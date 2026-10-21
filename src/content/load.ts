import rawSite from "../../content/site.json";
import rawProjects from "../../content/projects.json";
import rawAtlas from "../../content/atlas.json";
import {
  siteSchema,
  projectSchema,
  atlasSchema,
  type Site,
  type Project,
  type Atlas,
} from "./schema";

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

import { z } from "zod";

export const site: Site = loadSite();
export const projects: Project[] = loadProjects().projects;
export const atlas: Atlas = loadAtlas();

export const publishedProjects = projects.filter((p) => p.status !== "pending-content");

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export const LINE_COLORS: Record<string, string> = {
  red: "#c0392b",
  blue: "#2e86c1",
};
