import { site } from "@/content/load";
import CtaRailMap from "./atlas/CtaRailMap";
import AtlasRide from "./atlas/AtlasRide";

/** The scenic portfolio ride opens Atlas, followed by the live CTA network. */
export default function AtlasFacade() {
  return (
    <div className="toggle-view atlas" id="view-atlas" data-active="true" aria-label={site.facades.atlas.name}>
      <AtlasRide />
      <CtaRailMap />
      <footer className="atlas-end" aria-labelledby="atlas-end-title">
        <div className="atlas-end-copy">
          <span className="atlas-end-kicker">End of the line</span>
          <h2 id="atlas-end-title">The work keeps moving.</h2>
          <p>Read the projects in the Dispatch, or see the work on GitHub.</p>
        </div>
        <nav className="atlas-end-actions" aria-label="After the Atlas">
          <a href="/portfolio/#dispatch" onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}>Read the Dispatch</a>
          {site.contact?.github ? <a href={site.contact.github}>GitHub profile</a> : null}
        </nav>
      </footer>

    </div>
  );
}
