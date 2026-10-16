#!/usr/bin/env node
/**
 * Is the patches repository's verified work released, so storefronts actually get it?
 *
 *   npm run patches:released            # every patches repo the demo packages name
 *   node scripts/patchesReleased.mjs --facts <file.json> --now <iso>   # decide from given facts
 *
 * WHY. Demo Builder reads the patch ledgers and the last-known-good boilerplate pointer
 * at the patches repo's LATEST RELEASE, never at `main` (`resolvePatchRef`). The daily
 * drift gate verifies each new boilerplate on `main`; a release is what carries it to new
 * projects and to Check for Updates. From 2026-08-28 to 2026-10-16 nothing published a
 * release: `v1.0.0` stayed the baseline while the gate verified 73 newer commits, and
 * every project started on, and compared its updates against, a seven-week-old
 * boilerplate. Nothing anywhere said so, because both ends agreed on the stale value.
 *
 * Since 2026-10-16 the gate publishes the release itself. This is the check that it
 * keeps doing so.
 *
 * THE RULE. FAIL when the daily gate is switched off or has not run on schedule within
 * STALE_AFTER_HOURS (GitHub switches off a public repo's schedule after 60 days with no
 * commit, and since 2026-10-16 the gate commits only on real upstream changes), or when
 * `main` holds a commit older than STALE_AFTER_HOURS that no release carries. A green daily run releases within a day, so anything older means the gate is
 * red (its run says why) or is not running. Commits younger than that are the normal
 * wait for the next run, reported but not failed.
 *
 * READS ONLY, public GitHub endpoints, no credentials. A request that fails is an error
 * (exit 2, "COULD NOT RUN"), never "released".
 */

