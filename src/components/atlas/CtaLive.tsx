"use client";

import { useEffect, useState } from "react";

/**
 * Live CTA arrivals from the server-side proxy. The browser only sees
 * normalized station/arrival data; the CTA key stays in the Node service.
 *
 * Where it lives: the terminal station panel. People can switch between
 * nearby Loop stations and see the next predictions with direction and
 * quality flags, then ask the portfolio guide below the board.
 */

const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";

type Station = { id: string; name: string };
type Arrival = {
	line: string;
	destination: string;
	direction: string;
	minutes: number;
	isApproaching: boolean;
	isDelayed: boolean;
	isScheduled: boolean;
};
type TransitResponse = {
	available?: boolean;
	station?: string;
	station_id?: string;
	stations?: Station[];
	arrivals?: Arrival[];
	as_of?: string;
};
type BoardState = {
	kind: "loading" | "available" | "empty" | "unavailable";
	station: string;
	stationId: string;
	stations: Station[];
	arrivals: Arrival[];
	asOf: string;
};

const LINE_NAMES: Record<string, string> = {
	red: "Red", blue: "Blue", brn: "Brown", g: "Green",
	org: "Orange", p: "Purple", pnk: "Pink", y: "Yellow",
};
const DEFAULT_STATION = "40380";
const STATIONS: Station[] = [
	{ id: "40380", name: "Clark/Lake" },
	{ id: "40260", name: "State/Lake" },
	{ id: "40730", name: "Washington/Wells" },
	{ id: "40040", name: "Quincy/Wells" },
];

function clockOf(iso: string): string {
	try {
		if (!iso || !Number.isFinite(Date.parse(iso))) return "";
		return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
	} catch {
		return "";
	}
}

export default function CtaLive() {
	const [selectedStation, setSelectedStation] = useState(DEFAULT_STATION);
	const [state, setState] = useState<BoardState>({
		kind: "loading",
		station: "Clark/Lake",
		stationId: DEFAULT_STATION,
		stations: STATIONS,
		arrivals: [],
		asOf: "",
	});

	useEffect(() => {
		if (!SERVICE_URL) return;
		let cancelled = false;
		let timer = 0;
		const controller = new AbortController();

		async function poll() {
			try {
				const res = await fetch(`${SERVICE_URL}/transit?station=${encodeURIComponent(selectedStation)}`, {
					signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
				});
				if (!res.ok) throw new Error(`transit service ${res.status}`);
				const data = (await res.json()) as TransitResponse;
				if (cancelled) return;
				const stations = Array.isArray(data.stations) && data.stations.length ? data.stations : STATIONS;
				const station = String(data.station ?? stations.find((entry) => entry.id === selectedStation)?.name ?? "Loop station");
				const arrivals = data.available === true && Array.isArray(data.arrivals)
					? data.arrivals.slice(0, 3)
					: [];
				const asOf = clockOf(String(data.as_of ?? ""));
				setState({
					kind: data.available !== true ? "unavailable" : arrivals.length > 0 ? "available" : "empty",
					station,
					stationId: String(data.station_id ?? selectedStation),
					stations,
					arrivals,
					asOf,
				});
			} catch {
				if (!cancelled) {
					setState((current) => ({
						...current,
						kind: "unavailable",
						stationId: selectedStation,
						arrivals: [],
					}));
				}
			} finally {
				if (!cancelled) {
					timer = window.setTimeout(poll, 60_000);
				}
			}
		}

		setState((current) => ({
			...current, kind: "loading", stationId: selectedStation,
			station: current.stations.find((entry) => entry.id === selectedStation)?.name ?? "Loop station",
			arrivals: [], asOf: "",
		}));
		poll();
		return () => {
			cancelled = true;
			controller.abort();
			window.clearTimeout(timer);
		};
	}, [selectedStation]);

	if (!SERVICE_URL) return null;

	const message = state.kind === "loading"
		? "Checking this station…"
		: state.kind === "unavailable"
			? "Live arrivals are unavailable right now. The project ride still works."
			: "No upcoming arrivals are reported right now.";

	return (
		<div className="transit-board" aria-label="CTA Loop station arrivals" data-state={state.kind} data-station={state.stationId} aria-busy={state.kind === "loading"}>
			<div className="transit-board-heading">
				<div>
					<span className="transit-eyebrow">Loop service</span>
					<h3>{state.station}</h3>
				</div>
				<span className={`transit-status transit-status-${state.kind}`}>
					<span aria-hidden="true" />
					{state.kind === "available"
						? state.arrivals.every((arrival) => arrival.isScheduled) ? "Scheduled" : "Live"
						: state.kind === "loading" ? "Updating" : state.kind === "empty" ? "No arrivals" : "Offline"}
				</span>
			</div>
			{state.stations.length > 1 ? (
				<div className="transit-stations" role="group" aria-label="Choose a Loop station">
					{state.stations.map((station) => (
						<button
							key={station.id}
							type="button"
							aria-pressed={selectedStation === station.id}
							onClick={() => setSelectedStation(station.id)}
						>
							{station.name}
						</button>
					))}
				</div>
			) : null}
			{state.kind === "available" ? (
				<div className="transit-arrivals" role="list" aria-label={`Next trains at ${state.station}`}>
					{state.arrivals.map((arrival, index) => {
						const note = [
							arrival.isScheduled ? "Scheduled" : "Predicted",
							arrival.isDelayed ? "Delay flagged" : "",
							arrival.isApproaching ? "Approaching" : "",
						].filter(Boolean).join(" · ");
						return (
							<div className="transit-arrival" role="listitem" key={`${arrival.line}-${arrival.destination}-${index}`}>
								<b className={`cta-line cta-${arrival.line}`}>{LINE_NAMES[arrival.line] ?? arrival.line.toUpperCase()}</b>
								<div className="transit-arrival-route">
									<strong>{arrival.destination}</strong>
									<span>{arrival.direction || note}</span>
								</div>
								<div className="transit-arrival-time">
									<span className={arrival.isDelayed ? "is-delayed" : ""}>{note}</span>
									<b>{arrival.isApproaching || arrival.minutes <= 0 ? "Due" : `${arrival.minutes} min`}</b>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="transit-empty" role="status" aria-live="polite">
					<p>{message}</p>
					{state.asOf ? <small>Checked {state.asOf}</small> : null}
				</div>
			)}
			<div className="transit-board-footer">
				{state.asOf ? <span>Updated {state.asOf} CT</span> : <span>Predictions can change</span>}
				<span className="cta-credit">CTA Train Tracker data</span>
			</div>
		</div>
	);
}
