import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fetchRiverObservation } from "@/lib/atlas-river-environment";
import { riverPreview } from "@/lib/atlas-river-preview";
import type { RiverTime, RiverWeatherMode, RiverSeason } from "@/lib/atlas-river-preview";
import type { RiverObservation } from "@/lib/atlas-river-environment";
import { guidedPosition, guidedStops } from "@/lib/atlas-guided-route";
import { moveRiverPan, RIVER_CENTER, RIVER_MARINA, RIVER_WILLIS } from "@/lib/atlas-river-renderer";
import type { RiverPan } from "@/lib/atlas-river-renderer";
import AtlasRiverfrontView from "./AtlasRiverfrontView";
import { atlas, landmarkNote } from "@/content/load";
import { WILLIS_TOWER } from "@/content/willis-tower";
import WillisTowerOrbit, { TowerOrbitControls } from "./WillisTowerOrbit";
import type { TowerOrbit } from "./WillisTowerOrbit";

const skyline = atlas.buildings.filter((building) => building.name !== WILLIS_TOWER);
const willis = atlas.buildings.find((building) => building.name === WILLIS_TOWER)!;
const lamps = [38, 122, 218, 328, 455, 572, 696, 812, 944, 1077, 1198, 1328, 1416];
const ripples = Array.from({ length: 140 }, (_, i) => ({
	x: (i * 197 + 33) % 1440,
	y: 606 + ((i * 71) % 191),
	width: 9 + ((i * 143) % 61),
	opacity: .07 + .11 * ((i * 11) % 8) / 7,
}));

