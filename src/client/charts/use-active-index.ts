import { type KeyboardEvent, type PointerEvent, useState } from "react"

/**
 * The data point a reader points at or has moved to with the arrow keys. The plot is one tab
 * stop; Left and Right step through the points, Home and End jump to the ends.
 */
export const useActiveIndex = (
  count: number,
  indexAt: (x: number, y: number) => number | null,
  { step = 1, rowStep = 0 }: { step?: number; rowStep?: number } = {},
) => {
  const [active, setActive] = useState<number | null>(null)
  const clamp = (index: number) => Math.min(count - 1, Math.max(0, index))
  /** The index a key moves to from `current`, or null for keys that do not move. */
  const moveFor = (key: string, current: number) => {
    switch (key) {
      case "ArrowRight":
        return current + step
      case "ArrowLeft":
        return current - step
      case "ArrowDown":
        return rowStep === 0 ? null : current + rowStep
      case "ArrowUp":
        return rowStep === 0 ? null : current - rowStep
      case "Home":
        return 0
      case "End":
        return count - 1
      default:
        return null
    }
  }
  return {
    active,
    setActive,
    handlers: {
      tabIndex: count === 0 ? -1 : 0,
      onPointerMove: (event: PointerEvent<Element>) => {
        const box = event.currentTarget.getBoundingClientRect()
        setActive(indexAt(event.clientX - box.left, event.clientY - box.top))
      },
      onPointerLeave: () => setActive(null),
      onFocus: () => setActive((current) => current ?? count - 1),
      onBlur: () => setActive(null),
      onKeyDown: (event: KeyboardEvent<Element>) => {
        const next = moveFor(event.key, active ?? count - 1)
        if (next === null) return
        event.preventDefault()
        setActive(clamp(next))
      },
    },
  }
}
