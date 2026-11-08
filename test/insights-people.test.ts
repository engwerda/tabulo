import { describe, expect, it } from "vitest"
import { personChoices } from "../src/client/insights/people.ts"

const person = (login: string, avatarUrl = `https://forgejo.example/avatars/${login}`) => ({
  login,
  avatarUrl,
})

describe("personChoices", () => {
  it("adds the people the insights lack, such as the signed-in user, in login order", () => {
    const choices = personChoices(
      [person("ada"), person("grace")],
      [person("Bob"), person("zed", "")],
    )

    expect(choices.map((choice) => choice.login)).toEqual(["ada", "Bob", "grace", "zed"])
  })

  it("keeps the person the insights name, whatever the case of the extra login", () => {
    const choices = personChoices([person("ada"), person("grace")], [person("ADA", "")])

    expect(choices).toEqual([person("ada"), person("grace")])
  })
})
