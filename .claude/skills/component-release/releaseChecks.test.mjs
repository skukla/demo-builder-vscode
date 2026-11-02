/**
 * What a component release must satisfy. A release is what reaches SCs, so every refusal is pinned,
 * along with the case that passes it. Plain Node: this repo's jest does not parse `.mjs`, and
 * `tests/scripts/componentRelease.test.ts` runs this file with the suite.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    checksToRun,
    ciVerdict,
    compareVersions,
    contractProblem,
    highestVersion,
    releaseArgs,
    releaseProblems,
    trackOf,
} from './releaseChecks.mjs';

const GOOD = {
    version: '1.2.0-beta.1',
    tags: ['v1.1.0', 'stable', 'v1.1.0-beta.1'],
    packageVersion: '1.2.0-beta.1',
    notes: 'What changed.',
    onPublishedMain: true,
    clean: true,
    checksFound: 1,
};

describe('releaseProblems', () => {
    it('CONTROL: a good release has none', () => {
        assert.deepEqual(releaseProblems(GOOD), []);
    });

    const REFUSALS = [
        ['a version no channel accepts', { version: '1.2' }, 'not a version'],
        ['a prerelease name no channel accepts', { version: '1.2.0-rc.1' }, 'not a version'],
        ['a normal release, until the extension reaches 1.x', { version: '1.2.0', packageVersion: '1.2.0' }, 'Until the extension'],
        ['the newest version again', { version: '1.1.0-beta.9', packageVersion: '1.1.0-beta.9', tags: ['v1.1.0-beta.9'] }, 'not above'],
        ['an older version', { version: '1.0.0-beta.1', packageVersion: '1.0.0-beta.1' }, 'not above'],
        ['package.json disagreeing', { packageVersion: '1.1.9' }, 'package.json says 1.1.9'],
        ['empty notes', { notes: '  \n' }, 'notes are empty'],
        ['uncommitted changes', { clean: false }, 'uncommitted'],
        ['an unpushed HEAD', { onPublishedMain: false }, 'pushed tip'],
        ['no checks at all', { checksFound: 0 }, 'no checks'],
    ];
    for (const [name, change, words] of REFUSALS) {
        it(`refuses ${name}`, () => {
            const problems = releaseProblems({ ...GOOD, ...change });

            assert.equal(problems.length, 1);
            assert.ok(problems[0].includes(words), problems[0]);
        });
    }

    it('an alpha need not bump package.json: it is a rehearsal', () => {
        assert.deepEqual(releaseProblems({ ...GOOD, version: '1.2.0-alpha.1', packageVersion: '1.1.0' }), []);
    });

    it('a beta must match package.json', () => {
        const problems = releaseProblems({ ...GOOD, version: '1.2.0-beta.1', packageVersion: '1.1.0' });

        assert.ok(problems[0].includes('package.json'));
    });

    it('a repository with no package.json has nothing to disagree with', () => {
        assert.deepEqual(releaseProblems({ ...GOOD, packageVersion: undefined }), []);
    });

    it('a first release has no newest version to beat', () => {
        assert.deepEqual(releaseProblems({ ...GOOD, tags: [] }), []);
    });

    it('a beta sits above the one before it, by number', () => {
        assert.deepEqual(releaseProblems({ ...GOOD, version: '1.2.0-beta.10', packageVersion: '1.2.0-beta.10', tags: ['v1.2.0-beta.9'] }), []);
    });
});

describe('versions', () => {
    it('sorts a prerelease below its normal release, and betas by number', () => {
        const sorted = ['1.0.0', '1.0.0-beta.10', '1.0.0-beta.2', '0.9.0'].sort(compareVersions);

        assert.deepEqual(sorted, ['0.9.0', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0']);
    });

    it('the highest ignores tags that are not versions, as the moving `stable` tag is not', () => {
        assert.equal(highestVersion(['stable', 'legacy', 'v1.0.0-beta.2', 'v0.9.0']), '1.0.0-beta.2');
    });

    it('has no highest with no versions', () => {
        assert.equal(highestVersion(['stable']), undefined);
    });

    const TRACKS = [
        ['1.2.0', 'normal'],
        ['1.2.0-beta.1', 'beta'],
        ['1.2.0-alpha.1', 'alpha'],
        ['1.2.0-rc.1', null],
        ['nightly', null],
    ];
    for (const [version, track] of TRACKS) {
        it(`${version} is on track ${track}`, () => {
            assert.equal(trackOf(version), track);
        });
    }
});

describe('checksToRun', () => {
    it('runs whichever the repository declares, tests first', () => {
        assert.deepEqual(checksToRun({ build: 'x', lint: 'y', test: 'z', dev: 'w' }), ['test', 'lint', 'build']);
    });

    it('has nothing to run for a repository with no scripts', () => {
        assert.deepEqual(checksToRun(undefined), []);
    });
});

describe('ciVerdict', () => {
    it('is none when no job ran', () => {
        assert.equal(ciVerdict([]), 'none');
        assert.equal(ciVerdict(undefined), 'none');
    });

    it('a job that was skipped says nothing', () => {
        assert.equal(ciVerdict([{ name: 'sync', conclusion: 'skipped' }]), 'none');
    });

    it('passes when everything that ran passed', () => {
        const runs = [
            { name: 'checks', conclusion: 'success' },
            { name: 'sync', conclusion: 'skipped' },
        ];

        assert.equal(ciVerdict(runs), 'passed');
    });

    it('names what failed, and what has not finished', () => {
        const runs = [
            { name: 'checks', conclusion: 'failure' },
            { name: 'deploy', conclusion: null },
            { name: 'lint', conclusion: 'success' },
        ];

        assert.deepEqual(ciVerdict(runs), ['checks', 'deploy']);
    });

    it('a red CI refuses the release', () => {
        const problems = releaseProblems({ ...GOOD, ci: ['checks'] });

        assert.ok(problems[0].includes('CI has not passed'));
    });
});

describe('the ERP pair', () => {
    it('passes when both are on one contract', () => {
        assert.equal(contractProblem('skukla/demo-erp', 24, 24), null);
    });

    it("names the integration's main when releasing the system", () => {
        assert.ok(contractProblem('skukla/demo-erp', 25, 24).includes("commerce-erp-integration's main"));
    });

    it("names the system's release when releasing the integration", () => {
        assert.ok(contractProblem('skukla/commerce-erp-integration', 25, 24).includes("demo-erp's newest release"));
    });

    it('refuses when the other half cannot be read', () => {
        assert.ok(contractProblem('skukla/demo-erp', 24, undefined).includes('Could not read'));
    });
});

describe('releaseArgs', () => {
    it('every release is a prerelease until the extension reaches 1.x', () => {
        assert.deepEqual(releaseArgs('1.2.0-beta.1', 'abc', 'n.md'), [
            'release', 'create', 'v1.2.0-beta.1', '--target', 'abc', '--title', 'v1.2.0-beta.1', '--notes-file', 'n.md', '--prerelease',
        ]);
    });
});
