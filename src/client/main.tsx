import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { RequestFailed, Unauthenticated } from "./api.ts"
import { syncBoardsWithWrites } from "./board/board-sync.ts"
import { startTheme } from "./theme.ts"
import "./styles.css"
import { keepDataToSessionUser, SESSION_USER } from "./session.ts"
import { ToastProvider } from "./ui/toast.tsx"

startTheme()

// Any request that finds the session gone sends the app back to the sign-in screen.
const signOutOnUnauthenticated = (error: Error) => {
  if (error instanceof Unauthenticated) queryClient.setQueryData(SESSION_USER, null)
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signOutOnUnauthenticated }),
  mutationCache: new MutationCache({ onError: signOutOnUnauthenticated }),
  defaultOptions: {
    queries: {
      // A 4xx answer will not change on retry, so only server and network failures retry.
      retry: (failureCount, error) =>
        !(error instanceof Unauthenticated) &&
        !(error instanceof RequestFailed && error.status < 500) &&
        failureCount < 2,
    },
  },
})
keepDataToSessionUser(queryClient)
syncBoardsWithWrites(queryClient)

const root = document.getElementById("root")
if (root === null) throw new Error("index.html is missing #root")

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
