export type RideExtent = { rideTop: number; rideHeight: number; viewportHeight: number };

const TERMINAL_START = .84;
const TERMINAL_END = .92;

/** Time-based settling produces the same camera response at every refresh rate. */
export function motionEase(elapsed: number, reducedMotion: boolean, responseMs = 180): number {
  return reducedMotion ? 1 : 1 - Math.exp(-Math.min(100, Math.max(0, elapsed)) / responseMs);
}

export function ridePhaseAtProgress(progress: number, stopCount: number): number {
  if (progress <= TERMINAL_START) return (progress / TERMINAL_START) * stopCount;
  if (progress <= TERMINAL_END) return stopCount;
  return Math.min(stopCount + 1, stopCount + (progress - TERMINAL_END) / (1 - TERMINAL_END));
}

/** Capture the nearest stop within 45% of a station interval. */
export function rideSnapPhase(progress: number, stopCount: number): number | null {
  if (progress <= 0 || progress >= TERMINAL_START) return null;
  const phase = ridePhaseAtProgress(progress, stopCount);
  const stop = Math.round(phase);
  return stop > 0 && Math.abs(stop - phase) <= .45 ? stop : null;
}

/** Stop positions follow the scene's progress warp, not uniform phase spacing. */
export function ridePhaseOffset({ rideTop, rideHeight, viewportHeight, target, stopCount }: RideExtent & { target: number; stopCount: number }): number {
  const progress = target <= stopCount
    ? (target / stopCount) * TERMINAL_START
    : Math.min(.94, TERMINAL_END + (target - stopCount) * .02);
  return rideTop + progress * Math.max(0, rideHeight - viewportHeight);
}

export function rideSkipOffset({ rideTop, rideHeight }: Pick<RideExtent, "rideTop" | "rideHeight">): number {
  return rideTop + rideHeight + 8;
}

/** Camera animation handles the glide; the browser must acknowledge taps now. */
export function jumpInstantly(top: number, scrollTo: (options: ScrollToOptions) => void): void {
  scrollTo({ top, behavior: "instant" });
}
