import type { Figure } from "@/content/schema";

export default function ImpactStrip({ figures }: { figures: Figure[] }) {
  return (
    <div className="impact-strip" aria-label="Headline impact figures">
      {figures.map((f) => (
        <div key={f.label}>
          <div className="num">{f.value}</div>
          <div className="lab">{f.label}</div>
          <span className="kind">{f.kind}</span>
        </div>
      ))}
    </div>
  );
}
