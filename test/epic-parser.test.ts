import { describe, expect, it } from "vitest"
import { parseEpicChildren, parseEpicParents } from "../src/worker/epic-links.ts"

const parse = (body: string, url = "https://forgejo.example") =>
  parseEpicChildren(body, { owner: "acme", name: "api" }, url).map(({ ref }) => ref)

const parents = (body: string, repository = { owner: "acme", name: "api" }) =>
  parseEpicParents(body, repository, "https://forgejo.example").map(({ ref }) => ref)

describe("epic list references", () => {
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
    ["- [ ]\t#12", "acme/api#12"],
    ["> - [ ] #12", "acme/api#12"],
    ["- [ ] [Fix login](https://forgejo.example/acme/api/issues/12)", "acme/api#12"],
    ['- [ ] [Fix login](<https://forgejo.example/acme/api/issues/12> "Login") now', "acme/api#12"],
    ["- [ ] [#12 Fix login](https://forgejo.example/other/web/issues/3)", "acme/api#12"],
  ])("parses %s", (line, ref) => expect(parse(line)).toEqual([ref]))

  it("deduplicates all forms and casing while preserving body order", () => {
    expect(
      parse(
        "- [ ] #12\n* [x] ACME/API#12\n- [ ] web#3\n- [ ] https://forgejo.example/acme/api/issues/12\n- [ ] #1",
      ),
    ).toEqual(["acme/api#12", "acme/web#3", "acme/api#1"])
  })

  it.each([
    ["- #12", "acme/api#12"],
    ["10) web#3", "acme/web#3"],
    ["* other/web#4 title", "other/web#4"],
    ["- https://forgejo.example/acme/api/issues/12", "acme/api#12"],
    [
      "1. [#931 Manage the dataset lifecycle](https://forgejo.example/acme/api/issues/931)",
      "acme/api#931",
    ],
  ])("lists the plain item %s without a checkbox", (line, ref) =>
    expect(parse(line)).toEqual([ref]),
  )

  it("reads a numbered delivery list as children in its order, by each item's first reference", () => {
    const body = [
      "## Proposed solution",
      "",
      "This epic delivers #1083 in six issues.",
      "",
      "### Findings that shape the plan",
      "",
      "- **Events are already in our data feed.** They join through `OBJECTID`.",
      "- **There is no calendar model.**",
      "",
      "### Issues in delivery order",
      "",
      "1. #1814 Sync upcoming company events and show them on the company page.",
      "2. #1815 Add research meetings and a calendar page. Uses #1814 for the merged list.",
      "3. #1816 Let the assistant read the calendar. Depends on #1814 and #1815.",
      "4. #1817 Prepare a pack before a meeting. Depends on #1815 and uses #1814.",
      "5. #1818 Email attendees when their pack is ready. Depends on #1817.",
      "6. #1819 Prompt for notes after a meeting. Hands over to the flow from #1082.",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] All child issues are closed.",
      "- [ ] Every acceptance criterion in #1083 is met or moved to a follow-up issue.",
    ].join("\n")
    expect(parse(body)).toEqual([
      "acme/api#1814",
      "acme/api#1815",
      "acme/api#1816",
      "acme/api#1817",
      "acme/api#1818",
      "acme/api#1819",
    ])
  })

  it("lists an issue once whether its item has a checkbox or not", () => {
    expect(parse("- [ ] #1\n- #1\n1. #2")).toEqual(["acme/api#1", "acme/api#2"])
  })

  it.each([
    "#12",
    "- Depends on #12",
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
    "- \\[ ] #12",
    "- **[ ]** #12",
    "- [ ]#12",
    "- [ ] [Fix login](https://elsewhere.example/acme/api/issues/12)",
    "- [ ] <!-- #8 --> #9",
  ])("ignores %s, whose item does not start with a valid reference", (line) =>
    expect(parse(line)).toEqual([]),
  )

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
        ].join("\n"),
      ),
    ).toEqual(["acme/api#2", "acme/api#4", "acme/api#5"])
  })

  it("ignores a fence opened right after a list marker, until it closes or its item ends", () => {
    expect(parse("- ```md\n  - [ ] #99\n  ```\n- [ ] #12")).toEqual(["acme/api#12"])
    expect(parse("- [ ] #1\n  ```\n  - [ ] #2\n- [ ] #3")).toEqual(["acme/api#1", "acme/api#3"])
  })

  it("reads the checkbox from the source, so a link definition named x cannot hide it", () => {
    expect(parse("- [x] #12\n- [ ] #13\n\n[x]: https://example.org")).toEqual([
      "acme/api#12",
      "acme/api#13",
    ])
  })

  it("reads a leading link by its text, then by its inline destination only", () => {
    const definition = "\n\n[1]: https://forgejo.example/acme/api/issues/13"
    expect(parse(`- [ ] [#12][1]${definition}`)).toEqual(["acme/api#12"])
    expect(parse(`- [ ] [Fix login][1]${definition}`)).toEqual([])
    expect(parse("- [ ] [**Fix**](https://forgejo.example/acme/api/issues/13), more")).toEqual([
      "acme/api#13",
    ])
    expect(parse("- [ ] [Fix login](/acme/api/issues/13)")).toEqual([])
    expect(parse("- [ ] [Fix login](#12)")).toEqual([])
    expect(parse("- [ ] [Fix login](web#12)")).toEqual([])
  })

  it("ignores text that CommonMark does not read as a link", () => {
    expect(parse("- [ ] [Fix](https://forgejo.example/acme/api/issues/12 nonsense)")).toEqual([])
    expect(parse("- [ ] [Fix](<https://forgejo.example/acme/api/issues/12)")).toEqual([])
    expect(parse("- [ ] # [Fix](https://forgejo.example/acme/api/issues/12)")).toEqual([])
  })

  it("does not read a code span in a link's text as its reference", () => {
    expect(parse("- [ ] [`#12`](https://forgejo.example/acme/api/issues/13)")).toEqual([
      "acme/api#13",
    ])
    expect(parse("- [ ] [`#12`](https://elsewhere.example/x)")).toEqual([])
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

  it("leaves out the parent a Parent heading or line names, before the cap", () => {
    const tasks = Array.from({ length: 200 }, (_, i) => `- [ ] #${i + 201}`).join("\n")
    const refs = parse(`## Parent\n\n- #100\n\n## Tasks\n\n${tasks}`)
    expect(refs).toHaveLength(200)
    expect(refs[0]).toBe("acme/api#201")
    expect(refs.at(-1)).toBe("acme/api#400")
    expect(parse("Parent: #100\n\n- #100\n- #101")).toEqual(["acme/api#101"])
  })

  it.each([
    ["## Epic\n\n1. #1814 API\n2. #1815 UI", ["acme/api#1814", "acme/api#1815"]],
    ["- #1814\n- #1815\n\nPart of #1814 shipped last week.", ["acme/api#1814", "acme/api#1815"]],
    [
      "Status: blocked. Part of #1815 waits on infra.\n\n- #1814\n- #1815",
      ["acme/api#1814", "acme/api#1815"],
    ],
  ])("keeps a listed child that only an Epic heading or part of names, in %j", (body, refs) =>
    expect(parse(body)).toEqual(refs),
  )
})

