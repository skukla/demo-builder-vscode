/**
 * What a component release must satisfy. Pure, so a test can drive every refusal.
 * `release.mjs` gathers the facts from git and GitHub and hands them here.
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** The parts of a version, or null when it is not one. */
export function parseVersion(version) {
    const match = SEMVER.exec(version ?? '');
    if (!match) return null;
    return { major: +match[1], minor: +match[2], patch: +match[3], prerelease: match[4] ?? '' };
}

function compareIdentifiers(a, b) {
    const [x, y] = [a.split('.'), b.split('.')];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (x[i] === undefined) return -1;
        if (y[i] === undefined) return 1;
        const [nx, ny] = [Number(x[i]), Number(y[i])];
        const numeric = !Number.isNaN(nx) && !Number.isNaN(ny);
        if (numeric && nx !== ny) return nx - ny;
        if (!numeric && x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    }
    return 0;
}

/** Semver order. A prerelease sorts below its normal release. */
export function compareVersions(a, b) {
    const [x, y] = [parseVersion(a), parseVersion(b)];
    for (const part of ['major', 'minor', 'patch']) {
        if (x[part] !== y[part]) return x[part] - y[part];
    }
    if (!x.prerelease && !y.prerelease) return 0;
    if (!x.prerelease) return 1;
    if (!y.prerelease) return -1;
    return compareIdentifiers(x.prerelease, y.prerelease);
}

/** The track a version is on: who the updater offers it to. Null for one no channel accepts. */
export function trackOf(version) {
    const parsed = parseVersion(version);
    if (!parsed) return null;
    if (!parsed.prerelease) return 'normal';
    const id = parsed.prerelease.split('.')[0];
    if (id === 'beta') return 'beta';
    return id === 'alpha' ? 'alpha' : null;
}

/** The highest version among tags. A tag that is not a version, such as `stable`, does not count. */
export function highestVersion(tags) {
    return tags
        .map((tag) => tag.replace(/^v/, ''))
        .filter((version) => trackOf(version) !== null)
        .sort(compareVersions)
        .pop();
}

/**
 * Whether the job every owned repository runs on every push passed on this commit. It is named `checks`
 * in all of them, so a deploy or a skipped sync job can never pass for it.
 *
 * @param runs - `{ conclusion }` for each check run named `checks` on the commit
 * @returns the reason it did not, or null
 */
export function checksProblem(runs = []) {
    if (runs.length === 0) return 'No job named `checks` has run on this commit.';
    const passed = runs.every((run) => run.conclusion === 'success');
    return passed ? null : 'The `checks` job has not passed on this commit.';
}

/**
 * Every reason this version may not be released. Empty means it may.
 *
 * @param facts.version - the version asked for
 * @param facts.tags - the repository's existing tags
 * @param facts.packageVersion - `version` in package.json, when it has one
 * @param facts.notes - the release notes
 * @param facts.onPublishedMain - whether HEAD is the pushed tip of the default branch
 * @param facts.clean - whether the working tree has no changes
 * @param facts.checksRuns - the commit's check runs named `checks`
 */
export function releaseProblems(facts) {
    const { version, tags, packageVersion, notes, onPublishedMain, clean, checksRuns } = facts;
    const problems = [];
    const track = trackOf(version);
    if (!track) {
        return [`"${version}" is not a version a channel accepts: use 1.2.3, 1.2.3-beta.1 or 1.2.3-alpha.1.`];
    }
    // Every component is on the extension's beta track until it reaches 1.x (owner, 2026-11-02).
    if (track === 'normal') {
        problems.push(`${version} is a normal release. Until the extension reaches 1.x, use ${version}-beta.1 or higher.`);
    }
    const highest = highestVersion(tags);
    if (highest && compareVersions(version, highest) <= 0) {
        problems.push(`${version} is not above the newest version, ${highest}.`);
    }
    // An alpha is a rehearsal: it changes nothing in the repository, so it need not bump it.
    if (track !== 'alpha' && packageVersion !== undefined && packageVersion !== version) {
        problems.push(`package.json says ${packageVersion}, not ${version}. Bump it and push first.`);
    }
    if (!notes?.trim()) problems.push('The release notes are empty.');
    if (!clean) problems.push('The working tree has uncommitted changes.');
    if (!onPublishedMain) problems.push('HEAD is not the pushed tip of the default branch.');
    const checks = checksProblem(checksRuns);
    if (checks) problems.push(checks);
    return problems;
}

/**
 * The ERP pair must agree on its contract. The system goes first, as the updater updates it first, so
 * releasing the system asks whether the integration's `main` is ready for it, and releasing the
 * integration asks whether a released system already speaks it.
 *
 * @returns the reason it may not be released, or null
 */
export function contractProblem(repo, ownContract, partnerContract) {
    if (partnerContract === undefined) return `Could not read the other half's contract for ${repo}.`;
    if (ownContract === partnerContract) return null;
    const partner = repo.endsWith('/demo-erp')
        ? "commerce-erp-integration's main"
        : "demo-erp's newest release";
    return `This repository is on contract ${ownContract}, and ${partner} is on ${partnerContract}.`;
}

/** The `gh release create` arguments for a version. */
export function releaseArgs(version, commit, notesFile) {
    const tag = `v${version}`;
    return ['release', 'create', tag, '--target', commit, '--title', tag, '--notes-file', notesFile, '--prerelease'];
}
