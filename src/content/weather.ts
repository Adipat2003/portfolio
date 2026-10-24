import rawWeather from "../../content/weather.json";
import { weatherSchema, type Weather } from "./schema";

/**
 * The baked weather snapshot, parsed once at build time with the same guard
 * every other record carries. scripts/weather-snapshot.mjs writes the file
 * daily; a failed bake leaves the previous day's record in place, so the
 * badge shows its own updated time rather than an empty state.
 */
export const weather: Weather = weatherSchema.parse(rawWeather);
