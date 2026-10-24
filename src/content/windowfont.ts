/**
 * A tiny 5x7 dot-matrix font for the window mosaics: impact figures spelled
 * in lit windows on the skyline. Authored here so the mosaics are diffable
 * source, not images, and shared by every renderer that draws them.
 */

export const MOSAIC_CELL = 4; // map units per lit window cell

const FONT: Record<string, string[]> = {
	"0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
	"1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
	"2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
	"3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
	"4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
	"5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
	"6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
	"7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
	"8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
	"9": ["01110", "10001", "10001", "01111", "00001", "00010", "00110"],
	$: ["00100", "01111", "11010", "00100", "01011", "11110", "00100"],
	",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
	"-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
	"~": ["00000", "00000", "01000", "10101", "00010", "00000", "00000"],
	M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
	K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
	B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
	"%": ["10001", "00010", "00100", "01000", "10000", "00001", "10001"],
};

export type MosaicCell = { dx: number; dy: number };

/**
 * A figure string becomes lit-window cell offsets: one 5-wide glyph plus a
 * one-cell gap per character. Unknown characters are skipped, so a figure
 * with an unmapped symbol still renders the rest of itself.
 */
export function figureGlyphs(value: string): MosaicCell[] {
	const cells: MosaicCell[] = [];
	const chars = [...value];
	chars.forEach((char, charIndex) => {
		const glyph = FONT[char];
		if (!glyph) return;
		glyph.forEach((row, dy) => {
			[...row].forEach((bit, dx) => {
				if (bit === "1") {
					cells.push({ dx: charIndex * 6 + dx, dy });
				}
			});
		});
	});
	return cells;
}

/** Mosaic width in map units, for centering the camera focus. */
export function mosaicWidth(value: string): number {
	const chars = [...value].filter((c) => FONT[c]);
	if (chars.length === 0) return 0;
	return (chars.length * 6 - 1) * MOSAIC_CELL;
}
