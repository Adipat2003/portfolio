import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects } from "@/content/load";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  return { title: project ? `${project.title} | Aditya Patel` : "Not found" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) notFound();

  const steps = project.approach.length > 0 ? project.approach : null;

  return (
    <>
      <header className="detail-head">
        <div className="wrap">
          <p className="back">
            <a href="/portfolio/">&larr; The Dispatch</a> &middot;{" "}
            <a href="/portfolio/#atlas">The Atlas</a>
          </p>
          {project.course ? <span className="kicker">{project.course}</span> : null}{" "}
          <span className="kicker">{project.line} line</span>
          <h1>{project.title}</h1>
          <p className="lede">{project.summary}</p>
        </div>
      </header>

      <main className="wrap detail-body">
        <section aria-labelledby="d-problem">
          <h2 id="d-problem">The problem</h2>
          <p>{project.problem ?? project.summary}</p>
        </section>
        <section aria-labelledby="d-role">
          <h2 id="d-role">What was owned</h2>
          <p>{project.role ?? project.summary}</p>
        </section>
        {steps ? (
          <section aria-labelledby="d-approach">
            <h2 id="d-approach">Approach</h2>
            <ol className="steps">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>
        ) : null}
        <section aria-labelledby="d-outcome">
          <h2 id="d-outcome">Outcome</h2>
          <p>{project.outcome ?? project.summary}</p>
        </section>
        {project.figures.length > 0 ? (
          <section aria-labelledby="d-figures">
            <h2 id="d-figures">Figures</h2>
            <ul className="figs">
              {project.figures.map((f) => (
                <li key={`${f.value}-${f.label}`}>
                  <b>{f.value}</b> {f.label}{" "}
                  <i>
                    ({f.kind}, source: {f.source})
                  </i>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="d-tags">
          <h2 id="d-tags">Tags</h2>
          <ul className="tags">
            {project.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
