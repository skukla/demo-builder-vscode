/**
 * What every repository the builder owns must carry so its releases are consistent. Pure, so a test
 * can drive every failure; `scripts/componentCi.mjs` reads the facts from GitHub.
 */

const JOB_NAMED_CHECKS = /^ {2}checks:\s*$/m;
const VERSION_STEP = /package\.json version/i;
const PUBLISHES_A_RELEASE = /gh release create|^\s+release:\s*$/m;
/** It publishes its own release when its daily gate passes (owner, 2026-11-02). */
export const PUBLISHES_ITSELF = 'skukla/eds-demo-patches';

/**
 * A tool that only runs the checks moves by itself. Holding one back is what broke the patch canary
 * on 2026-11-02: GitHub moved `ubuntu-latest` to a release a year-old Playwright refused, though
 * Playwright had supported it for four months. What reaches an SC is what gets a version, not this.
 */
const HELD_BACK = [/^\s*runs-on:\s*['"]?([a-z]+-\d[\w.]*)/m, /(playwright@\d[\w.-]*)/];

function heldBackTools(workflows) {
    return Object.entries(workflows).flatMap(([name, text]) =>
        HELD_BACK.map((pin) => text.match(pin)?.[1])
            .filter(Boolean)
            .map((tool) => `${name} holds back ${tool}: let it move`),
    );
}

function triggersOnEveryPush(workflow) {
    return /^\s+push:/m.test(workflow) && /^\s+pull_request:/m.test(workflow);
}

/**
 * Every way a repository falls short. Empty means it carries the process.
 *
 * @param repo - `owner/name`
 * @param facts.workflows - workflow file name to its text
 * @param facts.hasReleasing - whether it has a RELEASING.md
 * @param facts.checksRuns - `{ conclusion }` for runs named `checks` on the default branch's head
 */
export function repoProblems(repo, { workflows, hasReleasing, checksRuns }) {
    const problems = [...(hasReleasing ? [] : ['no RELEASING.md']), ...heldBackTools(workflows)];
    if (repo === PUBLISHES_ITSELF) return problems;

    const entries = Object.entries(workflows);
    const ci = entries.find(([, text]) => JOB_NAMED_CHECKS.test(text));
    if (!ci) return [...problems, 'no CI job named checks'];
    if (!triggersOnEveryPush(ci[1])) problems.push(`${ci[0]} does not run on every push and pull request`);
    if (!VERSION_STEP.test(ci[1])) problems.push(`${ci[0]} does not validate the package.json version`);
    for (const [name, text] of entries) {
        if (PUBLISHES_A_RELEASE.test(text)) problems.push(`${name} acts on or publishes a release`);
    }
    if (checksRuns.length === 0) problems.push('checks has not run on the head of its default branch');
    else if (!checksRuns.every((run) => run.conclusion === 'success')) {
        problems.push('checks has not passed on the head of its default branch');
    }
    return problems;
}
