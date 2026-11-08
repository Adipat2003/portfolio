"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as NativeMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point as GeoPoint } from "geojson";
import type { Point, RailNetwork } from "@/content/cta-geometry";
import { boundsFromBox, buildingLayer, coordinateFromPoint, isRecoverableMapError, mapStyleURL, modeCamera, networkGeoJSON, normalizeStyleResources, placeSource, type MapBox, type MapMode } from "@/content/geographic-map";
import { drawTrainSprite, spriteBearing, spriteImageName, spriteImageSize, spriteTint, TRAIN_SPRITE_PIXEL_RATIO } from "@/content/train-sprite";

export type GeographicMapHandle = { fit: (box: MapBox, animate: boolean) => void; zoom: (delta: number) => void; north: () => void };
type Location = { id: string; point: Point; name?: string; route?: string; heading?: number };
type Props = {
	active: boolean; network: RailNetwork; colors: Record<string, string>; box: MapBox; route: string;
	selected: string; places: Location[]; trains: Location[]; mode: MapMode;
	onState: (state: string) => void; onStation: (id: string) => void; onPlace: (id: string) => void;
	onGesture: () => void;
};

const emptyPoints: FeatureCollection<GeoPoint> = { type: "FeatureCollection", features: [] };

function cameraPadding(host: HTMLDivElement | null) {
	const padding = { top: 36, bottom: 36, left: 36, right: 36 };
	const pane = host?.getBoundingClientRect();
	const sheet = host?.closest(".rail-network")?.querySelector(".rail-sheet")?.getBoundingClientRect();
	if (!pane || !sheet) return padding;
	if (window.matchMedia("(max-width:760px)").matches) padding.bottom = Math.min(pane.height - 90, Math.max(36, pane.bottom - sheet.top + 24));
	else padding.right = Math.min(pane.width - 160, Math.max(36, pane.right - sheet.left + 24));
	return padding;
}

