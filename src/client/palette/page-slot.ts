import { useEffect, useSyncExternalStore } from "react"

/**
 * A value the page on screen lends to an app-wide surface, such as its shortcuts to the help
 * dialog or its commands to the command menu, for as long as the page is mounted.
 */
export const pageSlot = <T>(empty: T) => {
  let value = empty
  const listeners = new Set<() => void>()
  const publish = (next: T) => {
    value = next
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  return {
    usePublish: (next: T) => {
      useEffect(() => publish(next), [next])
      useEffect(() => () => publish(empty), [])
    },
    useValue: () => useSyncExternalStore(subscribe, () => value),
  }
}
