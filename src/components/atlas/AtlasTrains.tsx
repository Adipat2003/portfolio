import { atlas } from "@/content/load";

/**
 * 'L' trains drifting along the routes, one pair per line. Pure declarative
 * SMIL animateMotion: no JavaScript, no dependency, and the trains ride the
 * exact path data from content/atlas.json, so the line and the train can
 * never drift. Purely decorative: aria-hidden, pointer-transparent, and
 * display:none under prefers-reduced-motion.
 */
export default function AtlasTrains() {
	return (
		<g aria-hidden="true" className="trains">
			{atlas.routes.map((route, routeIndex) => {
				const duration = 24 + routeIndex * 5;
				return (
					<g key={route.line} className={`train-line train-line-${route.line}`}>
						{[0, 1].map((car) => (
							<g
								key={car}
								className={`train train-${route.line}`}
							>
								<rect x="-16" y="-5" width="32" height="10" rx="3" className="train-body" />
								<rect x="-11" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<rect x="-4.5" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<rect x="2" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<circle cx="16" cy="0" r="1.8" className="train-headlight" />
								<animateMotion
									dur={`${duration}s`}
									begin={`${-car * (duration / 2)}s`}
									repeatCount="indefinite"
									rotate="auto"
									path={route.d}
								/>
							</g>
						))}
					</g>
				);
			})}
		</g>
	);
}
