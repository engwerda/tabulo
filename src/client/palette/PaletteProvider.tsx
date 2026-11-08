import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useLocation } from "wouter"
import { useLastScope } from "../scope/remembered.ts"
import { type OrgViewId, orgViewHref } from "../scope/views.ts"
import { isTypingTarget } from "../ui/primitives.tsx"
import { CommandPalette } from "./CommandPalette.tsx"
import { ShortcutsDialog } from "./ShortcutsDialog.tsx"
import { type PendingKey, resolveKey, type ShortcutId } from "./shortcuts.ts"

type PaletteControls = { readonly openPalette: () => void }

const PaletteContext = createContext<PaletteControls | null>(null)

export const usePalette = (): PaletteControls => {
  const controls = useContext(PaletteContext)
  if (controls === null) throw new Error("usePalette needs a PaletteProvider")
  return controls
}

const GO_VIEWS: Partial<Record<ShortcutId, OrgViewId>> = {
  "go-board": "board",
  "go-insights": "insights",
  "go-epics": "epics",
}

type Surface = "none" | "palette" | "shortcuts"

/** Owns the command menu and the shortcuts dialog, and listens for their keys. */
export const PaletteProvider = ({
  signOut,
  children,
}: {
  signOut: () => void
  children: ReactNode
}) => {
  const [surface, setSurface] = useState<Surface>("none")
  const [, navigate] = useLocation()
  const lastScope = useLastScope()
  const pending = useRef<PendingKey>(null)
  const latest = useRef({ surface, navigate, lastScope })
  latest.current = { surface, navigate, lastScope }
  // Where focus was before the first surface opened: the shortcuts dialog, opened from the
  // command menu, returns there, as the menu's own input is gone by then.
  const opener = useRef<HTMLElement | null>(null)
  const rememberOpener = useCallback(() => {
    if (latest.current.surface === "none" && document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      const current = latest.current
      // A page's own modal, such as the board's shortcut list, owns plain keys while it is open.
      const typing =
        isTypingTarget(event.target) ||
        current.surface !== "none" ||
        document.querySelector("dialog[open]") !== null
      const result = resolveKey(event, pending.current, event.timeStamp, typing)
      pending.current = result.pending
      if (result.shortcut === null) return
      event.preventDefault()
      rememberOpener()
      switch (result.shortcut) {
        case "palette":
          setSurface(current.surface === "palette" ? "none" : "palette")
          return
        case "shortcuts":
          setSurface("shortcuts")
          return
        case "go-dashboard":
          current.navigate("/")
          return
        default: {
          const view = GO_VIEWS[result.shortcut]
          if (view !== undefined) {
            current.navigate(orgViewHref(view, current.lastScope?.org, current.lastScope?.repos))
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [rememberOpener])

  const openPalette = useCallback(() => {
    rememberOpener()
    setSurface("palette")
  }, [rememberOpener])
  // A surface closes only itself: the shortcuts dialog reports closing after Cmd+K opened the
  // menu over it, and that must not close the menu.
  const closePalette = useCallback(
    () => setSurface((current) => (current === "palette" ? "none" : current)),
    [],
  )
  const closeShortcuts = useCallback(
    () => setSurface((current) => (current === "shortcuts" ? "none" : current)),
    [],
  )
  const openShortcuts = useCallback(() => setSurface("shortcuts"), [])

  return (
    <PaletteContext value={{ openPalette }}>
      {children}
      <CommandPalette
        open={surface === "palette"}
        onClose={closePalette}
        onOpenShortcuts={openShortcuts}
        signOut={signOut}
      />
      <ShortcutsDialog
        open={surface === "shortcuts"}
        onClose={closeShortcuts}
        returnFocus={opener}
      />
    </PaletteContext>
  )
}
