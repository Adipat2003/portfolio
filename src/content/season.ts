/**
 * Seasonal theme resolution.
 *
 * The season is computed, not fetched: GitHub Pages serves static files, so a
 * weather call has nowhere to run. One definition in content/seasons.json is
 * read by both renderers, which take Chicago's local date and agree on the
 * season, so the site never shows two different seasons on two surfaces.
 *
 * scripts/build.py implements the identical walk in Python for the static page
 * it owns. If either side changes, change both.
 *
 * The definition is passed in rather than imported, for the same reason
 * retrieval.ts takes its corpus as a parameter: a bare JSON import resolves
 * under the Next bundler but not under Node, which silently stops
 * scripts/season-check.mjs from exercising this file at all. Passing it in
 * keeps the module free of runtime imports, and keeps the check honest.
 */
import type { SeasonName, Seasons } from "./schema";

export type Palette = {
  accent: string;
  accent_soft: string;
  sky: [string, string, string];
  lights: string;
};

export type SeasonEngine = {
  /** The season for a date, in the site's own timezone. */
  seasonFor(now: Date): SeasonName;
  /** The palette for that season. Throws on a palette the content omits. */
  paletteFor(season: SeasonName): Palette;
};

const MONTH_INDEX: Record<string, number> = {
  "01": 0, "02": 1, "03": 2, "04": 3, "05": 4, "06": 5,
  "07": 6, "08": 7, "09": 8, "10": 9, "11": 10, "12": 11,
};

/** A comparable key for a boundary date, so the walk is one plain ordering. */
function boundaryKey(start: string): number {
  const [month, day] = start.split("-");
  return MONTH_INDEX[month] * 100 + Number(day);
}

/** The date in the season's own timezone, never the reader's. */
function localKey(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return boundaryKey(`${month}-${day}`);
}

/**
 * The season for a date: the latest boundary at or before it.
 *
 * The boundary with the latest start date is the one wrapping the new year, so
 * a date falling before every boundary in its own year belongs to it. That
 * makes winter the default for January and February with no special case.
 */
function walk(
  boundaries: Array<{ name: SeasonName; start: string }>,
  today: number,
): SeasonName {
  const sorted = [...boundaries].sort((a, b) => boundaryKey(a.start) - boundaryKey(b.start));
  let current = sorted[sorted.length - 1].name;
  for (const boundary of sorted) {
    if (boundaryKey(boundary.start) <= today) current = boundary.name;
  }
  return current;
}

/**
 * Builds the engine over one definition.
 *
 * The caller validates. Parsing in here would pull the schema, and so zod, into
 * a module that scripts/season-check.mjs has to load under plain Node, where an
 * extensionless relative import cannot be resolved and the check silently
 * produces no output at all.
 */
export function buildSeasons(seasons: Seasons): SeasonEngine {

  return {
    seasonFor(now) {
      return walk(seasons.boundaries, localKey(now, seasons.timezone));
    },
    paletteFor(season) {
      const p = seasons.palettes[season];
      if (!p) throw new Error(`seasons.json has no palette for '${season}'`);
      return {
        accent: p.accent,
        accent_soft: p.accent_soft,
        sky: [p.sky[0], p.sky[1], p.sky[2]],
        lights: p.lights,
      };
    },
  };
}
