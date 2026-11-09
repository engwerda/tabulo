import { Effect, Redacted } from "effect"
import { ConfigInvalid } from "./errors.ts"
import type { ForgejoConfig } from "./forgejo/client.ts"
import { importTokenKey } from "./token-crypto.ts"

export type BoardSettings = {
  /** Exclusive labels whose name starts with this are status labels, for example `Status/`. */
  readonly statusScope: string
  readonly defaultColumns: ReadonlyArray<string>
  /** Issues closed within this many days are in Done. */
  readonly doneDays: number
}

export type AppConfig = {
  readonly appOrigin: string
  readonly forgejo: ForgejoConfig
  readonly tokenKey: CryptoKey
  readonly board: BoardSettings
  readonly epicLabel: string
}

const parseUrl = (name: string, value: string) =>
  URL.canParse(value)
    ? Effect.succeed(new URL(value))
    : Effect.fail(new ConfigInvalid({ message: `${name} is not an absolute URL` }))

// Tabulo must own the whole origin: its cookies use the __Host- prefix (Path=/), and the
// OAuth redirect URI and the Origin check are built from APP_URL.
const parseAppUrl = (value: string) =>
  Effect.gen(function* () {
    const url = yield* parseUrl("APP_URL", value)
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.href !== `${url.origin}/`) {
      return yield* new ConfigInvalid({
        message:
          "APP_URL must be an http or https origin with no path, query, or credentials, such as https://tabulo.example",
      })
    }
    return url
  })

const required = (name: string, value: string | undefined) =>
  value === undefined || value === ""
    ? Effect.fail(new ConfigInvalid({ message: `${name} is not set` }))
    : Effect.succeed(value)

const MAX_DONE_DAYS = 365

const parseBoardSettings = (env: Env) =>
  Effect.gen(function* () {
    const statusScope = env.BOARD_STATUS_SCOPE || "Status/"
    if (!statusScope.endsWith("/")) {
      return yield* new ConfigInvalid({ message: "BOARD_STATUS_SCOPE must end with /" })
    }

    const doneDaysText = env.BOARD_DONE_DAYS || "14"
    const doneDays = Number(doneDaysText)
    if (!/^\d+$/.test(doneDaysText) || doneDays < 1 || doneDays > MAX_DONE_DAYS) {
      return yield* new ConfigInvalid({
        message: `BOARD_DONE_DAYS must be a whole number from 1 to ${MAX_DONE_DAYS}`,
      })
    }

    const entries = (env.BOARD_COLUMNS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "")
    if (new Set(entries).size !== entries.length) {
      return yield* new ConfigInvalid({ message: "BOARD_COLUMNS lists a column twice" })
    }
    const defaultColumns: Array<string> = []
    for (const entry of entries) {
      if (entry === "Todo" || entry === "Done") defaultColumns.push(entry.toLowerCase())
      else if (entry.startsWith(statusScope) && entry.length > statusScope.length) {
        defaultColumns.push(entry)
      } else {
        return yield* new ConfigInvalid({
          message: `BOARD_COLUMNS entry "${entry}" is not Todo, Done, or a label starting with ${statusScope}`,
        })
      }
    }
    return { statusScope, defaultColumns, doneDays } satisfies BoardSettings
  })

export const loadConfig = (env: Env) =>
  Effect.gen(function* () {
    const appUrl = yield* parseAppUrl(env.APP_URL)
    const forgejoUrl = yield* parseUrl("FORGEJO_URL", env.FORGEJO_URL)
    const clientId = yield* required("FORGEJO_CLIENT_ID", env.FORGEJO_CLIENT_ID)
    const clientSecret = yield* required("FORGEJO_CLIENT_SECRET", env.FORGEJO_CLIENT_SECRET)
    const encryptionKey = yield* required("SESSION_ENCRYPTION_KEY", env.SESSION_ENCRYPTION_KEY)
    return {
      appOrigin: appUrl.origin,
      forgejo: {
        baseUrl: forgejoUrl.href.replace(/\/+$/, ""),
        clientId,
        clientSecret: Redacted.make(clientSecret),
        redirectUri: new URL("/auth/callback", appUrl).href,
      },
      tokenKey: yield* importTokenKey(encryptionKey),
      board: yield* parseBoardSettings(env),
      epicLabel: env.EPIC_LABEL?.trim() || "Type/Epic",
    } satisfies AppConfig
  })
