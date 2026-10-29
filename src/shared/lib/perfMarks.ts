/**
 * User Timing marks for the slow paths (startup, row saves, the day/month toggle), so a
 * browser profile or the local bench (scripts/bench/startup) can read where the time goes
 * from `performance.getEntriesByType("measure")`. All names start with "dv:".
 */
export function perfMark(name: string): void {
  try {
    performance.mark(`dv:${name}`);
  } catch {
    // No User Timing (very old browsers, some test environments): timing is optional.
  }
}

/** Measures from the `dv:${start}` mark to now, as `dv:${name}`. */
export function perfMeasure(name: string, start: string): void {
  try {
    performance.measure(`dv:${name}`, `dv:${start}`);
  } catch {
    // Start mark missing or no User Timing.
  }
}
