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
import { CheckIcon, ChevronDownIcon } from "./icons.tsx"

/**
 * On a touch screen a small control gets an invisible 44px hit area around it, so compact
 * desktop sizing stays and a finger still lands. The control must not clip its overflow.
 */
export const touchArea =
  "pointer-coarse:before:absolute pointer-coarse:before:top-1/2 pointer-coarse:before:left-1/2 pointer-coarse:before:size-11 pointer-coarse:before:-translate-1/2"

/** `touchArea` on a control that is not itself positioned. */
export const touchTarget = `relative ${touchArea}`

export const buttonClass = {
  primary:
    "inline-flex h-8 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-500 active:bg-indigo-700 disabled:pointer-events-none disabled:opacity-60",
  secondary:
    "inline-flex h-8 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 shadow-card transition hover:border-zinc-300 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/70",
  ghost:
    "inline-flex h-8 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  // A real 44px square on touch rather than an invisible hit area: icon buttons often sit in a
  // row, where enlarged areas would overlap and a tap could land on the neighbour.
  icon: "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition pointer-coarse:size-11 hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  iconSmall: `inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${touchTarget}`,
} as const

/** The surface of every card and section on a page. Floating panels use `panelClass`. */
export const cardClass =
  "rounded-xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-900"

// 16px text on phones keeps iOS from zooming in when a field takes focus.
export const inputClass =
  "h-8 pointer-coarse:h-11 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-base sm:text-sm text-zinc-900 shadow-card transition placeholder:text-zinc-500 hover:border-zinc-300 focus:border-indigo-400 focus:outline-none focus:ring-3 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:hover:border-zinc-700 dark:focus:border-indigo-500"

export const panelClass =
  "rounded-xl border border-zinc-200 bg-white shadow-pop dark:border-zinc-800 dark:bg-zinc-900"

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 border-zinc-200 bg-white px-1 font-sans text-2xs leading-none font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
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

const TAB_STOPS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The Tab stops of a panel that holds form controls, such as checkboxes, beside or instead of
 * menu items; null for a menu, whose only other stop is its search box.
 */
const formStops = (panel: HTMLElement): HTMLElement[] | null => {
  const stops = [...panel.querySelectorAll<HTMLElement>(TAB_STOPS)].filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
  )
  const isMenuStop = (element: HTMLElement) =>
    element.matches(MENU_ITEMS) ||
    (element instanceof HTMLInputElement && ["search", "text"].includes(element.type))
  return stops.every(isMenuStop) ? null : stops
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
            // Transparent rather than `visibility: hidden` while it is measured: a hidden panel
            // refuses focus until its visibility has finished changing.
            style={position ?? { opacity: 0, pointerEvents: "none", top: 0, left: 0 }}
            // A press inside the panel must not reach a draggable card around its trigger.
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            // Clicks stay in the panel too: React bubbles them through the portal to the trigger's
            // ancestors, such as a card that opens its details on click.
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault()
                const stops = formStops(event.currentTarget)
                if (stops === null) {
                  // Tab leaves a menu: it closes and focus goes back to where it was opened.
                  setOpen(false)
                  ;(returnFocus ?? trigger).current?.focus()
                } else {
                  // A panel of form controls keeps Tab inside it, so every control is reachable.
                  const current = stops.indexOf(document.activeElement as HTMLElement)
                  const step = event.shiftKey ? -1 : 1
                  stops[(current + step + stops.length) % stops.length]?.focus()
                }
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

/** A single choice in a menu-like listbox of a Popover, checked at the end when chosen. */
export const MenuOption = ({
  selected,
  onSelect,
  children,
  multiple = false,
  disabled = false,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  /** A choice among several that can be picked together. */
  multiple?: boolean
  /**
   * Shown dimmed and announced as unavailable, while it keeps focus; `onSelect` decides what a
   * press does meanwhile.
   */
  disabled?: boolean
}) => (
  // biome-ignore lint/a11y/useAriaPropsSupportedByRole: both menu item roles take aria-checked
  <button
    type="button"
    role={multiple ? "menuitemcheckbox" : "menuitemradio"}
    aria-checked={selected}
    aria-disabled={disabled || undefined}
    onClick={onSelect}
    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition pointer-coarse:min-h-11 aria-disabled:opacity-60 hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800 ${
      selected ? "font-medium text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300"
    }`}
  >
    <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    <CheckIcon
      className={`size-4 shrink-0 text-indigo-600 dark:text-indigo-400 ${selected ? "" : "invisible"}`}
    />
  </button>
)

/** Is the event's target a place where typing goes, so single-key shortcuts must not fire? */
export const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT")

/**
 * One choice among a few, as a row of pressed buttons: periods, chart series, the theme. The
 * selected option is a raised white segment on the zinc track.
 */
export const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  /** What the group chooses, for assistive technology. */
  label: string
  options: ReadonlyArray<{ readonly value: T; readonly label: ReactNode; readonly title?: string }>
  value: T
  onChange: (value: T) => void
  size?: "sm" | "md"
  className?: string
}) => (
  <fieldset
    className={`inline-flex shrink-0 items-center rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80 ${className}`}
  >
    <legend className="sr-only">{label}</legend>
    {options.map((option) => {
      const selected = option.value === value
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap tabular-nums transition ${
            size === "sm"
              ? "h-6 px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3"
              : "h-7 px-2.5 text-sm pointer-coarse:h-11 pointer-coarse:px-3"
          } ${
            selected
              ? "bg-white text-zinc-900 shadow-card ring-1 ring-zinc-900/5 dark:bg-zinc-700 dark:text-zinc-50 dark:ring-white/5"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {option.label}
        </button>
      )
    })}
  </fieldset>
)
