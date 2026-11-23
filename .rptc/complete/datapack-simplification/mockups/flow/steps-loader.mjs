/*
 * Loads reviewSteps.ts (the one list of review steps) for the Node tools beside it:
 * gen-journeys.mjs, gen-decisions.mjs and log-verdict.mjs. Compiled with esbuild, so the tools read the
 * same typed list the prototype does, never a copy.
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
export const planDir = join(here, '..', '..');

/** @returns {Array<{ id: string, name: string, summary: string, plan: string, steps: Array<{ id: string, title: string, action: string, question: string, window?: string }> }>} */
export function loadJourneys() {
    const out = buildSync({ entryPoints: [join(here, 'reviewSteps.ts')], bundle: true, format: 'cjs', platform: 'node', write: false });
    const module = { exports: {} };
    new Function('module', 'exports', 'require', out.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
    return module.exports.JOURNEYS;
}

/** A markdown table cell: no pipes or line breaks, so a row cannot break its table. */
export const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
