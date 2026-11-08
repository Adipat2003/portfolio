import type { RailNetwork, Point } from "./cta-geometry";
import type { FeatureCollection, LineString, Point as GeoPoint } from "geojson";
import type { FillExtrusionLayerSpecification, GeoJSONSourceSpecification, StyleSpecification } from "maplibre-gl";

export type MapBox = [number, number, number, number];
export type MapMode = "2d" | "3d";
export const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

/** Invert the local CTA equirectangular data, then let the engine project Mercator. */
export function coordinateFromPoint(point: number[], projection: RailNetwork["projection"]): Point {
	const { origin, radius, metresPerUnit } = projection;
	return [origin[1] + point[0] * metresPerUnit / (radius * Math.cos(origin[0] * Math.PI / 180)) * 180 / Math.PI,
		origin[0] - point[1] * metresPerUnit / radius * 180 / Math.PI];
}

export function boundsFromBox([x, y, width, height]: MapBox, projection: RailNetwork["projection"]): [Point, Point] {
	return [coordinateFromPoint([x, y + height], projection), coordinateFromPoint([x + width, y], projection)];
}

export function networkGeoJSON(network: RailNetwork, colors: Record<string, string>) {
	const routes: FeatureCollection<LineString> = { type: "FeatureCollection", features: network.routes.flatMap((route) => route.shapes.map((shape) => ({
		type: "Feature" as const, properties: { route: route.id, color: colors[route.id] ?? route.color },
		geometry: { type: "LineString" as const, coordinates: shape.points.map((point) => coordinateFromPoint(point, network.projection)) },
	}))) };
	const stations: FeatureCollection<GeoPoint> = { type: "FeatureCollection", features: network.stations.map((station) => ({
		type: "Feature", properties: { id: station.id, name: station.name, routes: station.routes.join(",") },
		geometry: { type: "Point", coordinates: coordinateFromPoint(station.point, network.projection) },
	})) };
	return { routes, stations };
}

export function placeSource(items: { id: string; point: Point }[], projection: RailNetwork["projection"]): GeoJSONSourceSpecification & { data: FeatureCollection<GeoPoint> } {
	return {
		type: "geojson", cluster: true, clusterRadius: 42, clusterMaxZoom: 18, maxzoom: 20,
		data: { type: "FeatureCollection", features: items.map((item) => ({
			type: "Feature", properties: { id: item.id },
			geometry: { type: "Point", coordinates: coordinateFromPoint(item.point, projection) },
		})) },
	};
}

export function modeCamera(mode: MapMode, reducedMotion: boolean) {
	return { pitch: mode === "3d" ? 55 : 0, bearing: 0, duration: reducedMotion ? 0 : 420 };
}

export function mapStyleURL(value?: string): string {
	try { const url = new URL(value ?? DEFAULT_MAP_STYLE); return url.protocol === "https:" ? url.href : DEFAULT_MAP_STYLE; }
	catch { return DEFAULT_MAP_STYLE; }
}

/** Tile/source failures and network-backed sprite/glyph errors need not destroy a usable map. */
export function isRecoverableMapError(event: { sourceId?: unknown; tile?: unknown; error?: { name?: string; message?: string; url?: unknown } }): boolean {
	if (event.tile || typeof event.sourceId === "string" || typeof event.error?.url === "string") return true;
	// The root style JSON is parsed before construction; later JSON parse failures are resources.
	if (event.error?.name === "SyntaxError") return true;
	return /failed to fetch|networkerror|network request|source image could not be decoded|(?:load|loading|decode)[^\n]*(?:sprite|glyph)|(?:sprite|glyph)[^\n]*(?:load|loading|decode)/i.test(event.error?.message ?? "");
}

/** Resolve resources before passing a fetched style object to MapLibre, which has no base URL. */
export function normalizeStyleResources(input: StyleSpecification, responseURL: string): StyleSpecification {
	const resource = (value: string) => {
		const url = new URL(value, responseURL);
		if (url.protocol !== "https:" || url.username || url.password) throw new Error("Style resources require HTTPS without credentials");
		// URL encodes braces; MapLibre must still receive its literal substitution tokens.
		return url.href.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
	};
	const style = structuredClone(input);
	if (style.glyphs) style.glyphs = resource(style.glyphs);
	if (typeof style.sprite === "string") style.sprite = resource(style.sprite);
	else if (style.sprite) style.sprite = style.sprite.map((sprite) => ({ ...sprite, url: resource(sprite.url) }));
	for (const source of Object.values(style.sources)) {
		if ("url" in source && typeof source.url === "string") source.url = resource(source.url);
		if ("tiles" in source && source.tiles) source.tiles = source.tiles.map(resource);
		if (source.type === "geojson" && typeof source.data === "string") source.data = resource(source.data);
		if (source.type === "video") source.urls = source.urls.map(resource);
	}
	return style;
}

/** OpenMapTiles derives render_height from height, levels * 3.66, or a 5 m default, rounded up.
 * A positive value is not proof of a surveyed height. Absent values stay at zero. */
export function buildingLayer(style: StyleSpecification): FillExtrusionLayerSpecification | null {
	const footprint = style.layers.find((layer) => "source-layer" in layer && layer["source-layer"] === "building" && "source" in layer && style.sources[layer.source]?.type === "vector");
	if (!footprint || !("source" in footprint)) return null;
	return {
		id: "atlas-buildings", type: "fill-extrusion", source: footprint.source, "source-layer": "building", minzoom: 14,
		filter: ["all", ["!=", ["to-string", ["get", "hide_3d"]], "true"], ["has", "render_height"], [">", ["to-number", ["get", "render_height"], 0], 0]],
		layout: { visibility: "none" },
		paint: {
			"fill-extrusion-color": "#59788a", "fill-extrusion-opacity": .72,
			"fill-extrusion-height": ["max", 0, ["to-number", ["get", "render_height"], 0]],
			"fill-extrusion-base": ["max", 0, ["to-number", ["get", "render_min_height"], 0]],
		},
	};
}
