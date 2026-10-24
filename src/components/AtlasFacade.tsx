import { site, publishedProjects, atlas } from "@/content/load";
import { weather } from "@/content/weather";
import WeatherBadge from "./WeatherBadge";
import LandmarkExplorer from "./chicago/LandmarkExplorer";
import ChicagoSpots from "./chicago/ChicagoSpots";
import RotatingEvents from "./chicago/RotatingEvents";
import ImpactStrip from "./ImpactStrip";
import ProjectCard from "./ProjectCard";
import AskBox from "./AskBox";
import AtlasScene from "./atlas/AtlasScene";

export default function AtlasFacade() {
  return (
    <div className="toggle-view atlas" id="view-atlas" data-active="true" aria-label={site.facades.atlas.name}>
      <header className="atlas-hero">
        <AtlasScene>
          <WeatherBadge className="atlas-weather" />
          <LandmarkExplorer />
          <p className="swipe-cue">Swipe the skyline to explore the whole map.</p>
          <div className="atlas-hero-copy wrap">
            <span className="kicker">Facade 2: The Atlas</span>
            <h1>The city is the navigation.</h1>
            <p className="lede">
              Same portfolio, different facade: the skyline is authored SVG, the river and elevated
              lines are routes, and each project is a station on the map.
            </p>
            <p className="dye-note">River dye week: Chicago runs the river green ahead of St. Patrick's Day.</p>
          </div>
          <div className={`weather-fx ${weather.condition_kind}`} aria-hidden="true" />
        </AtlasScene>
      </header>

      <ImpactStrip figures={site.impact} />

      <div className="atlas-copy">
        <div className="wrap">
          <p className="atelier-note">
            <b>Art pipeline:</b> {atlas.buildings.length} named landmarks as authored SVG.{" "}
            <span>Routes and stations render from data, so the map is diffable source.</span>
          </p>
        </div>
      </div>

      <ChicagoSpots
        id="f2-chicago"
        kicker="Aditya in Chicago"
        heading="Places that are his, in his own city"
      />
      <RotatingEvents />

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

      <hr className="flag-rule" aria-hidden="true" />
      <footer className="wrap site-foot">
        <span>{site.facades.atlas.description}</span>
        <span>
          Machine-readable content: <a href="/portfolio/api/portfolio.json">portfolio.json</a>
        </span>
      </footer>
    </div>
  );
}
