import { projectCoordinate, type RailNetwork } from "./cta-geometry";
export type MapBox = [number, number, number, number];
export type StreetTile = { key: string; url: string; x: number; y: number; width: number; height: number };
const degrees = 180 / Math.PI;

/** Select only tiles intersecting the visible SVG extent, including its letterboxing. */
export function streetTiles(box: MapBox, canvas: {width:number;height:number}, projection: RailNetwork["projection"], template = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"): StreetTile[] {
	const units = Math.max(box[2] / canvas.width, box[3] / canvas.height);
	const x = box[0] + (box[2] - canvas.width * units) / 2;
	const y = box[1] + (box[3] - canvas.height * units) / 2;
	const inverse = (px:number,py:number) => [projection.origin[1] + px * projection.metresPerUnit / projection.radius * degrees / Math.cos(projection.origin[0] / degrees), projection.origin[0] - py * projection.metresPerUnit / projection.radius * degrees];
	const [west,north] = inverse(x,y), [east,south] = inverse(x+canvas.width*units,y+canvas.height*units);
	const z = Math.max(8,Math.min(16,Math.floor(Math.log2(156543.03392*Math.cos(projection.origin[0]/degrees)/(units*projection.metresPerUnit)))));
	const n = 2 ** z;
	const tx = (lon:number) => Math.floor((lon+180)/360*n);
	const ty = (lat:number) => Math.floor((1-Math.asinh(Math.tan(lat/degrees))/Math.PI)/2*n);
	const latitude = (row:number) => Math.atan(Math.sinh(Math.PI*(1-2*row/n)))*degrees;
	const tiles: StreetTile[]=[];
	for(let col=Math.max(0,tx(west));col<=Math.min(n-1,tx(east));col++) for(let row=Math.max(0,ty(north));row<=Math.min(n-1,ty(south));row++) {
		const a=projectCoordinate(latitude(row),col/n*360-180,projection), b=projectCoordinate(latitude(row+1),(col+1)/n*360-180,projection);
		tiles.push({key:`${z}/${col}/${row}`,url:template.replace("{z}",String(z)).replace("{x}",String(col)).replace("{y}",String(row)),x:a[0],y:a[1],width:b[0]-a[0],height:b[1]-a[1]});
	}
	return tiles;
}
