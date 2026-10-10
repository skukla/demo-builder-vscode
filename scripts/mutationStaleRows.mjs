#!/usr/bin/env node
/**
 * List the mutation baseline rows that may no longer be true.
 *
 *   node scripts/mutationStaleRows.mjs              # stale rows, oldest first
 *   node scripts/mutationStaleRows.mjs --limit 30   # only the oldest 30 (the sweep's view)
 *   node scripts/mutationStaleRows.mjs --json
 *
 * WHY. A baseline row is re-measured only when someone runs a focus or sample run on
 * that module, so it can sit ABOVE the truth for weeks after the module changes. The
 * PL-69 sittings found three on one day (2026-10-09): githubAppService.ts pinned at
 * 74.02 and measuring 70.16, projectResetService.ts at 93.51 against 86.06,
 * consoleApiHandlers at 89.53 against 81.05 — each module had changed after its row
 * was written. A floor above the truth is not a ratchet; it is a number nobody checks.
 *
 * THE RULE. A row is STALE when its module, or a suite that mirrors it (the same
 * `mirroringSuites` rule the focused run uses), has a commit that the row's own commit
 * does not contain — git ancestry, not dates, so a module changed in the same commit
 * that pinned its row is fresh, and a side branch merged after the row is not. ANY
 * commit counts, a comment or a rename included. Deciding which changes "could not
 * move the score" is a guess; a re-measure is the answer.
 *
 * HOW A ROW'S DATE IS KNOWN. Rows carry no date, so it is read from git: the newest
 * commit whose diff of baseline.json changed that row to its current value. One
 * `git log --raw` names every version of the file and one `git cat-file --batch`
 * reads them all, so the whole history is two git calls. A row changed in the working
 * tree and not yet committed counts as just recorded.
 *
 * The one thing derivation alone could not see is a re-measure that produced the SAME
 * numbers: the row text would not change, git would show nothing, and the row would
 * stay stale forever — re-measured every night by `mutationSweep.mjs --stale`. So
 * `writeBaseline` now stamps each measured row with `recorded` (an ISO time). That
 * makes every write change the row; the date shown here is still the commit's.
 * Existing rows were NOT backfilled: stamping all of them in one commit would make
 * that commit every row's recording commit, and every row would read as fresh.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { fileURLToPath } from 'url';

import { mirroringSuites } from './focusModule.mjs';

export const BASELINE = 'reports/mutation/baseline.json';
const NO_BLOB = /^0+$/;

function git(args, input) {
    return execFileSync('git', args, {
        encoding: input === undefined ? 'utf8' : 'buffer',
        input,
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

/** Every commit that changed the baseline file, newest first, with its two blob ids. */
function baselineVersions() {
    const out = git(['log', '--format=C %H %cI', '--raw', '--no-abbrev', '--no-renames', '--', BASELINE]);
    const commits = [];
    for (const line of out.split('\n')) {
        if (line.startsWith('C ')) {
            const [, sha, date] = line.split(' ');
            commits.push({ sha, date });
        } else if (line.startsWith(':') && commits.length) {
            const [, , oldBlob, newBlob] = line.slice(1).split(/\s+/);
            Object.assign(commits[commits.length - 1], { oldBlob, newBlob });
        }
    }
    return commits.filter((c) => c.newBlob);
}

/** The `modules` map of each blob, keyed by blob id. One `cat-file --batch` for all. */
function readVersions(blobIds) {
    const wanted = [...new Set(blobIds)].filter((id) => id && !NO_BLOB.test(id));
    const versions = new Map();
    if (!wanted.length) return versions;
    const buf = git(['cat-file', '--batch'], Buffer.from(wanted.join('\n') + '\n'));
    let pos = 0;
    for (const id of wanted) {
        const nl = buf.indexOf(10, pos);
        const size = Number(buf.toString('utf8', pos, nl).split(' ')[2]);
        const body = buf.toString('utf8', nl + 1, nl + 1 + size);
        try {
            versions.set(id, JSON.parse(body).modules ?? {});
        } catch {
            throw new Error(`baseline.json blob ${id} in history is not valid JSON`);
        }
        pos = nl + 1 + size + 1;
    }
    return versions;
}

function headRows() {
    try {
        return JSON.parse(git(['show', `HEAD:${BASELINE}`])).modules ?? {};
    } catch {
        return {};
    }
}

/**
 * For each current row: the commit that recorded it, `{ uncommitted: true }` when the
 * working tree changed it, or nothing when no commit ever wrote this value.
 */
export function rowCommits(current) {
    const key = (row) => JSON.stringify(row);
    const head = headRows();
    const found = {};
    const pending = new Set();
    for (const [m, row] of Object.entries(current)) {
        if (key(head[m]) !== key(row)) found[m] = { uncommitted: true };
        else pending.add(m);
    }
    const history = baselineVersions();
    const versions = readVersions(history.flatMap((c) => [c.oldBlob, c.newBlob]));
    for (const c of history) {
        if (!pending.size) break;
        const before = versions.get(c.oldBlob) ?? {};
        const after = versions.get(c.newBlob) ?? {};
        for (const m of pending) {
            const now = key(current[m]);
            if (key(after[m]) === now && key(before[m]) !== now) {
                found[m] = { sha: c.sha, date: c.date };
                pending.delete(m);
            }
        }
    }
    return found;
}

