import { site } from "@/content/load";
import AtlasRide from "./atlas/AtlasRide";

/**
 * The Atlas is one interactive experience: the ride, then the dawn at the
 * lakefront. Every fact the removed sections carried still lives on the
 * Dispatch in plain HTML, which keeps the portfolio-first rule: the Atlas
 * adds the experience, never the information.
 */
export default function AtlasFacade() {
  return (
    <div className="toggle-view atlas" id="view-atlas" data-active="true" aria-label={site.facades.atlas.name}>
      <AtlasRide />

      <footer className="lakefront" aria-label="End of the line">
        <div className="sun" aria-hidden="true" />
        <div className="lakefront-inner wrap">
          <p className="sign">End of the line</p>
          <span>{site.facades.atlas.description}</span>
          <span className="lake-links">
            {site.contact?.github ? (
              <a href={site.contact.github}>GitHub</a>
            ) : null}
            <a href="/portfolio/api/portfolio.json">portfolio.json</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
