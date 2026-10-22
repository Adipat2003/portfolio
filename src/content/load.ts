import rawSite from "../../content/site.json";
import rawProjects from "../../content/projects.json";
import rawAtlas from "../../content/atlas.json";
import rawSeasons from "../../content/seasons.json";
import rawChicago from "../../content/chicago.json";
import { z } from "zod";
import {
  atlasSchema,
  chicagoSchema,
  projectSchema,
  seasonsSchema,
  siteSchema,
  type Atlas,
  type Chicago,
  type ChicagoEvent,
  type ChicagoSpot,
  type LineName,
  type Project,
  type Seasons,
  type Site,
} from "./schema";
import { buildSeasons, type Palette, type SeasonEngine } from "./season";
import { noteFor, visibleSpots } from "./chicago";

// Parsed once at build time. A schema failure throws here and fails the build,
// which is the same guarantee scripts/build.py gave from Python.

function loadSite(): Site {
  return siteSchema.parse(rawSite);
}

function loadProjects(): { projects: Project[] } {
  const parsed = z.object({
    public_safe_reviewed: z.literal(true),
    projects: z.array(projectSchema),
  });
  return parsed.parse(rawProjects);
}

function loadAtlas(): Atlas {
  return atlasSchema.parse(rawAtlas);
}

function loadSeasons(): Seasons {
  return seasonsSchema.parse(rawSeasons);
}

function loadChicago(): Chicago {
  return chicagoSchema.parse(rawChicago);
}

export const site: Site = loadSite();
export const projects: Project[] = loadProjects().projects;
export const atlas: Atlas = loadAtlas();

export const publishedProjects = projects.filter((p) => p.status !== "pending-content");

/**
 * The seasonal theme engine, built over content/seasons.json at build time. A
 * schema failure here fails the build, the same as every other record.
 */
export const seasons: SeasonEngine = buildSeasons(loadSeasons());

/**
 * The Chicago layer, parsed once at build time with the same guard the projects
 * carry. The spot and event arrays are expected to be empty until records are
 * approved for publication; every component checks before rendering.
 */
export const chicago: Chicago = loadChicago();

/** Spots in the curated order the strip renders. */
export const chicagoSpots: ChicagoSpot[] = visibleSpots(chicago);

/** Curated city events, in authored order. */
export const chicagoEvents: ChicagoEvent[] = chicago.events;

/** A landmark note when one exists for that building, else null. */
export function landmarkNote(building: string): string | null {
  return noteFor(chicago.landmark_notes, building);
}

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export const LINE_COLORS: Record<LineName, string> = {
  red: "#c0392b",
  blue: "#2e86c1",
};

export const LINES: LineName[] = ["red", "blue"];

/** Lines that carry at least one route in atlas.json. */
const routedLines = new Set(atlas.routes.map((r) => r.line));

/**
 * Station records joined to the projects they name, sorted by label for a
 * stable render order.
 *
 * The build fails when a station names a project that does not exist, or one
 * that is unpublished, or a line with no route: a station with no line to sit
 * on is a dead end on the map.
 */
export const stations = Object.entries(atlas.labels)
  .map(([slug, station]) => {
    const project = projectBySlug(slug);
    if (!project) {
      throw new Error(`atlas.json station '${slug}' has no matching project in projects.json`);
    }
    if (project.status === "pending-content") {
      throw new Error(`atlas.json station '${slug}' points at the unpublished project '${slug}'`);
    }
    if (!routedLines.has(project.line)) {
      throw new Error(
        `atlas.json station '${slug}' sits on line '${project.line}', which has no route`,
      );
    }
    return { slug, station, project };
  })
  .sort((a, b) => a.station.label.localeCompare(b.station.label));

const chicagoBuildingNames = new Set(atlas.buildings.map((b) => b.name));

/**
 * The same cross-checks the stations carry: a landmark note must name a
 * building that exists, and no spot or event slug may repeat. The build fails
 * otherwise, so a malformed record never reaches a render.
 */
for (const building of Object.keys(chicago.landmark_notes)) {
  if (!chicagoBuildingNames.has(building)) {
    throw new Error(`chicago.json landmark note '${building}' names no building in atlas.json`);
  }
}

for (const [list, kind] of [[chicago.spots, "spot"], [chicago.events, "event"]] as const) {
  const seen = new Set<string>();
  for (const record of list) {
    if (seen.has(record.slug)) {
      throw new Error(`chicago.json has a duplicate ${kind} slug '${record.slug}'`);
    }
    seen.add(record.slug);
  }
}
