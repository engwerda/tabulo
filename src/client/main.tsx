import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App, SESSION_USER } from "./App.tsx"
import { Unauthenticated } from "./api.ts"
import "./styles.css"

// Any request that finds the session gone sends the app back to the sign-in screen.
const signOutOnUnauthenticated = (error: Error) => {
  if (error instanceof Unauthenticated) queryClient.setQueryData(SESSION_USER, null)
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signOutOnUnauthenticated }),
  mutationCache: new MutationCache({ onError: signOutOnUnauthenticated }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !(error instanceof Unauthenticated) && failureCount < 2,
    },
  },
})

const root = document.getElementById("root")
if (root === null) throw new Error("index.html is missing #root")

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
