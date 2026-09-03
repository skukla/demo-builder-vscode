/**
 * Repo readiness for storefront setup.
 *
 * The wizard asks "Reset to template?" as one checkbox that defaults to off.
 * That question only makes sense when the answer could destroy something. On
 * 2026-07-29 an existing repo was selected with the box unticked and setup ran
 * to `Complete` on a repo with no `scripts/scripts.js`:
 *
 *   [Inspector Tagging] scripts/delayed.js not found — skipping loader snippet
 *   [PDP404]            scripts/delayed.js not found — skipping smart 404 install
 *   [QuickEdit]         scripts/scripts.js not found — skipping Quick Edit wiring
 *   [Storefront Setup]  Complete: https://github.com/skukla/demo-builder-test
 *
 * Three subsystems opted out and the run reported success.
 *
 * This classifier is the input to fixing that: empty repos need no consent
 * (nothing to lose), populated non-storefronts are a failed precondition rather
 * than a warning to skip, and only a real storefront is worth asking about.
 *
 * The repo that prompted this was NOT empty — it had 53 blocks — so emptiness
 * detection alone would have missed it. That is why the canonical-file check
 * carries the weight here.
 */

import { classifyRepoForStorefront } from '@/features/eds/services/storefront/repoStorefrontReadiness';
import type { RepoReadiness } from '@/features/eds/services/storefront/repoStorefrontReadiness';
import { createMockLogger } from '../../../../helpers/loggerFake';

import type { GithubFake } from '../../../../helpers/githubFake';
const logger = createMockLogger();

/** Stub GitHubFileOperations: `present` lists the paths that exist. */
function fileOps(
    present: string[],
    opts: { emptyRepo?: boolean; throwOn?: string } = {}
): GithubFake {
    return {
        getFileContent: jest.fn().mockImplementation(async (_o: string, _r: string, p: string) => {
            if (opts.throwOn && p === opts.throwOn) throw new Error('network down');
            if (opts.emptyRepo) throw new Error('This repository is empty.');
            return present.includes(p) ? { content: 'x', sha: 's' } : null;
        }),
    } as GithubFake;
}

const CANONICAL = ['scripts/scripts.js', 'scripts/delayed.js', 'head.html'];

describe('classifyRepoForStorefront', () => {
    beforeEach(() => jest.clearAllMocks());

    it('calls a repo with every canonical file a storefront', async () => {
        const result = await classifyRepoForStorefront(
            fileOps(CANONICAL),
            'skukla',
            'b2b-tester',
            logger
        );

        expect(result.kind).toBe('storefront');
    });

    it('calls an empty repo empty', async () => {
        const result = await classifyRepoForStorefront(
            fileOps([], { emptyRepo: true }),
            'skukla',
            'fresh',
            logger
        );

        expect(result.kind).toBe('empty');
    });

    it('names which canonical files are missing', async () => {
        // The user has to know WHAT is wrong to judge whether reset is safe.
        const result = await classifyRepoForStorefront(
            fileOps(['head.html']),
            'skukla',
            'demo-builder-test',
            logger
        );

        expect(result.kind).toBe('not-a-storefront');
        if (result.kind === 'not-a-storefront') {
            expect(result.missing).toEqual(
                expect.arrayContaining(['scripts/scripts.js', 'scripts/delayed.js'])
            );
            expect(result.missing).not.toContain('head.html');
        }
    });

    it('does not call a populated non-storefront empty', async () => {
        // The repo that prompted this had 53 blocks and no scripts/scripts.js.
        // Treating it as empty would auto-reset someone's populated repo.
        const result = await classifyRepoForStorefront(
            fileOps(['blocks/header/header.js']),
            'skukla',
            'x',
            logger
        );

        expect(result.kind).toBe('not-a-storefront');
    });

    it('refuses to classify when a check fails, rather than guessing', async () => {
        // An unreachable GitHub must never read as "empty" — that answer would
        // authorize a destructive reset on a repo we could not see.
        const result = await classifyRepoForStorefront(
            fileOps(CANONICAL, { throwOn: 'scripts/delayed.js' }),
            'skukla',
            'b2b-tester',
            logger
        );

        expect(result.kind).toBe('undetermined');
    });

    it('never reports undetermined as a missing-file problem', async () => {
        const result = await classifyRepoForStorefront(
            fileOps(CANONICAL, { throwOn: 'head.html' }),
            'skukla',
            'b2b-tester',
            logger
        );

        expect(result.kind).not.toBe('not-a-storefront');
        expect(result.kind).not.toBe('empty');
    });

    it('checks every canonical file, not just the first miss', async () => {
        // Reporting one missing file at a time turns a single fix into three
        // round trips.
        const ops = fileOps([]);
        await classifyRepoForStorefront(ops, 'skukla', 'x', logger);

        const checked = ops.getFileContent.mock.calls.map((c) => c[2]);
        for (const f of CANONICAL) expect(checked).toContain(f);
    });
});

describe('consent policy', () => {
    it.each<[RepoReadiness['kind'], boolean]>([
        ['empty', false],
        ['storefront', true],
        ['not-a-storefront', false],
    ])('%s → asks for consent: %s', async (kind, expected) => {
        const { shouldAskBeforeReset } = await import(
            '@/features/eds/services/storefront/repoStorefrontReadiness'
        );
        expect(shouldAskBeforeReset(kind)).toBe(expected);
    });

    it('does not ask when the state is undetermined', async () => {
        // Nothing is known, so nothing may be destroyed — but the answer is
        // "block", not "proceed silently". Consent is not the right prompt.
        const { shouldAskBeforeReset } = await import(
            '@/features/eds/services/storefront/repoStorefrontReadiness'
        );
        expect(shouldAskBeforeReset('undetermined')).toBe(false);
    });
});
