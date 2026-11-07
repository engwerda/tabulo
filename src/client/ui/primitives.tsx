import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { ChevronDownIcon } from "./icons.tsx"

export const buttonClass = {
  primary:
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-500 active:bg-indigo-700 disabled:pointer-events-none disabled:opacity-60",
  secondary:
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 shadow-card transition hover:border-zinc-300 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/70",
  ghost:
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  icon: "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  iconSmall:
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
} as const

// 16px text on phones keeps iOS from zooming in when a field takes focus.
export const inputClass =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-base sm:text-sm text-zinc-900 shadow-card transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-indigo-400 focus:outline-none focus:ring-3 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:hover:border-zinc-700 dark:focus:border-indigo-500"

export const panelClass =
  "rounded-xl border border-zinc-200 bg-white shadow-pop dark:border-zinc-800 dark:bg-zinc-900"

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border leading-none border-zinc-200 bg-zinc-50 px-1 font-sans text-[0.6875rem] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
    {children}
  </kbd>
)

/** Closes on a pointer down outside every one of `inside` and on Escape, which returns focus. */
export const useDismiss = (
  open: boolean,
  close: () => void,
  inside: ReadonlyArray<RefObject<HTMLElement | null>>,
  returnFocus?: RefObject<HTMLElement | null>,
) => {
  const closeRef = useRef(close)
  closeRef.current = close
  const insideRef = useRef(inside)
  insideRef.current = inside
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!insideRef.current.some((ref) => ref.current?.contains(target))) closeRef.current()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      closeRef.current()
      returnFocus?.current?.focus()
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [open, returnFocus])
}

type PopoverProps = {
  /** The trigger's content. */
  readonly label: ReactNode
  readonly accessibleLabel?: string
  readonly triggerClass: string
  readonly align?: "start" | "end"
  readonly panelClass?: string
  readonly chevron?: boolean
  readonly children: (close: () => void) => ReactNode
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  /** Classes of the wrapper; a trigger that should truncate needs "min-w-0" here. */
  readonly containerClass?: string
  /** Moves focus to the first menu item on open, as a menu button does. */
  readonly focusFirstItem?: boolean
  /** -1 keeps the trigger out of the Tab order when a key opens the panel instead. */
  readonly triggerTabIndex?: number
  /** Where focus goes when the panel closes; the trigger when left out. */
  readonly returnFocus?: RefObject<HTMLElement | null>
}

const MENU_ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

/** Up and down arrows move between a panel's menu items, Home and End to the ends. */
const moveMenuFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
  // In a search box Home and End move the caret.
  if (event.target instanceof HTMLInputElement && (event.key === "Home" || event.key === "End")) {
    return
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEMS)]
  if (items.length === 0) return
  event.preventDefault()
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (current + 1) % items.length
          : current === -1
            ? items.length - 1
            : (current - 1 + items.length) % items.length
  items[next]?.focus()
}

const GAP = 6

/** Whether `element` is scrolled out of the screen or out of a scrolling ancestor's view. */
const outOfSight = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  const outside = (box: { top: number; bottom: number; left: number; right: number }) =>
    rect.bottom < box.top || rect.top > box.bottom || rect.right < box.left || rect.left > box.right
  if (outside({ top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }))
    return true
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (/auto|scroll|hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)) {
      if (outside(parent.getBoundingClientRect())) return true
    }
  }
  return false
}

/** Where the panel goes: below the trigger, or above it when it would overflow, inside the screen. */
const panelPosition = (trigger: DOMRect, panel: HTMLElement, align: "start" | "end") => {
  const below = trigger.bottom + GAP + panel.offsetHeight <= window.innerHeight - GAP
  const top = below ? trigger.bottom + GAP : Math.max(GAP, trigger.top - GAP - panel.offsetHeight)
  const left = align === "end" ? trigger.right - panel.offsetWidth : trigger.left
  return {
    top,
    left: Math.min(Math.max(GAP, left), window.innerWidth - panel.offsetWidth - GAP),
  }
}

