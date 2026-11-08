export type RideExtent = { rideTop: number; rideHeight: number; viewportHeight: number };

/** Time-based settling produces the same camera response at every refresh rate. */
export function motionEase(elapsed: number, reducedMotion: boolean, responseMs = 180): number {
  return reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, elapsed) / responseMs);
}

/** Stop positions follow the scene's progress warp, not uniform phase spacing. */
export function ridePhaseOffset({ rideTop, rideHeight, viewportHeight, target, stopCount }: RideExtent & { target: number; stopCount: number }): number {
  const progress = target <= stopCount
    ? (target / stopCount) * .84
    : Math.min(.94, .92 + (target - stopCount) * .02);
  return rideTop + progress * Math.max(0, rideHeight - viewportHeight);
}

export function rideSkipOffset({ rideTop, rideHeight }: Pick<RideExtent, "rideTop" | "rideHeight">): number {
  return rideTop + rideHeight + 8;
}

/** Camera animation handles the glide; the browser must acknowledge taps now. */
export function jumpInstantly(top: number, scrollTo: (options: ScrollToOptions) => void): void {
  scrollTo({ top, behavior: "instant" });
}
