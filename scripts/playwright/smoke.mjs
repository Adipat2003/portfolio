import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const playwrightBinDir = process.env.PATH
	?.split(path.delimiter)
	.find((directory) => existsSync(path.join(directory, "playwright")));

if (!playwrightBinDir) {
	throw new Error(
		"Playwright was not found. Run this script with the npm exec command in scripts/playwright/README.md.",
	);
}

const playwrightCli = realpathSync(path.join(playwrightBinDir, "playwright"));
const requireFromPlaywright = createRequire(playwrightCli);
const { chromium } = requireFromPlaywright("playwright");
const baseUrl = new URL(process.env.BASE_URL ?? "http://localhost:3000/portfolio/");
const errors = [];
const screenshotDir = process.env.SCREENSHOT_DIR;
async function capture(page, name) {
	if (!screenshotDir) return;
	await page.waitForFunction(() => document.querySelector(".rail-network")?.getAttribute("data-camera") !== "moving");
	await page.evaluate(() => Promise.allSettled(Array.from(document.querySelectorAll(".rail-sheet,.rail-paths path,.rail-route-reveal")).flatMap((element) => element.getAnimations().map((animation) => animation.finished))));
	mkdirSync(screenshotDir, { recursive: true });
	const session = await page.context().newCDPSession(page);
	const { data } = await session.send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
	writeFileSync(path.join(screenshotDir, `${name}.jpg`), Buffer.from(data, "base64"));
	await session.detach();
}
const viewports = [
	{ name: "desktop", width: 1920, height: 1080 },
	{ name: "laptop", width: 1440, height: 900 },
	{ name: "small laptop", width: 1366, height: 768 },
	{ name: "laptop", width: 1280, height: 800 },
	{ name: "squarish", width: 1024, height: 768 },
	{ name: "short laptop", width: 1280, height: 600 },
	{ name: "tablet portrait", width: 820, height: 1180 },
	{ name: "tablet landscape-ish", width: 768, height: 1024 },
	{ name: "phone", width: 390, height: 844 },
];

if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";

function assertGeometry(geometry, label) {
	assert.ok(geometry.stage, `${label}: Atlas ride stage exists`);
	assert.ok(Math.abs(geometry.stage.top) <= 1, `${label}: stage is pinned to the viewport top`);
	assert.ok(
		Math.abs(geometry.stage.height - geometry.viewport.height) <= 1,
		`${label}: stage fills the viewport height`,
	);
	assert.ok(geometry.city, `${label}: city map exists`);
	assert.ok(
		geometry.city.top < geometry.viewport.height && geometry.city.bottom > 0 && geometry.city.width > 100,
		`${label}: city map is visible`,
	);
	assert.ok(geometry.strip, `${label}: trip strip exists`);
	assert.ok(
		geometry.strip.top >= geometry.header.bottom,
		`${label}: trip strip clears the measured header`,
	);
	assert.ok(geometry.card?.visible, `${label}: ride card is visible`);
	assert.ok(geometry.overflow <= 0, `${label}: no horizontal page overflow`);
}

async function readGeometry(page) {
	return page.evaluate(() => {
		const bounds = (selector) => {
			const element = document.querySelector(selector);
			if (!element) return null;
			const { top, bottom, height, width } = element.getBoundingClientRect();
			return { top, bottom, height, width };
		};
		const card = document.querySelector(".ride-overlay .chi-card");
		const cardBounds = card?.getBoundingClientRect();
		return {
			viewport: { width: innerWidth, height: innerHeight },
			stage: bounds(".ride-stage"),
			city: bounds(".atlas-scroll .chi-map"),
			strip: bounds(".trip-strip"),
			header: bounds(".concept-bar"),
			card: cardBounds
				? { top: cardBounds.top, bottom: cardBounds.bottom, visible: cardBounds.top < innerHeight && cardBounds.bottom > 0 }
				: null,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	});
}

async function checkMatrix(page, viewports) {
	const matrix = [];
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.locator(".ride").evaluate((ride) => {
			const bounds = ride.getBoundingClientRect();
			window.scrollTo(0, window.scrollY + bounds.top + bounds.height * 0.14);
		});
		await page.waitForTimeout(250);
		const geometry = await readGeometry(page);
		assertGeometry(geometry, `${viewport.name} ${viewport.width}x${viewport.height}`);
		if (viewport.width <= 860) {
			if (viewport.width <= 390) {
				assert.ok(geometry.header.height <= 64, "phone facade header fits in one compact row");
			}
			assert.equal(
				await page.locator(".chi-map .station text").first().evaluate((element) => getComputedStyle(element).display),
				"none",
				`${viewport.name}: full station names stay in the trip strip and project card`,
			);
			assert.equal(
				await page.locator(".trip-stop.hit em").evaluate((element) => getComputedStyle(element).display),
				"none",
				`${viewport.name}: active stop label does not clip in the narrow trip strip`,
			);
			assert.ok(
				await page.locator(".trip-strip .strip-counter").evaluate((element) => element.scrollWidth <= element.clientWidth),
				`${viewport.name}: active stop counter is not clipped`,
			);
		}
		matrix.push({ name: viewport.name, ...geometry });
		await capture(page, `atlas-${viewport.width}x${viewport.height}`);
	}

	return matrix;
}

