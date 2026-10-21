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

export const buildingSchema = z.object({
  name: z.string(),
  feature: z.string(),
  d: z.string(),
  extra: z.string().optional(),
  extra_stroke: z.string().optional(),
  extra_width: z.number().optional(),
  extra_fill: z.string().optional(),
});

export const atlasSchema = z.object({
  viewBox: z.string(),
  buildings: z.array(buildingSchema),
  window_lights: z.array(z.tuple([z.number(), z.number()])),
  window_size: z.tuple([z.number(), z.number()]),
  river: z.array(
    z.object({
      d: z.string(),
      fill: z.string().optional(),
      stroke: z.string(),
      width: z.number(),
      opacity: z.number().optional(),
    }),
  ),
  station_style: z.object({
    r: z.number(),
    fill: z.string(),
    stroke_width: z.number(),
    halo: z.string(),
  }),
  labels: z.record(
    z.string(),
    z.object({ label: z.string(), cx: z.number(), cy: z.number(), dx: z.number(), dy: z.number() }),
  ),
});

export type Figure = z.infer<typeof figureSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Site = z.infer<typeof siteSchema>;
export type Building = z.infer<typeof buildingSchema>;
export type Atlas = z.infer<typeof atlasSchema>;
export type LineName = "red" | "blue";
