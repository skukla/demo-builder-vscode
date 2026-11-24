#!/usr/bin/env node
/**
 * Does every block example Demo Builder ships show as it should? (EDS-71, owner 2026-11-24:
 * "ensure through testing that they show as they should as previews".)
 *
 *   npm run block-examples:render                       # every shipped example
 *   npm run block-examples:render -- --only carousel,table
 *   npm run block-examples:render -- --plant carousel   # self-test: break one example on purpose
 *   npm run block-examples:render -- --update-fixture   # record the blocks' code shapes
 *   npm run block-examples:render -- --draft bodea-blocks=/tmp/bodea.json --only hero-banner
 *       # check examples still being written: that file's entries replace the source's own
 *
 * For each example: a local page that starts exactly as a storefront page does, the template's
 * own `head.html` and so its `scripts.js` startup, Commerce included, with the template's public
 * demo store settings (`demo-config.json`, Adobe's demo shop, read only) served as
 * `/config.json`. The block's JS and CSS are read from GitHub at the ref Demo Builder installs
 * (`githubCode.mjs`). DA.live's group markers (`library-container-start`/`-end`) are taken out
 * first: they tell DA.live what one click inserts and are not blocks. Opened headless at 1280px,
 * reading only (a Commerce block may query the demo shop; nothing writes to it). PASS only when every block on the
 * page finished loading (`data-block-status="loaded"`), the page threw nothing and no block
 * failed to load, and every block's box is taller than 20px. An example that names
 * `structureOnly` (a block that cannot show outside a real storefront even so) is reported
 * "STRUCTURE ONLY" with that reason and never PASS, unless its code cannot even be imported (a
 * missing file or export), which is a FAIL whatever the mark says. (Every mark was re-judged from its screenshot
 * on 2026-11-24, once Commerce blocks could draw against the demo shop: a block that shows
 * something useful carries no mark.) Screenshots and
 * `reports/block-examples/contact-sheet.html` are written for a person to look at.
 *
 * It also checks the code-shape fixture the structural suite reads
 * (`tests/fixtures/eds/block-library/shipped-block-code.json`): a block whose code changed fails
 * here until the fixture is re-recorded with --update-fixture.
 *
 * Reads only: GitHub, read-only. Writes only `reports/block-examples/` (git-ignored) and, with
 * --update-fixture, the fixture. Exit 1 when any example fails, 2 when it could not run.
 */

import { createServer } from 'http';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { contactSheet } from './contactSheet.mjs';
import { githubReader, libraryCode, templateCode } from './githubCode.mjs';
import { loadSourceModules } from './sourceModules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = join(ROOT, 'reports', 'block-examples');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'eds', 'block-library', 'shipped-block-code.json');
const VIEWPORT = { width: 1280, height: 900 };
/** A block that collapsed measures near 0; one line of text (a breadcrumb trail) is about 24. */
const MIN_HEIGHT_PX = 20;
const SAMPLE_PHOTO = '/__sample-photo.svg';
const PLANTED = '-planted-fault';
const SCROLL_PAUSE_MS = 200;
/** The page frame loads the storefront's nav and footer documents, which only a real site has. */
const FRAME_BLOCK = /failed to load (?:module|block) for (?:header|footer)\b/i;
/** The storefront's own message when a block fails, in its import or in its decorate(). */
const LOAD_FAILURE = /failed to load (?:module|block)/i;
/**
 * The browser's message when a block's code itself cannot be imported (a missing file or
 * export), as opposed to code that loads and then stops for want of live data. Measured
 * 2026-11-24: Bodea's form gives "Failed to fetch dynamically imported module"; the template's
 * modal and Demo Team's form give a TypeError or SyntaxError from inside their decorate().
 */
const IMPORT_FAILURE = /dynamically imported module|does not provide an export named|importing a module script failed/i;

const TYPES = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.html': 'text/html',
};

const PHOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">'
    + '<rect width="1600" height="900" fill="#d8dadc"/><circle cx="560" cy="330" r="80" fill="#c2c5c8"/>'
    + '<path d="M300 700 L640 420 L860 600 L1040 480 L1300 700 Z" fill="#c2c5c8"/></svg>';

