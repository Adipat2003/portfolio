import { useEffect, useId, useMemo, useState } from "react";
import { fetchRiverObservation, getRiverEnvironment } from "@/lib/atlas-river-environment";
import type { RiverObservation } from "@/lib/atlas-river-environment";
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
const localParts = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric",
});
const previewModes = ["live", "daylight", "dusk", "night", "rain", "snow", "spring", "summer", "autumn", "winter"] as const;
type Preview = typeof previewModes[number];

function previewTime(now: Date, mode: Preview) {
	const parts = localParts.formatToParts(now);
	const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
	const year = value("year");
	const season = { spring: [4, 5], summer: [6, 15], autumn: [9, 18], winter: [0, 20] } as const;
	if (mode === "spring" || mode === "summer" || mode === "autumn" || mode === "winter") {
		const [month, day] = season[mode];
		return new Date(Date.UTC(year, month, day, 18));
	}
	const afternoon = Date.UTC(year, value("month") - 1, value("day"), 18);
	if (mode === "night") return new Date(afternoon + 11 * 3600_000);
	if (mode !== "dusk") return new Date(afternoon);
	for (let minutes = 180; minutes <= 780; minutes += 5) {
		const candidate = new Date(afternoon + minutes * 60_000);
		if (getRiverEnvironment(candidate).sun.elevation < -4.5) return candidate;
	}
	return new Date(afternoon + 9 * 3600_000);
}

export default function WillisRiverfront({ orbit, close }: { orbit: TowerOrbit; close: () => void }) {
	const [renderer, setRenderer] = useState<"loading" | "ready" | "fallback">("loading");
	const [place, setPlace] = useState<"willis" | "marina">("willis");
	const [mode, setMode] = useState<Preview>("live");
	const [now, setNow] = useState(() => new Date());
	const [observation, setObservation] = useState<RiverObservation | null>(null);

	useEffect(() => {
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
	}, []);

	const simulated = mode !== "live";
	const env = useMemo(() => {
		if (mode === "live") return getRiverEnvironment(now, observation);
		const preview = getRiverEnvironment(previewTime(now, mode));
		const wet = mode === "rain" || mode === "snow";
		return { ...preview, weather: { ...preview.weather,
			cloudCover: wet ? .96 : .14,
			visibilityKm: mode === "rain" ? 4 : mode === "snow" ? 3 : 24,
			windSpeedKmh: wet ? 21 : 8,
			precipitation: wet ? mode : null,
		} };
	}, [mode, now, observation]);
	const visiblePlace = renderer === "fallback" ? "willis" : place;
	const heading = visiblePlace === "willis" ? WILLIS_TOWER : "Marina City";
	const landmark = visiblePlace === "willis" ? willis : atlas.buildings.find((building) => building.name === "Marina City (east)")!;
	const note = landmarkNote(landmark.name);
	const weatherStatus = renderer === "loading" ? "Loading riverfront…" :
		renderer === "fallback" ? "Illustrated waterfront" :
		simulated ? "Simulated conditions" :
		env.weather.status === "current" && env.weather.observedAt
			? `Midway · ${env.weather.description ?? "Conditions reported"} · ${chicagoTime.format(new Date(env.weather.observedAt))}`
			: "Midway weather unavailable · Chicago time";

	return (
		<section className="willis-riverfront" aria-labelledby="willis-heading" data-renderer={renderer}>
			{renderer === "fallback" ? <IllustratedRiverfront orbit={orbit} close={close} /> :
				<div className="willis-vista riverfront-vista">
					<AtlasRiverfrontView orbit={orbit} env={env} place={place} close={close} status={setRenderer}
						snow={mode === "snow" ? .85 : 0} />
					{renderer === "ready" ? <a className="riverfront-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> : null}
				</div>}

			<div className="willis-details">
				<button className="tower-orbit-close" type="button" onClick={close}>
					<span aria-hidden="true">←</span> Back to the ride
				</button>
				<h2 id="willis-heading">{heading}</h2>
				<p className="willis-feature">{landmark.feature}</p>
				{note ? <p className="willis-feature">{note}</p> : null}
				{renderer === "ready" ? (
					<div className="riverfront-settings">
						<label>Landmark
							<select value={place} onChange={(event) => {
								setPlace(event.currentTarget.value as typeof place);
								orbit.reset();
							}}>
								<option value="willis">Willis Tower</option>
								<option value="marina">Marina City</option>
							</select>
						</label>
						<label>Conditions
							<select value={mode} onChange={(event) => setMode(event.currentTarget.value as Preview)}>
								<option value="live">Live Chicago</option>
								<optgroup label="Time of day">
									<option value="daylight">Daylight</option>
									<option value="dusk">Blue hour</option>
									<option value="night">Night</option>
								</optgroup>
								<optgroup label="Weather preview">
									<option value="rain">Rain preview</option>
									<option value="snow">Snow preview</option>
								</optgroup>
								<optgroup label="Season preview">
									<option value="spring">Spring</option>
									<option value="summer">Summer</option>
									<option value="autumn">Autumn</option>
									<option value="winter">Winter</option>
								</optgroup>
							</select>
						</label>
					</div>
				) : null}
				<TowerOrbitControls {...orbit} showLighting={visiblePlace === "willis"} />
				<p className="riverfront-status" data-mode={mode}>{weatherStatus}</p>
			</div>
		</section>
	);
}