import { readFileSync, realpathSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = resolve(ROOT, 'src/features/components/config/demo-packages.json');
const STALE_AFTER_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;
const API = 'https://api.github.com';

/**
 * The verdict for one patches repo.
 *
 * @param {object} facts - what GitHub said
 * @param {string} facts.repo - owner/repo
 * @param {{tag: string, sha: string} | null} facts.release - the latest release, or null
 * @param {string} facts.mainSha - main's head
 * @param {{sha: string, date: string}[]} facts.unreleased - commits on main the release lacks
 * @param {string | null} facts.gateConclusion - the drift gate's latest scheduled run
 * @param {number} now - ms since the epoch
 * @returns {{ok: boolean, line: string}}
 */
function releaseVerdict(facts, now) {
    const { repo, release, mainSha, unreleased, gateConclusion } = facts;
    const gateProblem = gateVerdict(facts, now);
    if (gateProblem) return { ok: false, line: `${repo}: ${gateProblem}` };
    if (!release) {
        return { ok: false, line: `${repo}: no release at all, so Demo Builder reads main unpinned` };
    }
    if (release.sha === mainSha || unreleased.length === 0) {
        return { ok: true, line: `${repo}: main is released as ${release.tag}` };
    }
    const oldest = Math.min(...unreleased.map((c) => Date.parse(c.date)));
    const hours = Math.floor((now - oldest) / HOUR_MS);
    const count = `${unreleased.length} commit${unreleased.length === 1 ? '' : 's'}`;
    const gate = gateConclusion ? ` The drift gate's last run: ${gateConclusion}.` : '';
    if (hours < STALE_AFTER_HOURS) {
        return {
            ok: true,
            line: `${repo}: ${count} on main wait for the next daily release (oldest ${hours}h).${gate}`,
        };
    }
    return {
        ok: false,
        line:
            `${repo}: ${count} on main, the oldest ${hours}h old, are in no release, so no ` +
            `storefront gets them (latest release ${release.tag}).${gate}`,
    };
}

/**
 * Whether the daily gate itself is alive: switched on, and run on schedule within
 * the window. Since 2026-10-16 the gate commits only when upstream's files change, so
 * a quiet stretch can go 60 days without a commit, and GitHub then switches a
 * scheduled workflow off (it did that to bodea-source's sync). With nothing
 * unreleased, the release check alone would read that as fine forever.
 *
 * @returns the problem in words, or null when the gate is alive or the facts do not say
 */
function gateVerdict({ gateState, gateLastRun }, now) {
    if (gateState !== undefined && gateState !== 'active') {
        return `the daily drift gate is switched off (${gateState}): enable "LKG drift gate" in the repo's Actions tab`;
    }
    if (gateLastRun === undefined) return null;
    if (gateLastRun === null) return 'the daily drift gate has never run on its schedule';
    const hours = Math.floor((now - Date.parse(gateLastRun)) / HOUR_MS);
    return hours >= STALE_AFTER_HOURS ? `the daily drift gate last ran ${hours}h ago, so it has stopped running` : null;
}

/** Every patches repo a demo package names, once. */
function patchRepos() {
    const packages = JSON.parse(readFileSync(PACKAGES, 'utf8'));
    const repos = new Set();
    const walk = (value) => {
        if (!value || typeof value !== 'object') return;
        const source = value.codePatchSource;
        if (source && source.owner && source.repo) repos.add(`${source.owner}/${source.repo}`);
        Object.values(value).forEach(walk);
    };
    walk(packages);
    return [...repos].sort();
}

async function getJson(path) {
    // Signed when a token is present (the scheduled job passes its own): GitHub's
    // shared runners exhaust the unauthenticated rate limit. Reads only either way.
    const token = process.env.GITHUB_TOKEN;
    const response = await fetch(`${API}${path}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
    return response.json();
}

/** What GitHub says about one patches repo. */
async function factsFor(repo) {
    const latest = await getJson(`/repos/${repo}/releases/latest`);
    const main = await getJson(`/repos/${repo}/commits/main`);
    if (!main) throw new Error(`${repo} has no main branch, or cannot be read`);
    const workflow = await getJson(`/repos/${repo}/actions/workflows/lkg-gate.yml`);
    if (!workflow) throw new Error(`${repo} has no lkg-gate.yml workflow, or it cannot be read`);
    const runs = await getJson(`/repos/${repo}/actions/workflows/lkg-gate.yml/runs?event=schedule&per_page=1`);
    const lastRun = runs && runs.workflow_runs ? runs.workflow_runs[0] : undefined;
    const gate = {
        gateConclusion: (lastRun && lastRun.conclusion) || null,
        gateState: workflow.state,
        gateLastRun: lastRun ? lastRun.created_at : null,
    };
    if (!latest) return { repo, release: null, mainSha: main.sha, unreleased: [], ...gate };
    const released = await getJson(`/repos/${repo}/commits/${latest.tag_name}`);
    const compare = await getJson(`/repos/${repo}/compare/${latest.tag_name}...main`);
    const unreleased = ((compare && compare.commits) || []).map((c) => ({
        sha: c.sha,
        date: c.commit.committer.date,
    }));
    return {
        repo,
        release: { tag: latest.tag_name, sha: released ? released.sha : '' },
        mainSha: main.sha,
        unreleased,
        ...gate,
    };
}

/** The value after a flag, or undefined. */
function flag(argv, name) {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
}

async function main(argv) {
    const factsFile = flag(argv, '--facts');
    const all = factsFile
        ? JSON.parse(readFileSync(factsFile, 'utf8'))
        : await Promise.all(patchRepos().map(factsFor));
    const nowArg = flag(argv, '--now');
    const now = nowArg ? Date.parse(nowArg) : Date.now();
    const verdicts = all.map((facts) => releaseVerdict(facts, now));
    verdicts.forEach(({ ok, line }) => console.log(`${ok ? 'OK  ' : 'FAIL'} ${line}`));
    return verdicts.every((v) => v.ok) ? 0 : 1;
}

const isMain =
    process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (error) => {
            console.error(`COULD NOT RUN: ${error.message}`);
            process.exit(2);
        },
    );
}
