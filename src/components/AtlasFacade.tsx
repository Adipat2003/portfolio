import { site } from "@/content/load";
import CtaRailMap from "./atlas/CtaRailMap";
import AtlasRide from "./atlas/AtlasRide";

/** The scenic portfolio ride opens Atlas, followed by the live CTA network. */
export default function AtlasFacade() {
  return (
    <div className="toggle-view atlas" id="view-atlas" data-active="true" aria-label={site.facades.atlas.name}>
      <AtlasRide />
      <CtaRailMap />

    </div>
  );
}
