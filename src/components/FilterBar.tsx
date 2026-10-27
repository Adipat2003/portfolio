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

  const hasFilters = query.trim().length > 0 || activeTag !== null;

  return (
    <>
      <div className="filter-bar">
        <div className="filter-search">
          <label htmlFor="project-filter">Find a project</label>
          <div className="filter-bar-top">
            <div className="filter-control">
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <circle cx="10.8" cy="10.8" r="6.4" />
                <path d="m15.5 15.5 4.2 4.2" />
              </svg>
              <input
                type="search"
                id="project-filter"
                placeholder="Title, skill, or technology"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {hasFilters ? (
              <button
                type="button"
                className="chip clear-filter"
                onClick={() => {
                  setQuery("");
                  setActiveTag(null);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
        <div className="filter-tags">
          <span className="filter-tags-label">Filter by tag</span>
          <div className="filter-tag-list" role="group" aria-label="Filter by tag">
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
      </div>
      <p className="project-count" role="status" aria-live="polite">
        {shown.length} of {projects.length} projects
      </p>

      {shown.length === 0 ? (
        <div className="empty-state" role="status" aria-live="polite">
          <h3>No projects match this filter</h3>
          <p>Try a broader skill, a different tag, or clear the filters to return to the full list.</p>
        </div>
      ) : (
        <div className="project-grid">
          {shown.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      )}
    </>
  );
}
