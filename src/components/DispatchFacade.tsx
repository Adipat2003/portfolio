import PublicPlaces from "./chicago/PublicPlaces";
import { site, publishedProjects } from "@/content/load";
import FilterBar from "./FilterBar";
import AskBox from "./AskBox";
import ChicagoSpots from "./chicago/ChicagoSpots";
import RotatingEvents from "./chicago/RotatingEvents";
import LandmarksList from "./chicago/LandmarksList";
import BiteRadar from "./chicago/BiteRadar";

export default function DispatchFacade() {
  return (
    <div className="toggle-view dispatch" id="view-dispatch" data-active="true" aria-label={site.facades.dispatch.name}>
      <header className="hero">
        <span className="ghost-star" aria-hidden="true" />
        <div className="wrap dispatch-hero">
          <div className="dispatch-hero-copy">
            <span className="kicker hero-kicker">
              <span>{site.owner}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{site.role}, {site.location}</span>
            </span>
            <h1>{site.tagline}</h1>
            <p className="lede">{site.intro}</p>
            <div className="hero-actions">
              <a className="hero-action-primary" href="#f1-work">Browse selected work</a>
              {site.contact?.github ? (
                <a className="hero-action-secondary" href={site.contact.github}>GitHub profile</a>
              ) : null}
            </div>
            {site.academics_line ? <p className="hero-credential">{site.academics_line}</p> : null}
          </div>
        </div>
      </header>

      <section aria-labelledby="f1-work">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="kicker">Selected work</span>
              <h2 id="f1-work">Projects and what changed</h2>
            </div>
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

      <ChicagoSpots
        id="f1-chicago"
        kicker="Aditya in Chicago"
        heading="Places that are his, in his own city"
      />

      <BiteRadar id="f1-bites" />

      <PublicPlaces />

      <RotatingEvents />

      <LandmarksList id="f1-landmarks" />

      <AskBox
        examples={site.ask_examples}
        headingId="f1-ask"
        heading="Questions get sourced answers"
      />

      <hr className="flag-rule" aria-hidden="true" />
      <footer className="wrap site-foot">
        <span>{site.facades.dispatch.description}</span>
        <span>
          Machine-readable content: <a href="/portfolio/api/portfolio.json">portfolio.json</a>
        </span>
      </footer>
    </div>
  );
}
