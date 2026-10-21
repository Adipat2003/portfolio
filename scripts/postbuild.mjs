// Copies the machine-readable artifacts into the static export so the URLs stay
// identical to the current live site (/portfolio/api/portfolio.json, llms.txt,
// robots.txt) after the Pages source switches to the Next build.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "out");

if (!existsSync(out)) {
  console.error("postbuild: out/ missing; did next build fail?");
  process.exit(1);
}

for (const item of ["api", "llms.txt", "robots.txt"]) {
  const from = join(root, item);
  if (existsSync(from)) {
    cpSync(from, join(out, item), { recursive: true });
    console.log(`postbuild: copied ${item}`);
  } else {
    console.warn(`postbuild: ${item} not found, skipped`);
  }
}