async function checkNetwork(page) {
	const map = page.locator(".rail-network");
	assert.equal(await map.count(), 1);
	assert.ok(await page.evaluate(() => document.querySelector(".ride").compareDocumentPosition(document.querySelector(".rail-network")) & Node.DOCUMENT_POSITION_FOLLOWING), "scenic route comes first");
	await map.evaluate((element) => element.scrollIntoView({ block: "start" }));
	assert.equal(await map.locator(".rail-paths path").count(), 8);
	assert.equal(await map.locator(".rail-station").count(), 143);
	assert.equal(await map.locator(".rail-sheet").count(), 0, "map opens without a word-heavy panel");
	assert.equal(await map.locator(".rail-station text").count(), 0, "station words appear only after selection");
	await page.waitForFunction(() => document.querySelector(".rail-feed-status")?.getAttribute("data-state") !== "loading", null, {timeout:25000});
	await page.waitForTimeout(1100);
	assert.ok(await map.locator(".rail-water path").count() > 100, "real water geometry replaces the illustrative shoreline");
	assert.ok(await map.locator(".rail-parks path").count() > 100, "local park geometry is available without tile requests");
	assert.equal(await map.locator(".rail-streets path").count(),3);
	await capture(page, "network-desktop");
	await map.getByRole("combobox", { name: "Choose a CTA line" }).selectOption("brn");
	assert.ok(await map.locator(".rail-station").count() < 143);
	await map.getByRole("searchbox").fill("Kimball");
	await map.getByRole("group", { name: "Matching stations" }).getByRole("button", { name: "Kimball" }).click();
	assert.match(await map.locator(".rail-sheet-heading h3").innerText(), /Kimball/);
	if (await map.locator(".transit-board").count()) await page.waitForFunction(() => document.querySelector(".rail-network .transit-board")?.getAttribute("data-state") !== "loading", null, { timeout:25_000 });
	const stationFocus = await map.locator('.rail-station[aria-pressed="true"]').evaluate((element) => ({ outline:getComputedStyle(element).outlineStyle, width:element.querySelector(".rail-stop-dot").getBoundingClientRect().width }));
	assert.equal(stationFocus.outline, "none", "SVG stations have no scaled native focus ring");
	assert.ok(stationFocus.width <= 12, "selected station marker stays screen-sized");
	await map.getByRole("button", { name: "Close map details" }).click();
	await map.getByRole("combobox", { name: "Choose a CTA line" }).selectOption("all");
	await map.getByRole("searchbox").fill("ohare");
	assert.ok(await map.getByRole("group", { name: "Matching stations" }).getByRole("button", { name: "O'Hare" }).count(),"station search tolerates omitted punctuation");
	await map.getByRole("searchbox").fill("Clark");
	await map.getByRole("group", { name: "Matching stations" }).getByRole("button").first().press("Escape");
	assert.equal(await map.getByRole("group", { name: "Matching stations" }).count(), 0);
	await map.getByRole("searchbox").fill("Clark/Lake");
	await map.getByRole("group", { name: "Matching stations" }).getByRole("button", { name: "Clark/Lake" }).click();
	assert.ok(await map.locator('.rail-projects a[href$="offline-sync-engine/"]').count());
	await capture(page, "network-station");
	await map.getByRole("button", { name: "Close map details" }).click();
	await map.getByRole("button", { name: "Loop", exact:true }).click();
	await page.waitForFunction(() => document.querySelector(".rail-network")?.getAttribute("data-camera") === "idle");
	assert.equal(await map.getByRole("button", { name: "Loop", exact:true }).getAttribute("aria-pressed"), "true");
	assert.ok(await map.locator(".rail-station text").count() <= 1, "zoom does not bring back label clutter");
	await capture(page, "network-loop");
	await map.getByRole("button", { name: "Network", exact:true }).click();
	for (const size of [{ width:1920,height:1080 }, { width:1280,height:600 }, { width:820,height:1180 }, { width:390,height:844 }, { width:320,height:740 }]) {
		await page.setViewportSize(size);
		await map.evaluate((element) => element.scrollIntoView({ block:"start" }));
		await page.waitForTimeout(500);
		const geometry = await map.evaluate((element) => {
			const r=element.getBoundingClientRect(), toolbar=element.querySelector(".rail-topbar").getBoundingClientRect(), header=document.querySelector(".concept-bar").getBoundingClientRect();
			return { height:r.height, top:r.top, toolbar:toolbar.top, header:header.bottom, overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth };
		});
		assert.equal(geometry.height,size.height,"network fills the screen");
		assert.ok(Math.abs(geometry.top)<=1 && geometry.toolbar>=geometry.header && geometry.overflow<=0,"full-screen controls clear the real header without overflow");
		assert.ok(await map.evaluate((element) => {
			const svg=element.querySelector(".rail-map-svg").getBoundingClientRect(),label=element.querySelector(".rail-lake-name")?.getBoundingClientRect();
			return !label || (label.left>=svg.left && label.right<=svg.right && label.top>=svg.top && label.bottom<=svg.bottom);
		}),"water label is hidden when it cannot fit on screen");
		const controls = await map.locator("button,select,input").evaluateAll((elements) => elements.filter((e) => e.getBoundingClientRect().height>0).map((e) => e.getBoundingClientRect().height));
		assert.ok(controls.every((height)=>height>=44));
		const clearance = await map.evaluate((element) => ({tools:element.querySelector(".rail-map-tools").getBoundingClientRect().right,credit:element.querySelector(".rail-map-credit").getBoundingClientRect().left}));
		assert.ok(clearance.tools <= clearance.credit,`map controls and attribution never overlap at ${size.width}: ${JSON.stringify(clearance)}`);
		const clutter = await map.locator(".rail-live-train").evaluateAll((elements)=>elements.map((e)=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
		for(let i=0;i<clutter.length;i++)for(let k=i+1;k<clutter.length;k++)assert.ok(Math.hypot(clutter[i].x-clutter[k].x,clutter[i].y-clutter[k].y)>=35);
		await capture(page, `network-${size.width}x${size.height}`);
	}
	await page.route("**/disruptions",(route)=>route.fulfill({ headers:{"access-control-allow-origin":baseUrl.origin},contentType:"application/json",body:JSON.stringify({available:true,as_of:new Date().toISOString(),alerts:[{id:"1",headline:"Fixture station closure",description:"Use the adjacent station.",url:"https://www.transitchicago.com/alerts/"}]}) }));
	await map.getByRole("button",{name:"Alerts",exact:true}).click();
	await map.getByText("Fixture station closure",{exact:true}).waitFor();
	await map.getByText("Fixture station closure",{exact:true}).click();
	assert.ok(await map.getByText("Use the adjacent station.").isVisible());
	await map.getByRole("button",{name:"Close map details"}).press("Escape");
	await page.route("**/ask-transit",(route)=>route.fulfill({headers:{"access-control-allow-origin":baseUrl.origin},contentType:"application/json",body:JSON.stringify({answer:"Blue Line: 12 trains reporting positions.\n\n" + Array(6).fill("Fixture service context for a long sourced answer. Conditions can change; use the linked official notice for the full details.").join("\n\n"),evidence:[{id:"r1",source:"https://www.transitchicago.com/traintracker/",as_of:new Date().toISOString()}]})}));
	await map.getByRole("button",{name:"Ask CTA",exact:true}).click();
	await map.getByRole("textbox",{name:"Your question"}).fill("Where are Blue Line trains?");
	await map.locator(".transit-guide form").getByRole("button",{name:"Ask CTA",exact:true}).click();
	await map.locator(".transit-guide-answer p").waitFor();
	assert.match(await map.locator(".transit-guide-answer p").innerText(), /^Blue Line: 12/);
	assert.ok(await map.getByRole("link",{name:"CTA source ↗"}).isVisible());
	await map.locator(".rail-sheet").evaluate((element)=>{element.scrollTop=element.scrollHeight;});
	const dismiss = await map.getByRole("button",{name:"Close map details"}).evaluate((button)=>{
		const r=button.getBoundingClientRect(),panel=button.closest(".rail-sheet").getBoundingClientRect();return r.top>=panel.top && r.bottom<=panel.bottom;
	});
	assert.ok(dismiss,"long answers keep the close control on screen");
	await capture(page,"network-guide-phone");
	await map.getByRole("button",{name:"Close map details"}).click();
	await page.setViewportSize({width:1440,height:900});
	await map.getByRole("button",{name:"Ask CTA",exact:true}).click();
	await map.getByRole("link",{name:"Back to the scenic route ↑"}).click();
	assert.equal(await map.locator(".rail-sheet").count(),0,"leaving the map closes its guide panel");
	await page.evaluate(()=>window.scrollTo(0,0));
}

async function checkLiveUpdates(browser) {
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	page.on("pageerror", (error) => errors.push(error.message));
	await page.clock.install();
	await page.route("**/transit-alerts", (route) => route.fulfill({ headers: { "access-control-allow-origin": baseUrl.origin }, contentType: "application/json", body: JSON.stringify({ available: true, routes: [{ route: "p", status: "Normal Service" }, { route: "pexp", status: "Planned Work" }] }) }));
	let requests = 0;
	await page.route("**/positions", async (route) => {
		requests++;
		const train = { id: "blue-123", route: "blue", lat: requests === 1 ? 41.901 : requests === 2 ? 41.902 : 41.9033, lon: -87.6643, heading: 180, destination: "Forest Park", nextStation: "Washington", nextStationId: "40370", isDelayed: false };
		await route.fulfill({ headers: { "access-control-allow-origin": baseUrl.origin }, contentType: "application/json", body: JSON.stringify({ available: requests !== 4,
			trains: requests === 6 ? [] : [train], as_of: new Date(await page.evaluate(() => Date.now()) + (requests === 7 ? 180_000 : requests === 5 ? -180_000 : 0)).toISOString() }) });
	});
	await page.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(".rail-network");
	await page.waitForFunction(() => document.querySelector(".rail-feed-status")?.getAttribute("data-state") !== "loading");
	if (!requests) { await page.close(); return; }
	await page.locator('.rail-network .rail-feed-status[data-state="live"]').waitFor();
	assert.equal(requests, 1, "camera and station changes do not duplicate the positions poll");
	const networkExtent = await page.locator(".rail-map-svg").getAttribute("viewBox");
	await page.getByRole("button", {name:"Loop",exact:true}).click();
	await page.clock.runFor(120);
	assert.equal(await page.locator(".rail-network").getAttribute("data-camera"),"moving");
	await page.getByRole("button", {name:"Network",exact:true}).click();
	await page.clock.runFor(320);
	assert.equal(await page.locator(".rail-network").getAttribute("data-camera"),"idle","camera can be interrupted and settles on the latest target");
	assert.equal(await page.locator(".rail-map-svg").getAttribute("viewBox"),networkExtent);
	await page.emulateMedia({reducedMotion:"reduce"});
	await page.getByRole("button", {name:"Loop",exact:true}).click();
	assert.equal(await page.locator(".rail-network").getAttribute("data-camera"),"idle","reduced-motion camera changes are immediate");
	assert.equal(await page.locator(".rail-sheet").count(),0);
	await page.emulateMedia({reducedMotion:"no-preference"});
	await page.getByRole("button", {name:"Network",exact:true}).focus();
	await page.keyboard.press("Enter");
	assert.equal(await page.locator(".rail-network").getAttribute("data-camera"),"idle","keyboard navigation never waits for camera motion");
	assert.equal(await page.getByRole("button", {name:"Network",exact:true}).getAttribute("aria-pressed"),"true");

	assert.equal(await page.locator('.rail-live-train[data-train="blue-123"]').count(), 1);
	const marker = page.locator('.rail-network .rail-live-train').first();
	const firstPosition = await marker.getAttribute("transform");
	for (const tick of [2, 3, 4, 5, 6, 7]) {
		if (tick === 3) await page.emulateMedia({ reducedMotion: "reduce" });
		const response = page.waitForResponse((result) => result.url().endsWith("/positions"));
		await page.clock.fastForward(15_000);
		await response;
		await page.clock.runFor(tick === 2 ? 1100 : 60);
		assert.equal(requests, tick);
		if (tick === 2) assert.notEqual(await marker.getAttribute("transform"), firstPosition, "marker moves when its real fix changes");
		if (tick === 3) assert.equal(await marker.evaluate((element) => getComputedStyle(element).transitionDuration), "0s", "reduced-motion fixes do not interpolate with CSS");
		if (tick >= 4) {
			await page.locator(`.rail-network .rail-feed-status[data-state="${tick === 6 ? "empty" : "offline"}"]`).waitFor();
			assert.equal(await page.locator(".rail-live-train").count(), 0, "empty/stale/unavailable feeds never leave fake moving trains");
			assert.equal(await page.locator(".rail-paths path").count(), 8, "static network survives feed failure");
		}
	}
	await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
	if (process.env.NETWORK_ONLY === "1") {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("#view-atlas");
		await capture(page, "atlas-intro-desktop");
		await checkNetwork(page);
		await checkLiveUpdates(browser);
		console.log("Network browser checks passed");
	} else if (process.env.SPOT_CHECK === "1") {
		const page = await browser.newPage();
		const session = await page.context().newCDPSession(page);
		await session.send("Network.enable");
		await session.send("Network.setCacheDisabled", { cacheDisabled: true });
		await page.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("#view-atlas");
		const matrix = await checkMatrix(page, viewports.filter(({ width }) => [1920, 1280, 390].includes(width)).filter(({ height }) => height !== 800));
		console.log(JSON.stringify({ result: "passed", baseUrl: baseUrl.href, cacheDisabled: true, matrix }, null, 2));
	} else {
		const keyboardPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		keyboardPage.on("pageerror", (error) => errors.push(error.message));
		await keyboardPage.goto(baseUrl.href, { waitUntil: "domcontentloaded" });
		await keyboardPage.keyboard.press("Tab");
		assert.equal(await keyboardPage.evaluate(() => document.activeElement?.id), "btn-dispatch");
		const focusOutline = await keyboardPage.locator("#btn-dispatch").evaluate((button) => {
			const style = getComputedStyle(button);
			return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
		});
		assert.equal(focusOutline.style, "solid");
		assert.ok(focusOutline.width >= 3, "keyboard focus is visibly outlined");
		await keyboardPage.close();

		const noJsContext = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 1440, height: 900 },
		});
		const noJsPage = await noJsContext.newPage();
		await noJsPage.goto(baseUrl.href, { waitUntil: "domcontentloaded" });
		assert.match(await noJsPage.locator("h1").innerText(), /I build systems that keep working/);
		assert.ok(await noJsPage.locator(".project-card").count(), "static project content renders without JavaScript");
		await noJsContext.close();

		const motionPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		motionPage.on("pageerror", (error) => errors.push(error.message));
		await motionPage.emulateMedia({ reducedMotion: "reduce" });
		await motionPage.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await motionPage.waitForSelector(".ride-copy");
		assert.equal(
			await motionPage.locator(".ride-copy").evaluate((element) => getComputedStyle(element).transitionDuration),
			"0s",
			"Atlas transitions respect reduced motion",
		);
		await motionPage.close();

		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		page.on("pageerror", (error) => errors.push(error.message));

		await page.goto(baseUrl.href, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("#view-dispatch");
		assert.equal(await page.locator("#view-dispatch .impact-band").count(), 0, "Dispatch has no detached impact figures");
		const dispatchDesktopOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		assert.ok(dispatchDesktopOverflow <= 0, "desktop Dispatch has no horizontal page overflow");
		await capture(page, "dispatch-desktop");

		await page.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("#view-atlas");
		await page.waitForFunction(() => document.title.includes("The Atlas"));
		assert.equal(await page.locator("#btn-atlas").getAttribute("aria-pressed"), "true");
		assert.equal(await page.locator(".mosaics").count(), 0, "Atlas has no detached impact-number mosaics");
		await checkNetwork(page);
		await checkLiveUpdates(browser);
		await page.locator("#btn-dispatch").click();
		await page.waitForFunction(() => document.title.includes("The Dispatch"));
		assert.equal(new URL(page.url()).hash, "");
		await page.locator("#btn-atlas").click();
		await page.waitForFunction(() => document.title.includes("The Atlas"));
		assert.equal(new URL(page.url()).hash, "#atlas");
		await page.locator(".skip-ride").click();
		await page.waitForFunction(() => window.scrollY > 1000);
		assert.ok(await page.locator(".rail-network").evaluate((element) => Math.abs(element.getBoundingClientRect().top) <= 1), "Skip the ride reaches the full-screen network ending");
		await page.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("#view-atlas");

		const matrix = await checkMatrix(page, viewports);

		await page.setViewportSize({ width: 1440, height: 900 });
		await page.getByRole("button", { name: /Jump to Offline sync engine/ }).click();
		await page.waitForFunction(() =>
			document.querySelector(".ride-overlay .station-card h3")?.textContent?.includes("Inspection reporting that survives dead zones"),
		);
		await page.getByRole("button", { name: /Offline sync engine station/ }).click();
		await page.waitForFunction(() => document.querySelector(".ride-overlay .station-card h3") !== null);
		assert.match(await page.locator(".ride-overlay .station-card h3").innerText(), /Inspection reporting that survives dead zones/);
		assert.ok(await page.locator(".station-evidence").getByText("546", { exact: true }).count());
		assert.ok(await page.locator(".station-evidence").getByText("commits on the mobile monorepo").count());
		assert.ok(await page.locator(".station-evidence").getByText("self-reported").count());
		const landmark = page.getByRole("button", { name: /Willis Tower:/ });
		await landmark.focus();
		await landmark.press(" ");
		await page.waitForFunction(() => document.querySelector(".bld-selected") !== null);
		await page.waitForTimeout(100);
		assert.equal(await page.locator(".bld-selected").count(),1,"browser focus scrolling does not release a keyboard selection");
		await landmark.press("Escape");
		await landmark.press("Enter");
		await page.waitForFunction(() => document.querySelector(".bld-selected") !== null);
		assert.equal(await landmark.evaluate((element)=>getComputedStyle(element).outlineStyle),"none","landmark focus has no scaled native ring");
		assert.equal(await page.locator(".bld-selected").evaluate((element)=>getComputedStyle(element).filter),"none","selection cannot spill a glowing shadow");
		assert.equal(await page.locator(".window-lights").getAttribute("clip-path"),"url(#atlas-window-mask)");
		assert.ok(await page.locator(".window-lights").evaluate((group) => {
			const mask=document.querySelector("#atlas-window-mask path");
			return [...group.querySelectorAll("rect")].every((rect)=>{
				const x=Number(rect.getAttribute("x")),y=Number(rect.getAttribute("y")),w=Number(rect.getAttribute("width")),h=Number(rect.getAttribute("height"));
				return [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].every(([a,b])=>mask.isPointInFill(new DOMPoint(a,b)));
			});
		}),"every window fits an authored building silhouette");
		assert.match(await page.locator(".ride-overlay .chi-card h3").innerText(), /Willis Tower/);
		await page.waitForTimeout(700);
		const selectedCamera = await page.locator(".chi-map.riding").evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return { left: rect.left, right: rect.right, width: innerWidth };
		});
		assert.ok(selectedCamera.left <= 1 && selectedCamera.right >= selectedCamera.width - 1, "selected SVG covers both screen edges");
		await capture(page, "skyline-selected");
		const buildingBounds = await page.locator('.atlas-building[aria-expanded="true"]').evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom, strip: document.querySelector(".trip-strip").getBoundingClientRect().bottom, height: innerHeight };
		});
		assert.ok(buildingBounds.top >= buildingBounds.strip - 2 && buildingBounds.bottom <= buildingBounds.height + 2, "selected landmark fits below the trip strip");
		await landmark.press("Escape");
		await page.waitForFunction(() => document.querySelector(".bld-selected") === null);
		await landmark.press("Enter");
		await page.waitForFunction(() => document.querySelector(".bld-selected") !== null);
		assert.equal(await landmark.evaluate((element)=>getComputedStyle(element).outlineStyle),"none","landmark focus has no scaled native ring");
		assert.equal(await page.locator(".bld-selected").evaluate((element)=>getComputedStyle(element).filter),"none","selection cannot spill a glowing shadow");
		assert.equal(await page.locator(".window-lights").getAttribute("clip-path"),"url(#atlas-window-mask)");
		assert.ok(await page.locator(".window-lights").evaluate((group) => {
			const mask=document.querySelector("#atlas-window-mask path");
			return [...group.querySelectorAll("rect")].every((rect)=>{
				const x=Number(rect.getAttribute("x")),y=Number(rect.getAttribute("y")),w=Number(rect.getAttribute("width")),h=Number(rect.getAttribute("height"));
				return [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].every(([a,b])=>mask.isPointInFill(new DOMPoint(a,b)));
			});
		}),"every window fits an authored building silhouette");
		await page.mouse.wheel(0, 80);
		await page.waitForFunction(() => document.querySelector(".bld-selected") === null);


		await page.getByRole("button", { name: "Jump to Android rollout" }).click();
		await page.waitForFunction(() => /STOP 2 OF \d+/.test(document.querySelector('[aria-label="Trip progress"]')?.textContent ?? ""));
		assert.match(await page.getByRole("group", { name: "Trip progress" }).innerText(), /STOP 2 OF \d+/);
		await page.getByRole("button", { name: /Jump to The terminal/ }).click();
		await page.waitForSelector(".terminal-card");
		await page.waitForTimeout(600);
		await capture(page, "terminal-desktop");
		if (await page.locator(".terminal-card .transit-board").count()) {
			const transitStations = page.getByRole("group", { name: "Choose a Loop station" });
			assert.equal(await transitStations.getByRole("button").count(), 4);
			await page.waitForFunction(() => document.querySelector(".terminal-card .transit-board")?.getAttribute("data-state") !== "loading", null, { timeout: 25_000 });
			await capture(page, "terminal-live-clark-lake");
			await transitStations.getByRole("button", { name: "State/Lake" }).click();
			await page.waitForFunction(() => {
				const board = document.querySelector(".terminal-card .transit-board");
				return board?.getAttribute("data-station") === "40260" && board.getAttribute("data-state") !== "loading";
			}, null, { timeout: 25_000 }).catch(async (error) => {
				console.error(await page.evaluate(() => ({ board: document.querySelector(".terminal-card .transit-board")?.outerHTML, scrollY, card: document.querySelector(".ride-overlay")?.outerHTML, errors: document.body.innerText.slice(-500) })));
				await capture(page, "terminal-failure");
				throw error;
			});
			assert.match(await page.locator(".terminal-card .transit-board-heading h3").innerText(), /State\/Lake/);
			assert.ok(["available", "empty", "unavailable"].includes(await page.locator(".terminal-card .transit-board").getAttribute("data-state")));
			await page.locator(".terminal-overlay").evaluate((element) => { element.scrollTop = 0; });
			await page.waitForTimeout(600);
			await capture(page, "terminal-desktop");
			await transitStations.getByRole("button", { name: "Clark/Lake", exact: true }).click();
			await page.waitForFunction(() => document.querySelector(".terminal-card .transit-board")?.getAttribute("data-state") !== "loading", null, { timeout: 25_000 });
			for (const viewport of [{ width: 1280, height: 600 }, { width: 390, height: 844 }]) {
				await page.setViewportSize(viewport);
				await page.getByRole("button", { name: /Jump to The terminal/ }).click();
				await page.waitForTimeout(600);
				await page.locator(".terminal-overlay").evaluate((element) => { element.scrollTop = 0; });
				const terminal = await page.locator(".terminal-overlay").evaluate((element) => {
					const box = element.getBoundingClientRect();
					const strip = document.querySelector(".trip-strip").getBoundingClientRect();
					return { top: box.top, bottom: box.bottom, stripBottom: strip.bottom, height: innerHeight };
				});
				assert.ok(terminal.top >= terminal.stripBottom, "terminal clears the trip strip");
				assert.ok(terminal.bottom <= terminal.height, "terminal stays inside viewport");
				await capture(page, `terminal-${viewport.width}x${viewport.height}`);
				const edge = await page.locator(".chi-map.riding").evaluate((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: innerWidth }));
				assert.ok(edge.left <= 1 && edge.right >= edge.width - 1, `terminal covers screen edges: ${JSON.stringify(edge)}`);
			}
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.getByRole("button", { name: /Jump to The terminal/ }).click();
			await page.waitForTimeout(600);
			for (const [index, kind] of ["available", "empty", "unavailable"].entries()) {
				const stationId = index === 1 ? "40380" : "40260";
				const station = stationId === "40380" ? "Clark/Lake" : "State/Lake";
				let release;
				const pending = new Promise((resolve) => { release = resolve; });
				await page.route("**/transit?station=*", async (route) => {
					await pending;
					await route.fulfill({ headers: { "access-control-allow-origin": baseUrl.origin }, contentType: "application/json", body: JSON.stringify({
						available: kind !== "unavailable", station, station_id: stationId,
						arrivals: kind === "available" ? [{ line: "brn", destination: "Kimball", direction: "Outer Loop platform", minutes: 7, isScheduled: true, isDelayed: true, isApproaching: false }] : [],
					}) });
				});
				await transitStations.getByRole("button", { name: station, exact: true }).click();
				await page.locator(`.terminal-card .transit-board[data-station="${stationId}"][data-state="loading"]`).waitFor();
				assert.equal(await page.locator(".terminal-card .transit-board-heading h3").innerText(), station);
				release();
				await page.locator(`.terminal-card .transit-board[data-state="${kind}"]`).waitFor().catch(async (error) => {
					console.error(await page.evaluate(() => ({ y:scrollY, board:document.querySelector(".terminal-card .transit-board")?.outerHTML, overlay:document.querySelector(".ride-overlay")?.outerHTML })));
					await capture(page, "fixture-failure");
					throw error;
				});
				if (kind === "available") {
					assert.match(await page.locator(".terminal-card .transit-status").innerText(), /Scheduled/i);
					assert.match(await page.locator(".terminal-card .transit-arrival").innerText(), /Scheduled · Delay flagged/i);
				} else {
					assert.match(await page.locator(".terminal-card .transit-empty").innerText(), kind === "empty" ? /No upcoming arrivals/ : /unavailable/);
				}
				await page.unroute("**/transit?station=*");
			}
		}
		await page.getByRole("button", { name: "How does the offline sync stay correct?" }).click();
		await page.waitForFunction(() => document.querySelector(".terminal-card .answer")?.textContent?.includes("Single-writer"));

		await page.locator("#btn-dispatch").click();
		await page.waitForFunction(() => document.title.includes("The Dispatch"));
		const projectSearch = page.getByRole("searchbox", { name: "Find a project" });
		await projectSearch.fill("75-endpoint");
		const apiCard = page.locator(".project-card").filter({ hasText: "Access control for a 75-endpoint inspection API" });
		assert.ok(await apiCard.getByText("75", { exact: true }).count());
		assert.ok(await apiCard.getByText("API paths on the platform").count());
		assert.ok(await apiCard.getByText("self-reported").count());
		await projectSearch.fill("");
		await page.getByRole("group", { name: "Filter by tag" }).getByRole("button", { name: "offline-first" }).click();
		assert.match(await page.getByRole("status").first().innerText(), /1 of 14 projects/i);
		await projectSearch.fill("offline");
		assert.match(await page.getByRole("status").first().innerText(), /[1-9]\d* of \d+ projects/i);
		await page.getByRole("button", { name: "Clear filters" }).click();
		await page.getByRole("button", { name: "How does the offline sync stay correct?" }).click();
		await page.waitForFunction(() => document.querySelector(".answer")?.textContent?.includes("Single-writer fact logs"));
		await Promise.all([
			page.waitForURL(/\/projects\/offline-sync-engine\/?$/),
			page.getByRole("link", { name: "Inspection reporting that survives dead zones" }).click(),
		]);
		assert.equal(await page.locator("h1").innerText(), "Inspection reporting that survives dead zones");
		await capture(page,"project-detail-desktop");
		await page.setViewportSize({width:390,height:844});
		assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),"project details fit phone width");
		await capture(page,"project-detail-phone");
		await page.setViewportSize({width:1440,height:900});
		await Promise.all([
			page.waitForURL(/\/portfolio\/?$/),
			page.locator('.detail-head a[href="/portfolio/"]').click(),
		]);
		assert.ok(await page.locator("#view-dispatch").count());
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(baseUrl.href, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("#view-dispatch");
		await capture(page, "dispatch-phone");
		const dispatchPhoneOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		assert.ok(dispatchPhoneOverflow <= 0, "phone Dispatch has no horizontal page overflow");
		assert.equal(
			await page.locator(".ghost-star").evaluate((star) => getComputedStyle(star).display),
			"none",
			"phone Dispatch keeps the decorative star clear of the headline",
		);

		for (const size of [{width:1440,height:900},{width:390,height:844}]) {
			await page.setViewportSize(size);
			for (const section of ["f1-work","f1-about","f1-chicago","f1-landmarks","f1-ask"]) {
				const heading=page.locator(`#${section}`);
				if (!(await heading.count())) continue;
				await heading.evaluate((element)=>element.closest("section").scrollIntoView({block:"start"}));
				assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
				await capture(page,`dispatch-${section}-${size.width}`);
			}
			await page.locator(".site-foot").scrollIntoViewIfNeeded();
			await capture(page,`dispatch-footer-${size.width}`);
		}

		const touchContext = await browser.newContext({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
		});
		const touchPage = await touchContext.newPage();
		touchPage.on("pageerror", (error) => errors.push(error.message));
		await touchPage.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await touchPage.waitForSelector("#view-atlas");
		await capture(touchPage, "atlas-intro-phone");
		await touchPage.locator(".ride").evaluate((element) => element.scrollIntoView({ block: "start" }));
		await touchPage.mouse.wheel(0, 1200);
		await touchPage.waitForTimeout(300);
		const firstMobileStop = await touchPage.locator(".trip-stop.hit").getAttribute("aria-label");
		await touchPage.mouse.wheel(0, 1200);
		await touchPage.waitForTimeout(300);
		const secondMobileStop = await touchPage.locator(".trip-stop.hit").getAttribute("aria-label");
		assert.notEqual(firstMobileStop, secondMobileStop, "phone scrolling advances through ride phases");
		const strip = touchPage.locator(".trip-strip");
		const stripMetrics = await strip.evaluate((element) => ({
			left: element.scrollLeft,
			scrollWidth: element.scrollWidth,
			clientWidth: element.clientWidth,
			rect: element.getBoundingClientRect().toJSON(),
		}));
		assert.ok(stripMetrics.scrollWidth > stripMetrics.clientWidth, "phone trip strip has horizontal overflow to pan");
		const touchSession = await touchContext.newCDPSession(touchPage);
		const touchY = stripMetrics.rect.y + stripMetrics.rect.height / 2;
		const touchStartX = stripMetrics.rect.x + 70;
		const touchEndX = touchStartX + 150;
		await touchSession.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ id: 1, x: touchStartX, y: touchY, radiusX: 2, radiusY: 2, force: 1 }],
		});
		await touchSession.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ id: 1, x: touchEndX, y: touchY, radiusX: 2, radiusY: 2, force: 1 }],
		});
		await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await touchPage.waitForTimeout(200);
		assert.notEqual(await strip.evaluate((element) => element.scrollLeft), stripMetrics.left, "phone trip strip responds to touch dragging");
		await touchPage.getByRole("button", { name: /Jump to The terminal/ }).click();
		await touchPage.locator(".terminal-overlay").waitFor();
		if (await touchPage.locator(".terminal-card .transit-board").count()) {
			await touchPage.waitForFunction(() => {
				const board = document.querySelector(".terminal-card .transit-board");
				return board && board.getAttribute("data-state") !== "loading";
			}, null, { timeout: 25_000 });
		}
		await touchPage.locator(".terminal-overlay").evaluate((element) => { element.scrollTop = element.scrollHeight; });
		await touchPage.locator(".terminal-overlay").hover();
		let closingMapVisible = false;
		for (let gesture = 0; gesture < 4; gesture++) {
			await touchPage.mouse.wheel(0, 2400);
			await touchPage.waitForTimeout(150);
			closingMapVisible = await touchPage.locator('.rail-network').evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return bounds.top < innerHeight && bounds.bottom > 0;
			});
			if (closingMapVisible) break;
		}
		assert.ok(closingMapVisible, "phone can scroll out of the terminal to the closing network");
		await touchPage.locator(".rail-network").evaluate((element)=>element.scrollIntoView({block:"start"}));
		await touchPage.locator('.rail-network[data-ready="true"]').waitFor();
		const beforePan = await touchPage.locator(".rail-map-svg").getAttribute("viewBox");
		const panOrigin = await touchPage.locator(".rail-map-svg").evaluate((svg)=>{
			const r=svg.getBoundingClientRect();
			for(const [dx,dy] of [[65,65],[r.width-65,65],[65,r.height-65]]){
				const x=r.x+dx,y=r.y+dy,hit=document.elementFromPoint(x,y);
				if(hit?.closest("svg")===svg && !hit.closest('[role="button"]'))return {x,y};
			}
			throw new Error("No clear map canvas for the touch gesture");
		});
		const scrollBeforePan=await touchPage.evaluate(()=>scrollY);
		await touchSession.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:2,x:panOrigin.x,y:panOrigin.y}]});
		await touchSession.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:2,x:panOrigin.x-45,y:panOrigin.y-55}]});
		await touchSession.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
		await touchPage.waitForTimeout(100);
		assert.notEqual(await touchPage.locator(".rail-map-svg").getAttribute("viewBox"),beforePan,"full-screen map pans with a touch drag");
		assert.equal(await touchPage.evaluate(()=>scrollY),scrollBeforePan,"map drag does not move the page");
		await capture(touchPage, "network-end-phone");
		await touchContext.close();

		assert.deepEqual(errors, [], "no uncaught browser errors");
		console.log(
			JSON.stringify(
				{ result: "passed", baseUrl: baseUrl.href, dispatchDesktopOverflow, matrix, dispatchPhoneOverflow },
				null,
				2,
			),
		);
	}
} finally {
	await browser.close();
}