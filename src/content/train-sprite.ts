/**
 * Bespoke train sprite, authored geometry for both map renderers.
 *
 * One module describes the sprite: the MapLibre vector path and the local SVG
 * fallback in CtaRailMap both read these shapes, so the two can never drift
 * apart. Nothing here is fetched, generated, or stock imagery; every shape is
 * hand-authored below.
 *
 * The grid is 24 by 12 units centred on (0,0) with the nose pointing +x
 * (east), so a reported heading of 0 (north) rotates the sprite by -90
 * degrees in both renderers.
 */

export type SpriteShape =
  | { shape: "rect"; x: number; y: number; w: number; h: number; r: number; fill: string; opacity?: number; stroke?: string; strokeWidth?: number }
  | { shape: "circle"; cx: number; cy: number; r: number; fill: string; opacity?: number };

/** Authored palette. Silver car body, blue-gray glass, warm lamps. */
export const SPRITE_PALETTE = {
  body: "#dbe6ec",
  edge: "#0b1c28",
  glass: "#6f8b9c",
  skirt: "#8e9ea9",
  seam: "#7d8f9c",
  truck: "#0b1c28",
  lamp: "#ffd890",
  tail: "#e0665e",
  shadow: "#04121b",
} as const;

/** Unknown route ids keep this neutral silver tint in both renderers. */
export const SPRITE_FALLBACK_TINT = "#8fb6cf";

export const TRAIN_SPRITE_GRID = { width: 24, height: 12 } as const;
/** Device pixels per sprite unit in the vector renderer. */
export const TRAIN_SPRITE_PIXEL_RATIO = 2;

export function spriteImageName(route: string): string {
  return `atlas-train-${route}`;
}

export function spriteImageSize(pixelRatio: number = TRAIN_SPRITE_PIXEL_RATIO) {
  return { width: TRAIN_SPRITE_GRID.width * pixelRatio, height: TRAIN_SPRITE_GRID.height * pixelRatio };
}

/** A reported heading rotates the sprite; a missing heading stays level. */
export function spriteBearing(heading: number): number {
  return Number.isFinite(heading) ? heading - 90 : 0;
}

/** The shared sprite, in paint order, for a route tint on the roof band. */
export function trainSprite(tint: string = SPRITE_FALLBACK_TINT): SpriteShape[] {
  const color = /^#[0-9a-f]{6}$/i.test(tint) ? tint : SPRITE_FALLBACK_TINT;
  return [
    // Contact shadow first, wide of the body, so the car sits on the basemap.
    { shape: "rect", x: -12, y: 4.4, w: 24, h: 1.6, r: 0.8, fill: SPRITE_PALETTE.shadow, opacity: 0.4 },
    // Two trucks under the body read as rail contact at sprite scale.
    { shape: "rect", x: -8.6, y: 4, w: 4.6, h: 1.6, r: 0.8, fill: SPRITE_PALETTE.truck },
    { shape: "rect", x: 4, y: 4, w: 4.6, h: 1.6, r: 0.8, fill: SPRITE_PALETTE.truck },
    // Car body: rounded silver shell with a dark outline.
    { shape: "rect", x: -11, y: -5, w: 22, h: 10, r: 3.5, fill: SPRITE_PALETTE.body, stroke: SPRITE_PALETTE.edge, strokeWidth: 1.1 },
    // Route stripe on the roof.
    { shape: "rect", x: -8.6, y: -5.2, w: 17.2, h: 2.8, r: 1.4, fill: color },
    // Skirt band over the lower body.
    { shape: "rect", x: -10.4, y: 3.2, w: 20.8, h: 1.2, r: 0.6, fill: SPRITE_PALETTE.skirt },
    // Passenger glass, four windows along the body.
    { shape: "rect", x: -7.4, y: -1.4, w: 3.4, h: 2.8, r: 0.8, fill: SPRITE_PALETTE.glass },
    { shape: "rect", x: -3, y: -1.4, w: 3.4, h: 2.8, r: 0.8, fill: SPRITE_PALETTE.glass },
    { shape: "rect", x: 1.4, y: -1.4, w: 3.4, h: 2.8, r: 0.8, fill: SPRITE_PALETTE.glass },
    { shape: "rect", x: 5.8, y: -1.4, w: 3.4, h: 2.8, r: 0.8, fill: SPRITE_PALETTE.glass },
    // Cab glass at the nose, taller than the passenger windows.
    { shape: "rect", x: 8.4, y: -1.4, w: 2.6, h: 4.4, r: 1.2, fill: SPRITE_PALETTE.glass },
    // Door seams.
    { shape: "rect", x: -4.2, y: -4.4, w: 0.5, h: 7.6, r: 0.25, fill: SPRITE_PALETTE.seam, opacity: 0.85 },
    { shape: "rect", x: 2, y: -4.4, w: 0.5, h: 7.6, r: 0.25, fill: SPRITE_PALETTE.seam, opacity: 0.85 },
    // Headlamp at the nose, tail marker at the rear: the sprite reads its direction.
    { shape: "circle", cx: 9.6, cy: 2.2, r: 0.85, fill: SPRITE_PALETTE.lamp },
    { shape: "circle", cx: -10.2, cy: 2.2, r: 0.7, fill: SPRITE_PALETTE.tail },
  ];
}

