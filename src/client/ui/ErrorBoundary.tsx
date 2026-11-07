import { Component, type ReactNode } from "react"
import { AlertIcon } from "./icons.tsx"
import { buttonClass } from "./primitives.tsx"

type State = { readonly error: Error | null }

/**
 * Shows a way back instead of a blank page when rendering throws. `resetKey` clears the error,
 * so moving to another page tries again.
 */
export class ErrorBoundary extends Component<
  { readonly children: ReactNode; readonly resetKey: string },
  State
> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidUpdate(previous: { readonly resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null })
    }
  }

  override render() {
    if (this.state.error === null) return this.props.children
    return (
      <main className="grid flex-1 place-items-center px-6 py-24">
        <div role="alert" className="max-w-md text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-500/10">
            <AlertIcon className="size-5" />
          </div>
          <h1 className="mt-5 text-lg font-semibold tracking-tight">
            Something broke on this page
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Your changes in Forgejo are safe. Reload to carry on.
          </p>
          <p className="mt-3 font-mono text-xs break-words text-zinc-500">
            {this.state.error.message}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className={buttonClass.secondary}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={buttonClass.primary}
            >
              Reload
            </button>
          </div>
        </div>
      </main>
    )
  }
}
