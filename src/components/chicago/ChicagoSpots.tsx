import { chicagoSpots } from "@/content/load";

/**
 * The personal Chicago layer, rendered as text so it reads without JavaScript
 * and on a keyboard. Renders nothing when no spot has been approved for
 * publication, which is the committed state until records are added.
 */
export default function ChicagoSpots({
  id,
  kicker,
  heading,
}: {
  id: string;
  kicker: string;
  heading: string;
}) {
  if (chicagoSpots.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="kicker">{kicker}</span>
            <h2 id={id}>{heading}</h2>
          </div>
          <span className="concept-title">{chicagoSpots.length} places</span>
        </div>
        <ul className="chi-list">
          {chicagoSpots.map((spot) => (
            <li key={spot.slug} className="chi-item">
              <span className="chi-name">
                {spot.favorite ? (
                  <b className="chi-star" title="Absolute favorite">
                    <span className="sr-only">Absolute favorite. </span>
                  </b>
                ) : null}
                {spot.name}
              </span>
              <span className="chi-kind">{spot.kind}</span>
              <span className="chi-hood">{spot.neighborhood}</span>
              {spot.note ? <span className="chi-note">{spot.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
