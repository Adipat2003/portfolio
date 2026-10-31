import { useEffect, useMemo, useState } from "react";
import { streetTiles, type MapBox } from "@/content/map-tiles";
import type { RailNetwork } from "@/content/cta-geometry";

const template = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export default function StreetMap({box,canvas,projection,active,moving,onStateChange}:{box:MapBox;canvas:{width:number;height:number};projection:RailNetwork["projection"];active:boolean;moving:boolean;onStateChange:(state:string)=>void}) {
	const [view,setView]=useState<{box:MapBox;canvas:typeof canvas}|null>(null);
	const [loaded,setLoaded]=useState<Set<string>>(()=>new Set());
	const [failed,setFailed]=useState<Set<string>>(()=>new Set());
	useEffect(()=>{
		if(!active){setView(null);return;}
		if(moving)return;
		// Wait for a camera gesture to settle, without prefetching the next view.
		const timer=window.setTimeout(()=>setView({box,canvas}),140);
		return ()=>window.clearTimeout(timer);
	},[active,moving,...box,canvas.width,canvas.height]);
	const tiles=useMemo(()=>view?streetTiles(view.box,view.canvas,projection,template):[],[view,projection]);
	const state=!active?"idle":!tiles.length?"loading":tiles.every((tile)=>loaded.has(tile.key))?"ready":tiles.some((tile)=>failed.has(tile.key))?"unavailable":"loading";
	useEffect(()=>onStateChange(state),[state,onStateChange]);
	return <g className="rail-street-map" data-state={state} aria-hidden="true">
		{tiles.map((tile)=><image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={tile.width+.01} height={tile.height+.01} preserveAspectRatio="none" opacity={loaded.has(tile.key)?1:0}
			onLoad={()=>{setLoaded((before)=>new Set(before).add(tile.key));setFailed((before)=>{const next=new Set(before);next.delete(tile.key);return next;});}} onError={()=>{setFailed((before)=>new Set(before).add(tile.key));setLoaded((before)=>{const next=new Set(before);next.delete(tile.key);return next;});}} />)}
	</g>;
}
