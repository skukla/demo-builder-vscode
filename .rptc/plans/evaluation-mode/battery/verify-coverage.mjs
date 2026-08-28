#!/usr/bin/env node
/**
 * Prove the battery's allowlist covers EVERY tool the agent could reach.
 *
 *   node verify-coverage.mjs
 *
 * Two independent checks, because the allowlist has two halves and they fail
 * differently:
 *
 *   1. MCP — every tool each server reports must be allowed. Generated at run
 *      time, so this should never fail; it fails loudly if enumeration breaks.
 *   2. NATIVE — Claude's own tools have no `tools/list`, so the list is
 *      hand-kept. This compares it against every native tool ever OBSERVED in a
 *      recorded run, which is the only evidence available that one exists.
 *
 * The second check is the honest one: it cannot prove completeness, only that
 * nothing we have ever SEEN is missing. A native tool that has never appeared in
 * any run is invisible to it, and that limit is the reason this file says so out
 * loud rather than printing a reassuring tick.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const AB = new URL('.', import.meta.url).pathname;
const MCP = `${homedir()}/.demo-builder/projects/bodea/.mcp.json`;

const enumerated = execFileSync('node', [`${AB}/enumerate-tools.mjs`, MCP], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);

const runSrc = readFileSync(`${AB}/run.mjs`, 'utf8');
const nativeBlock = /const NATIVE_TOOLS = \[([\s\S]*?)\];/.exec(runSrc);
if (!nativeBlock) { console.error('ABORT: could not find NATIVE_TOOLS in run.mjs'); process.exit(2); }
const natives = [...nativeBlock[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);

// The BASE allowlist plus every legitimate run-mode widening, mirrored from
// run.mjs — the gate compares history against what runs could actually allow:
//   - third-party-reads.txt (tier-1 supplement for annotation-less servers)
//   - tier2-writes.txt, prefixed (tier-2 scratch-write runs)
// Playwright's non-read tools appear in skills-tier recordings and are handled
// below like GLOBAL_ONLY — reported, not counted missing.
const tpAllowed = readFileSync(`${AB}/third-party-reads.txt`, 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const t2Allowed = readFileSync(`${AB}/tier2-writes.txt`, 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((t) => `mcp__demo-builder__${t}`);
const allowed = new Set([...enumerated, ...tpAllowed, ...t2Allowed, ...natives]);

// Every tool ever seen in a recorded run — the only evidence that a native tool
// exists at all.
const seen = new Set();
const dir = `${AB}/results`;
if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
        for (const line of readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
            if (!line.trim()) continue;
            let row; try { row = JSON.parse(line); } catch { continue; }
            for (const t of row.route ?? []) seen.add(t);
        }
    }
}

// Routes record demo-builder tools BARE and others fully qualified, so compare
// on both forms rather than reporting a false gap.
const covers = (t) => allowed.has(t) || allowed.has(`mcp__demo-builder__${t}`);

// Tools from the USER'S GLOBAL config, recorded before `--strict-mcp-config` was
// added. A producer's project does not have them, so their absence is the fix
// working — not a gap. Reported separately rather than counted as missing.
const GLOBAL_ONLY = /^mcp__(MCP_DOCKER|fluffyjaws|serena|adobe-exl|lucid|home-assistant|adobe-creativity|ynab)__/;
// Playwright interaction tools (and their bare pre-prefix forms) appear in
// skills-tier recordings — the three Playwright-driven skills drive a browser.
// The skills harness allows them; the base battery does not. Reported, not
// counted missing, same treatment as GLOBAL_ONLY.
const SKILLS_TIER = /^(mcp__playwright__)?browser_/;
// Tools on the NAMED FLOOR (unprompted-baseline.json) are deliberately not
// allowlisted; an agent ATTEMPTING one and being denied is the design working,
// and the attempt is still recorded as a call. Known, not missing.
const floorNames = new Set(JSON.parse(readFileSync(`${AB}/unprompted-baseline.json`, 'utf8')).tools);
const floorDenied = [...seen]
    .filter((t) => !covers(t) && floorNames.has(t.replace(/^mcp__demo-builder__/, ''))).sort();
const stale = [...seen].filter((t) => GLOBAL_ONLY.test(t)).sort();
const skillsTier = [...seen].filter((t) => SKILLS_TIER.test(t) && !covers(t)).sort();
const missing = [...seen].filter((t) => !covers(t) && !GLOBAL_ONLY.test(t) && !SKILLS_TIER.test(t)
    && !floorNames.has(t.replace(/^mcp__demo-builder__/, ''))).sort();

console.log(`  MCP tools enumerated : ${enumerated.length}`);
console.log(`  native tools listed  : ${natives.length}  (${natives.join(' ')})`);
console.log(`  allowlist total      : ${allowed.size}`);
console.log(`  tools seen in runs   : ${seen.size}`);
console.log();
if (missing.length) {
    console.log(`  NOT COVERED (${missing.length}):`);
    for (const m of missing) console.log(`    ${m}`);
} else {
    console.log('  every tool observed in any recorded run is covered.');
}
if (floorDenied.length) {
    console.log(`\n  ${floorDenied.length} named-floor tool(s) were ATTEMPTED in recorded runs and`);
    console.log(`  denied by the allowlist — the design working: ${floorDenied.join(' ')}`);
}
if (skillsTier.length) {
    console.log(`\n  ${skillsTier.length} playwright interaction tool(s) appear only in skills-tier`);
    console.log('  recordings (the Playwright-driven skills); the base allowlist');
    console.log('  excludes them by design.');
}
if (stale.length) {
    console.log(`\n  ${stale.length} tool(s) from the user's GLOBAL servers appear in old`);
    console.log("  results, recorded before --strict-mcp-config. A producer's project");
    console.log('  does not have them; their absence is the isolation working.');
}
console.log();
console.log('  LIMIT: native tools have no tools/list, so completeness cannot be');
console.log('  proven — only that nothing SEEN is missing. A native tool that has');
console.log('  never appeared in a run would not show up here.');
process.exitCode = missing.length ? 1 : 0;

// ── Check 3: THIRD-PARTY coverage discipline ────────────────────────────────
// Every sibling-server read allowlisted in third-party-reads.txt must be either
// EXPECTED by at least one prompt or in third-party-floor.json with a reason —
// bidirectionally: a floor entry must still be allowlisted, and a floored tool
// gaining a prompt must LEAVE the floor (the list may only shrink). This is the
// hole found 2026-08-28: 20 sibling reads were allowlisted, one had a prompt,
// none had a floor, and nothing noticed — serversUsed read ['demo-builder']
// forever and the routing question was silently unmeasured.
const tpReads = readFileSync(`${AB}/third-party-reads.txt`, 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const tpFloor = JSON.parse(readFileSync(`${AB}/third-party-floor.json`, 'utf8'));
const prompts = JSON.parse(readFileSync(`${AB}/prompts.json`, 'utf8'));
const expectedBare = new Set(prompts.flatMap((p) => p.expect || []));
const bareOf = (full) => full.replace(/^mcp__[^_]+(?:[^_]|_(?!_))*__/, '');

const tpProblems = [];
for (const full of tpReads) {
    const prompted = expectedBare.has(bareOf(full));
    const floored = tpFloor.tools.includes(full);
    if (!prompted && !floored) tpProblems.push(`${full}: neither prompted nor floored`);
    if (prompted && floored) tpProblems.push(`${full}: prompted AND floored — remove it from the floor (the floor may only shrink)`);
    if (floored && !tpFloor.reasons[full]) tpProblems.push(`${full}: floored without a reason`);
}
for (const full of tpFloor.tools) {
    if (!tpReads.includes(full)) tpProblems.push(`${full}: floored but not in third-party-reads.txt`);
}
console.log(`  third-party reads    : ${tpReads.length}  (prompted ${tpReads.filter((f) => expectedBare.has(bareOf(f))).length}, floored ${tpFloor.tools.length})`);
if (tpProblems.length) {
    console.log(`\n  THIRD-PARTY DISCIPLINE BROKEN (${tpProblems.length}):`);
    for (const p of tpProblems) console.log(`    ${p}`);
    process.exitCode = 1;
} else {
    console.log('  every third-party read is prompted or floored-with-reason.');
}
