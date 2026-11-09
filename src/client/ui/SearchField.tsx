import type { KeyboardEvent, Ref } from "react"
import { SearchIcon, XIcon } from "./icons.tsx"
import { inputClass, Kbd, touchArea } from "./primitives.tsx"

type SearchFieldProps = {
  /** The field's name for assistive technology, such as "Search cards". */
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  /** The key that focuses the field from the page, shown while it is empty. */
  readonly shortcut?: string
  /** Inside a menu the field sits flat on the panel. */
  readonly inMenu?: boolean
  readonly inputRef?: Ref<HTMLInputElement>
  /** Runs first; Escape then clears a field with text unless this handler prevented it. */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly title?: string
  /** The id of the text that describes the field, such as what is wrong with the form. */
  readonly describedBy?: string | undefined
  /** Classes of the wrapper, for its width. */
  readonly className?: string
}

/**
 * The one search box: a magnifier, a clear button once there is text, and the page's key hint
 * while it is empty. Escape clears it in every browser, as Chrome does natively.
 */
export const SearchField = ({
  label,
  value,
  onChange,
  placeholder = label,
  shortcut,
  inMenu = false,
  inputRef,
  onKeyDown,
  title,
  describedBy,
  className = "",
}: SearchFieldProps) => (
  <label className={`relative block ${className}`}>
    <span className="sr-only">{label}</span>
    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
    <input
      ref={inputRef}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === "Escape" && value !== "" && !event.defaultPrevented) {
          event.preventDefault()
          onChange("")
        }
      }}
      placeholder={placeholder}
      title={title}
      aria-keyshortcuts={shortcut}
      aria-describedby={describedBy}
      // Named outright: the clear button sits inside the label and would join the name.
      aria-label={label}
      className={`${inputClass} pr-8 pl-8 [&::-webkit-search-cancel-button]:appearance-none ${
        inMenu ? "shadow-none" : ""
      }`}
    />
    {value !== "" ? (
      <button
        type="button"
        // Escape clears the field from the keyboard, so the button stays out of the Tab order.
        tabIndex={-1}
        onClick={(event) => {
          onChange("")
          event.currentTarget.parentElement?.querySelector("input")?.focus()
        }}
        aria-label="Clear the search"
        className={`absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${touchArea}`}
      >
        <XIcon className="size-3.5" />
      </button>
    ) : (
      shortcut !== undefined && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 pointer-coarse:hidden"
        >
          <Kbd>{shortcut}</Kbd>
        </span>
      )
    )}
  </label>
)
