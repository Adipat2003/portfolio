import { WILLIS_LIGHTING_SOURCE, willisLightingDate } from "../src/content/willis-lighting";
import type { WillisLighting } from "../src/content/willis-lighting";

const colors: Record<string, string> = {
  red: "#e24353", black: "#33333b", white: "#f2eee4", blue: "#628cff",
  navy: "#293c80", "light blue": "#79c3fa", green: "#41c47e", teal: "#41c5c6",
  purple: "#b188ef", pink: "#ed8dbd", orange: "#f78d43", yellow: "#ffda67",
  gold: "#ebbb5a", silver: "#cbd8e8", "silver sparkle": "#cbd8e8",
};

export function parseWillisLighting(html: string, date: string): WillisLighting | null {
  const list = html.match(/<ul\b[^>]*\bclass=["'][^"']*\bantenna-schedule-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1];
  if (!list) return null;
  for (const [, markup] of list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = markup.replace(/<[^>]+>/g, "").replace(/&amp;|&#0*38;/gi, "&")
      .replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
    if (!text.startsWith(`${date}:`)) continue;
    const colorLabel = text.slice(date.length + 1).split(/\s+[-–—]\s+/).at(-1)?.trim();
    if (!colorLabel || colorLabel.length > 100) return null;
    const names = colorLabel.toLowerCase().split(/\s*(?:&|,|\/|\band\b)\s*/).filter(Boolean);
    const palette = names.length <= 8 && names.every((name) => Object.hasOwn(colors, name))
      ? names.map((name) => colors[name]) : [];
    return { date, colors: colorLabel, palette };
  }
  return null;
}

export function createWillisLighting(fetchPage: typeof fetch = fetch, now = () => new Date()) {
  let cached: { date: string; expires: number; value: Promise<WillisLighting | null> } | undefined;
  return function getLighting() {
    const instant = now();
    const date = willisLightingDate(instant);
    if (cached?.date === date && cached.expires > instant.getTime()) return cached.value;

    const entry = {
      date,
      expires: instant.getTime() + 600_000,
      value: fetchPage(WILLIS_LIGHTING_SOURCE, { signal: AbortSignal.timeout(4500) })
        .then(async (response) => response.ok ? parseWillisLighting(await response.text(), date) : null)
        .catch(() => null)
        .then((lighting) => {
          if (!lighting) entry.expires = instant.getTime() + 60_000;
          return lighting;
        }),
    };
    cached = entry;
    return entry.value;
  };
}
