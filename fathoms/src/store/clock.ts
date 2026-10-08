/** The one place components read the clock, so tests can pin it and render stays pure. */
export const clock = {
  now: (): number => Date.now(),
}
