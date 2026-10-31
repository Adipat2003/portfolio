import { z } from "zod";
import raw from "../../content/public-places.json";
const link=z.string().url().refine((value)=>value.startsWith("https://"));
const data=z.object({checked_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),collections:z.array(z.object({id:z.string(),title:z.string(),description:z.string(),url:link,period:z.string()})),places:z.array(z.object({id:z.string(),name:z.string(),address:z.string(),neighborhood:z.string(),collection:z.string(),rank:z.number().int().positive(),website:link,lat:z.number().min(41).max(43),lon:z.number().min(-89).max(-87),coordinate_source:link,coordinate_note:z.string(),notice:z.string().optional()}))}).parse(raw);
const ids=new Set<string>();
for(const place of data.places){
	if(ids.has(place.id)||!data.collections.some((collection)=>collection.id===place.collection))throw new Error("Invalid public place identity or collection");
	ids.add(place.id);
}
export const publicPlaces=data;
export type PublicPlace=typeof data.places[number];