function IllustratedRiverfront({ orbit, close }: { orbit: TowerOrbit; close: () => void }) {
	const id = useId();
	return (
			<div className="willis-vista">
				<svg className="willis-waterfront" viewBox="0 0 1440 800" preserveAspectRatio="none" aria-hidden="true">
					<defs>
						<linearGradient id={`${id}-sky`} x2="0" y2="1">
							<stop offset="0" stopColor="#101620" stopOpacity="0" />
							<stop offset=".45" stopColor="#283d50" />
							<stop offset=".69" stopColor="#4e4d51" />
							<stop offset=".77" stopColor="#735b4f" />
						</linearGradient>
						<radialGradient id={`${id}-horizon`} cx=".44" cy=".97" r=".59">
							<stop offset="0" stopColor="#deb48a" stopOpacity=".62" />
							<stop offset="1" stopColor="#b2826e" stopOpacity="0" />
						</radialGradient>
						<linearGradient id={`${id}-water`} x2="0" y2="1">
							<stop offset="0" stopColor="#28424e" />
							<stop offset=".28" stopColor="#20343e" />
							<stop offset="1" stopColor="#101721" />
						</linearGradient>
						<linearGradient id={`${id}-city`} gradientUnits="userSpaceOnUse" x2="0" y1="120" y2="420">
							<stop offset="0" stopColor="#344855" />
							<stop offset="1" stopColor="#1a2833" />
						</linearGradient>
						<pattern id={`${id}-windows`} width="24" height="17" patternUnits="userSpaceOnUse">
							<path d="M2 2h2v2H2z M14 10h3v1h-3z" fill="#e6bb84" opacity=".54" />
							<path d="M9 4h2v2H9z M20 12h2v2h-2z" fill="#b2bdba" opacity=".36" />
						</pattern>
						<radialGradient id={`${id}-lamp`}>
							<stop offset="0" stopColor="#ffcd89" stopOpacity=".74" />
							<stop offset=".25" stopColor="#efad63" stopOpacity=".22" />
							<stop offset="1" stopColor="#f4a964" stopOpacity="0" />
						</radialGradient>
					</defs>

					<rect width="1440" height="612" fill={`url(#${id}-sky)`} />
					<rect width="1440" height="600" fill={`url(#${id}-horizon)`} />
					<path d="M0 428 Q310 360 557 402 T1120 386 Q1270 371 1440 377 M0 475 Q290 407 600 447 T1440 420"
						fill="none" stroke="#e3ac88" strokeOpacity=".09" strokeWidth="6" />
					<g transform="translate(-168 375) scale(1.55 .52)" fill="#52616a" opacity=".68">
						{skyline.map(({ name, d }) => <path key={name} d={d} />)}
					</g>
					<g transform="translate(-310 304) scale(1.74 .68)">
						{skyline.map(({ name, d, extra, extra_fill }, index) => (
							<g key={name}>
								<path d={d} fill={`url(#${id}-city)`} stroke="#92a2a3" strokeOpacity=".21" />
								<path d={d} fill={`url(#${id}-windows)`} opacity={index % 3 ? .8 : .42} />
								{extra ? <path d={extra} fill={extra_fill ? "#695454" : "none"} stroke="#83949b" strokeOpacity=".43" /> : null}
							</g>
						))}
					</g>

					<rect y="588" width="1440" height="12" fill="#273039" />
					<path d="M0 589H1440M0 597H1440" stroke="#9b7e63" strokeOpacity=".37" />
					<rect className="willis-water" y="600" width="1440" height="200" fill={`url(#${id}-water)`} />
					<path d="M0 601H1440" stroke="#19262d" strokeWidth="3" />
					<path d="M0 621q286 -15 525 -9m476 5q202 -5 439 -2M0 693q244 -23 506 -19M790 695q355 -21 650 5M0 758q313 -29 653 -24m275 21q221 -7 512 12"
						fill="none" stroke="#7497a1" strokeOpacity=".16" strokeWidth="2" />
					{lamps.map((x, i) => (
						<g key={x} transform={`translate(${x} 0)`}>
							<path d="M0 591v-11" stroke="#433a36" />
							<ellipse cy="580" rx="14" ry="14" fill={`url(#${id}-lamp)`} />
							<circle cy="580" r="1.7" fill="#ffe2ab" />
							<ellipse cy={619 + i % 4 * 6} rx="20" ry={20 + i % 5 * 8} fill={`url(#${id}-lamp)`} opacity=".52" />
							<path d={`M-5 611h10 m-16 6h20 m-16 8h10 m-${17 + i % 8} 9h19 m-8 11h12`}
								stroke="#d9aa75" strokeOpacity=".35" fill="none" />
						</g>
					))}
					<g fill="none" stroke="#a1c1c7">
						{ripples.map(({ x, y, width, opacity }) => (
							<path key={y} d={`M${x} ${y}q${width / 2} -1 ${width} 0`} opacity={opacity} />
						))}
					</g>
				</svg>
				<div className="willis-tower-slot">
					<WillisTowerOrbit {...orbit} close={close} />
				</div>
			</div>

	);
}