/** Commits under src/ and tests/, newest first, indexed by the paths they touched. */
function pathHistory() {
    const out = git(['log', '--format=C %H %cI', '--name-only', '--no-renames', 'HEAD', '--', 'src', 'tests']);
    const byPath = new Map();
    let commit = null;
    for (const line of out.split('\n')) {
        if (line.startsWith('C ')) {
            const [, sha, date] = line.split(' ');
            commit = { sha, date };
        } else if (line && commit) {
            if (!byPath.has(line)) byPath.set(line, []);
            byPath.get(line).push(commit);
        }
    }
    return byPath;
}

/** `contains(r, c)`: is commit c in r's history (r included)? Cached per r. */
function ancestry() {
    const parents = new Map();
    for (const line of git(['rev-list', '--parents', 'HEAD']).split('\n')) {
        const [sha, ...ps] = line.split(' ');
        if (sha) parents.set(sha, ps);
    }
    const cache = new Map();
    return (r, c) => {
        if (!cache.has(r)) {
            const seen = new Set();
            const stack = [r];
            while (stack.length) {
                const s = stack.pop();
                if (seen.has(s)) continue;
                seen.add(s);
                for (const p of parents.get(s) ?? []) stack.push(p);
            }
            cache.set(r, seen);
        }
        return cache.get(r).has(c);
    };
}

/**
 * The commits to `module` or its mirroring suites that `recorded` does not contain,
 * newest first, and whether any of them touched the module itself rather than only
 * a suite — a module change is the case that can leave a row ABOVE the truth.
 */
function changesAfter(module, recorded, byPath, contains) {
    const seen = new Set();
    const after = [];
    const moduleAfter = (byPath.get(module) ?? []).some((c) => !contains(recorded.sha, c.sha));
    for (const p of [module, ...mirroringSuites(module)]) {
        for (const c of byPath.get(p) ?? []) {
            if (seen.has(c.sha)) continue;
            seen.add(c.sha);
            if (!contains(recorded.sha, c.sha)) after.push(c);
        }
    }
    after.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return { after, moduleChanged: moduleAfter };
}

/** The whole report. Paths are relative to the current directory, like the sibling scripts. */
export function findStaleRows() {
    const current = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
    const recordedBy = rowCommits(current);
    const byPath = pathHistory();
    const contains = ancestry();
    const report = { rows: Object.keys(current).length, stale: [], uncommitted: 0, gone: [], unknown: [] };
    for (const module of Object.keys(current)) {
        const recorded = recordedBy[module];
        if (!existsSync(module)) report.gone.push(module);
        else if (!recorded) report.unknown.push(module);
        else if (recorded.uncommitted) report.uncommitted += 1;
        else {
            const { after, moduleChanged } = changesAfter(module, recorded, byPath, contains);
            if (after.length) {
                report.stale.push({
                    module,
                    recorded,
                    lastChange: after[0],
                    changesAfter: after.length,
                    changed: moduleChanged ? 'module' : 'suite',
                });
            }
        }
    }
    report.stale.sort((a, b) => Date.parse(a.recorded.date) - Date.parse(b.recorded.date));
    return report;
}

function printText(report, limit) {
    const day = (iso) => iso.slice(0, 10);
    const s = report.stale.length;
    const moduleChanged = report.stale.filter((r) => r.changed === 'module').length;
    console.log(
        `Mutation baseline: ${s} of ${report.rows} rows stale — the module or a suite mirroring ` +
            `it has a commit the row's commit does not contain. Any commit counts, comments included.\n` +
            `${moduleChanged} of them because the MODULE changed (the case that can leave a row ` +
            `above the truth), ${s - moduleChanged} because only a suite did.`
    );
    if (s) console.log(`\nrow recorded   last change   commits   changed   module`);
    for (const r of limit ? report.stale.slice(0, limit) : report.stale) {
        console.log(
            `${day(r.recorded.date)}     ${day(r.lastChange.date)}    ` +
                `${String(r.changesAfter).padStart(5)}     ${r.changed.padEnd(6)}    ${r.module}`
        );
    }
    if (limit && s > limit) console.log(`… and ${s - limit} newer — run without --limit for all.`);
    if (report.uncommitted) console.log(`\n${report.uncommitted} row(s) changed in the working tree: counted fresh.`);
    if (report.gone.length) console.log(`\nRows whose module is gone (delete the row): ${report.gone.join(', ')}`);
    if (report.unknown.length) console.log(`\nRows no commit recorded: ${report.unknown.join(', ')}`);
    if (s) console.log(`\nRe-measure them unattended: node scripts/mutationSweep.mjs --stale --minutes 480`);
}

function main() {
    const i = process.argv.indexOf('--limit');
    const limit = i === -1 ? 0 : Number(process.argv[i + 1]);
    const report = findStaleRows();
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else printText(report, limit);
}

const isEntryPoint =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) main();
