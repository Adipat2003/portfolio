"use client";

import { useMemo, useState } from "react";
import ProjectCard from "./ProjectCard";
import type { Project } from "@/content/schema";

export default function ProjectGrid({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(() => {
    const seen: string[] = [];
    for (const p of projects) {
      for (const t of p.tags) if (!seen.includes(t)) seen.push(t);
    }
    return seen.slice(0, 14);
  }, [projects]);

  const shown = useMemo(
    () =>
      projects.filter((p) => {
        const haystack = [p.title, p.summary, p.role ?? "", p.course ?? "", ...p.tags]
          .join(" ")
          .toLowerCase();
        const text = haystack.includes(query.trim().toLowerCase());
        const tag = activeTag === null || p.tags.includes(activeTag);
        return text && tag;
      }),
    [projects, query, activeTag],
  );

  return (
    <>
      <div className="filter-bar">
        <label className="sr-only" htmlFor="project-filter">
          Filter projects
        </label>
        <input
          type="search"
          id="project-filter"
          placeholder="Filter by name, tag, or skill"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="ask-row" role="group" aria-label="Filter by tag">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              aria-pressed={activeTag === t}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <p className="concept-title" role="status" aria-live="polite">
        {shown.length} of {projects.length} projects
      </p>
      <div className="grid-3" style={{ marginTop: 24 }}>
        {shown.map((p) => (
          <ProjectCard key={p.slug} project={p} />
        ))}
      </div>
    </>
  );
}
