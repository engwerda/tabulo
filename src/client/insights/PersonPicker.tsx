import { useState } from "react"
import type { Person } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { UserIcon } from "../ui/icons.tsx"
import { buttonClass, MenuOption, Popover } from "../ui/primitives.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { sameLogin } from "./people.ts"

/**
 * Narrows the insights to one person, or shows everyone. `choices` is undefined until the first
 * insights have loaded, and the button waits for them.
 */
export const PersonPicker = ({
  choices,
  selected,
  onChange,
}: {
  readonly choices: ReadonlyArray<Person> | undefined
  /** The login the page is narrowed to; null for everyone. */
  readonly selected: string | null
  readonly onChange: (login: string | null) => void
}) => {
  const [search, setSearch] = useState("")
  const chosen =
    selected === null
      ? undefined
      : (choices?.find((person) => sameLogin(person.login, selected)) ?? {
          login: selected,
          avatarUrl: "",
        })
  const visible = (choices ?? []).filter((person) =>
    person.login.toLowerCase().includes(search.trim().toLowerCase()),
  )
  return (
    <Popover
      triggerClass={`${buttonClass.secondary} min-w-0 max-w-48`}
      containerClass="relative min-w-0 shrink-0"
      disabled={choices === undefined}
      accessibleLabel={`Person: ${chosen === undefined ? "everyone" : chosen.login}`}
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
      label={
        chosen === undefined ? (
          <>
            <UserIcon className="size-4 opacity-70" />
            Everyone
          </>
        ) : (
          <>
            <Avatar url={chosen.avatarUrl} name={chosen.login} size="xs" />
            <span className="truncate">{chosen.login}</span>
          </>
        )
      }
      panelClass="w-64 p-1.5"
    >
      {(close) => (
        <>
          <SearchField
            label="Search people"
            value={search}
            onChange={setSearch}
            inMenu
            className="mb-1"
          />
          <div role="menu" aria-label="Person" className="scroll-thin max-h-72 overflow-y-auto">
            <MenuOption
              selected={chosen === undefined}
              onSelect={() => {
                onChange(null)
                close()
              }}
            >
              <UserIcon className="size-5 shrink-0 p-0.5 text-zinc-500 dark:text-zinc-400" />
              <span className="flex-1">Everyone</span>
            </MenuOption>
            {visible.map((person) => (
              <MenuOption
                key={person.login}
                selected={chosen !== undefined && sameLogin(chosen.login, person.login)}
                onSelect={() => {
                  onChange(person.login)
                  close()
                }}
              >
                <Avatar url={person.avatarUrl} name={person.login} size="xs" />
                <span className="min-w-0 flex-1 truncate">{person.login}</span>
              </MenuOption>
            ))}
            {visible.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                No one matches “{search.trim()}”.
              </p>
            )}
          </div>
        </>
      )}
    </Popover>
  )
}