/** DA.live's group markers: what one click inserts, never blocks of their own. */
const GROUP_MARKER = /<div class="library-container-(?:start|end)">(?:<div><div><\/div><\/div>)?<\/div>/g;

function args(argv) {
    const value = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
    return {
        only: value('--only')?.split(',').filter(Boolean),
        plant: value('--plant'),
        updateFixture: argv.includes('--update-fixture'),
        drafts: argv.flatMap((flag, i) => (flag === '--draft' ? [argv[i + 1]] : [])).map(draftOf),
    };
}

/** `<source>=<file>`: a JSON file in the shipped-examples shape, read over that source's own. */
function draftOf(value) {
    const [source, file] = value?.split('=') ?? [];
    if (!source || !file) throw new Error(`--draft takes <source>=<file>, not "${value}"`);
    const entries = Object.entries(JSON.parse(readFileSync(file, 'utf8'))).filter(([id]) => id !== '$schema');
    return { source, entries };
}

/** Playwright's browser cache on this platform (playwright's own defaults). */
function browserCache() {
    if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright');
    if (process.platform === 'win32') {
        return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ms-playwright');
    }
    return join(homedir(), '.cache', 'ms-playwright');
}

/** The headless shell inside one cached browser folder (its platform folder varies), if any. */
function shellIn(folder) {
    const binary = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
    return readdirSync(folder)
        .filter((d) => d.startsWith('chrome-headless-shell-'))
        .map((d) => join(folder, d, binary))
        .find((path) => existsSync(path));
}

/** The Chromium playwright-core expects, else the newest one in the cache, else none. */
function chromiumPath(chromium) {
    const expected = chromium.executablePath();
    if (existsSync(expected)) return expected;
    const cache = browserCache();
    const shells = existsSync(cache)
        ? readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()
        : [];
    for (const dir of shells) {
        const binary = shellIn(join(cache, dir));
        if (binary) return binary;
    }
    return undefined;
}

/** Every shipped example with the repository and commit its block's code is read from. */
async function plan(modules, github, only, drafts) {
    const shipped = new Map([...modules.loadShippedBlockExamples()].map(([source, examples]) => [source, new Map(examples)]));
    for (const { source, entries } of drafts) {
        if (!shipped.has(source)) throw new Error(`--draft names "${source}", which is not a shipped source`);
        for (const [id, example] of entries) shipped.get(source).set(id, example);
    }
    const template = await templateCode(github, modules.demoPackages);
    const codeOf = { [modules.TEMPLATE_SOURCE]: template };
    for (const library of modules.blockLibraries.libraries) {
        if (shipped.get(library.id)?.size) codeOf[library.id] = await libraryCode(github, library, modules.RELEASED_REPOS);
    }
    const items = [];
    for (const [source, examples] of shipped) {
        const site = isOwnStorefront(modules.demoPackages, codeOf[source]) ? codeOf[source] : template;
        const brand = await brandOf(github, modules, source);
        for (const [blockId, example] of examples) {
            if (!only || only.includes(blockId)) items.push({ source, blockId, example, code: codeOf[source], site, brand });
        }
    }
    return { template, items };
}

/**
 * The brand files a library's own package copies onto its storefronts (`brandAssets`: Bodea's
 * theme and scripts), so its blocks are shown as on that storefront: each file served at its
 * storefront path, and the package's head lines added to the page. None for other sources.
 */
async function brandOf(github, modules, source) {
    const library = modules.blockLibraries.libraries.find((entry) => entry.id === source);
    const assets = modules.demoPackages.packages
        .filter((pkg) => library?.nativeForPackages?.includes(pkg.id))
        .flatMap((pkg) => Object.values(pkg.storefronts ?? {}))
        .find((storefront) => storefront.brandAssets)?.brandAssets;
    if (!assets) return undefined;
    const repo = `${assets.source.owner}/${assets.source.repo}`;
    return {
        repo,
        sha: await github.commitOf(repo, assets.source.branch),
        files: new Map(assets.files.map((file) => [`/${file.to}`, file.from])),
        head: assets.headSnippet ?? '',
    };
}

