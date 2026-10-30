/**
 * Whose edit a clashing file holds (`clashAttribution.ts`). The real comparison against a
 * colleague's repository is driven with real git in `templateSyncService-ownPieces.test.ts`;
 * here, what it falls back to and what it refuses to put in a command.
 */

import { copiedDemoOf, whoseEdits } from '@/features/updates/services/clashAttribution';
import type { CommandResult } from '@/core/shell/types';
import type { GitStep } from '@/features/updates/services/templateMergeBase';

const SHA = 'a'.repeat(40);
const BLOB = 'b'.repeat(40);
const demo = { owner: 'kmanns', repo: 'justrite', commit: SHA, url: 'https://github.com/kmanns/justrite.git' };

/** A git that answers each command by the first pattern it matches; anything else succeeds silently. */
function scriptedGit(answers: Array<[RegExp, { code: number; stdout: string }]>): jest.MockedFunction<GitStep> {
    return jest.fn<Promise<CommandResult>, [string, number]>(async (command: string) => {
        const found = answers.find(([pattern]) => pattern.test(command));
        return { code: found?.[1].code ?? 0, stdout: found?.[1].stdout ?? '', stderr: '', duration: 0 };
    });
}

describe('whoseEdits', () => {
    it("names a file the colleague's repository holds byte for byte as theirs", async () => {
        const git = scriptedGit([[/^git rev-parse /, { code: 0, stdout: `${BLOB}\n` }]]);

        await expect(whoseEdits(git, ['blocks/header/header.js'], demo)).resolves.toEqual([
            { file: 'blocks/header/header.js', whose: 'copied-demo', from: 'kmanns/justrite' },
        ]);
    });

    it('counts a file as edited in this storefront when the two differ', async () => {
        const git = scriptedGit([
            [/rev-parse "HEAD:/, { code: 0, stdout: `${BLOB}\n` }],
            [/rev-parse "a+:/, { code: 0, stdout: `${'c'.repeat(40)}\n` }],
        ]);

        await expect(whoseEdits(git, ['x.js'], demo)).resolves.toEqual([{ file: 'x.js', whose: 'storefront' }]);
    });

    it("counts every file as this storefront's when the colleague's repository cannot be fetched", async () => {
        const git = scriptedGit([[/^git fetch /, { code: 128, stdout: '' }]]);

        await expect(whoseEdits(git, ['a.js', 'b.js'], demo)).resolves.toEqual([
            { file: 'a.js', whose: 'storefront' },
            { file: 'b.js', whose: 'storefront' },
        ]);
        expect(git.mock.calls.map(([c]) => c).filter((c) => c.startsWith('git rev-parse'))).toStrictEqual([]);
    });

    it('asks git nothing with no colleague, and never quotes a name that could break out', async () => {
        const quiet = scriptedGit([]);
        await expect(whoseEdits(quiet, ['a.js'])).resolves.toEqual([{ file: 'a.js', whose: 'storefront' }]);
        expect(quiet).not.toHaveBeenCalled();

        const git = scriptedGit([[/^git rev-parse /, { code: 0, stdout: `${BLOB}\n` }]]);
        await expect(whoseEdits(git, ['a"$(x).js'], demo)).resolves.toEqual([{ file: 'a"$(x).js', whose: 'storefront' }]);
        expect(git.mock.calls.some(([c]) => c.includes('$(x)'))).toBe(false);
    });
});

describe('copiedDemoOf', () => {
    it("reads the colleague's repository and the commit the storefront last matched", () => {
        expect(copiedDemoOf({ templateOwner: 'kmanns', templateRepo: 'justrite', lastSyncedCommit: SHA })).toEqual({
            owner: 'kmanns',
            repo: 'justrite',
            commit: SHA,
        });
        expect(copiedDemoOf({ templateOwner: 'kmanns' })).toBeUndefined();
        expect(copiedDemoOf(undefined)).toBeUndefined();
    });
});
