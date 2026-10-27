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

const browser = await chromium.launch({ headless: true });
try {
	if (process.env.SPOT_CHECK === "1") {
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
		await page.locator("#btn-dispatch").click();
		await page.waitForFunction(() => document.title.includes("The Dispatch"));
		assert.equal(new URL(page.url()).hash, "");
		await page.locator("#btn-atlas").click();
		await page.waitForFunction(() => document.title.includes("The Atlas"));
		assert.equal(new URL(page.url()).hash, "#atlas");
		await page.locator(".skip-ride").click();
		await page.waitForFunction(() => window.scrollY > 1000);
		assert.ok(await page.locator(".lakefront").count(), "Skip the ride reaches the end of the Atlas");
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
		await landmark.press("Enter");
		await page.waitForFunction(() => document.querySelector(".bld-selected") !== null);
		assert.match(await page.locator(".ride-overlay .chi-card h3").innerText(), /Willis Tower/);
		await landmark.press("Escape");
		await page.waitForFunction(() => document.querySelector(".bld-selected") === null);

		await page.getByRole("button", { name: "Jump to Android rollout" }).click();
		await page.waitForFunction(() => /STOP 2 OF \d+/.test(document.querySelector('[aria-label="Trip progress"]')?.textContent ?? ""));
		assert.match(await page.getByRole("group", { name: "Trip progress" }).innerText(), /STOP 2 OF \d+/);
		await page.getByRole("button", { name: /Jump to The terminal/ }).click();
		await page.waitForSelector(".terminal-card");
		await page.waitForTimeout(600);
		await capture(page, "terminal-desktop");
		if (await page.locator(".transit-board").count()) {
			const transitStations = page.getByRole("group", { name: "Choose a Loop station" });
			assert.equal(await transitStations.getByRole("button").count(), 4);
			await page.waitForFunction(() => document.querySelector(".transit-board")?.getAttribute("data-state") !== "loading", null, { timeout: 25_000 });
			await capture(page, "terminal-live-clark-lake");
			await transitStations.getByRole("button", { name: "State/Lake" }).click();
			await page.waitForFunction(() => {
				const board = document.querySelector(".transit-board");
				return board?.getAttribute("data-station") === "40260" && board.getAttribute("data-state") !== "loading";
			}, null, { timeout: 25_000 }).catch(async (error) => {
				console.error(await page.evaluate(() => ({ board: document.querySelector(".transit-board")?.outerHTML, scrollY, card: document.querySelector(".ride-overlay")?.outerHTML, errors: document.body.innerText.slice(-500) })));
				await capture(page, "terminal-failure");
				throw error;
			});
			assert.match(await page.locator(".transit-board-heading h3").innerText(), /State\/Lake/);
			assert.ok(["available", "empty", "unavailable"].includes(await page.locator(".transit-board").getAttribute("data-state")));
			await page.locator(".terminal-overlay").evaluate((element) => { element.scrollTop = 0; });
			await page.waitForTimeout(600);
			await capture(page, "terminal-desktop");
			await transitStations.getByRole("button", { name: "Clark/Lake", exact: true }).click();
			await page.waitForFunction(() => document.querySelector(".transit-board")?.getAttribute("data-state") !== "loading", null, { timeout: 25_000 });
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
				await page.locator(`.transit-board[data-station="${stationId}"][data-state="loading"]`).waitFor();
				assert.equal(await page.locator(".transit-board-heading h3").innerText(), station);
				release();
				await page.locator(`.transit-board[data-state="${kind}"]`).waitFor().catch(async (error) => {
					console.error(await page.evaluate(() => ({ y:scrollY, board:document.querySelector(".transit-board")?.outerHTML, overlay:document.querySelector(".ride-overlay")?.outerHTML })));
					await capture(page, "fixture-failure");
					throw error;
				});
				if (kind === "available") {
					assert.match(await page.locator(".transit-status").innerText(), /Scheduled/i);
					assert.match(await page.locator(".transit-arrival").innerText(), /Scheduled · Delay flagged/i);
				} else {
					assert.match(await page.locator(".transit-empty").innerText(), kind === "empty" ? /No upcoming arrivals/ : /unavailable/);
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

		const touchContext = await browser.newContext({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
		});
		const touchPage = await touchContext.newPage();
		touchPage.on("pageerror", (error) => errors.push(error.message));
		await touchPage.goto(new URL("#atlas", baseUrl).href, { waitUntil: "domcontentloaded" });
		await touchPage.waitForSelector("#view-atlas");
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