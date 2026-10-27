import { site } from "@/content/load";
import CtaRailMap, { CtaNetworkProvider } from "./atlas/CtaRailMap";
import AtlasRide from "./atlas/AtlasRide";

/** The geographic CTA network opens and closes Atlas; the skyline is a
 * secondary portfolio tour over the same project records as Dispatch. */
export default function AtlasFacade() {
  return (
    <div className="toggle-view atlas" id="view-atlas" data-active="true" aria-label={site.facades.atlas.name}>
      <CtaNetworkProvider>
        <CtaRailMap placement="start" />
        <AtlasRide />
        <CtaRailMap placement="end" />
      </CtaNetworkProvider>

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
