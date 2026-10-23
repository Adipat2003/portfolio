import { LINE_COLORS } from "@/content/load";
import type { Project } from "@/content/schema";

export default function ProjectCard({ project }: { project: Project }) {
  const cls = project.status === "pending-content" ? "card pending" : "card";
  return (
    <article className={cls}>
      <span
        className="line-band"
        aria-hidden="true"
        style={{ background: LINE_COLORS[project.line] }}
      />
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
      <ul className="tags">
        {project.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </article>
  );
}
