import { Effect, Redacted } from "effect"
import { ConfigInvalid } from "./errors.ts"
import type { ForgejoConfig } from "./forgejo/client.ts"
import { importTokenKey } from "./token-crypto.ts"

export type AppConfig = {
  readonly appOrigin: string
  readonly forgejo: ForgejoConfig
  readonly tokenKey: CryptoKey
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
    } satisfies AppConfig
  })
