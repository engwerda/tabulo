import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { unstable_readConfig } from "wrangler"

/**
 * Writes the static assets' `_headers` file. It is generated rather than kept in `public/`
 * because the CSP must allow avatars from `FORGEJO_URL`, which is set in `wrangler.jsonc`.
 * The dev server ignores `_headers`, so Vite's inline HMR scripts keep working there.
 */
const securityHeaders = (): Plugin => ({
  name: "tabulo:security-headers",
  apply: "build",
  applyToEnvironment: (environment) => environment.name === "client",
  generateBundle() {
    const { vars } = unstable_readConfig({ env: process.env.CLOUDFLARE_ENV })
    const forgejoOrigin = new URL(String(vars.FORGEJO_URL)).origin
    const csp = [
      "default-src 'self'",
      `img-src 'self' data: ${forgejoOrigin}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
    this.emitFile({
      type: "asset",
      fileName: "_headers",
      source: [
        "/*",
        `  Content-Security-Policy: ${csp}`,
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  X-Content-Type-Options: nosniff",
        "",
      ].join("\n"),
    })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), securityHeaders()],
})
