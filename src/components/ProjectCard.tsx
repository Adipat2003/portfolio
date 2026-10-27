import { LINE_COLORS } from "@/content/load";
import type { Project } from "@/content/schema";

/**
 * The Dispatch card: a broadsheet entry on the transit system. The route
 * disc carries the line color as the accent system (not a stray banner),
 * the title wins the hierarchy over administrative metadata, and the
 * technology list reads as an editorial STACK line instead of SaaS pills.
 */
export default function ProjectCard({ project }: { project: Project }) {
  const cls = project.status === "pending-content" ? "project-card pending" : "project-card";

  return (
    <article
      className={cls}
      style={{ ["--line-color" as string]: LINE_COLORS[project.line] }}
    >
      <div className="project-card-head">
        <span className="project-line">
          <span className="project-line-dot" aria-hidden="true" />
          {project.line} line
        </span>
        {project.course ? <span className="project-course">{project.course}</span> : null}
      </div>
      <h3>
        <a href={`/portfolio/projects/${project.slug}/`}>{project.title}</a>
      </h3>
      <p className="summary">{project.summary}</p>

      {project.figures.length > 0 ? (
        <div className="project-evidence" aria-label={`${project.title} evidence`}>
          {project.figures.map((figure) => (
            <div className="project-metric" key={`${figure.value}-${figure.label}`}>
              <div className="project-metric-heading">
                <b>{figure.value}</b>
                <span className="evidence-kind">{figure.kind}</span>
              </div>
              <span className="project-metric-label">{figure.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {project.role ? (
        <div className="project-role">
          <span>Role</span>
          <p>{project.role}</p>
        </div>
      ) : null}

      {project.tags.length > 0 ? (
        <ul className="tag-row" aria-label={`${project.title} tags`}>
          {project.tags.slice(0, 4).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
