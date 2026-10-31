import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const load=(file)=>{
 const source=readFileSync(new URL(file,import.meta.url),"utf8");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 new Function("require","module","exports",js)((path)=>path==="./cta-geometry"?load("../src/content/cta-geometry.ts"):null,module,module.exports);
 return module.exports;
};
const {streetTiles}=load("../src/content/map-tiles.ts");
const {projection}=JSON.parse(readFileSync(new URL("../content/cta-network.json",import.meta.url)));
for(const canvas of [{width:1920,height:900},{width:320,height:500}]){
 const tiles=streetTiles([-220,-230,420,540],canvas,projection);
 assert.ok(tiles.length>0&&tiles.length<60,"only the visible grid loads");
 assert.equal(new Set(tiles.map((tile)=>tile.key)).size,tiles.length);
 assert.ok(tiles.every((tile)=>Number.isFinite(tile.x)&&Number.isFinite(tile.y)&&tile.width>0&&tile.height>0));
 const units=Math.max(420/canvas.width,540/canvas.height),left=-220+(420-canvas.width*units)/2,right=left+canvas.width*units;
 assert.ok(Math.min(...tiles.map((t)=>t.x))<=left && Math.max(...tiles.map((t)=>t.x+t.width))>=right,"tiles include letterboxed geographic space");
}
const places=JSON.parse(readFileSync(new URL("../content/public-places.json",import.meta.url)));
assert.equal(places.collections.length,2);
assert.equal(places.places.length,10);
assert.equal(new Set(places.places.map((p)=>p.id)).size,10);
for(const place of places.places){
 assert.ok(place.lat>41.6&&place.lat<42.1&&place.lon> -88&&place.lon< -87.5);
 assert.ok(place.coordinate_source.startsWith("https://geocoding.geo.census.gov/"));
 assert.ok(places.collections.some((collection)=>collection.id===place.collection));
}
assert.ok(!places.collections.find((c)=>c.id==="beli-resy").title.includes("weekly"));
console.log("map-layers-check: PASS");
