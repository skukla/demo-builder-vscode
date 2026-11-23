#!/usr/bin/env node
/**
 * The four type-aware lint rules the test tree must stay clean of (PL-113).
 *
 * `npm run lint` is deliberately not type-aware (a full program per run is too slow
 * for every push), so these four could only be found by hand with `eslint.casts.mjs`,
 * and they grew while nothing ran it: PL-34 measured 170 and 40 of the first two,
 * and 2026-11-21 measured 232 and 83. This runs that config over `tests/` and counts
 * only these four (scripts/lib/typeAwareLintVerdict.mjs), because the config also
 * carries rules this check is not about. It runs in the periodic sweep (it takes
 * minutes), and fails on any finding or on a file it could not read.
 *
 *   npm run lint:types
 */
import { ESLint } from 'eslint';
import { rulesNotOn, verdict } from './lib/typeAwareLintVerdict.mjs';

const eslint = new ESLint({ overrideConfigFile: 'eslint.casts.mjs' });

// The positive control: all four rules must be on, or "clean" would mean nothing.
const off = rulesNotOn((await eslint.calculateConfigForFile('tests/setup/consoleGate.ts')).rules);
if (off.length > 0) {
    console.error(`lint:types: not set to error in eslint.casts.mjs: ${off.join(', ')}`);
    process.exit(2);
}

const { code, lines } = verdict(await eslint.lintFiles(['tests/']), process.cwd());

const say = code === 0 ? console.log : console.error;
for (const line of lines) say(`lint:types: ${line}`);
process.exit(code);
