/**
 * Text typed and not yet sent, such as a new issue's title or a comment, kept while the tab is
 * open. Storage can be missing or refuse writes; a draft is then simply not kept.
 */
export const drafts = {
  read: (key: string) => {
    try {
      return window.sessionStorage.getItem(key) ?? ""
    } catch {
      return ""
    }
  },
  write: (key: string, text: string) => {
    try {
      if (text.trim() === "") window.sessionStorage.removeItem(key)
      else window.sessionStorage.setItem(key, text)
    } catch {}
  },
}

export const titleDraftKey = (org: string, column: string) =>
  `tabulo.board.draft.${org.toLowerCase()}.${column}`

export const commentDraftKey = (cardKey: string) => `tabulo.board.comment.${cardKey.toLowerCase()}`
