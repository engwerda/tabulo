import { type Clock, Duration, Effect } from "effect"

/**
 * A Clock that a test moves by hand. A sleep advances the clock and returns at once, unless
 * `parkSleeps` is set: then it waits for `wake`, so a test can hold a request where it waits.
 */
export const createFakeClock = ({ parkSleeps = false } = {}) => {
  let now = Date.UTC(2026, 10, 7, 9, 0)
  let parked: Array<() => void> = []
  let firstSleep = () => {}
  const slept = new Promise<void>((resolve) => {
    firstSleep = resolve
  })
  const nanos = () => BigInt(now) * 1_000_000n
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: nanos,
    currentTimeNanos: Effect.sync(nanos),
    monotonicTimeNanosUnsafe: nanos,
    monotonicTimeNanos: Effect.sync(nanos),
    sleep: (duration) =>
      parkSleeps
        ? Effect.promise(
            () =>
              new Promise<void>((resolve) => {
                parked.push(resolve)
                firstSleep()
              }),
          )
        : Effect.sync(() => {
            now += Duration.toMillis(duration)
          }),
  }
  return {
    clock,
    advance: (millis: number) => {
      now += millis
    },
    /** Resolves once anything has started sleeping. */
    slept,
    wake: () => {
      const sleepers = parked
      parked = []
      for (const resume of sleepers) resume()
    },
  }
}
