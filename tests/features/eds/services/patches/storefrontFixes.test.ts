/**
 * Our fixes against a storefront repository's own files (EDS-13f steps 02, 03
 * and 07): what each fix's state is, and, when asked, ONE commit of the ones
 * that fit.
 *
 * The real engine runs; the ledger fetch (a public GitHub read) and the
 * repository are the boundaries. A fix FITS only when its precondition appears
 * exactly once: a second match means the code is not the boilerplate's and the
 * fix is refused, never applied to the first match.
 */

import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import { fetchExternalPatches } from '@/features/eds/services/patches/externalPatchFetcher';
import { applyFixes, checkFixes } from '@/features/eds/services/patches/storefrontFixes';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/eds/services/patches/externalPatchFetcher', () => ({
    fetchExternalPatches: jest.fn(),
}));
const mockLedger = fetchExternalPatches as jest.Mock;

const SOURCE = { owner: 'skukla', repo: 'eds-demo-patches', path: 'citisignal-b2b' };
const TARGET = { owner: 'steve', repo: 'aistore-demo', branch: 'main' };

function patch(id: string, target: string, precondition: string, replacement: string): CodePatch {
    return { id, target, description: id, precondition, replacement };
}

const LEDGER: CodePatch[] = [
    patch('fits', 'scripts/commerce.js', 'encode(sku)', 'encodeSku(sku)'),
    patch('present', 'scripts/commerce.js', 'old-present', 'new-present'),
    patch('drifted', 'scripts/commerce.js', 'not-in-file', 'whatever'),
    patch('twice', 'scripts/scripts.js', 'dup()', 'once()'),
    patch('no-file', 'blocks/gone/gone.js', 'x', 'y'),
    patch('broken-read', 'blocks/header/header.js', 'nav', 'nav?.'),
];

const FILES: Record<string, string | null | Error> = {
    'scripts/commerce.js': 'const a = encode(sku); const b = new-present;',
    'scripts/scripts.js': 'dup(); dup();',
    'blocks/gone/gone.js': null,
    'blocks/header/header.js': new Error('GitHub answered 502'),
};

function deps(files: Record<string, string | null | Error> = FILES) {
    const fileOps = {
        getFileContent: jest.fn(async (_o: string, _r: string, path: string) => {
            const value = files[path];
            if (value instanceof Error) throw value;
            return value === null || value === undefined ? null : { content: value, sha: 's', path, encoding: 'utf-8' };
        }),
        commitTreeToBranch: jest.fn(async () => 'c0ffee'),
    };
    return { fileOps, logger: createMockLogger() };
}

const IDS = LEDGER.map((p) => p.id);

beforeEach(() => {
    jest.clearAllMocks();
    mockLedger.mockResolvedValue(LEDGER);
});

describe('checkFixes', () => {
    it('names each fix applied / fits / missing / target missing / could not read, and writes nothing', async () => {
        const d = deps();

        const outcomes = await checkFixes(d, TARGET, IDS, SOURCE);

        expect(outcomes.map((o) => [o.patchId, o.state])).toEqual([
            ['fits', 'fits'],
            ['present', 'applied'],
            ['drifted', 'missing'],
            ['twice', 'missing'],
            ['no-file', 'target-missing'],
            ['broken-read', 'unreadable'],
        ]);
        expect(outcomes.find((o) => o.patchId === 'twice')?.reason).toMatch(/more than once/);
        expect(d.fileOps.commitTreeToBranch).not.toHaveBeenCalled();
    });

    it("reads each target once, from the repository's branch", async () => {
        const d = deps();

        await checkFixes(d, { ...TARGET, branch: 'demo' }, IDS, SOURCE);

        const reads = d.fileOps.getFileContent.mock.calls.map((call) => call.slice(0, 4));
        expect(reads).toEqual([
            ['steve', 'aistore-demo', 'scripts/commerce.js', 'demo'],
            ['steve', 'aistore-demo', 'scripts/scripts.js', 'demo'],
            ['steve', 'aistore-demo', 'blocks/gone/gone.js', 'demo'],
            ['steve', 'aistore-demo', 'blocks/header/header.js', 'demo'],
        ]);
    });

    it('says it could not read every fix when the ledger cannot be fetched, never that they miss', async () => {
        mockLedger.mockRejectedValue(new Error('offline'));

        const outcomes = await checkFixes(deps(), TARGET, ['fits', 'present'], SOURCE);

        expect(outcomes.map((o) => o.state)).toEqual(['unreadable', 'unreadable']);
    });
});

describe('applyFixes', () => {
    it('writes the fits in ONE commit naming the count and the ids, and nothing else', async () => {
        const d = deps();

        const result = await applyFixes(d, TARGET, IDS, SOURCE);

        expect(d.fileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        expect(d.fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'steve',
            'aistore-demo',
            'main',
            [
                {
                    path: 'scripts/commerce.js',
                    mode: '100644',
                    type: 'blob',
                    content: 'const a = encodeSku(sku); const b = new-present;',
                },
            ],
            'Demo Builder: 1 fix\n\nfits',
        );
        expect(result).toEqual({
            applied: ['fits'],
            commitSha: 'c0ffee',
            outcomes: expect.arrayContaining([{ patchId: 'fits', target: 'scripts/commerce.js', state: 'applied' }]),
        });
    });

    it('writes nothing when nothing fits', async () => {
        const d = deps();

        const result = await applyFixes(d, TARGET, ['present', 'drifted', 'twice'], SOURCE);

        expect(d.fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.applied).toStrictEqual([]);
        expect(result).not.toHaveProperty('commitSha');
    });
});
