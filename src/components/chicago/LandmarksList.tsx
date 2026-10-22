import { atlas, landmarkNote } from "@/content/load";

/**
 * The skyline as text, so the landmark facts read without the interactive
 * map. Mounted on the Dispatch so a fact never lives only in the world view;
 * the Atlas reaches the same facts through the explorer card.
 */
export default function LandmarksList({ id }: { id: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="kicker">Landmarks</span>
            <h2 id={id}>What the skyline is made of</h2>
          </div>
        </div>
        <dl className="chi-landmarks">
          {atlas.buildings.map((b) => {
            const note = landmarkNote(b.name);
            return (
              <div key={b.name}>
                <dt className="chi-name">{b.name}</dt>
                <dd className="chi-feature">
                  {b.feature}
                  {note ? <span className="chi-note"> {note}</span> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