const chicagoTime = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
export default function WillisRiverfront({
	orbit, entry = false, active, close, showSimple, guided = false, guideProgress = 0,
	guideStop, explore, resume, skip, onStation, onFallback, children,
}: {
	orbit: TowerOrbit;
	entry?: boolean;
	active: boolean;
	close: () => void;
	showSimple?: () => void;
	guided?: boolean;
	guideProgress?: number;
	guideStop?: typeof guidedStops[number];
	explore?: () => void;
	resume?: () => void;
	skip?: () => void;
	onStation?: (id: string) => void;
	onFallback?: () => void;
	children?: ReactNode;
}) {
	const [renderer, setRenderer] = useState<"loading" | "ready" | "fallback">("loading");
	const [place, setPlace] = useState<"willis" | "marina">("willis");
	const [dragMode, setDragMode] = useState<"pan" | "orbit">(entry ? "pan" : "orbit");
	const [pan, setPan] = useState<RiverPan>(RIVER_CENTER);
	const [time, setTime] = useState<RiverTime>("live");
	const [weather, setWeather] = useState<RiverWeatherMode>("live");
	const [season, setSeason] = useState<RiverSeason>("auto");
	const [showCta, setShowCta] = useState(false);
	const hasOpened = useRef(false);
	const [now, setNow] = useState(() => new Date());
	const [observation, setObservation] = useState<RiverObservation | null>(null);

	useEffect(() => {
		if (!active) {
			setRenderer("loading");
			return;
		}
		setNow(new Date());
		const controller = new AbortController();
		const refresh = async () => {
			const latest = await fetchRiverObservation(controller.signal);
			if (!controller.signal.aborted && latest) setObservation(latest);
		};
		void refresh();
		const clock = window.setInterval(() => setNow(new Date()), 30_000);
		const weather = window.setInterval(refresh, 10 * 60_000);
		return () => {
			controller.abort();
			window.clearInterval(clock);
			window.clearInterval(weather);
		};
	}, [active]);

	const target = place === "willis" ? RIVER_WILLIS : RIVER_MARINA;
	const movePan = (right: number, forward: number) =>
		setPan((position) => moveRiverPan(orbit.view, target, position, right, forward));
	const resetView = () => {
		setPan(RIVER_CENTER);
		orbit.reset();
	};
	function exploreFromRoute() {
		if (guideProgress > .5) {
			const { point } = guidedPosition(guideProgress);
			setPan([point[0] - target[0], point[1] - target[2]]);
		}
		explore?.();
	}
	const panControl = !guided && renderer === "ready" && dragMode === "pan" ? movePan : undefined;
	const atGuideStop = guided && Boolean(children);
	const { env, snow, simulated } = useMemo(() =>
		riverPreview(now, observation, time, weather, season), [now, observation, time, weather, season]);
	if (!active) return null;

	const visiblePlace = renderer === "fallback" ? "willis" : place;
	const heading = visiblePlace === "willis" ? WILLIS_TOWER : "Marina City";
	const landmark = visiblePlace === "willis" ? willis : atlas.buildings.find((building) => building.name === "Marina City (east)")!;
	const note = landmarkNote(landmark.name);
	const weatherStatus = renderer === "loading" ? "Loading riverfront…" :
		renderer === "fallback" ? "Illustrated waterfront" :
		weather !== "live" ? "Simulated weather" :
		env.weather.status === "current" && env.weather.observedAt
			? `Midway · ${env.weather.description ?? "Conditions reported"} · ${chicagoTime.format(new Date(env.weather.observedAt))}`
			: "Midway weather unavailable";


	const settings = renderer === "ready" ? (
		<div className="riverfront-settings">
			{!guided ? <label>Landmark
				<select value={place} onChange={(event) => {
					setPlace(event.currentTarget.value as typeof place);
					resetView();
				}}>
					<option value="willis">Willis Tower</option>
					<option value="marina">Marina City</option>
				</select>
			</label> : null}
			<label>Time
				<select value={time} onChange={(event) => setTime(event.currentTarget.value as RiverTime)}>
					<option value="live">Live time</option>
					<option value="dawn">Dawn</option>
					<option value="daylight">Daylight</option>
					<option value="dusk">Blue hour</option>
					<option value="night">Night</option>
				</select>
			</label>
			<label>Weather
				<select value={weather} onChange={(event) => setWeather(event.currentTarget.value as RiverWeatherMode)}>
					<option value="live">Live weather</option>
					<option value="clear">Clear</option>
					<option value="overcast">Overcast</option>
					<option value="rain">Rain</option>
					<option value="snow">Snow</option>
				</select>
			</label>
			<label>Season
				<select value={season} onChange={(event) => setSeason(event.currentTarget.value as RiverSeason)}>
					<option value="auto">Current season</option>
					<option value="spring">Spring</option>
					<option value="summer">Summer</option>
					<option value="autumn">Autumn</option>
					<option value="winter">Winter</option>
				</select>
			</label>
			{!guided ? <label>Drag
				<select value={dragMode} onChange={(event) => setDragMode(event.currentTarget.value as typeof dragMode)}>
					<option value="pan">Pan</option>
					<option value="orbit">Orbit</option>
				</select>
			</label> : null}
		</div>
	) : null;
	return (
		<section className="willis-riverfront" aria-labelledby="willis-heading" data-renderer={renderer} data-entry={entry} data-guided={guided} data-guide-stop={guideStop?.id} data-guide-card={atGuideStop} data-time={time} data-weather={weather} data-season={season}>
			{renderer === "fallback" ? <IllustratedRiverfront orbit={orbit} close={close} /> :
				<div className="willis-vista riverfront-vista">
					<AtlasRiverfrontView orbit={orbit} env={env} place={place} close={close} status={(status) => {
							if (status === "ready") hasOpened.current = true;
							else if (entry) onFallback?.();
							setRenderer(status);
						}} entry={entry} autoZoom={entry && !hasOpened.current} pan={pan} movePan={panControl}
						showCta={showCta || (guided && guideProgress > .25)} guided={guided} guideProgress={guideProgress}
						guideStops={entry ? guidedStops.map(({ id }) => id) : undefined}
						activeStop={guideStop?.id} selectStop={onStation}
						snow={snow} />
					{renderer === "ready" ? <a className="riverfront-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> : null}
				</div>}

			<div className="willis-details">
				{entry ? (
					<>
						{atGuideStop ? (
							<>
								{guideStop ? <p className="riverfront-line" style={{ borderColor: guideStop.color }}>{guideStop.route === "blue" ? "Blue Line" : "Red Line"}</p> : null}
								<h2 id="willis-heading">{guideStop?.name ?? "The terminal"}</h2>
							</>
						) : <h1 id="willis-heading">Chicago riverfront</h1>}
						<div className="riverfront-entry-actions">
							{guided ? (
								<>
									{!atGuideStop ? <button className="riverfront-projects" type="button" onClick={close}>Start ride <span aria-hidden="true">→</span></button> : null}
									<button className="riverfront-simple" type="button" onClick={exploreFromRoute}>Explore</button>
								</>
							) : <button className="riverfront-projects" type="button" onClick={resume}>Resume ride <span aria-hidden="true">→</span></button>}
							<button className="riverfront-simple" type="button" onClick={showSimple}>Simple view</button>
						</div>
						{guided ? <p id="atlas-riverfront-guide-help" className="riverfront-guide-help">
							{guideStop?.id === "40070" ? "Transfer to the Red Line at Jackson." : "Scroll to ride, or select a station."}
						</p> : null}
						{!atGuideStop ? <button type="button" className="riverfront-skip" onClick={skip}>Skip to the live map</button> : null}
					</>
				) : (
					<>
						<button className="tower-orbit-close" type="button" onClick={close}><span aria-hidden="true">←</span> Back to the ride</button>
						<h2 id="willis-heading">{heading}</h2>
					</>
				)}
				{!entry ? <p className="willis-feature">{landmark.feature}</p> : null}
				{note && !entry ? <p className="willis-feature">{note}</p> : null}
				{children}
				{atGuideStop && settings ? (
					<details className="riverfront-guide-settings"><summary>Scene settings</summary>{settings}</details>
				) : settings}
				{!guided ? <TowerOrbitControls {...orbit} reset={resetView} pan={panControl} showLighting={visiblePlace === "willis" && !entry} /> : null}
				{renderer === "ready" && !atGuideStop ? (
					<label className="riverfront-rail-toggle">
						<input type="checkbox" checked={showCta} onChange={(event) => setShowCta(event.currentTarget.checked)} />
						<span>CTA subway</span><i className="red" aria-hidden="true" /><i className="blue" aria-hidden="true" />
					</label>
				) : null}
				<p className="riverfront-status">{simulated && weather === "live" ? "Preview · " : ""}{weatherStatus}</p>
			</div>
		</section>
	);
}
