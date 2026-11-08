import { useEffect, useState } from "react"

// Signatures of data that has already been drawn with its entrance, across mounts, so returning
// to a page whose data has not changed draws the chart at rest.
const played = new Set<string>()

/**
 * Whether a chart should play its entrance: once for each distinct `signature` of its data. The
 * answer holds for as long as the signature does, so a hover re-render never cuts the entrance
 * short.
 */
export const useEntrance = (signature: string) => {
  const [state, setState] = useState(() => ({ signature, play: !played.has(signature) }))
  const current =
    state.signature === signature ? state : { signature, play: !played.has(signature) }
  if (current !== state) setState(current)
  useEffect(() => {
    played.add(signature)
  }, [signature])
  return current.play
}