/** The 2D context surface the canvas renderer needs. */
export type SpriteCanvas = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
};

function roundedRect(context: SpriteCanvas, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + w - radius, y);
  context.arcTo(x + w, y, x + w, y + radius, radius);
  context.lineTo(x + w, y + h - radius);
  context.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  context.lineTo(x + radius, y + h);
  context.arcTo(x, y + h, x, y + h - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.closePath();
}

function circle(context: SpriteCanvas, cx: number, cy: number, r: number) {
  context.beginPath();
  context.arcTo(cx, cy - r, cx - r, cy, r);
  context.arcTo(cx - r, cy, cx, cy + r, r);
  context.arcTo(cx, cy + r, cx + r, cy, r);
  context.arcTo(cx + r, cy, cx, cy - r, r);
  context.closePath();
}

function drawShape(context: SpriteCanvas, shape: SpriteShape) {
  // Do not lean on save/restore for globalAlpha: an explicit reset keeps the
  // renderer correct even if a caller supplies a partial 2D context.
  const previousAlpha = context.globalAlpha;
  context.save();
  if (shape.opacity !== undefined) context.globalAlpha = shape.opacity;
  if (shape.shape === "circle") {
    circle(context, shape.cx, shape.cy, shape.r);
    context.fillStyle = shape.fill;
    context.fill();
  } else {
    roundedRect(context, shape.x, shape.y, shape.w, shape.h, shape.r);
    if (shape.stroke && shape.strokeWidth) {
      context.strokeStyle = shape.stroke;
      context.lineWidth = shape.strokeWidth;
      context.stroke();
    }
    context.fillStyle = shape.fill;
    context.fill();
  }
  context.globalAlpha = previousAlpha;
  context.restore();
}

/**
 * Render the shared shapes into a MapLibre sprite image. Callers supply the
 * pixel buffer, so the same function serves the renderer and the tests.
 */
export function drawTrainSprite(context: SpriteCanvas, tint: string = SPRITE_FALLBACK_TINT, pixelRatio: number = TRAIN_SPRITE_PIXEL_RATIO) {
  const { width, height } = spriteImageSize(pixelRatio);
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(pixelRatio, pixelRatio);
  for (const shape of trainSprite(tint)) drawShape(context, shape);
  context.restore();
  return spriteImageSize(pixelRatio);
}

/** The tint every route sprite uses, with the neutral fallback for unknown ids. */
export function spriteTint(color: string | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(color ?? "") ? color! : SPRITE_FALLBACK_TINT;
}
