import { atlas, LINE_COLORS } from "@/content/load";
import TrainSprite from "./TrainSprite";

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
								<g transform="scale(1.3 0.9)"><TrainSprite tint={LINE_COLORS[route.line]} /></g>
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
