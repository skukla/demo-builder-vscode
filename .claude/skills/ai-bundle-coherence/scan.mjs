#!/usr/bin/env node
/**
 * AI-bundle coherence scan — do REAL projects on disk match their shape?
 *
 * The static half lives in `tests/templates/ai-bundle-coherence.test.ts`; this
 * is the half a unit test structurally cannot do, because it needs the real
 * installed package and the real delivered files. It answers, per project:
 *
 *   1. Do the delivered Adobe skill BUNDLES match the project's shape?
 *      (an EDS storefront → aem-*; builds an App Builder app → appbuilder-*)
 *   2. Do the bundle SOURCE dirs exist in .demo-builder-mcp for every kit the
 *      shape calls for? (the AI-1m failure: a copy source that never existed,
 *      ENOENT-skipped silently on every project ever created)
 *   3. Does every applicable ai-defaults entry have BOTH its .mcp.json server
 *      entry and its package installed? (tier-1/tier-3 desync)
 *
 * Shape predicates mirror `aiToolingGate.ts` (projectHasEdsStorefront /
 * projectBuildsAppBuilderApps). They are three lines each and restated here
 * because this scan is plain node and cannot import TS; if the gate changes,
 * the static suite pins the writer side and THIS header is the reminder.
 *
 *   node .claude/skills/ai-bundle-coherence/scan.mjs             # all projects
 *   node .claude/skills/ai-bundle-coherence/scan.mjs --self-test # prove it can fail
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const PROJECTS = process.env.DEMO_BUILDER_PROJECTS_DIR ?? join(homedir(), '.demo-builder', 'projects');
const KIT_DIST = join('node_modules', '@adobe-commerce', 'commerce-extensibility-tools', 'dist');

function readJson(p) {
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return undefined; }
}

/** Mirrors aiToolingGate.projectHasEdsStorefront. */
function hasEds(manifest) {
    return Boolean(manifest?.componentInstances?.['eds-storefront']?.path);
}
/** Mirrors aiToolingGate.projectBuildsAppBuilderApps. */
function buildsApps(manifest) {
    const instances = Object.keys(manifest?.componentInstances ?? {});
    const mesh = instances.some((id) => /mesh/i.test(id));
    return mesh || Object.keys(manifest?.appBuilderComponents ?? {}).length > 0;
}

function scanProject(dir) {
    const findings = [];
    const manifest = readJson(join(dir, '.demo-builder.json'));
    if (!manifest) return { skipped: true, findings };

    const eds = hasEds(manifest);
    const apps = buildsApps(manifest);
    const skillsDir = join(dir, '.claude', 'skills');
    // A bundle counts as delivered only if its directory holds at least one
    // FILE. The ADR-013 reconcile removes files on per-file proof and leaves
    // the empty directory behind (a recursive delete has no proof), so a husk
    // like bodea's post-reconcile appbuilder-* dirs is correct state — the
    // scan's first real run flagged exactly that and was wrong.
    const hasAnyFile = (dir) => {
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; }
        // RECURSIVE, because the husks nest: the reconcile removes files and
        // leaves directories, including empty SUBdirectories (a kit ships
        // references/ folders), so a shallow entry count still reads as
        // delivered. bodea's post-reconcile state caught this on run two.
        return entries.some((e) => (e.isFile() ? true : e.isDirectory() && hasAnyFile(join(dir, e.name))));
    };
    const bundleDelivered = (prefix) => {
        try {
            return readdirSync(skillsDir, { withFileTypes: true })
                .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
                .some((e) => hasAnyFile(join(skillsDir, e.name)));
        } catch { return false; }
    };
    const hasAem = bundleDelivered('aem-');
    const hasAppb = bundleDelivered('appbuilder-');

    // 1 — bundles follow shape, both directions.
    if (eds && !hasAem) findings.push('EDS storefront but NO aem-* skills delivered (the AI-1m shape)');
    if (!eds && hasAem) findings.push('aem-* skills delivered but no EDS storefront');
    if (apps && !hasAppb) findings.push('builds App Builder apps but NO appbuilder-* skills delivered');
    if (!apps && hasAppb) findings.push('appbuilder-* skills delivered but nothing builds an App Builder app (the AI-1o shape)');

    // 2 — the copy SOURCES the shape calls for actually exist.
    const toolsDir = join(dir, '.demo-builder-mcp');
    const kits = [];
    if (eds) kits.push('aem-boilerplate-commerce');
    if (apps) kits.push('integration-starter-kit');
    for (const kit of kits) {
        const src = join(toolsDir, KIT_DIST, kit, 'skills');
        if (!existsSync(src)) findings.push(`bundle source missing: ${join(KIT_DIST, kit, 'skills')}`);
    }

    // 3 — applicable ai-defaults entries have server entry + installed package.
    // Applicability from each entry's own `requires`, read from the extension's
    // config so a new entry is covered without touching this scan.
    const defaults = readJson(join(REPO, 'src/features/project-creation/config/ai-defaults.json'));
    const mcp = readJson(join(dir, '.mcp.json'))?.mcpServers ?? {};
    const installed = Object.keys(readJson(join(toolsDir, 'package.json'))?.dependencies ?? {});
    for (const entry of defaults?.mcpServers ?? []) {
        const applies = entry.requires === 'eds-storefront' ? eds : eds || apps;
        if (!applies) continue;
        if (!mcp[entry.id]) findings.push(`applicable entry "${entry.id}" missing from .mcp.json`);
        if (!installed.includes(entry.package)) findings.push(`applicable package ${entry.package} not installed in .demo-builder-mcp`);
    }

    return { skipped: false, findings, shape: { eds, apps } };
}

