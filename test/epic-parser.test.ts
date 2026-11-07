import { describe, expect, it } from "vitest"
import { parseEpicChildren } from "../src/worker/epics.ts"

const parse = (body: string, url = "https://forgejo.example") =>
  parseEpicChildren(body, { owner: "acme", name: "api" }, url).map(({ ref }) => ref)

describe("epic task-list references", () => {
  it.each([
    ["- [ ] #12", "acme/api#12"],
    ["- [x] #12 trailing text", "acme/api#12"],
    ["* [ ] web#12", "acme/web#12"],
    ["- [X] OTHER/Web#12", "other/web#12"],
    ["  + [ ] #12", "acme/api#12"],
    ["- [ ] https://forgejo.example/other/web/issues/12", "other/web#12"],
    ["- [ ] <https://forgejo.example/other/web/issues/12> details", "other/web#12"],
    ["- [ ] https://forgejo.example/other/web/issues/12#comment-1", "other/web#12"],
    ["- [ ] https://forgejo.example/other/web/pulls/12", "other/web#12"],
    ["- [ ] (https://forgejo.example/other/web/issues/12).", "other/web#12"],
    ["- [ ] #12: Login page", "acme/api#12"],
    ["- [ ] #12, #13", "acme/api#12"],
    ["- [ ] #12.", "acme/api#12"],
    ["- [ ] (#12)", "acme/api#12"],
    ["- [ ] **#12** title", "acme/api#12"],
    ["- [ ] _web#12_", "acme/web#12"],
    ["- [ ] [#12](https://forgejo.example/acme/api/issues/12)", "acme/api#12"],
    ["1. [ ] #12", "acme/api#12"],
    ["10) [x] #12", "acme/api#12"],
  ])("parses %s", (line, ref) => expect(parse(line)).toEqual([ref]))

  it("deduplicates all forms and casing while preserving body order", () => {
    expect(
      parse(
        "- [ ] #12\n* [x] ACME/API#12\n- [ ] web#3\n- [ ] https://forgejo.example/acme/api/issues/12\n- [ ] #1",
      ),
    ).toEqual(["acme/api#12", "acme/web#3", "acme/api#1"])
  })

  it.each([
    "#12",
    "- #12",
    "- [ ] text #12",
    "- [y] #12",
    "- [ ] #0",
    "- [ ] #-1",
    "- [ ] #1suffix",
    "- [ ] ../web#1",
    "- [ ] owner/#12",
    "- [ ] #9007199254740992",
    "- [ ] https://elsewhere.example/acme/api/issues/12",
    "- [ ] https://forgejo.example.evil/acme/api/issues/12",
    "- [ ] `#12`",
    "1- [ ] #12",
    "- [ ] https://forgejo.example/api/v1/repos/acme/api/issues/12",
  ])("ignores invalid or non-task reference %s", (line) => expect(parse(line)).toEqual([]))

  it("ignores backtick and tilde fences, including longer fences and unfinished fences", () => {
    expect(
      parse(
        "````md\n- [ ] #1\n```\n- [ ] #2\n````\n- [ ] #3\n\nNotes\n  ~~~\n- [ ] #4\n  ~~~~\n- [ ] #5\n```\n- [ ] #6",
      ),
    ).toEqual(["acme/api#3", "acme/api#5"])
  })

  it("ignores indented code, fences inside list items, and HTML comments", () => {
    expect(
      parse(
        [
          "Notes",
          "",
          "    - [ ] #1",
          "",
          "- [ ] #2",
          "    ```",
          "    - [ ] #3",
          "    ```",
          "  - [ ] #4",
          "    - [ ] #5",
          "          - [ ] #6",
          "<!--",
          "- [ ] #7",
          "-->",
          "- [ ] <!-- #8 --> #9",
        ].join("\n"),
      ),
    ).toEqual(["acme/api#2", "acme/api#4", "acme/api#5", "acme/api#9"])
  })

  it("ignores a fence opened right after a list marker, until it closes or its item ends", () => {
    expect(parse("- ```md\n  - [ ] #99\n  ```\n- [ ] #12")).toEqual(["acme/api#12"])
    expect(parse("- [ ] #1\n  ```\n  - [ ] #2\n- [ ] #3")).toEqual(["acme/api#1", "acme/api#3"])
  })

  it("hides everything after an unclosed HTML comment", () => {
    expect(parse("- [ ] #1\n<!-- draft\n- [ ] #2\n- [ ] #3")).toEqual(["acme/api#1"])
  })

  it("reads children after a fence that holds a comment opener", () => {
    expect(parse("```\n<!--\n```\n- [ ] #12")).toEqual(["acme/api#12"])
    expect(parse("- [ ] #1\n  ~~~html\n  <p>draft</p> <!-- start\n  ~~~\n- [ ] #2")).toEqual([
      "acme/api#1",
      "acme/api#2",
    ])
  })

  it("does not open a backtick fence whose info string has a backtick", () => {
    expect(parse("- ```echo `pwd` ```\n  - [ ] #12")).toEqual(["acme/api#12"])
    expect(parse("```echo `pwd` ```\n- [ ] #13")).toEqual(["acme/api#13"])
  })

  it("reads nested task lists under a task item in body order", () => {
    expect(parse("- [ ] #1\n  - [x] #2\n    1. [ ] web#3\n- [ ] #4")).toEqual([
      "acme/api#1",
      "acme/api#2",
      "acme/web#3",
      "acme/api#4",
    ])
  })

  it("handles CRLF and blank bodies", () => {
    expect(parse("- [ ] #1\r\n\r\n- [x] #2")).toEqual(["acme/api#1", "acme/api#2"])
    expect(parse("")).toEqual([])
  })

  it("accepts only the configured Forgejo base path", () => {
    expect(
      parse(
        "- [ ] https://forgejo.example/git/acme/api/issues/12\n- [ ] https://forgejo.example/acme/api/issues/13",
        "https://forgejo.example/git/",
      ),
    ).toEqual(["acme/api#12"])
  })

  it("caps unique children at 200", () => {
    const refs = parse(
      Array.from({ length: 210 }, (_, i) => `- [ ] #${i + 1}\n- [x] #${i + 1}`).join("\n"),
    )
    expect(refs).toHaveLength(200)
    expect(refs.at(-1)).toBe("acme/api#200")
  })
})
