import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

const FADE = "2rem"

/**
 * A list that scrolls inside its card from the `md` breakpoint up, fading out at the edge that
 * hides more rows so the reader sees there is more. On phones the list shows in full.
 */
export const ScrollFade = ({
  className,
  children,
}: {
  /** The height cap, such as `md:max-h-80`. */
  readonly className: string
  readonly children: ReactNode
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ above: false, below: false })
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const measure = () => {
      const { scrollTop, scrollHeight, clientHeight } = element
      const above = scrollTop > 1
      const below = scrollTop + clientHeight < scrollHeight - 1
      setEdges((current) =>
        current.above === above && current.below === below ? current : { above, below },
      )
    }
    measure()
    element.addEventListener("scroll", measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => {
      element.removeEventListener("scroll", measure)
      observer.disconnect()
    }
  }, [])
  const mask =
    edges.above || edges.below
      ? `linear-gradient(to bottom, ${edges.above ? `transparent, black ${FADE}` : "black"}, ${
          edges.below ? `black calc(100% - ${FADE}), transparent` : "black"
        })`
      : undefined
  return (
    <div
      ref={ref}
      className={`scroll-thin md:overflow-y-auto md:overscroll-contain ${className}`}
      style={mask === undefined ? undefined : { maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </div>
  )
}
