import { LINE_COLORS } from "@/content/load";
import type { Project } from "@/content/schema";

/**
 * The Dispatch card: a broadsheet entry on the transit system. The route
 * disc carries the line color as the accent system (not a stray banner),
 * the title wins the hierarchy over administrative metadata, and the
 * technology list reads as an editorial STACK line instead of SaaS pills.
 */
export default function ProjectCard({ project }: { project: Project }) {
  const cls = project.status === "pending-content" ? "card pending" : "card";
  return (
    <article
      className={cls}
      style={{ ["--line-color" as string]: LINE_COLORS[project.line] }}
    >
      <span className="kicker">
        {project.line} line{project.course ? ` · ${project.course}` : ""}
      </span>
      <h3>
        <a href={`/portfolio/projects/${project.slug}/`}>{project.title}</a>
      </h3>
      <p>{project.summary}</p>
      {project.role ? (
        <p className="role">
          <b>Role:</b> {project.role}
        </p>
      ) : null}
      {project.figures.length > 0 ? (
        <ul className="figs">
          {project.figures.map((f) => (
            <li key={`${f.value}-${f.label}`}>
              <b>{f.value}</b> {f.label} <i>({f.kind})</i>
            </li>
          ))}
        </ul>
      ) : null}
      {project.tags.length > 0 ? (
        <p className="stack">
          <b>Stack</b>
          {project.tags.join(" · ")}
        </p>
      ) : null}
    </article>
  );
}
