#!/usr/bin/env node
/**
 * Does every repository the builder owns still carry the release process? A CI job named `checks`
 * on every push, validating the version; a RELEASING.md; nothing else publishing a release; and that
 * job green on the head of its default branch.
 *
 * The test suite cannot see this: those files live in other repositories, and it runs offline. So a
 * repository could lose its CI with nothing saying so until its next release. This runs daily from
 * `.github/workflows/component-ci.yml`, where a failure emails the owner, and in the periodic sweep.
 *
 *   npm run components:ci
 *
 * Exit 0: all carry it. Exit 1: one does not, and it says what. Exit 2: GitHub could not be read.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoProblems } from './componentCiChecks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIST = readFileSync(join(HERE, '../src/core/releases/releasedRepos.ts'), 'utf8');
const REPOS = [...LIST.matchAll(/^\s+'(skukla\/[\w.-]+)',$/gm)].map((m) => m[1]);

function token() {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    try {
        return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
}

const HEADERS = {
    Accept: 'application/vnd.github+json',
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
};

async function api(path) {
    const response = await fetch(`https://api.github.com/${path}`, { headers: HEADERS });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}`);
    return response.json();
}

async function factsOf(repo) {
    const listed = (await api(`repos/${repo}/contents/.github/workflows`)) ?? [];
    const workflows = {};
    for (const file of listed) {
        const body = await api(`repos/${repo}/contents/${file.path}`);
        workflows[file.name] = Buffer.from(body.content, 'base64').toString('utf8');
    }
    const { default_branch: branch } = await api(`repos/${repo}`);
    const runs = await api(`repos/${repo}/commits/${branch}/check-runs?check_name=checks`);
    return {
        workflows,
        hasReleasing: (await api(`repos/${repo}/contents/RELEASING.md`)) !== null,
        checksRuns: runs?.check_runs ?? [],
    };
}

async function main() {
    if (REPOS.length === 0) throw new Error('No repositories read from releasedRepos.ts');
    let failed = 0;
    for (const repo of REPOS) {
        const problems = repoProblems(repo, await factsOf(repo));
        failed += problems.length > 0 ? 1 : 0;
        console.log(`${problems.length > 0 ? 'FAIL' : 'ok  '} ${repo}${problems.map((p) => `\n     - ${p}`).join('')}`);
    }
    console.log(`\n${REPOS.length - failed} of ${REPOS.length} repositories carry the release process.`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error(`Could not run: ${error.message}`);
    process.exit(2);
});
