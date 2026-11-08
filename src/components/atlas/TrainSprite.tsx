import { trainSprite, type SpriteShape } from "@/content/train-sprite";

/** The same hand-authored car geometry used by the vector map's canvas sprite. */
export default function TrainSprite({ tint }: { tint?: string }) {
  return <g className="rail-train-sprite" aria-hidden="true">
    {trainSprite(tint).map((part: SpriteShape, index) => part.shape === "rect"
      ? <rect key={index} x={part.x} y={part.y} width={part.w} height={part.h} rx={part.r} fill={part.fill} opacity={part.opacity} stroke={part.stroke} strokeWidth={part.strokeWidth} />
      : <circle key={index} cx={part.cx} cy={part.cy} r={part.r} fill={part.fill} opacity={part.opacity} />)}
  </g>;
}
