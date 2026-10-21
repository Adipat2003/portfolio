/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: GitHub Pages serves the site from the export directory.
  output: "export",
  // Pages serves the site under /portfolio/, so every asset and link is based there.
  basePath: "/portfolio",
  // /portfolio/projects/<slug>/ needs the trailing slash to resolve as a directory.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
