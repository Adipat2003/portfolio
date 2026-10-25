import { bites } from "@/content/bites";
import { biteRadar } from "@/content/bite-radar";

/**
 * Bite Radar: the restaurants climbing Aditya's own Beli list, scored by the
 * pure module beside it. Renders nothing until he approves records into
 * content/bites.json, which is the committed state: the private Masterlist
 * stays private, and every rendered line is self-reported by definition.
 */
export default function BiteRadar({ id }: { id: string }) {
	if (bites.length === 0) return null;

	const ranked = biteRadar(bites, new Date()).slice(0, 5);

	return (
		<section aria-labelledby={id}>
			<div className="wrap">
				<div className="sec-head">
					<div>
						<span className="kicker">Bite Radar</span>
						<h2 id={id}>Restaurants climbing his list</h2>
					</div>
					<span className="concept-title">self-reported, from his Beli ratings</span>
				</div>
				<ol className="bite-list">
					{ranked.map((bite) => (
						<li key={bite.name} className={`bite-item bite-${bite.status}`}>
							<span className="bite-rank" aria-hidden="true" />
							<span className="bite-name">
								<b>{bite.name}</b>
								<span className="bite-kind">{bite.kind}</span>
								<span className="bite-hood">{bite.neighborhood}</span>
							</span>
							<span className="bite-score" aria-label={`score ${bite.score.toFixed(2)}`}>
								<i style={{ width: `${Math.round(bite.score * 100)}%` }} />
							</span>
							<span className="bite-status">{bite.status}</span>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
