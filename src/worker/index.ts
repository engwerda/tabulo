import { createApp } from "./app.ts"

export default createApp({ fetch: (request) => fetch(request) })
