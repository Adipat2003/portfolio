import { memo } from "react";
import geography from "../../../content/chicago-basemap.json";

/** Geographic context is bundled locally, so exploring never waits for map tiles. */
export default memo(function RailBasemap() {
	return <g className="rail-geography" aria-hidden="true">
		<g className="rail-parks">{geography.parks.map((feature, index) => <path key={index} d={feature.path} />)}</g>
		<g className="rail-streets">{geography.streets.map((feature) => <path key={feature.class} data-road-class={feature.class} d={feature.path} />)}</g>
		<g className="rail-water">{geography.water.map((feature, index) => <path key={index} d={feature.path} fillRule="evenodd" />)}</g>
	</g>;
});