describe("epic parent references", () => {
  it.each([
    ["Part of #1813, which delivers #1083.", "acme/api#1813"],
    ["This issue is part of #930 and adds the import screen.", "acme/api#930"],
    ["## Parent\n\n#930", "acme/api#930"],
    ["## Parent\n\n#930 (found in the integration review of #1377)", "acme/api#930"],
    ["Parent: #12", "acme/api#12"],
    ["**Parent:** #12", "acme/api#12"],
    ["**Parent**: #12", "acme/api#12"],
    ["Epic: web#12", "acme/web#12"],
    ["parent: other/web#12", "other/web#12"],
    ["## Epic\n\n#12", "acme/api#12"],
    ["Parent\n------\n\n#12", "acme/api#12"],
    ["## Parent:\n\n- #12", "acme/api#12"],
    ["## Part of #12", "acme/api#12"],
    ["(Part of #12)", "acme/api#12"],
    ["PART OF #12", "acme/api#12"],
    ["Sync events\nPart of #12", "acme/api#12"],
    ["Done. Part of #12", "acme/api#12"],
    ["Part of: #12", "acme/api#12"],
    ["Part of (<https://forgejo.example/acme/web/issues/12>)", "acme/web#12"],
    ["Parent: (<https://forgejo.example/acme/web/issues/12>)", "acme/web#12"],
    ["## Parent\n\n(<https://forgejo.example/acme/web/issues/12>)", "acme/web#12"],
    ["## Parent\n<!-- e.g. #123 -->\n#12", "acme/api#12"],
    ["## Parent\n\n- [ ] #12", "acme/api#12"],
    ["## Parent\n\n- [x] #12", "acme/api#12"],
    ["## Parent\n\n- [x] #12\n\n[x]: https://example.org", "acme/api#12"],
    ["## Parent\n\n- [x] #12\n\n[x]: https://forgejo.example/acme/api/issues/99", "acme/api#12"],
    ["**Part of:** #97", "acme/api#97"],
    ["Part of [#12](https://forgejo.example/acme/api/issues/12)", "acme/api#12"],
    ["Part of [the epic](https://forgejo.example/acme/web/issues/12)", "acme/web#12"],
    ["Part of <https://forgejo.example/acme/web/issues/12>", "acme/web#12"],
    ["Part of [the epic][e]\n\n[e]: https://forgejo.example/acme/web/issues/12", "acme/web#12"],
  ])("finds the parent in %j", (body, ref) => expect(parents(body)).toEqual([ref]))

  it.each([
    "Document how a parent issue #930 and its child issues #931 and #932 relate.",
    "Related to #930",
    "Closes #931",
    "Part of a whole: no pie, doughnut, or gauge charts. See #12.",
    "Depends on #12",
    "Blocked by #12",
    "Follow-up to #12",
    "Split from #12",
    "This is not part of #12",
    "No longer part of #12",
    "It was part of #12",
    "A counterpart of #12",
    "`Part of #12`",
    "Part of `api` #12",
    "```\nPart of #12\n```",
    "    Part of #12",
    "> Part of #12",
    "> ## Parent\n>\n> #12",
    "<!-- Part of #12 -->",
    "<div>\nPart of #12\n</div>",
    "Parent #12",
    "Done. Parent: #12",
    "## Parents\n\n#12",
    "## Parent issue\n\n#12",
    "## Parent\n\nSee #12",
    "## Parent\n\n---\n\n#12",
    "## Parent\n\n> #12",
    "Part of https://elsewhere.example/acme/api/issues/12",
    "Part of [the epic](/acme/api/issues/12)",
  ])("finds no parent in %j", (body) => expect(parents(body)).toEqual([]))

  it("resolves a bare number in the describing issue's own repository", () => {
    expect(parents("Part of #5", { owner: "acme", name: "web" })).toEqual(["acme/web#5"])
  })

  it("returns every parent once, in body order", () => {
    expect(parents("Part of #5\n\n## Parent\n\nweb#6\n\nPart of ACME/API#5")).toEqual([
      "acme/api#5",
      "acme/web#6",
    ])
  })
})
