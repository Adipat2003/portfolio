import rawSite from "../../content/site.json";
import rawProjects from "../../content/projects.json";
import rawAtlas from "../../content/atlas.json";
import rawSeasons from "../../content/seasons.json";
import { z } from "zod";
import {
  atlasSchema,
  projectSchema,
  seasonsSchema,
  siteSchema,
  type Atlas,
  type LineName,
  type Project,
  type Seasons,
  type Site,
} from "./schema";
import { buildSeasons, type Palette, type SeasonEngine } from "./season";

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

export const site: Site = loadSite();
export const projects: Project[] = loadProjects().projects;
export const atlas: Atlas = loadAtlas();

export const publishedProjects = projects.filter((p) => p.status !== "pending-content");

/**
 * The seasonal theme engine, built over content/seasons.json at build time. A
 * schema failure here fails the build, the same as every other record.
 */
export const seasons: SeasonEngine = buildSeasons(loadSeasons());

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

/** Routes for one line, so a component renders a line's full path set. */
export function routesForLine(line: LineName) {
  return atlas.routes.filter((r) => r.line === line);
}
