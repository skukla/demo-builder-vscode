/** Every way a repository can fall short of the release process, and the case that passes. */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { repoProblems } from './componentCiChecks.mjs';

const CI = `on:
  push:
    branches: [main]
  pull_request:
jobs:
  checks:
    steps:
      - name: Validate the package.json version
`;
const GOOD = { workflows: { 'ci.yml': CI }, hasReleasing: true, checksRuns: [{ conclusion: 'success' }] };
const REPO = 'skukla/demo-erp';

it('CONTROL: a repository that carries it has no problems', () => {
    assert.deepEqual(repoProblems(REPO, GOOD), []);
});

const FALLS_SHORT = [
    ['no RELEASING.md', { hasReleasing: false }, 'no RELEASING.md'],
    ['no workflows at all', { workflows: {} }, 'no CI job named checks'],
    ['a job under another name', { workflows: { 'ci.yml': CI.replace('checks:', 'build:') } }, 'no CI job named checks'],
    ['a job that skips pull requests', { workflows: { 'ci.yml': CI.replace('  pull_request:\n', '') } }, 'every push'],
    ['a job that only runs by hand', { workflows: { 'ci.yml': CI.replace('  push:\n    branches: [main]\n', '  workflow_dispatch:\n') } }, 'every push'],
    ['no version step', { workflows: { 'ci.yml': CI.replace('Validate the package.json version', 'Lint') } }, 'package.json version'],
    ['a workflow fired by a release', { workflows: { 'ci.yml': CI, 'deploy.yml': 'on:\n  release:\n    types: [released]\n' } }, 'deploy.yml acts on'],
    ['a workflow that publishes one', { workflows: { 'ci.yml': CI, 'x.yml': 'run: gh release create v1\n' } }, 'x.yml acts on'],
    ['a job that never ran', { checksRuns: [] }, 'has not run'],
    ['a red job', { checksRuns: [{ conclusion: 'failure' }] }, 'has not passed'],
];
for (const [name, change, words] of FALLS_SHORT) {
    it(`fails on ${name}`, () => {
        const problems = repoProblems(REPO, { ...GOOD, ...change });

        assert.equal(problems.length, 1, problems.join('; '));
        assert.ok(problems[0].includes(words), problems[0]);
    });
}

it('the patches repository needs only its RELEASING.md: its gate publishes for it', () => {
    const facts = { workflows: { 'gate.yml': 'run: gh release create v1\n' }, hasReleasing: true, checksRuns: [] };

    assert.deepEqual(repoProblems('skukla/eds-demo-patches', facts), []);
});
