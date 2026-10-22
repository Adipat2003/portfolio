/**
 * Shaping rules for the Chicago layer, kept free of runtime imports so
 * scripts/chicago-check.mjs can exercise them under plain Node, the same way
 * season-check.mjs exercises season.ts.
 *
 * The data is passed in rather than imported, so a check never depends on the
 * committed content being non-empty.
 */
import type { Chicago, ChicagoEvent, ChicagoSpot } from "./schema";

/**
 * The curated order for the spot strip: absolute favorites first, then
 * neighborhood, then name. Sorting is stable and total, so a record added at
 * any position renders in the same place on both facades.
 */
export function visibleSpots(chicago: Chicago): ChicagoSpot[] {
  return [...chicago.spots].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (a.neighborhood !== b.neighborhood) return a.neighborhood.localeCompare(b.neighborhood);
    return a.name.localeCompare(b.name);
  });
}

/** The event shown for a rotation step, wrapping at the end of the list. */
export function eventAt(events: ChicagoEvent[], index: number): ChicagoEvent | null {
  if (events.length === 0) return null;
  const wrapped = ((index % events.length) + events.length) % events.length;
  return events[wrapped];
}

/** A landmark note, when the author has written one for that building. */
export function noteFor(landmarkNotes: Record<string, string>, building: string): string | null {
  const note = landmarkNotes[building];
  return note && note.trim() ? note : null;
}
