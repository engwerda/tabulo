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

export const inputClass =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 shadow-card transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-indigo-400 focus:outline-none focus:ring-3 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:hover:border-zinc-700 dark:focus:border-indigo-500"

export const panelClass =
  "rounded-xl border border-zinc-200 bg-white shadow-pop dark:border-zinc-800 dark:bg-zinc-900"

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-zinc-200 bg-zinc-50 px-1 font-sans text-[0.6875rem] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
    {children}
  </kbd>
)

/** Closes on a pointer down outside `container` and on Escape, which returns focus. */
export const useDismiss = (
  open: boolean,
  close: () => void,
  container: RefObject<HTMLElement | null>,
  returnFocus?: RefObject<HTMLElement | null>,
) => {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) closeRef.current()
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
  }, [open, container, returnFocus])
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
  /**
   * "fixed" places the panel against the viewport, so a scrolling ancestor such as a board
   * column cannot clip it. It opens upward when there is no room below.
   */
  readonly strategy?: "absolute" | "fixed"
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

/** Where a fixed panel goes: below the trigger, or above it when it would overflow. */
const fixedPosition = (trigger: DOMRect, panel: HTMLElement, align: "start" | "end") => {
  const below = trigger.bottom + GAP + panel.offsetHeight <= window.innerHeight - GAP
  const style: CSSProperties = below
    ? { top: trigger.bottom + GAP }
    : { top: Math.max(GAP, trigger.top - GAP - panel.offsetHeight) }
  const left = align === "end" ? trigger.right - panel.offsetWidth : Math.max(GAP, trigger.left)
  return {
    ...style,
    left: Math.min(Math.max(GAP, left), window.innerWidth - panel.offsetWidth - GAP),
  }
}

/** A button that toggles a panel below it; the panel closes on Escape or an outside click. */
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
  strategy = "absolute",
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
  const [fixedStyle, setFixedStyle] = useState<CSSProperties | null>(null)
  // An absolute panel near the edge of a narrow screen shifts back inside it.
  const [shift, setShift] = useState(0)
  const close = () => setOpen(false)
  const closeRef = useRef(close)
  closeRef.current = close
  useDismiss(open, close, container, returnFocus ?? trigger)

  useLayoutEffect(() => {
    if (!open) {
      setShift(0)
      return
    }
    if (focusFirstItem) panel.current?.querySelector<HTMLElement>(MENU_ITEMS)?.focus()
    if (strategy === "absolute" && panel.current !== null) {
      const rect = panel.current.getBoundingClientRect()
      const overflowRight = rect.right - (window.innerWidth - GAP)
      setShift(overflowRight > 0 ? -overflowRight : rect.left < GAP ? GAP - rect.left : 0)
    }
  }, [open, strategy, focusFirstItem])

  useLayoutEffect(() => {
    if (!open || strategy !== "fixed") {
      setFixedStyle(null)
      return
    }
    const place = () => {
      if (trigger.current !== null && panel.current !== null) {
        setFixedStyle(fixedPosition(trigger.current.getBoundingClientRect(), panel.current, align))
      }
    }
    place()
    const closeOnScroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) closeRef.current()
    }
    window.addEventListener("scroll", closeOnScroll, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", closeOnScroll, true)
      window.removeEventListener("resize", place)
    }
  }, [open, strategy, align])

  const position =
    strategy === "fixed"
      ? "fixed"
      : `absolute top-full mt-1.5 ${align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`
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
        className={triggerClass}
      >
        {label}
        {chevron && (
          <ChevronDownIcon
            className={`size-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only contain events for the controls inside
        <div
          ref={panel}
          id={panelId}
          style={
            strategy === "fixed" ? (fixedStyle ?? { visibility: "hidden" }) : { marginLeft: shift }
          }
          // A press inside the panel must not reach a draggable card around it.
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onKeyDown={moveMenuFocus}
          className={`${position} z-40 max-w-[calc(100vw-0.75rem)] animate-pop-in ${panelClass} ${extraPanelClass}`}
        >
          {children(() => {
            setOpen(false)
            ;(returnFocus ?? trigger).current?.focus()
          })}
        </div>
      )}
    </div>
  )
}

/** A single choice in a menu-like listbox of a Popover. */
export const MenuOption = ({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    role="menuitemradio"
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
