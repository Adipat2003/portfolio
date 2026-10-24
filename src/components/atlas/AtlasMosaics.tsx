import { site } from "@/content/load";
import { mosaics } from "@/content/mosaics";
import { figureGlyphs, MOSAIC_CELL } from "@/content/windowfont";

/**
 * The impact figures, spelled in lit windows on the skyline. Cell data comes
 * from the 5x7 font, placement from content/mosaics.json, and the figures
 * themselves from site.json, so the mosaics can never show a number the
 * Dispatch does not, and can never drift from its hedging.
 */
export default function AtlasMosaics({ active = -1 }: { active?: number }) {
	return (
		<g className="mosaics" aria-hidden="true">
			{mosaics.map((mosaic) => {
				const figure = site.impact[mosaic.figure_index];
				const cells = figureGlyphs(figure.value);
				return (
					<g
						key={mosaic.figure_index}
						className={`mosaic${active === mosaic.figure_index ? " mosaic-active" : ""}`}
					>
						{cells.map((cell, i) => (
							<rect
								key={i}
								x={mosaic.x + cell.dx * MOSAIC_CELL}
								y={mosaic.y + cell.dy * MOSAIC_CELL}
								width={MOSAIC_CELL - 1.1}
								height={MOSAIC_CELL - 1.1}
								className="mosaic-cell"
								style={{ animationDelay: `${(cell.dx * 70 + cell.dy * 110) % 1100}ms` }}
							/>
						))}
					</g>
				);
			})}
		</g>
	);
}
