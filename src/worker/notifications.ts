import { Effect } from "effect"
import type { MarkNotificationReadRequest } from "../shared/api.ts"
import { type AccessToken, ForgejoClient } from "./forgejo/client.ts"

/** Marks the notification read as the user who owns `token`; Forgejo decides whether they may. */
export const markNotificationRead = (
  token: AccessToken,
  _login: string,
  request: MarkNotificationReadRequest,
) =>
  ForgejoClient.use((forgejo) => forgejo.markNotificationRead(token, request.id)).pipe(
    Effect.as({}),
  )
