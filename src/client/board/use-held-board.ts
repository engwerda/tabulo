import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { Board, BoardCard } from "../../shared/api.ts"
import {
  type BoardActivity,
  type BoardSeen,
  landHold,
  NO_HOLD,
  nextHold,
  nextSeen,
} from "./board-view.ts"

/** How long after a touch or a scroll the person still counts as using the columns. */
const RECENT_MS = 1000

/**
 * Whether the person is using the columns that `ref` and `handlers` mark: a mouse or pen over
 * them, or a touch or a scroll in them within the last second. Focus does not count, or a click
 * would hold the board for good.
 */
export const useColumnsInUse = () => {
  const [pointerOver, setPointerOver] = useState(false)
  const [recent, setRecent] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const touched = useCallback(() => {
    setRecent(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setRecent(false), RECENT_MS)
  }, [])
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return
      // React's onScroll does not bubble, so a column list's scroll is caught natively.
      element.addEventListener("scroll", touched, { capture: true, passive: true })
      // The columns can go while the pointer is over them, as when no card matches the filters.
      return () => {
        element.removeEventListener("scroll", touched, { capture: true })
        window.clearTimeout(timer.current)
        setPointerOver(false)
        setRecent(false)
      }
    },
    [touched],
  )
  // React's pointer events, not the DOM's: a card's menu renders in a portal outside the columns,
  // and React counts it as inside them, so moving into the menu does not release the board.
  const handlers = {
    onPointerEnter: (event: ReactPointerEvent) => {
      if (event.pointerType !== "touch") setPointerOver(true)
    },
    onPointerLeave: (event: ReactPointerEvent) => {
      if (event.pointerType !== "touch") setPointerOver(false)
    },
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "touch") touched()
    },
  }
  return { ref, handlers, inUse: pointerOver || recent }
}

const CARD_LINK = "a[data-card-link]"

/**
 * When changes land and the redraw removed the focused card's link, as a card that changes
 * column remounts, focus goes to that card's new link if the board still shows it.
 */
const useCardFocusKept = (shown: Board | undefined) => {
  const focused = useRef<{ readonly key: string; readonly link: Element } | null>(null)
  useEffect(() => {
    // Only keyboard focus follows the card: focusing a mouse user's card again would scroll the
    // board under the pointer.
    const focusIn = (event: FocusEvent) => {
      const link =
        event.target instanceof Element &&
        event.target.matches(CARD_LINK) &&
        event.target.matches(":focus-visible")
          ? event.target
          : null
      const key = link?.closest("[data-card-key]")?.getAttribute("data-card-key")
      focused.current = link === null || key == null ? null : { key, link }
    }
    // Clicking away leaves focus on the page with the link still there; only a removed link is
    // remembered, whether or not the browser reports its removal as a focus change.
    const focusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null) return
      const link = event.target
      queueMicrotask(() => {
        if (focused.current?.link === link && focused.current.link.isConnected) {
          focused.current = null
        }
      })
    }
    document.addEventListener("focusin", focusIn)
    document.addEventListener("focusout", focusOut)
    return () => {
      document.removeEventListener("focusin", focusIn)
      document.removeEventListener("focusout", focusOut)
    }
  }, [])
  const previous = useRef(shown)
  useLayoutEffect(() => {
    const landed = previous.current !== shown
    previous.current = shown
    const last = focused.current
    if (last === null || last.link.isConnected) return
    focused.current = null
    const active = document.activeElement
    if (!landed || (active !== null && active !== document.body)) return
    document
      .querySelector<HTMLElement>(`[data-card-key="${CSS.escape(last.key)}"] ${CARD_LINK}`)
      ?.focus()
  })
}

/**
 * The board to show. While the person uses it, layout changes wait and content changes show at
 * once; a write, and the read after it, show as they come. `visible` is the board's filters, and
 * `fetched` whether the board was read since the page opened. `land` shows what waits and the
 * board's next read at once, as Refresh does.
 */
export const useHeldBoard = (
  live: Board | undefined,
  { fetched, ...activity }: BoardActivity & { readonly fetched: boolean },
  visible: (card: BoardCard) => boolean,
) => {
  const [hold, setHold] = useState(NO_HOLD)
  const next = nextHold(hold, live, activity, visible)
  if (next !== hold) setHold(next)
  const shown = next.snapshot ?? live

  const now = { board: shown, following: next.following, fetched }
  const [seen, setSeen] = useState<BoardSeen>({ ...now, fetched: false, announcement: null })
  const told = nextSeen(seen, now, live, visible)
  if (told !== seen) setSeen(told)

  useCardFocusKept(shown)
  const land = useCallback(() => setHold(landHold), [])
  return { shown, waiting: shown !== live, announcement: told.announcement, land }
}
