import path from "node:path"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

const testSecrets = {
  FORGEJO_CLIENT_SECRET: "test-client-secret",
  SESSION_ENCRYPTION_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
}
// Wrangler warns when required secrets are missing from .dev.vars and process.env.
Object.assign(process.env, testSecrets)

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Explicit bindings win over a developer's .dev.vars, so tests never see local values.
        bindings: {
          ...testSecrets,
          APP_URL: "https://tabulo.example",
          FORGEJO_URL: "https://forgejo.example",
          FORGEJO_CLIENT_ID: "test-client-id",
          // Empty means the default; without these a local BOARD_* setting would leak in.
          BOARD_STATUS_SCOPE: "",
          BOARD_COLUMNS: "",
          BOARD_DONE_DAYS: "",
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
  },
})
