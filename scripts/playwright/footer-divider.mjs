import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const playwrightBinDir = process.env.PATH
  ?.split(path.delimiter)
  .find((directory) => existsSync(path.join(directory, "playwright")));
if (!playwrightBinDir) throw new Error("Run with npm exec --package=playwright@1.64.1");
const requireFromPlaywright = createRequire(realpathSync(path.join(playwrightBinDir, "playwright")));
const { chromium } = requireFromPlaywright("playwright");
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8293/portfolio/";

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const divider = page.locator("#view-dispatch .flag-rule");
    await divider.waitFor();
    const style = await divider.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        top: computed.borderTopWidth,
        bottom: computed.borderBottomWidth,
        height: element.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.deepEqual(style, { top: "1px", bottom: "0px", height: 1, overflow: 0 },
      `${viewport.width}px Dispatch footer should have one quiet divider without overflow`);
    await page.close();
  }
  console.log("Dispatch footer divider: passed at 390px and 1440px");
} finally {
  await browser.close();
}
