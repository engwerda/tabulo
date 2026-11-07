import { useLayoutEffect, useRef, useState } from "react"

/** A ref for an element and its current content size, kept up to date as it resizes. */
export const useSize = <T extends Element>() => {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const { width, height } = element.getBoundingClientRect()
    setSize({ width, height })
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/** A ref for an element and its current content width. */
export const useWidth = <T extends Element>() => {
  const [ref, size] = useSize<T>()
  return [ref, size.width] as const
}