/** All points and lines are engine-projected geographic layers, including under pitch. */
const GeographicMap = forwardRef<GeographicMapHandle, Props>(function GeographicMap(props, ref) {
	const host = useRef<HTMLDivElement>(null);
	const map = useRef<NativeMap | null>(null);
	const fitFrame = useRef(0);
	const latest = useRef(props);
	latest.current = props;
	const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
	const [attempt, setAttempt] = useState(0);
	const [resourceError, setResourceError] = useState(false);
	const ready = state === "ready";
	const [label, setLabel] = useState<{ x: number; y: number; name: string } | null>(null);
	const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	useImperativeHandle(ref, () => ({
		fit(box, animate) {
			const engine = map.current;
			if (!engine || !ready) return;
			cancelAnimationFrame(fitFrame.current);
			// Measure the newly committed detail panel, not the panel from the previous selection.
			fitFrame.current = requestAnimationFrame(() => {
				if (map.current !== engine) return;
				engine.fitBounds(boundsFromBox(box, latest.current.network.projection), {
					padding: cameraPadding(host.current), duration: animate && !reduced() ? 420 : 0, maxZoom: 18,
					pitch: latest.current.mode === "3d" ? 55 : 0, bearing: engine.getBearing(),
				});
			});
		},
		zoom(delta) { map.current?.zoomTo((map.current?.getZoom() ?? 10) + delta, { duration: reduced() ? 0 : 200 }); },
		north() { map.current?.easeTo({ bearing: 0, duration: reduced() ? 0 : 260 }); },
	}), [ready]);

	useEffect(() => {
		if (!props.active || !host.current) return;
		let disposed = false;
		let engine: NativeMap | null = null;
		let observer: ResizeObserver | null = null;
		let canvas: HTMLCanvasElement | null = null;
		let watchdog = 0;
		let failed = false;
		const controller = new AbortController();
		const stop = () => {
			controller.abort(); window.clearTimeout(watchdog); cancelAnimationFrame(fitFrame.current); observer?.disconnect();
			canvas?.removeEventListener("webglcontextlost", fail);
			map.current = null;
			engine?.remove(); engine = null;
		};
		function fail(reason?: unknown) {
			if (disposed || failed) return;
			if (host.current) host.current.dataset.error = reason instanceof Error ? reason.message : "Renderer unavailable or load timed out";
			failed = true; setState("unavailable"); setLabel(null);
			latest.current.onState("unavailable"); stop();
		}
		setState("loading"); setResourceError(false); latest.current.onState("loading");
		delete host.current.dataset.error;
		watchdog = window.setTimeout(fail, 20_000);
		(async () => {
			try {
				const lib = await import("maplibre-gl");
				// MapLibre 6 ships its module worker separately. Bundle it on our own origin.
				lib.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
				if (disposed || failed) return;
				const response = await fetch(mapStyleURL(process.env.NEXT_PUBLIC_MAP_STYLE_URL), { signal: controller.signal });
				if (!response.ok) throw new Error("Vector style unavailable");
				const style = normalizeStyleResources(await response.json(), response.url);
				if (disposed || failed) return;
				// Replace provider extrusions to honor hide_3d and keep absent render_height at zero.
				style.layers = style.layers.filter((layer: { type: string }) => layer.type !== "fill-extrusion");
				engine = new lib.Map({
					container: host.current!, style, attributionControl: false, maxZoom: 20, minZoom: 8,
					bounds: boundsFromBox(latest.current.box, latest.current.network.projection), fitBoundsOptions: { padding: 36 },
					pitch: 0, bearing: 0, maxPitch: 65, renderWorldCopies: false,
					// Wheel needs a modifier, touch pan needs two fingers: page scroll remains available.
					cooperativeGestures: true, canvasContextAttributes: { antialias: true },
				});
				map.current = engine;
				canvas = engine.getCanvas();
				canvas.setAttribute("aria-label", "Chicago vector map. Search or browse map points for keyboard selection.");
				canvas.addEventListener("webglcontextlost", fail);
				engine.on("error", (event) => {
					if (disposed || failed) return;
					if (isRecoverableMapError(event)) {
						if (host.current) host.current.dataset.error = event.error.message;
						setResourceError(true);
					} else fail(event.error);
				});
				observer = new ResizeObserver(() => { if (!disposed && !failed) engine?.resize(); });
				observer.observe(host.current!);
				engine.on("movestart", (event) => { if (event.originalEvent) latest.current.onGesture(); });
				engine.on("load", () => {
					if (disposed || failed || !engine) return;
					try {
					const data = networkGeoJSON(latest.current.network, latest.current.colors);
					const style = engine.getStyle();
					const buildings = buildingLayer(style);
					// Keep extrusions below provider labels, but CTA markers and trains above them.
					if (buildings) engine.addLayer(buildings, style.layers.find((layer) => layer.type === "symbol")?.id);
					engine.addSource("atlas-routes", { type: "geojson", data: data.routes });
					engine.addSource("atlas-stations", { type: "geojson", data: data.stations });
					engine.addSource("atlas-places", placeSource(latest.current.places, latest.current.network.projection));
					engine.addSource("atlas-trains", { type: "geojson", data: emptyPoints });
					engine.addLayer({ id: "atlas-route-casing", type: "line", source: "atlas-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b151d", "line-width": 7 } });
					engine.addLayer({ id: "atlas-route", type: "line", source: "atlas-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 3 } });
					engine.addLayer({ id: "atlas-station", type: "circle", source: "atlas-stations", paint: { "circle-radius": 3.5, "circle-color": "#142731", "circle-stroke-color": "#b5c9d7", "circle-stroke-width": 1.5 } });
					engine.addLayer({ id: "atlas-station-selected", type: "circle", source: "atlas-stations", filter: ["==", ["get", "id"], ""], paint: { "circle-radius": 7, "circle-color": "#f6ce86", "circle-stroke-color": "#10202d", "circle-stroke-width": 2 } });
					engine.addLayer({ id: "atlas-place", type: "circle", source: "atlas-places", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 8, "circle-color": "#efcb87", "circle-stroke-color": "#142530", "circle-stroke-width": 2 } });
					engine.addLayer({ id: "atlas-place-cluster", type: "circle", source: "atlas-places", filter: ["has", "point_count"], paint: { "circle-radius": 12, "circle-color": "#efcb87", "circle-stroke-color": "#142530", "circle-stroke-width": 4 } });
					// The canvas and SVG fallback paint the same authored car geometry.
					for (const [route, tint] of [...Object.entries(latest.current.colors), ["", ""]] as [string, string][]) {
						const sprite = document.createElement("canvas");
						const { width, height } = spriteImageSize();
						sprite.width = width; sprite.height = height;
						const context = sprite.getContext("2d");
						if (!context) throw new Error("Train sprite canvas unavailable");
						drawTrainSprite(context, spriteTint(tint));
						engine.addImage(spriteImageName(route), context.getImageData(0, 0, width, height), { pixelRatio: TRAIN_SPRITE_PIXEL_RATIO });
					}
					engine.addLayer({ id: "atlas-train", type: "symbol", source: "atlas-trains", layout: { "icon-image": ["case", ["any", ["!", ["has", "route"]], ["==", ["get", "route"], ""]], spriteImageName(""), ["concat", "atlas-train-", ["get", "route"]]], "icon-rotate": ["get", "bearing"], "icon-allow-overlap": false, "icon-rotation-alignment": "viewport" } });
					engine.on("click", (event: MapMouseEvent) => {
						if (!engine || disposed || failed) return;
						const { x, y } = event.point;
						const hits = engine.queryRenderedFeatures([[x - 12, y - 12], [x + 12, y + 12]], { layers: ["atlas-place", "atlas-place-cluster", "atlas-station", "atlas-station-selected"] });
						const hit = hits[0]; if (!hit) return;
						if (hit.layer.id === "atlas-place-cluster" && hit.geometry.type === "Point") {
							const center = hit.geometry.coordinates as [number, number];
							const source = engine.getSource("atlas-places") as GeoJSONSource;
							source.getClusterExpansionZoom(Number(hit.properties.cluster_id)).then((zoom) => {
								if (!disposed && !failed) engine?.easeTo({ center, zoom, duration: reduced() ? 0 : 300 });
							}).catch(() => {});
							return;
						}
						if (hit.layer.id === "atlas-place") latest.current.onPlace(String(hit.properties.id));
						else latest.current.onStation(String(hit.properties.id));
					});
					engine.on("render", () => {
						if (!engine || disposed || failed || !host.current) return;
						host.current.dataset.pitch = engine.getPitch().toFixed(2);
						host.current.dataset.bearing = engine.getBearing().toFixed(2);
						host.current.dataset.zoom = engine.getZoom().toFixed(3);
						const station = latest.current.network.stations.find((entry) => entry.id === latest.current.selected);
						if (!station) { setLabel((before) => before === null ? before : null); return; }
						const point = engine.project(coordinateFromPoint(station.point, latest.current.network.projection));
						setLabel((before) => before?.x === point.x && before?.y === point.y && before.name === station.name ? before : { x: point.x, y: point.y, name: station.name });
					});
					engine.on("idle", () => {
						if (host.current && engine && !failed) {
							host.current.dataset.renderedRoutes = String(engine.queryRenderedFeatures({ layers: ["atlas-route"] }).length);
							host.current.dataset.renderedBuildings = String(engine.getLayer("atlas-buildings") ? engine.queryRenderedFeatures({ layers: ["atlas-buildings"] }).length : 0);
						}
					});
					// Selection may have changed after construction while the initial tiles loaded.
					engine.fitBounds(boundsFromBox(latest.current.box, latest.current.network.projection), {
						padding: cameraPadding(host.current), duration: 0, maxZoom: 18, pitch: latest.current.mode === "3d" ? 55 : 0,
					});
					window.clearTimeout(watchdog); setState("ready"); latest.current.onState("ready");
					} catch (error) { fail(error); }
				});
			} catch (error) { fail(error); }
		})();
		return () => { disposed = true; stop(); };
	}, [props.active, attempt]);

	useEffect(() => {
		const engine = map.current; if (!ready || !engine) return;
		const route = props.route;
		engine.setPaintProperty("atlas-route", "line-opacity", route === "all" ? 1 : ["case", ["==", ["get", "route"], route], 1, .16]);
		engine.setFilter("atlas-station", route === "all" ? null : ["in", route, ["split", ["get", "routes"], ","]]);
		engine.setFilter("atlas-station-selected", ["==", ["get", "id"], props.selected]);
		const points = (items: Location[]): FeatureCollection<GeoPoint> => ({ type: "FeatureCollection", features: items.map((item) => ({ type: "Feature", properties: { id: item.id, route: item.route && Object.hasOwn(props.colors, item.route) ? item.route : "", bearing: spriteBearing(item.heading ?? NaN) }, geometry: { type: "Point", coordinates: coordinateFromPoint(item.point, props.network.projection) } })) });
		(engine.getSource("atlas-places") as GeoJSONSource).setData(placeSource(props.places, props.network.projection).data);
		(engine.getSource("atlas-trains") as GeoJSONSource).setData(points(props.trains));
		engine.triggerRepaint();
	}, [ready, props.route, props.selected, props.places, props.trains, props.network]);

	useEffect(() => {
		const engine = map.current; if (!ready || !engine) return;
		engine.easeTo(modeCamera(props.mode, reduced()));
		if (props.mode === "3d") {
			engine.dragRotate.enable(); engine.touchZoomRotate.enableRotation();
			engine.touchPitch.enable(); engine.keyboard.enableRotation();
		} else {
			engine.dragRotate.disable(); engine.touchZoomRotate.disableRotation();
			engine.touchPitch.disable(); engine.keyboard.disableRotation();
		}
		if (engine.getLayer("atlas-buildings")) engine.setLayoutProperty("atlas-buildings", "visibility", props.mode === "3d" ? "visible" : "none");
	}, [ready, props.mode]);

	return <><div className="geographic-map" ref={host} data-state={state} data-mode={ready ? props.mode : "2d"}>
		{ready && label ? <span className="geographic-selected-label" style={{ left: label.x, top: label.y }}>{label.name.replace(/ \(.*\)$/, "")}</span> : null}
	</div>{state === "unavailable" || resourceError ? <button type="button" className="rail-map-alert" style={{ top: "auto", bottom: 82 }} onClick={() => setAttempt((before) => before + 1)}>{ready ? "Some map details failed to load. Retry map details" : "Retry vector map"}</button> : null}</>;
});
export default GeographicMap;
