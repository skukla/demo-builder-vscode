#!/usr/bin/env node
/**
 * Release one component. Dry by default: it checks everything and says what it would do.
 *
 *   node release.mjs <path-to-repo> --version 1.2.0 --notes notes.md [--publish]
 *
 * See SKILL.md. Exit 0 means every check passed; 1 means a check refused; 2 means it could not run.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksToRun, ciVerdict, contractProblem, releaseArgs, releaseProblems, trackOf } from './releaseChecks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_LIST = join(HERE, '../../../src/core/releases/releasedRepos.ts');
/** It publishes its own release when its daily gate passes (owner, 2026-11-02). */
const PUBLISHES_ITSELF = 'skukla/eds-demo-patches';
const ERP_SYSTEM = 'skukla/demo-erp';
const ERP_INTEGRATION = 'skukla/commerce-erp-integration';

function fail(message) {
    console.error(message);
    process.exit(2);
}

function parseArgs(argv) {
    const [repoPath, ...rest] = argv;
    const args = { repoPath, publish: rest.includes('--publish') };
    for (const name of ['version', 'notes']) {
        const at = rest.indexOf(`--${name}`);
        if (at >= 0) args[name] = rest[at + 1];
    }
    if (!repoPath || !args.version || !args.notes) {
        fail('usage: release.mjs <path-to-repo> --version <semver> --notes <file> [--publish]');
    }
    return args;
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function tryGh(...args) {
    try {
        return gh(...args);
    } catch {
        return undefined;
    }
}

function repoOf(repoPath) {
    const url = git(repoPath, 'config', '--get', 'remote.origin.url');
    const repo = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url)?.[1];
    const listed = readFileSync(REPO_LIST, 'utf8').includes(`'${repo}'`);
    if (!listed) fail(`${repo ?? url} is not in RELEASED_REPOS, so this process does not cover it.`);
    if (repo === PUBLISHES_ITSELF) fail(`${repo} publishes its own release when its daily gate passes.`);
    return repo;
}

function contractAt(repo, ref) {
    const encoded = tryGh('api', `repos/${repo}/contents/contract/erp-contract.json?ref=${ref}`, '--jq', '.content');
    if (!encoded) return undefined;
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')).contractVersion;
}

function erpProblem(repo, repoPath, version) {
    if (repo !== ERP_SYSTEM && repo !== ERP_INTEGRATION) return null;
    const own = JSON.parse(readFileSync(join(repoPath, 'contract/erp-contract.json'), 'utf8')).contractVersion;
    if (repo === ERP_SYSTEM) return contractProblem(repo, own, contractAt(ERP_INTEGRATION, 'main'));
    // An alpha is a rehearsal, so the other half's main will do: no SC gets either.
    if (trackOf(version) === 'alpha') return contractProblem(repo, own, contractAt(ERP_SYSTEM, 'main'));
    const newest = tryGh('api', `repos/${ERP_SYSTEM}/releases/latest`, '--jq', '.tag_name');
    return contractProblem(repo, own, newest ? contractAt(ERP_SYSTEM, newest) : undefined);
}

function gatherFacts(args, repo) {
    const { repoPath } = args;
    const pkgPath = join(repoPath, 'package.json');
    const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
    git(repoPath, 'fetch', '--quiet', 'origin');
    const branch = gh('api', `repos/${repo}`, '--jq', '.default_branch');
    const head = git(repoPath, 'rev-parse', 'HEAD');
    const runs = JSON.parse(tryGh('api', `repos/${repo}/commits/${head}/check-runs`, '--jq', '.check_runs') ?? '[]');
    const ci = ciVerdict(runs);
    const scripts = checksToRun(pkg.scripts);
    return {
        head,
        // CI is the answer when it has one. Local checks are for a repository with none.
        scripts: ci === 'none' ? scripts : [],
        facts: {
            version: args.version,
            tags: gh('api', `repos/${repo}/tags?per_page=100`, '--jq', '.[].name').split('\n').filter(Boolean),
            packageVersion: pkg.version,
            notes: existsSync(args.notes) ? readFileSync(args.notes, 'utf8') : '',
            onPublishedMain: head === git(repoPath, 'rev-parse', `origin/${branch}`),
            clean: git(repoPath, 'status', '--porcelain') === '',
            checksFound: scripts.length + runs.filter((run) => run.conclusion !== 'skipped').length,
            ci,
        },
    };
}

function runChecks(repoPath, scripts) {
    return scripts.flatMap((name) => {
        console.log(`Running npm run ${name}`);
        const run = spawnSync('npm', ['run', name], { cwd: repoPath, stdio: 'inherit' });
        return run.status === 0 ? [] : [`npm run ${name} failed.`];
    });
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = repoOf(args.repoPath);
    const { head, scripts, facts } = gatherFacts(args, repo);
    const contract = erpProblem(repo, args.repoPath, args.version);
    const problems = [
        ...releaseProblems(facts),
        ...(contract ? [contract] : []),
    ];
    if (problems.length === 0) problems.push(...runChecks(args.repoPath, scripts));
    if (problems.length > 0) {
        console.error(`${repo} ${args.version} may not be released:`);
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    const command = releaseArgs(args.version, head, args.notes);
    if (!args.publish) {
        console.log(`Every check passed. Dry run: would run gh ${command.join(' ')} in ${repo}`);
        return;
    }
    console.log(gh(...command, '--repo', repo));
}

try {
    main();
} catch (error) {
    fail(`Could not run: ${error.message.split('\n')[0]}`);
}
