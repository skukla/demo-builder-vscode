#!/usr/bin/env node
/**
 * Refuse to push a stylesheet change with no resting baseline behind it.
 *
 * WHY THIS EXISTS. A CSS change that breaks a surface produces NO error anywhere:
 * eight webview bundles, and a feature stylesheet reaches only the bundles whose
 * entry imports it, so a class can be styled on one surface and simply absent on
 * the next with nothing failing. `webview-visual-baseline` is the instrument that
 * turns that into a readable diff, and until 2026-09-10 nothing required it.
 *
 * That day a dashboard regression reached a release spot-check. The label padding
 * on a tile had started eating 19px once `box-sizing: border-box` began applying,
 * and the day's CSS work had been verified with the INTERACTION capture alone —
 * which cannot see a width, a padding, or a rule that stopped applying. The skill
 * already said which capture was the base; a doc could not make anyone run it.
 *
 * Three things were built, and this is the one the first two existed for:
 *   1. every capture records itself to `reports/visual-baseline/`
 *   2. `captureInteractions` refuses to run before a resting capture exists
 *   3. THIS — the push refuses when the evidence is absent
 *
 * WHAT IT ASSERTS. For the stylesheets in this push, at least one RESTING capture
 * ran while one of them was modified. The record carries `dirtyPaths` — the files
 * dirty at capture time — so this is a direct question rather than a timestamp
 * guess: captures happen on a dirty tree BEFORE the commit, so comparing a capture
 * time against a commit time would reject the correct workflow.
 *
 * WHY IT IS NOT IN `npm run gate`. Two reasons, each fatal to that placement.
 * `gate` is the inner-loop command, run constantly while iterating — and mid-edit
 * is exactly when no capture exists yet. And CI runs the same checks with no
 * browser and no records directory, so there it would fail every time and be
 * switched off within a week. This is a LOCAL pre-push question: you are about to
 * publish this.
 *
 * WHAT IT CANNOT DO: it cannot tell you the diff was empty. It proves a baseline
 * was taken, not that anyone read it. That step is still a person's.
 *
 * Usage:
 *   node scripts/check-css-baseline.mjs <range>     # e.g. origin/develop..HEAD
 *   node scripts/check-css-baseline.mjs             # defaults to @{upstream}..HEAD
 *
 * Bypass, when a capture is genuinely impossible (no browser on this machine):
 *   CSS_BASELINE_BYPASS="why" git push
 * It passes and prints the reason. Prefer it over `--no-verify`, which also throws
 * away the whole quality gate.
 */
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const RECORDS = join(ROOT, 'reports', 'visual-baseline');

function sh(cmd) {
    try {
        return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function changedStylesheets(range) {
    const out = sh(`git diff --name-only ${range} -- "src/**/*.css"`);
    return out ? out.split('\n').filter(Boolean) : [];
}

/**
 * Every recorded resting capture, newest first.
 *
 * Returns null when the directory is ABSENT, which is a different fact from an
 * empty one — reporting "none" for both is how a broken instrument reads as a
 * clean result.
 */
function restingRecords() {
    if (!existsSync(RECORDS)) return null;
    const out = [];
    for (const name of readdirSync(RECORDS)) {
        if (!name.endsWith('.json')) continue;
        try {
            const rec = JSON.parse(readFileSync(join(RECORDS, name), 'utf8'));
            if (rec && rec.kind === 'resting') out.push({ name, ...rec });
        } catch {
            /* unreadable — not evidence */
        }
    }
    return out.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
}

function fail(files, why) {
    console.error(`
css-baseline: REFUSED — this push changes ${files.length} stylesheet(s) and no resting
baseline was captured while they were modified.

  ${why}

${files.map((f) => `  - ${f}`).join('\n')}

A CSS change that breaks a surface fails SILENTLY: there are eight webview bundles and
a feature stylesheet reaches only the ones whose entry imports it, so a class can be
styled on one surface and absent on the next with no error anywhere.

Capture one:

  eval "$(.claude/skills/webview-visual-baseline/serve.sh --build)"
  # drive a browser at $VR_BASE and run capture.js's capture({ sentinel: $VR_SENTINEL })
  .claude/skills/webview-visual-baseline/serve.sh --stop

The capture records itself; re-run the push once it has.

Genuinely cannot capture here (no browser on this machine)?
  CSS_BASELINE_BYPASS="reason" git push
That keeps the rest of the quality gate, which --no-verify does not.
`);
    process.exit(1);
}

const bypass = process.env.CSS_BASELINE_BYPASS;
const range = process.argv[2] || `${sh('git rev-parse --abbrev-ref @{upstream}') || 'HEAD~1'}..HEAD`;

const sheets = changedStylesheets(range);
if (sheets.length === 0) {
    process.exit(0); // silent: the overwhelmingly common case
}

if (bypass) {
    console.log(`css-baseline: BYPASSED — ${bypass}`);
    console.log(`  ${sheets.length} stylesheet(s) pushed with no baseline required.`);
    process.exit(0);
}

const records = restingRecords();
if (records === null) {
    fail(sheets, 'reports/visual-baseline/ does not exist — no capture has ever run here.');
}

const matched = records.filter(
    (r) => Array.isArray(r.dirtyPaths) && r.dirtyPaths.some((p) => sheets.includes(p))
);

if (matched.length === 0) {
    fail(
        sheets,
        records.length
            ? `${records.length} resting capture(s) recorded, none while these files were modified.`
            : 'No resting capture has been recorded at all.'
    );
}

console.log(`css-baseline: OK — ${sheets.length} stylesheet(s), baseline ${matched[0].name}`);
console.log(`  captured ${matched[0].capturedAt} at ${String(matched[0].sha).slice(0, 9)}`);
process.exit(0);
