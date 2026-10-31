import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const raw = readFileSync(new URL("../content/chicago-basemap.json",import.meta.url),"utf8");
const map = JSON.parse(raw);
const network = JSON.parse(readFileSync(new URL("../content/cta-network.json",import.meta.url),"utf8"));
assert.deepEqual(map.metadata.projection,network.projection,"geography and CTA coordinates share one projection");
assert.ok(raw.length < 600_000,"keep the bundled vector backdrop compact");
assert.equal(map.metadata.sources.length,3);
for(const source of map.metadata.sources){
 assert.ok(source.url.startsWith("https://data.cityofchicago.org/d/"));
 assert.match(source.sha256,/^[a-f0-9]{64}$/);
 assert.ok(source.features>0);
}
assert.ok(map.water.some((feature)=>feature.name==="LAKE MICHIGAN"));
assert.ok(map.parks.length>100 && map.streets.length===3);
for(const layer of [map.water,map.parks,map.streets])for(const feature of layer){
 assert.match(feature.path,/^M/);
 assert.match(feature.path,/^[MLZ0-9.,-]+$/,"only finite projected coordinates and path commands");
}
console.log("basemap-check: PASS");
