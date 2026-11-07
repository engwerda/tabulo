import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { createApp } from "../src/worker/app.ts"

export const APP_URL = "https://tabulo.example"

export const tabulo = (forgejoFetch: (request: Request) => Promise<Response>) => {
  const app = createApp({ fetch: forgejoFetch })
  return async (path: string, init?: RequestInit): Promise<Response> => {
    const ctx = createExecutionContext()
    const response = await app.fetch(new Request(`${APP_URL}${path}`, init), env, ctx)
    await waitOnExecutionContext(ctx)
    return response
  }
}
