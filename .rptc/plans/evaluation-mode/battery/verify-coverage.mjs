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

const allowed = new Set([...enumerated, ...natives]);

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
const stale = [...seen].filter((t) => GLOBAL_ONLY.test(t)).sort();
const missing = [...seen].filter((t) => !covers(t) && !GLOBAL_ONLY.test(t)).sort();

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