/**
 * A button that toggles a panel below it; the panel closes on Escape or an outside click. The
 * panel renders in a portal against the viewport, so a scrolling or transformed ancestor such as
 * a board column, a card, or the filter row cannot clip or displace it.
 */
export const Popover = ({
  label,
  accessibleLabel,
  triggerClass,
  align = "start",
  panelClass: extraPanelClass = "w-72",
  chevron = true,
  children,
  open: controlledOpen,
  onOpenChange,
  containerClass = "relative",
  focusFirstItem = false,
  triggerTabIndex,
  returnFocus,
}: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const close = () => setOpen(false)
  const closeRef = useRef(close)
  closeRef.current = close
  useDismiss(open, close, [container, panel], returnFocus ?? trigger)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = () => {
      if (trigger.current !== null && panel.current !== null) {
        setPosition(panelPosition(trigger.current.getBoundingClientRect(), panel.current, align))
      }
    }
    place()
    // The panel follows its trigger when something scrolls, and closes once the trigger has
    // scrolled out of sight.
    const follow = () => {
      if (trigger.current === null) return
      if (outOfSight(trigger.current)) closeRef.current()
      else place()
    }
    window.addEventListener("scroll", follow, true)
    window.addEventListener("resize", place)
    // Content that grows or shrinks, such as a filtered list, keeps the panel against its trigger.
    const resized = new ResizeObserver(place)
    if (panel.current !== null) resized.observe(panel.current)
    return () => {
      window.removeEventListener("scroll", follow, true)
      window.removeEventListener("resize", place)
      resized.disconnect()
    }
  }, [open, align])

  // React's autoFocus would run while the panel is still hidden for placing, so the panel's
  // search box, or its first menu item for a menu button, takes focus here instead.
  const placed = open && position !== null
  useEffect(() => {
    if (!placed) return
    const within = (selector: string) => panel.current?.querySelector<HTMLElement>(selector)
    const target =
      (focusFirstItem ? null : within("input")) ??
      within(MENU_ITEMS) ??
      within("a[href], button, input")
    target?.focus()
  }, [placed, focusFirstItem])

  return (
    <div ref={container} className={containerClass}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={accessibleLabel}
        tabIndex={triggerTabIndex}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={triggerClass}
      >
        {label}
        {chevron && (
          <ChevronDownIcon
            className={`size-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open &&
        createPortal(
          // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only contain events for the controls inside
          <div
            ref={panel}
            id={panelId}
            style={position ?? { visibility: "hidden", top: 0, left: 0 }}
            // A press inside the panel must not reach a draggable card around its trigger.
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            // Clicks stay in the panel too: React bubbles them through the portal to the trigger's
            // ancestors, such as a card that opens its details on click.
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              // Tab leaves a menu: it closes and focus goes back to where it was opened.
              if (event.key === "Tab") {
                event.preventDefault()
                setOpen(false)
                ;(returnFocus ?? trigger).current?.focus()
                return
              }
              moveMenuFocus(event)
            }}
            className={`fixed z-50 max-w-[calc(100vw-0.75rem)] animate-pop-in ${panelClass} ${extraPanelClass}`}
          >
            {children(() => {
              setOpen(false)
              ;(returnFocus ?? trigger).current?.focus()
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** A single choice in a menu-like listbox of a Popover. */
export const MenuOption = ({
  selected,
  onSelect,
  children,
  multiple = false,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  /** A choice among several that can be picked together. */
  multiple?: boolean
}) => (
  // biome-ignore lint/a11y/useAriaPropsSupportedByRole: both menu item roles take aria-checked
  <button
    type="button"
    role={multiple ? "menuitemcheckbox" : "menuitemradio"}
    aria-checked={selected}
    onClick={onSelect}
    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800 ${
      selected ? "font-medium text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300"
    }`}
  >
    {children}
  </button>
)

/** Is the event's target a place where typing goes, so single-key shortcuts must not fire? */
export const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT")
