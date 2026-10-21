import { site, publishedProjects, atlas } from "@/content/load";
import AtlasMap from "./atlas/AtlasMap";
import ImpactStrip from "./ImpactStrip";
import ProjectCard from "./ProjectCard";
import AskBox from "./AskBox";

export default function AtlasFacade() {
  return (
    <div className="toggle-view atlas" id="view-atlas" data-active="true" aria-label={site.facades.atlas.name}>
      <header className="atlas-hero">
        <AtlasMap />
        <ImpactStrip figures={site.impact} />
      </header>

      <div className="atlas-copy">
        <div className="wrap">
          <span className="kicker">Facade 2: The Atlas</span>
          <h1>The city is the navigation.</h1>
          <p className="lede">
            Same portfolio, different facade: the skyline is authored SVG, the river and elevated
            lines are routes, and each project is a station on the map.
          </p>
          <p className="atelier-note">
            <b>Art pipeline:</b> {atlas.buildings.length} named landmarks as authored SVG.{" "}
            <span>Routes and stations render from data, so the map is diffable source.</span>
          </p>
        </div>
      </div>

      <section aria-labelledby="f2-work">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="kicker">Stations</span>
              <h2 id="f2-work">The same projects, mapped</h2>
            </div>
          </div>
          <div className="grid-3">
            {publishedProjects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        </div>
      </section>

      <AskBox
        examples={site.ask_examples}
        headingId="f2-ask"
        heading="The Atlas answers too"
      />

      <hr className="rule" />
      <footer className="wrap site-foot">
        <span>{site.facades.atlas.description}</span>
        <span>
          Machine-readable content: <a href="/portfolio/api/portfolio.json">portfolio.json</a>
        </span>
      </footer>
    </div>
  );
}
