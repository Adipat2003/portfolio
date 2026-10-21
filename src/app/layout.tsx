import type { Metadata } from "next";
import "./globals.css";
import { seasons, site } from "@/content/load";
import SeasonSync from "@/components/SeasonSync";

export const metadata: Metadata = {
  title: "Aditya Patel: Engineering Portfolio",
  description: `${site.tagline} ${site.intro}`,
};

/**
 * Resolved once at build time and baked into the exported HTML, so the first
 * paint carries the right season with no client work. SeasonSync corrects it
 * after hydration when a boundary has passed since the build.
 */
const season = seasons.seasonFor(new Date());

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-season={season}>
      <head>
        <link rel="alternate" type="application/json" href="/portfolio/api/portfolio.json" />
      </head>
      <body>
        <SeasonSync />
        {children}
      </body>
    </html>
  );
}
