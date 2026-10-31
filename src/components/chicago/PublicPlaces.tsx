import { publicPlaces } from "@/content/public-places";

export default function PublicPlaces() {
	return <section className="public-food" aria-labelledby="public-food-title"><div className="wrap">
		<div className="sec-head"><div><span className="kicker">Around Chicago</span><h2 id="public-food-title">Public food lists</h2></div><a href="#map">Explore the city map ↗</a></div>
		<p>Public rankings, separate from Aditya’s recommendations. Snapshot checked {publicPlaces.checked_on}.</p>
		<div className="public-food-lists">{publicPlaces.collections.map((collection)=><details key={collection.id}><summary>{collection.title}<span>5 places</span></summary><p>{collection.description} {collection.period}.</p><ol>{publicPlaces.places.filter((place)=>place.collection===collection.id).map((place)=><li key={place.id}><a href={place.website}>{place.name} ↗</a><span>{place.neighborhood} · {place.address}</span>{place.notice?<p>{place.notice}</p>:null}</li>)}</ol><a href={collection.url}>View ranking source ↗</a></details>)}</div>
	</div></section>;
}
