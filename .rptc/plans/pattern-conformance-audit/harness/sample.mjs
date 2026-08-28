#!/usr/bin/env node
/**
 * Seeded refutation sample — the units independent checkers re-classify to
 * try to REFUTE the audit. Seeded so the owner can reproduce the exact list.
 *
 *   node sample.mjs <seed> [n=25]
 */
import { execSync } from 'node:child_process';
const [seed, n = '25'] = process.argv.slice(2);
if (!seed) { console.error('usage: sample.mjs <seed> [n]'); process.exit(2); }
const files = execSync("git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'", { encoding: 'utf8' })
    .trim().split('\n');
// Deterministic PRNG (mulberry32) from the seed string.
let h = 1779033703 ^ seed.length;
for (const c of seed) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
const rand = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
const picked = new Set();
while (picked.size < Math.min(Number(n), files.length)) picked.add(files[Math.floor(rand() * files.length)]);
for (const f of picked) console.log(f);
