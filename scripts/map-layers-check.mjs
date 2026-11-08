import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createExpression, featureFilter } from "@maplibre/maplibre-gl-style-spec";
const load=(file)=>{
 const source=readFileSync(new URL(file,import.meta.url),"utf8");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 new Function("require","module","exports",js)((path)=>path==="./cta-geometry"?load("../src/content/cta-geometry.ts"):null,module,module.exports);
 return module.exports;
};
const {streetTiles}=load("../src/content/map-tiles.ts");
const sprite=load("../src/content/train-sprite.ts");
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
const vector=load("../src/content/geographic-map.ts");
const geometry=load("../src/content/cta-geometry.ts");
for (const [lat,lon] of [[41.8781,-87.6298],[42.0732,-87.6906],[41.721,-87.624]]) {
 const local=geometry.projectCoordinate(lat,lon,projection);
 const actual=vector.coordinateFromPoint(local,projection);
 assert.ok(Math.abs(actual[0]-lon)<1e-10 && Math.abs(actual[1]-lat)<1e-10,"inverse projection round trips without Mercator skew");
}
const network=JSON.parse(readFileSync(new URL("../content/cta-network.json",import.meta.url)));
const data=vector.networkGeoJSON(network,{red:"#f25b70"});
assert.equal(data.routes.features.length,network.routes.reduce((n,r)=>n+r.shapes.length,0));
assert.equal(data.stations.features.length,143);
assert.deepEqual(data.stations.features[0].geometry.coordinates,vector.coordinateFromPoint(network.stations[0].point,projection));
const bounds=vector.boundsFromBox([37,-4,66,79],projection);
assert.ok(bounds[0][0]<bounds[1][0] && bounds[0][1]<bounds[1][1],"fit bounds are southwest/northeast");
assert.deepEqual(vector.modeCamera("2d",true),{pitch:0,bearing:0,duration:0});
assert.equal(vector.modeCamera("3d",false).pitch,55);
assert.equal(vector.mapStyleURL("http://unsafe.example/style"),vector.DEFAULT_MAP_STYLE);
assert.equal(vector.mapStyleURL("not a url"),vector.DEFAULT_MAP_STYLE);
assert.equal(typeof vector.isRecoverableMapError,"function","resource errors need classification before teardown");
for(const event of [
 {sourceId:"streets",tile:{},error:new Error("network request failed")},
 {sourceId:"streets",error:new Error("source metadata request failed")},
 {error:Object.assign(new Error("HTTP 503"),{url:"https://example.test/sprite.json",status:503})},
 {error:new TypeError("Failed to fetch")}, {error:new Error("Could not load glyph range")},
 {error:new Error("Could not load sprite image")},
 {error:new SyntaxError("Unexpected token in sprite JSON")},
 {error:new Error("The source image could not be decoded.")},
]) assert.equal(vector.isRecoverableMapError(event),true,`recoverable resource: ${event.error.message}`);
for(const event of [
 {error:new Error("layers[0].type: expected a valid layer type")},
 {error:new Error("Failed to initialize WebGL")}, {error:new Error("Invalid style")},
]) assert.equal(vector.isRecoverableMapError(event),false,`fatal renderer/style: ${event.error.message}`);
const customStyle={version:8,glyphs:"../fonts/{fontstack}/{range}.pbf",sprite:"./sprites/dark",sources:{
 tiles:{type:"vector",url:"../tiles.json"}, raster:{type:"raster",tiles:["./tiles/{z}/{x}/{y}.png","https://cdn.example/{z}.png"]},
 points:{type:"geojson",data:"./points.json"}, image:{type:"image",url:"../image.png",coordinates:[]},
 video:{type:"video",urls:["./video.webm"],coordinates:[]}, inline:{type:"geojson",data:{type:"FeatureCollection",features:[]}},
},layers:[]};
assert.equal(typeof vector.normalizeStyleResources,"function","custom style needs explicit response URL resource resolution");
const normalized=vector.normalizeStyleResources(customStyle,"https://styles.example/redirected/dark/style.json");
assert.equal(normalized.glyphs,"https://styles.example/redirected/fonts/{fontstack}/{range}.pbf");
assert.equal(normalized.sprite,"https://styles.example/redirected/dark/sprites/dark");
assert.equal(normalized.sources.tiles.url,"https://styles.example/redirected/tiles.json");
assert.deepEqual(normalized.sources.raster.tiles,["https://styles.example/redirected/dark/tiles/{z}/{x}/{y}.png","https://cdn.example/{z}.png"]);
assert.equal(normalized.sources.points.data,"https://styles.example/redirected/dark/points.json");
assert.equal(normalized.sources.image.url,"https://styles.example/redirected/image.png");
assert.deepEqual(normalized.sources.video.urls,["https://styles.example/redirected/dark/video.webm"]);
assert.deepEqual(normalized.sources.inline.data,customStyle.sources.inline.data);
assert.equal(customStyle.sprite,"./sprites/dark","normalization must not mutate the input style");
assert.deepEqual(vector.normalizeStyleResources({...customStyle,sprite:[{id:"dark",url:"//cdn.example/sprite"}]},"https://styles.example/style.json").sprite,[{id:"dark",url:"https://cdn.example/sprite"}]);
for(const url of ["http://insecure.example/sprite","javascript:alert(1)","https://user:secret@cdn.example/sprite"]) {
 assert.throws(()=>vector.normalizeStyleResources({...customStyle,sprite:url},"https://styles.example/style.json"),/HTTPS|credentials/,"unsafe style resource must not reach the renderer");
}
const extrusion=vector.buildingLayer({version:8,sources:{tiles:{type:"vector",tiles:["https://test.invalid/{z}/{x}/{y}.pbf"]}},layers:[{id:"building",type:"fill",source:"tiles","source-layer":"building"}]});
assert.equal(extrusion["source-layer"],"building");
const buildingFilter=featureFilter(extrusion.filter,"layers.atlas-buildings.filter").filter;
for (const [properties, visible] of [
 [{render_height:24,hide_3d:true},false],
 [{render_height:24,hide_3d:"true"},false],
 [{render_height:24,hide_3d:false},true],
 [{render_height:24,hide_3d:"false"},true],
 [{render_height:24},true],
 [{},false], [{render_height:0},false], [{render_height:-2},false],
]) assert.equal(buildingFilter({zoom:16},{type:3,properties}),visible,`building visibility: ${JSON.stringify(properties)}`);
const height=createExpression(extrusion.paint["fill-extrusion-height"],"layers.atlas-buildings.paint.fill-extrusion-height");
assert.equal(height.result,"success");
assert.equal(height.value.evaluate({zoom:16},{type:3,properties:{}}),0,"absent render_height stays zero");
assert.equal(height.value.evaluate({zoom:16},{type:3,properties:{render_height:5}}),5,"source defaults are rendered but not claimed as surveyed heights");
assert.equal(vector.buildingLayer({version:8,sources:{},layers:[]}),null);
const placeSource=vector.placeSource([{id:"food",point:[0,0]}],projection);
assert.equal(placeSource.cluster,true,"nearby food markers cluster instead of hiding downtown routes");
assert.equal(placeSource.clusterRadius,42);
assert.ok(placeSource.maxzoom > placeSource.clusterMaxZoom,"cluster ceiling must be below source maxzoom");
assert.equal(placeSource.data.features[0].properties.id,"food");
assert.deepEqual(placeSource.data.features[0].geometry.coordinates,vector.coordinateFromPoint([0,0],projection));
const mapCopy=readFileSync(new URL("../src/components/atlas/CtaRailMap.tsx",import.meta.url),"utf8");
assert.match(mapCopy,/building heights[^.]*approximations[^.]*defaults/i,"map info must disclose derived OpenMapTiles height uncertainty");
assert.match(mapCopy,/const visibleFoodPlaces\s*=\s*useMemo\(\(\)\s*=>\s*foodPoints\.filter\([\s\S]*?\),\s*\[foodLayers\]\)/,"the vector map's clustered places must retain identity across search renders");
assert.match(mapCopy,/places=\{visibleFoodPlaces\}/,"the vector map must receive stable clustered places");
assert.doesNotMatch(mapCopy,/unknown heights are not extruded|accurate building heights/i);
// Exercise the component's real load/error callbacks with a controlled renderer boundary.
const componentSource=readFileSync(new URL("../src/components/atlas/GeographicMap.tsx",import.meta.url),"utf8");
const componentJS=ts.transpileModule(componentSource.replaceAll("import.meta.url",JSON.stringify(import.meta.url)),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const callbacks=new Map(), cameraFits=[], states=[], refs=[], effects=[], stateValues=[];
let hook=0, stateHook=0, removed=false, engine;
const host={dataset:{},getBoundingClientRect:()=>({width:1440,height:900,right:1440,bottom:900}),closest:()=>null};
const canvas={setAttribute(){},addEventListener(){},removeEventListener(){}};
const context=new Proxy({}, {get:(_target,key)=>key==="getImageData"?()=>({}):()=>{}});
const interaction={enable(){},disable(){},enableRotation(){},disableRotation(){}};
const lib={setWorkerUrl(){},Map:class {
 constructor(){engine=this;removed=false;this.dragRotate=interaction;this.touchZoomRotate=interaction;this.touchPitch=interaction;this.keyboard=interaction;}
 getCanvas(){return canvas;}
 on(name,callback){callbacks.set(name,callback);}
 getStyle(){return {version:8,sources:{},layers:[]};}
 addSource(){} addLayer(){} addImage(){} resize(){}
 fitBounds(bounds,options){cameraFits.push({bounds,options});}
 easeTo(){} getLayer(){return false;}
 remove(){removed=true;}
}};
const react={
 forwardRef:(component)=>component,
 useRef:(initial)=>{const index=hook++;return refs[index]??(refs[index]={current:index===0?host:initial});},
 useState:(initial)=>{
  const index=stateHook++;
  if(!(index in stateValues))stateValues[index]=initial;
  return [stateValues[index],(value)=>{stateValues[index]=typeof value==="function"?value(stateValues[index]):value;if(typeof value==="string")states.push(value);}];
 },
 useEffect:(effect,deps)=>effects.push({effect,deps}), useImperativeHandle(){},
};
const componentModule={exports:{}};
new Function("require","module","exports",componentJS)((name)=>{
 if(name==="react")return react;
 if(name==="react/jsx-runtime")return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:"fragment"};
 if(name==="maplibre-gl")return lib;
 if(name==="@/content/geographic-map")return vector;
 if(name==="@/content/train-sprite")return sprite;
 if(name.endsWith(".css"))return {};
 throw new Error(`Unexpected component dependency ${name}`);
},componentModule,componentModule.exports);
const saved=new Map(["window","document","ResizeObserver","fetch","cancelAnimationFrame"].map((key)=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
let cleanup;
try {
 globalThis.cancelAnimationFrame=()=>{};
 globalThis.window={setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true})};
 globalThis.document={createElement:()=>({getContext:()=>context})};
 globalThis.ResizeObserver=class {observe(){} disconnect(){}};
 globalThis.fetch=async()=>({ok:true,url:"https://styles.example/style.json",json:async()=>({version:8,sources:{},layers:[]})});
 const initialProps={active:true,network,colors:{},box:[-220,-230,420,540],route:"all",selected:"",places:[],trains:[],mode:"2d",onState(){},onGesture(){}};
 const render=(props)=>{hook=0;stateHook=0;effects.length=0;return componentModule.exports.default(props,null);};
 render(initialProps); const initialDependencies=effects[0].deps; cleanup=effects[0].effect();
 await new Promise((resolve)=>setImmediate(resolve));
 assert.ok(engine,"controlled renderer must construct before delayed load");
 const selectedBox=[37,-4,66,79];
 render({...initialProps,box:selectedBox});
 callbacks.get("load")();
 assert.deepEqual(cameraFits.at(-1)?.bounds,vector.boundsFromBox(selectedBox,projection),"load must apply latest box before declaring ready");
 assert.equal(cameraFits.at(-1).options.duration,0);
 assert.equal(states.at(-1),"ready");
 render({...initialProps,box:selectedBox});
 effects[2].effect();
 const fitsAfterLoad=cameraFits.length;
 render({...initialProps,box:selectedBox,trains:[{id:"refresh",point:[0,0]}]});
 assert.deepEqual(effects[0].deps,initialDependencies,"unrelated renders must not recreate the engine effect");
 assert.equal(cameraFits.length,fitsAfterLoad,"unrelated renders must not reset a user-panned camera");
 callbacks.get("error")({sourceId:"streets",tile:{},error:new Error("network request failed")});
 assert.equal(removed,false,"one failed tile must retain the usable renderer");
 assert.equal(states.at(-1),"ready");
 assert.equal(host.dataset.error,"network request failed","recoverable failures remain diagnosable");
 const retry=render({...initialProps,box:selectedBox}).props.children[1];
 assert.match(retry.props.children,/Retry map details/);
 retry.props.onClick();
 render({...initialProps,box:selectedBox});
 assert.notDeepEqual(effects[0].deps,initialDependencies,"explicit retry must trigger a fresh attempt");
 const firstEngine=engine;
 cleanup();cleanup=effects[0].effect();
 await new Promise((resolve)=>setImmediate(resolve));
 assert.notEqual(engine,firstEngine,"retry constructs a replacement renderer");
 callbacks.get("load")();
 assert.equal(render({...initialProps,box:selectedBox}).props.children[1],null,"successful retry clears the resource warning");
 callbacks.get("error")({error:new Error("Invalid style")});
 assert.equal(removed,true,"fatal style error must dispose the renderer");
 assert.equal(states.at(-1),"unavailable");
 assert.equal(host.dataset.error,"Invalid style","fatal failures must not swallow their cause");
 render({...initialProps,box:selectedBox}).props.children[1].props.onClick();
 render({...initialProps,box:selectedBox});
 cleanup();cleanup=effects[0].effect();
 await new Promise((resolve)=>setImmediate(resolve));
 engine.addSource=()=>{throw new Error("Cannot initialize overlay source");};
 assert.doesNotThrow(()=>callbacks.get("load")(),"load-time layer construction errors must fall back instead of escaping the callback");
 assert.equal(states.at(-1),"unavailable");
 assert.equal(host.dataset.error,"Cannot initialize overlay source");
} finally {
 cleanup?.();
 for(const [key,descriptor] of saved) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
console.log("map-layers-check: PASS (projection, layers, real style expressions, resource URLs/errors, load camera lifecycle, clustering, height disclosure)");
