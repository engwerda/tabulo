import { isMac } from "../palette/keys.tsx"
import type { ShortcutSection } from "../palette/ShortcutsDialog.tsx"

/** The board's keys, which BoardPage, the cards, and the card panel handle. */
export const BOARD_SHORTCUTS: ReadonlyArray<ShortcutSection> = [
  {
    title: "Board",
    rows: [
      { keys: ["/"], label: "Search cards" },
      { keys: ["N"], label: "New issue in the first column" },
      { keys: ["M"], label: "Show only cards assigned to me" },
      { keys: ["R"], label: "Refresh the board" },
    ],
  },
  {
    title: "Card details",
    rows: [
      { keys: ["J"], label: "Next card in the column" },
      { keys: ["K"], label: "Previous card in the column" },
      { keys: ["A"], label: "Assign or unassign me" },
      { keys: ["O"], label: "Open in Forgejo" },
      { keys: [isMac ? "⌘" : "Ctrl", "↵"], label: "Send a comment" },
      { keys: ["Esc"], label: "Close" },
    ],
  },
  {
    title: "Cards",
    rows: [
      { keys: ["Tab"], label: "Go to the next column" },
      { keys: ["←", "↑", "↓", "→"], label: "Go to another card" },
      { keys: ["Home", "End"], label: "First or last card in the column" },
      { keys: ["↵"], label: "Open the card's details" },
      { keys: ["."], label: "Open the card's menu" },
      { keys: ["Space"], label: "Pick the card up, then drop it" },
      { keys: ["←", "↑", "↓", "→"], label: "Move a picked-up card" },
      { keys: ["Esc"], label: "Cancel a move" },
    ],
  },
  {
    title: "Menus",
    rows: [
      { keys: ["↓"], label: "Open a menu from its button" },
      { keys: ["↑", "↓"], label: "Go through its items" },
      { keys: ["↵"], label: "Choose an item" },
      { keys: ["Esc"], label: "Close it" },
    ],
  },
]
