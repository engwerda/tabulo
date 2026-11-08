import type { Person } from "../../shared/api.ts"

/** Whether two logins name the same Forgejo user, which ignores case. */
export const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * The people the insights can be narrowed to: everyone in `people`, then each of `also` that
 * `people` lacks, such as the signed-in user or the login in the address, by login.
 */
export const personChoices = (
  people: ReadonlyArray<Person>,
  also: ReadonlyArray<Person>,
): ReadonlyArray<Person> => {
  const choices = [...people]
  for (const person of also) {
    if (!choices.some((choice) => sameLogin(choice.login, person.login))) choices.push(person)
  }
  return choices.sort((a, b) => a.login.toLowerCase().localeCompare(b.login.toLowerCase()))
}
