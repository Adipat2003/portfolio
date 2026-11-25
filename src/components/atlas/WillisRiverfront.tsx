import { useId } from "react";
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

export default function WillisRiverfront({ orbit, close }: { orbit: TowerOrbit; close: () => void }) {
	const id = useId();
	const note = landmarkNote(WILLIS_TOWER);

	return (
		<section className="willis-riverfront" aria-labelledby="willis-heading">
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

			<div className="willis-details">
				<button className="tower-orbit-close" type="button" onClick={close}>
					<span aria-hidden="true">←</span> Back to the ride
				</button>
				<h2 id="willis-heading">{willis.name}</h2>
				<p className="willis-feature">{willis.feature}</p>
				{note ? <p className="willis-feature">{note}</p> : null}
				<TowerOrbitControls {...orbit} />
			</div>
		</section>
	);
}
