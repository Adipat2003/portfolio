import { z } from "zod";

// The content guard, now at compile time. The build fails when a record does
// not match, which replaces the Python-side check in scripts/build.py.

export const figureKind = z.enum(["measured", "projected", "self-reported"]);

export const figureSchema = z.object({
  value: z.string(),
  label: z.string(),
  kind: figureKind,
  source: z.string(),
});

export const projectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase with hyphens"),
  title: z.string(),
  summary: z.string(),
  problem: z.string().nullable(),
  role: z.string().nullable(),
  approach: z.array(z.string()),
  outcome: z.string().nullable(),
  figures: z.array(figureSchema),
  tags: z.array(z.string()),
  line: z.enum(["red", "blue"]),
  public_safe: z.literal(true, {
    errorMap: () => ({ message: "record must be marked public_safe: true" }),
  }),
  course: z.string().optional(),
  status: z.literal("pending-content").optional(),
});

export const siteSchema = z.object({
  owner: z.string(),
  role: z.string(),
  location: z.string(),
  tagline: z.string(),
  intro: z.string(),
  academics_line: z.string().optional(),
  about: z.string().optional(),
  contact: z.object({ github: z.string().url() }).partial().optional(),
  facades: z.object({
    dispatch: z.object({ name: z.string(), description: z.string() }),
    atlas: z.object({ name: z.string(), description: z.string() }),
  }),
  impact: z.array(figureSchema),
  ask_examples: z.array(
    z.object({ question: z.string(), answer: z.string(), source: z.string() }),
  ),
});

export const lineName = z.enum(["red", "blue"]);

export const routeSchema = z.object({
  line: lineName,
  d: z.string().min(1, "route path data is required"),
});

export const stationSchema = z.object({
  label: z.string(),
  cx: z.number(),
  cy: z.number(),
  dx: z.number(),
  dy: z.number(),
  /** Text anchor for the label, so an edge station can keep its name inside the map. */
  anchor: z.enum(["start", "middle", "end"]).optional(),
});

export const stationStyleSchema = z.object({
  r: z.number(),
  fill: z.string(),
  stroke_width: z.number(),
  halo: z.string(),
});

export const buildingSchema = z.object({
  name: z.string(),
  feature: z.string(),
  d: z.string(),
  extra: z.string().optional(),
  extra_stroke: z.string().optional(),
  extra_width: z.number().optional(),
  extra_fill: z.string().optional(),
});

export const riverSchema = z.object({
  d: z.string(),
  fill: z.string().optional(),
  stroke: z.string(),
  width: z.number(),
  opacity: z.number().optional(),
});

export const gradientStopSchema = z.object({
  offset: z.string(),
  color: z.string(),
});

export const gradientSchema = z.object({
  id: z.string(),
  x1: z.string(),
  y1: z.string(),
  x2: z.string(),
  y2: z.string(),
  stops: z.array(gradientStopSchema).min(2, "a gradient needs at least two stops"),
});

export const seasonName = z.enum(["winter", "spring", "summer", "fall"]);
export const seasonBoundarySchema = z.object({
  name: seasonName,
  /** Month and day the season begins, as MM-DD. */
  start: z.string().regex(/^\d{2}-\d{2}$/, "start must be MM-DD"),
});

export const seasonPaletteSchema = z.object({
  accent: z.string(),
  accent_soft: z.string(),
  /** Three sky stops, the first being the deepest. */
  sky: z.tuple([z.string(), z.string(), z.string()]),
  lights: z.string(),
});

export const seasonsSchema = z.object({
  note: z.string(),
  timezone: z.string(),
  boundaries: z.array(seasonBoundarySchema).min(1),
  palettes: z.record(seasonName, seasonPaletteSchema),
});

export const mosaicSchema = z.object({
  figure_index: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
});

export const mosaicsSchema = z.object({
  figures: z.array(mosaicSchema),
});

export const chicagoSpotKind = z.enum([
  "bar",
  "coffee",
  "food",
  "music",
  "shop",
  "other",
]);

/**
 * Bite Radar: one visit record from Aditya's Beli list, approved for
 * publication by hand. Self-reported by definition; the private Masterlist
 * stays private, and only records committed to this file ever render.
 */
export const biteVisitSchema = z.object({
  name: z.string().min(1),
  neighborhood: z.string(),
  kind: chicagoSpotKind,
  /** His Beli rating, 1 to 5. */
  rating: z.number().int().min(1).max(5),
  /** Last visit, YYYY-MM. */
  visited_on: z.string().regex(/^\d{4}-\d{2}$/, "visited_on must be YYYY-MM"),
  /** Total visits, when he tracks repeats. Defaults to 1. */
  visits: z.number().int().positive().optional(),
  note: z.string().optional(),
});

export const bitesSchema = z.object({
  public_safe_reviewed: z.literal(true, {
    errorMap: () => ({ message: "bites.json must set public_safe_reviewed: true" }),
  }),
  visits: z.array(biteVisitSchema),
});

export const chicagoSpotSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase with hyphens"),
  name: z.string(),
  neighborhood: z.string(),
  kind: chicagoSpotKind,
  /** Marks an absolute favorite, which sorts the spot to the top of the strip. */
  favorite: z.boolean(),
  note: z.string().optional(),
  public_safe: z.literal(true, {
    errorMap: () => ({ message: "record must be marked public_safe: true" }),
  }),
});

export const chicagoEventSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase with hyphens"),
  title: z.string(),
  kind: z.string(),
  when: z.string(),
  note: z.string().optional(),
  public_safe: z.literal(true, {
    errorMap: () => ({ message: "record must be marked public_safe: true" }),
  }),
});

export const chicagoSchema = z.object({
  note: z.string(),
  public_safe_reviewed: z.literal(true),
  spots: z.array(chicagoSpotSchema),
  events: z.array(chicagoEventSchema),
  /** A note per landmark, keyed by the building name in atlas.json. */
  landmark_notes: z.record(z.string(), z.string()),
});

export const atlasSchema = z.object({
  viewBox: z.string(),
  sky: gradientSchema,
  building_fill: gradientSchema,
  buildings: z.array(buildingSchema),
  window_lights: z.array(z.tuple([z.number(), z.number()])),
  window_size: z.tuple([z.number(), z.number()]),
  routes: z.array(routeSchema).min(1, "the Atlas needs at least one route"),
  river: z.array(riverSchema),
  station_style: stationStyleSchema,
  labels: z.record(z.string(), stationSchema),
});

export type Figure = z.infer<typeof figureSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Site = z.infer<typeof siteSchema>;
export type LineName = z.infer<typeof lineName>;
export type SeasonName = z.infer<typeof seasonName>;
export type SeasonPalette = z.infer<typeof seasonPaletteSchema>;
export type Seasons = z.infer<typeof seasonsSchema>;
export type Mosaic = z.infer<typeof mosaicSchema>;
export type BiteVisit = z.infer<typeof biteVisitSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Station = z.infer<typeof stationSchema>;
export type StationStyle = z.infer<typeof stationStyleSchema>;
export type Building = z.infer<typeof buildingSchema>;
export type Gradient = z.infer<typeof gradientSchema>;
export type Atlas = z.infer<typeof atlasSchema>;
export type ChicagoSpot = z.infer<typeof chicagoSpotSchema>;
export type ChicagoEvent = z.infer<typeof chicagoEventSchema>;
export type Chicago = z.infer<typeof chicagoSchema>;