/**
 * True when a package builds its storefront from this code's repository (Isle5, BuildRight): its
 * blocks are then shown on their own site, with its own page head, scripts and styles. Every
 * other library's blocks are installed onto the B2B template, so they are shown on the template.
 */
function isOwnStorefront(demoPackages, code) {
    return demoPackages.packages.some((pkg) => Object.values(pkg.storefronts ?? {})
        .some((sf) => sf.templateOwner && `${sf.templateOwner}/${sf.templateRepo}` === code.repo));
}

/** A variant the block's JS checks for (`block.classList.contains('autoplay')`), not only its CSS. */
const JS_VARIANT = /\bblock\.classList\.contains\(\s*['"]([a-z0-9-]+)['"]\s*\)/g;
/** The JS takes every cell of a row, however many (`cells.forEach(...)`): any width will do. */
const EVERY_CELL = /\bcells\.(?:forEach|map)\(|for\s*\(\s*const\s+\w+\s+of\s+cells\b/;

/**
 * The block's code shape as the library build reads it (`analyzeBlockCode`, ported from DA.live's
 * Import Blocks), with three readings of the JS it does not make: whether it reads settings rows,
 * the variants it checks for itself, and whether it takes every cell of a row (`anyWidth`), where
 * the ported column count is a guess an example need not meet.
 */
async function codeShape(modules, github, item) {
    const read = (path) => github.file(item.code.repo, item.code.sha, path);
    const analysis = await modules.analyzeBlockCode(item.blockId, read);
    const js = (await read(`blocks/${item.blockId}/${item.blockId}.js`)) ?? '';
    const jsVariants = [...js.matchAll(JS_VARIANT)].map((m) => m[1]).filter((v) => v !== 'block');
    return {
        repo: item.code.repo, ref: item.code.ref, commit: item.code.sha, ...analysis,
        variants: [...new Set([...analysis.variants, ...jsVariants])].sort(),
        readsConfig: /readBlockConfig\s*\(/.test(js),
        anyWidth: EVERY_CELL.test(js),
    };
}

/** The part of a recorded shape that must match: what the structural suite asserts. */
const SHAPE_FIELDS = ['rows', 'columns', 'variants', 'readsConfig', 'anyWidth'];
const shapeOnly = (shape) => JSON.stringify(SHAPE_FIELDS.map((field) => shape?.[field]));

function pageHtml(templateHead, main) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
${templateHead}
</head><body><header></header><main>${main}</main><footer></footer></body></html>`;
}

/**
 * Serves one source's example pages: that source's blocks from its code at its commit, and
 * everything else from the site the source is shown on (`site`). One server per source, so one
 * source's copy of a block never reaches another source's page.
 */
function startServer(github, site, pages, config) {
    const server = createServer(async (request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
        const send = (status, body, type = 'text/plain') => {
            response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            response.end(body);
        };
        try {
            if (pages.has(path)) return send(200, pages.get(path).html, TYPES['.html']);
            if (path === '/config.json') return send(200, config, TYPES['.json']);
            if (path === SAMPLE_PHOTO) return send(200, PHOTO_SVG, TYPES['.svg']);
            const type = TYPES[/\.[a-z0-9]+$/i.exec(path)?.[0]?.toLowerCase()] ?? 'application/octet-stream';
            const brand = pages.values().next().value?.brand;
            if (brand?.files.has(path)) {
                const body = await github.bytes(brand.repo, brand.sha, brand.files.get(path));
                return body === undefined ? send(404, 'Not found') : send(200, body, type);
            }
            const block = /^\/blocks\/([^/]+)\//.exec(path)?.[1];
            const owner = [...pages.values()].find((page) => page.blockId === block)?.code ?? site;
            const body = await github.bytes(owner.repo, owner.sha, path.slice(1));
            if (body === undefined) return send(404, 'Not found');
            return send(200, body, type);
        } catch (error) {
            return send(502, String(error));
        }
    });
    return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

function verdictOf(item, observed) {
    const problems = problemsOf(item, observed);
    if (item.example.structureOnly) {
        // The mark excuses a block with nothing to show here, never one whose code cannot load.
        const notLoading = observed.errors.filter((e) => IMPORT_FAILURE.test(e));
        if (notLoading.length > 0) {
            return { verdict: 'FAIL', reason: `its code does not load: ${notLoading.join(' | ')}` };
        }
        return { verdict: 'STRUCTURE ONLY', reason: `Structure only: ${item.example.structureOnly}` };
    }
    if (problems.length > 0) return { verdict: 'FAIL', reason: problems.join('; ') };
    const heights = observed.blocks.map((b) => `${Math.round(b.height)}px`).join(', ');
    return { verdict: 'PASS', reason: `${observed.blocks.length} block(s) loaded, no errors, heights ${heights}.` };
}

function problemsOf(item, observed) {
    const problems = [];
    if (observed.timedOut) problems.push('the page did not finish loading its blocks');
    if (observed.errors.length > 0) problems.push(`errors: ${observed.errors.join(' | ')}`);
    const blocks = observed.blocks;
    if (blocks.length === 0) problems.push(`no ${item.blockId} block on the page`);
    blocks.forEach((b, n) => {
        if (b.name !== item.blockId) problems.push(`block ${n + 1} is "${b.name}", not ${item.blockId}`);
        if (b.status !== 'loaded') problems.push(`block ${n + 1} is "${b.status}", not loaded`);
        if (!(b.height > MIN_HEIGHT_PX)) problems.push(`block ${n + 1} is ${Math.round(b.height)}px tall (needs more than ${MIN_HEIGHT_PX}px)`);
    });
    return problems;
}

async function observe(browser, url, timeoutMs, settleMs, screenshot, blockId) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
    page.on('console', (message) => {
        const text = message.text();
        if (message.type() === 'error' && LOAD_FAILURE.test(text) && !FRAME_BLOCK.test(text)) {
            errors.push(text);
        }
    });
    let timedOut = false;
    try {
        await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
        await page.waitForFunction(() => document.body.classList.contains('appear')
            && [...document.querySelectorAll('main .block')].every((b) => b.dataset.blockStatus === 'loaded'), null, { timeout: timeoutMs });
        await page.waitForLoadState('networkidle', { timeout: settleMs }).catch(() => undefined);
    } catch {
        timedOut = true;
    }
    await scrollThrough(page);
    // A block may move itself out of the page body (a banner into the header), so it is also
    // found by name anywhere on the page. A site whose startup does not mark its blocks
    // (BuildRight's) has its block found by class, and counts as loaded once the page settled.
    const blocks = await page.$$eval(`main .block, .block[data-block-name="${blockId}"], main div.${blockId}`, (all, id) => all.map((el) => ({
        name: el.dataset.blockName ?? id,
        status: el.dataset.blockStatus ?? (el.classList.contains('block') ? undefined : 'loaded'),
        height: el.getBoundingClientRect().height,
    })), blockId);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.close();
    return { errors, blocks, timedOut };
}

/** Scrolls down a screen at a time, then back to the top, so content that fades in on scroll shows. */
async function scrollThrough(page) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += VIEWPORT.height) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(SCROLL_PAUSE_MS);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(SCROLL_PAUSE_MS);
}

function checkFixture(shapes, update, readAt) {
    if (update) {
        const fixture = {
            readAt,
            how: 'npm run block-examples:render -- --update-fixture (scripts/block-examples/render-check.mjs)',
            blocks: shapes,
        };
        writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
        return [];
    }
    const recorded = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')).blocks : {};
    return Object.entries(shapes)
        .filter(([key, shape]) => shapeOnly(recorded[key]) !== shapeOnly(shape))
        .map(([key]) => `${key}: the block's code shape differs from the fixture; re-record with --update-fixture`);
}

async function main() {
    const options = args(process.argv.slice(2));
    let chromium;
    try {
        ({ chromium } = await import('playwright-core'));
    } catch {
        throw new Error('playwright-core is not installed. Run npm install.');
    }
    const executablePath = chromiumPath(chromium);
    if (!executablePath) {
        throw new Error(`No Chromium found in ${browserCache()}. `
            + 'Install one with: npx playwright-core install chromium-headless-shell');
    }
    const modules = await loadSourceModules(ROOT);
    const { TIMEOUTS } = modules;
    const github = githubReader(TIMEOUTS.NORMAL);
    const { template, items } = await plan(modules, github, options.only, options.drafts);
    if (items.length === 0) throw new Error('No shipped example matched.');
    const config = await github.file(template.repo, template.sha, 'demo-config.json');
    if (!config) throw new Error(`${template.repo} has no demo-config.json at ${template.sha}`);
    mkdirSync(REPORT, { recursive: true });

    const bySource = new Map();
    for (const item of items) {
        const planted = options.plant === item.blockId;
        const html = planted
            ? item.example.html.replace(`class="${item.blockId}`, `class="${item.blockId}${PLANTED}`)
            : item.example.html;
        if (!bySource.has(item.source)) bySource.set(item.source, new Map());
        // At the top level, so a site head that loads ./scripts/ by a relative path finds them.
        bySource.get(item.source).set(`/__example--${item.blockId}.html`, { ...item, html, planted });
    }
    const browser = await chromium.launch({ executablePath, headless: true });
    const results = [];
    const shapes = {};
    try {
        for (const pages of bySource.values()) {
            const { site, brand } = pages.values().next().value;
            const head = `${(await github.file(site.repo, site.sha, 'head.html')) ?? ''}\n${brand?.head ?? ''}`;
            const server = await startServer(github, site, pages, config);
            const origin = `http://127.0.0.1:${server.address().port}`;
            try {
                for (const [path, item] of pages) {
                    const { page } = modules.shippedExamplePage({ description: '', html: item.html }, [`${origin}${SAMPLE_PHOTO}`]);
                    item.html = pageHtml(head, /<main>([\s\S]*)<\/main>/.exec(page)[1].replace(GROUP_MARKER, ''));
                    const shot = `${item.source}--${item.blockId}.png`;
                    const observed = await observe(browser, `${origin}${path}`, TIMEOUTS.NORMAL, TIMEOUTS.QUICK, join(REPORT, shot), item.blockId);
                    shapes[`${item.source}/${item.blockId}`] = await codeShape(modules, github, item);
                    const { verdict, reason } = verdictOf(item, observed);
                    results.push({
                        source: item.source, blockId: item.blockId, repo: item.code.repo, ref: item.code.ref,
                        verdict, reason: item.planted ? `${reason} (planted fault)` : reason, screenshot: shot,
                    });
                    console.log(`${verdict.padEnd(14)} ${item.source}/${item.blockId}: ${results.at(-1).reason}`);
                }
            } finally {
                server.close();
            }
        }
    } finally {
        await browser.close();
    }
    const ranAt = new Date().toISOString();
    const drift = options.only || options.plant || options.drafts.length ? [] : checkFixture(shapes, options.updateFixture, ranAt.slice(0, 10));
    drift.forEach((line) => console.log(`FAIL           ${line}`));
    writeFileSync(join(REPORT, 'contact-sheet.html'), contactSheet(results, ranAt));
    console.log(`\nTemplate: ${template.repo} @ ${template.ref} (${template.how})`);
    console.log(`Contact sheet: ${join(REPORT, 'contact-sheet.html')}`);
    if (options.updateFixture && !options.only && !options.plant) console.log(`Fixture written: ${FIXTURE}`);
    const failed = results.filter((r) => r.verdict === 'FAIL').length + drift.length;
    console.log(failed > 0 ? `${failed} failed.` : 'No failures.');
    process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
    console.error(`COULD NOT RUN: ${error.message}`);
    process.exitCode = 2;
});