const REPO = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

function run(projectsDir) {
    let dirs = [];
    try { dirs = readdirSync(projectsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch {
        console.error(`no projects dir at ${projectsDir}`); process.exit(2);
    }
    let total = 0;
    const report = [];
    for (const name of dirs) {
        const { skipped, findings, shape } = scanProject(join(projectsDir, name));
        if (skipped) continue;
        total++;
        const label = `${name} (${shape.eds ? 'eds' : ''}${shape.eds && shape.apps ? '+' : ''}${shape.apps ? 'apps' : ''}${!shape.eds && !shape.apps ? 'bare' : ''})`;
        if (findings.length) report.push({ label, findings });
        else report.push({ label, findings: [] });
    }
    for (const r of report) {
        console.log(r.findings.length ? `INCOHERENT  ${r.label}` : `ok          ${r.label}`);
        for (const f of r.findings) console.log(`    - ${f}`);
    }
    const bad = report.filter((r) => r.findings.length);
    console.log(`\n${total} project(s): ${total - bad.length} coherent, ${bad.length} with findings`);
    process.exit(bad.length ? 1 : 0);
}

if (process.argv.includes('--self-test')) {
    // Build a deliberately broken project and assert the scan CAN fail — the
    // positive control, in the tool itself, dogfood-style.
    const base = join(tmpdir(), `abc-selftest-${process.pid}`);
    const proj = join(base, 'broken');
    mkdirSync(join(proj, '.claude', 'skills', 'appbuilder-architect'), { recursive: true });
    // A DELIVERED bundle has content — an empty dir is a reconcile husk and
    // must NOT count (that distinction is itself under test).
    writeFileSync(join(proj, '.claude', 'skills', 'appbuilder-architect', 'SKILL.md'), '# x');
    writeFileSync(join(proj, '.demo-builder.json'), JSON.stringify({
        name: 'broken',
        componentInstances: { 'eds-storefront': { path: '/x' } },
    }));
    let out = '';
    const { findings } = scanProject(proj);
    out = findings.join('\n');
    rmSync(base, { recursive: true, force: true });
    const want = ['NO aem-* skills', 'appbuilder-* skills delivered but nothing', 'bundle source missing'];
    const missing = want.filter((w) => !out.includes(w));
    if (missing.length) { console.error(`SELF-TEST FAILED — did not detect: ${missing.join('; ')}\ngot:\n${out}`); process.exit(1); }
    console.log('self-test ok — all three planted defects detected');
    process.exit(0);
}

run(PROJECTS);
