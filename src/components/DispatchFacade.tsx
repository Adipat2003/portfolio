import { site, publishedProjects } from "@/content/load";
import ImpactStrip from "./ImpactStrip";
import FilterBar from "./FilterBar";
import AskBox from "./AskBox";

export default function DispatchFacade() {
  const meta = site.impact.slice(0, 3);
  return (
    <div className="toggle-view" id="view-dispatch" data-active="true" aria-label={site.facades.dispatch.name}>
      <header className="hero">
        <div className="wrap">
          <span className="kicker">
            {site.owner} &middot; {site.role}, {site.location}
          </span>
          <h1>{site.tagline}</h1>
          <p className="lede">{site.intro}</p>
          {site.academics_line ? (
            <p className="lede" style={{ marginTop: 18 }}>
              {site.academics_line}
            </p>
          ) : null}
          <div className="hero-meta">
            {meta.map((i) => (
              <span key={i.label}>
                <b>{i.value}</b> {i.label.split(",")[0]}
              </span>
            ))}
          </div>
        </div>
      </header>

      <ImpactStrip figures={site.impact} />

      <section aria-labelledby="f1-work">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="kicker">Selected work</span>
              <h2 id="f1-work">Projects and what changed</h2>
            </div>
            <span className="concept-title">{publishedProjects.length} projects</span>
          </div>
          <FilterBar projects={publishedProjects} />
        </div>
      </section>

      {site.about ? (
        <section aria-labelledby="f1-about">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="kicker">About</span>
                <h2 id="f1-about">The short version</h2>
              </div>
            </div>
            <div className="card">
              <p>{site.about}</p>
              {site.contact?.github ? (
                <p className="role">
                  <b>GitHub:</b>{" "}
                  <a href={site.contact.github}>{site.contact.github.replace("https://", "")}</a>
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <AskBox
        examples={site.ask_examples}
        headingId="f1-ask"
        heading="Questions get sourced answers"
        facadeLabel="dispatch"
      />

      <hr className="rule" />
      <footer className="wrap site-foot">
        <span>{site.facades.dispatch.description}</span>
        <span>
          Machine-readable content: <a href="/portfolio/api/portfolio.json">portfolio.json</a>
        </span>
      </footer>
    </div>
  );
}
