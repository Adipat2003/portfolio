import rawMosaics from "../../content/mosaics.json";
import { mosaicsSchema } from "./schema";
import { site } from "./load";

/**
 * Window-mosaic placements for the impact figures, parsed at build time with
 * the same guard every record carries. A mosaic naming a figure that does
 * not exist fails the build, the same way a station naming a missing project
 * does.
 */
const parsed = mosaicsSchema.parse(rawMosaics);
for (const mosaic of parsed.figures) {
	if (mosaic.figure_index >= site.impact.length) {
		throw new Error(
			`mosaics.json figure_index ${mosaic.figure_index} is out of range for site.json impact`,
		);
	}
}
export const mosaics = parsed.figures;
