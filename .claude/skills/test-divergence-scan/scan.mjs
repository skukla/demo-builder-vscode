#!/usr/bin/env node
/**
 * test-divergence-scan — how many DIFFERENT ways does the suite build the same
 * fake?
 *
 * The question this answers is not "is there duplication" (the clone scan does
 * that) but "does every test invent its own version of a thing the suite has
 * already solved". A logger fake written 300 different ways is 300 chances for
 * one of them to drift from what the real logger does, and 300 edits when the
 * real one changes.
 *
 * METHOD. For each collaborator that tests routinely fake, find every literal
 * that builds one, normalise whitespace, and count how many DISTINCT texts
 * exist versus how many suites import a shared helper instead.
 *
 * CONTROLS. Every probe reports a control count first. A probe that matches
 * nothing looks exactly like a clean result, and this repo has paid for that
 * mistake more than once — so a zero from a probe whose control is also zero is
 * reported as BROKEN, not as clean.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.argv[2] ?? 'tests';

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name === 'node_modules') continue;
            out.push(...walk(full));
        } else if (/\.tsx?$/.test(name)) out.push(full);
    }
    return out;
}

const FILES = walk(ROOT);
const SRC = new Map(FILES.map((f) => [relative('.', f), readFileSync(f, 'utf8')]));

/** Collapse whitespace so formatting differences do not read as design differences. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Each probe: what the fake is, how to recognise one being BUILT inline, and
 * how to recognise a suite importing a shared one instead.
 */
const PROBES = [
    {
        name: 'Logger',
        // an object literal carrying the logger's method set
        inline: /\{[^{}]*\bdebug:\s*jest\.fn\(\)[^{}]*\berror:\s*jest\.fn\(\)[^{}]*\}/g,
        shared: /\b(createMockLogger|makeLogger|mockLogger)\b\s*(?:\(|,|\))/,
    },
    {
        name: 'CommandExecutor',
        inline: /\{[^{}]*\bexecute:\s*jest\.fn\([^)]*\)[^{}]*\}/g,
        shared: /\b(createMockCommandExecutor|mockCommandExecutor|meshDeps)\b/,
    },
    {
        name: 'HandlerContext',
        inline: /\{[^{}]*\bsendMessage:\s*jest\.fn\(\)[^{}]*\}/g,
        shared: /\b(createMockHandlerContext|createMockContext|makeContext)\b/,
    },
    {
        name: 'StateManager',
        inline: /\{[^{}]*\bsaveProject:\s*jest\.fn\([^)]*\)[^{}]*\}/g,
        shared: /\b(createMockStateManager|mockStateManager)\b/,
    },
    {
        name: 'Project fixture',
        inline: /\{[^{}]*\bcomponentInstances:\s*\{[^{}]*\}[^{}]*\}/g,
        shared: /\b(createMockProject|makeProject|buildProject)\b/,
    },
];

console.log(`test-divergence-scan over ${ROOT} — ${FILES.length} files\n`);

let anyBroken = false;
for (const probe of PROBES) {
    const variants = new Map(); // normalised text -> files
    const sharedUsers = new Set();
    for (const [file, src] of SRC) {
        for (const m of src.matchAll(probe.inline)) {
            const key = norm(m[0]);
            if (!variants.has(key)) variants.set(key, []);
            variants.get(key).push(file);
        }
        if (probe.shared.test(src)) sharedUsers.add(file);
    }

    const inlineFiles = new Set([...variants.values()].flat());
    const control = inlineFiles.size + sharedUsers.size;
    if (control === 0) {
        anyBroken = true;
        console.log(`${probe.name}: PROBE BROKEN — matched nothing at all. Do not read this as clean.\n`);
        continue;
    }

    // how concentrated is it? one shape used everywhere is fine; N shapes is the finding
    const sorted = [...variants.entries()].sort((a, b) => b[1].length - a[1].length);
    const topShare = sorted.length ? sorted[0][1].length / [...variants.values()].flat().length : 0;

    console.log(`${probe.name}`);
    console.log(`   suites importing a shared builder : ${sharedUsers.size}`);
    console.log(`   suites hand-rolling one inline    : ${inlineFiles.size}`);
    console.log(`   DISTINCT hand-rolled shapes       : ${variants.size}`);
    if (sorted.length) {
        console.log(`   most common shape covers          : ${(topShare * 100).toFixed(0)}% of inline uses`);
        console.log(`   example of the most common        : ${sorted[0][0].slice(0, 88)}`);
        const onceOnly = sorted.filter(([, f]) => f.length === 1).length;
        console.log(`   shapes used exactly once          : ${onceOnly}`);
    }
    console.log();
}

if (anyBroken) {
    console.log('At least one probe matched nothing. Fix the probe before trusting this run.');
    process.exit(2);
}
