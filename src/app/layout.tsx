import type { Metadata } from "next";
import "./globals.css";
import { site } from "@/content/load";

export const metadata: Metadata = {
  title: "Aditya Patel: Engineering Portfolio",
  description: `${site.tagline} ${site.intro}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="alternate" type="application/json" href="/portfolio/api/portfolio.json" />
      </head>
      <body>{children}</body>
    </html>
  );
}
