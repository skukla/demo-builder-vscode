#!/usr/bin/env node
/**
 * Which webview surfaces a set of stylesheets reaches: the bundles whose entry imports one of
 * them, directly or through a component (ADR-017 §6: a feature stylesheet reaches only the bundles
 * whose entry imports it). Part of this skill's instrument, not one of its own: `capture.js` runs
 * the surfaces it names, and `scripts/check-css-baseline.mjs` accepts a capture that covers them.
 *
 * WHY. The visual baseline captured all nine surfaces for any CSS change, at two themes and three
 * widths, and the pre-push check asked for that whole run even when one stylesheet on one surface
 * changed (owner, 2026-11-04: a capture took over half an hour). A surface no changed stylesheet
 * reaches cannot have moved, so capturing it measures nothing.
 *
 * Built the way `tests/sop/webviewBundleClasses.ts` builds each bundle: the real entries and the
 * real alias plugin, with esbuild's metafile listing every input.
 *
 * Usage:
 *   node .claude/skills/webview-visual-baseline/css-reach.mjs src/core/ui/styles/modal.css
 *   node .claude/skills/webview-visual-baseline/css-reach.mjs --changed   # changed against develop
 */
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const require = createRequire(join(ROOT, 'package.json'));
const esbuild = require('esbuild');
const { WEBVIEW_ENTRIES, aliasPlugin } = require(join(ROOT, 'esbuild.config.js'));

/**
 * @param {string} root - the checkout
 * @param {string[]} cssPaths - stylesheets, relative to the checkout
 * @returns {Promise<string[]>} the surfaces (bundle names) any of them reaches, in entry order
 */
export async function surfacesReaching(root, cssPaths) {
    const wanted = new Set(cssPaths.map((p) => p.replace(/\\/g, '/')));
    if (wanted.size === 0) return [];
    const reached = [];
    for (const [bundle, entry] of Object.entries(WEBVIEW_ENTRIES)) {
        const result = await esbuild.build({
            entryPoints: [entry],
            bundle: true,
            write: false,
            metafile: true,
            format: 'iife',
            platform: 'browser',
            target: ['chrome91'],
            absWorkingDir: root,
            loader: { '.css': 'text', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.gif': 'empty' },
            define: { 'process.env.NODE_ENV': '"development"' },
            plugins: [aliasPlugin],
            logLevel: 'silent',
        });
        if (Object.keys(result.metafile.inputs).some((input) => wanted.has(input))) reached.push(bundle);
    }
    return reached;
}

/** Every surface there is: what a capture covers when what a change reaches cannot be told. */
export const ALL_SURFACES = Object.keys(WEBVIEW_ENTRIES);

/** Every stylesheet changed against develop: committed on this branch, staged, or not yet staged. */
export function changedStylesheets(root) {
    const run = (cmd) => {
        try {
            return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
        } catch {
            return '';
        }
    };
    const base = run('git merge-base HEAD origin/develop') || 'HEAD';
    const lists = [run(`git diff --name-only ${base} -- "src/**/*.css"`), run('git ls-files --others --exclude-standard -- "src/**/*.css"')];
    return [...new Set(lists.join('\n').split('\n').filter(Boolean))];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const sheets = args[0] === '--changed' ? changedStylesheets(ROOT) : args;
    console.log(JSON.stringify(await surfacesReaching(ROOT, sheets)));
}
