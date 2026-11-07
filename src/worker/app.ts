import { Hono } from "hono"

export type Dependencies = {
  readonly fetch: (request: Request) => Promise<Response>
}

export const createApp = (_dependencies: Dependencies) => {
  const app = new Hono<{ Bindings: Env }>()
  app.get("/api/me", (c) => c.json({ error: "unauthenticated" }, 401))
  return app
}
