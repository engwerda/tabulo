import { existsSync } from "node:fs"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import {
  experimental_readRawConfig,
  type Unstable_Config,
  type Unstable_RawConfig,
  unstable_readConfig,
} from "wrangler"

const DEPLOY_OVERRIDE = "wrangler.deploy.jsonc"
const OVERRIDE_KEYS = ["routes", "vars", "d1_databases"] as const
type OverrideKey = (typeof OVERRIDE_KEYS)[number]
type DeployOverride = Pick<Unstable_RawConfig, OverrideKey>

const readDeployOverride = (): DeployOverride => {
  const { rawConfig } = experimental_readRawConfig({ config: DEPLOY_OVERRIDE })
  const unknownKeys = Object.keys(rawConfig).filter(
    (key) => !OVERRIDE_KEYS.some((allowed) => allowed === key),
  )
  if (unknownKeys.length > 0) {
    throw new Error(
      `${DEPLOY_OVERRIDE} may set only ${OVERRIDE_KEYS.join(", ")}, not ${unknownKeys.join(", ")}.`,
    )
  }
  return rawConfig
}

const applyDeployOverride = (
  config: Pick<Unstable_Config, OverrideKey>,
  override: DeployOverride,
): void => {
  if (override.routes) config.routes = override.routes
  config.vars = { ...config.vars, ...override.vars }
  for (const database of override.d1_databases ?? []) {
    const index = config.d1_databases.findIndex(({ binding }) => binding === database.binding)
    if (index === -1) {
      throw new Error(
        `${DEPLOY_OVERRIDE} names the D1 binding ${database.binding}, which wrangler.jsonc does not have.`,
      )
    }
    config.d1_databases[index] = { ...config.d1_databases[index], ...database }
  }
}

const securityHeaders = (override: DeployOverride): Plugin => ({
  name: "tabulo:security-headers",
  apply: "build",
  applyToEnvironment: (environment) => environment.name === "client",
  generateBundle() {
    const config = unstable_readConfig({ env: process.env.CLOUDFLARE_ENV })
    applyDeployOverride(config, override)
    const forgejoOrigin = new URL(String(config.vars.FORGEJO_URL)).origin
    const csp = [
      "default-src 'self'",
      `img-src 'self' data: ${forgejoOrigin}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; ")
    this.emitFile({
      type: "asset",
      fileName: "_headers",
      source: [
        "/*",
        `  Content-Security-Policy: ${csp}`,
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Strict-Transport-Security: max-age=31536000",
        "  X-Content-Type-Options: nosniff",
        "",
      ].join("\n"),
    })
  },
})

export default defineConfig(({ command }) => {
  const buildWithOverride = command === "build" && existsSync(DEPLOY_OVERRIDE)
  const override = buildWithOverride ? readDeployOverride() : {}
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Mutate rather than return a partial config: the plugin merges a returned object with
      // defu, which concatenates arrays and would keep the template's route and D1 entry.
      cloudflare({ config: (config) => applyDeployOverride(config, override) }),
      securityHeaders(override),
      {
        name: "tabulo:deploy-override",
        // Vite also loads this file once per environment; buildApp is the hook that runs once.
        async buildApp() {
          if (buildWithOverride) console.info(`Applying ${DEPLOY_OVERRIDE} over wrangler.jsonc`)
        },
      },
    ],
  }
})
