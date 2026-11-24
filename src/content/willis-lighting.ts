import { z } from "zod";

export const WILLIS_LIGHTING_SOURCE = "https://theskydeck.com/willis-tower-antennas-and-lights/";

export const willisLightingSchema = z.object({
  date: z.string().min(1).max(32),
  colors: z.string().min(1).max(100),
  palette: z.array(z.string().regex(/^#[a-f\d]{6}$/i)).max(8),
});
export type WillisLighting = z.infer<typeof willisLightingSchema>;

const chicagoDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "America/Chicago",
});
export function willisLightingDate(date: Date) {
  return chicagoDate.format(date);
}
