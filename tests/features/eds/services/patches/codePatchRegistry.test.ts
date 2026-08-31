/**
 * Tests for Code Patch Registry (v2 — externalized).
 *
 * Recovered from v1 `templatePatchRegistry` (`git show 'f6a7d029^:…'`) and adapted
 * per ADR-006:
 *   - `filePath` → `target` (matches content-patch naming family)
 *   - Definitions externalized to `eds-demo-patches` (no bundled fallback per D3)
 *   - Reuses content-patch fetch+cache via shared helper
 *   - Per-patch `critical: true` (D1 escape hatch; defaults off)
 *
 * Per-patch failure discipline (proceed-and-warn, D1):
 *   - Precondition mismatch → `applied: false` with descriptive reason
 *   - Target not in working file map → `applied: false`
 *   - External fetch failure → batch returns `applied: false` per requested ID
 *   - Unknown patch ID → warn + non-applied result
 *   - critical: true patch failure → throws CodePatchCriticalError after recording result
 */

import {
    getCodePatches,
    applyCodePatches,
    CodePatchCriticalError,
    _clearCodePatchCacheForTests,
    type CodePatch,
} from '@/features/eds/services/patches/codePatchRegistry';
import type { Logger } from '@/types/logger';
import type { CodePatchSource } from '@/types/demoPackages';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockLogger: Logger = createMockLogger();

const originalFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    _clearCodePatchCacheForTests();
    // Install a default fetch mock so "no fetch should happen" assertions
    // (`expect(global.fetch).not.toHaveBeenCalled()`) have something to spy on.
    // Tests that exercise fetch overwrite this in the test body.
    global.fetch = jest.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

/** Helper: mock fetch returning a patches.json-style response */
function mockExternalLedger(patches: CodePatch[]): jest.Mock {
    const mock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ patches }),
    });
    global.fetch = mock;
    return mock;
}

const SOURCE: CodePatchSource = {
    owner: 'skukla',
    repo: 'eds-demo-patches',
    path: 'citisignal',
};

// ==========================================================================
// getCodePatches — fetch + filter
// ==========================================================================

describe('getCodePatches', () => {
    it('returns empty array when no patch IDs requested', async () => {
        const patches = await getCodePatches([], SOURCE, mockLogger);
        expect(patches).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches external patches and filters by requested IDs', async () => {
        mockExternalLedger([
            {
                id: 'patch-a',
                target: 'blocks/header/header.js',
                description: 'A',
                precondition: 'foo',
                replacement: 'bar',
            },
            {
                id: 'patch-b',
                target: 'blocks/footer/footer.js',
                description: 'B',
                precondition: 'baz',
                replacement: 'qux',
            },
        ]);

        const patches = await getCodePatches(['patch-a'], SOURCE, mockLogger);

        expect(patches).toHaveLength(1);
        expect(patches[0].id).toBe('patch-a');
    });

    it('filters out unknown IDs (returns only known ones)', async () => {
        mockExternalLedger([
            {
                id: 'patch-a',
                target: 'scripts/a.js',
                description: 'A',
                precondition: 'foo',
                replacement: 'bar',
            },
        ]);

        const patches = await getCodePatches(['patch-a', 'unknown-patch'], SOURCE, mockLogger);

        expect(patches).toHaveLength(1);
        expect(patches[0].id).toBe('patch-a');
    });

    it('returns empty array when external fetch fails (HTTP error)', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

        const patches = await getCodePatches(['patch-a'], SOURCE, mockLogger);

        expect(patches).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('External fetch failed')
        );
    });

    it('returns empty array when external fetch throws (network error)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network down'));

        const patches = await getCodePatches(['patch-a'], SOURCE, mockLogger);

        expect(patches).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Network down'));
    });

    it('fetches from the canonical eds-demo-patches code-patches.json URL', async () => {
        const fetchMock = mockExternalLedger([]);

        await getCodePatches(['anything'], SOURCE, mockLogger);

        expect(fetchMock).toHaveBeenCalledWith(
            'https://raw.githubusercontent.com/skukla/eds-demo-patches/main/citisignal/code-patches.json',
            expect.any(Object)
        );
    });
});

// ==========================================================================
// applyCodePatches — apply + result shape
// ==========================================================================

describe('applyCodePatches — happy path', () => {
    it('applies a single patch successfully and returns applied:true', async () => {
        mockExternalLedger([
            {
                id: 'header-nav-tools-defensive',
                target: 'blocks/header/header.js',
                description: 'Tolerate missing nav-tools',
                precondition: `const navTools = nav.querySelector('.nav-tools');`,
                replacement: `let navTools = nav.querySelector('.nav-tools');\n  if (!navTools) navTools = document.createElement('div');`,
            },
        ]);

        const files = new Map<string, string>([
            [
                'blocks/header/header.js',
                `function decorate() { const navTools = nav.querySelector('.nav-tools'); }`,
            ],
        ]);

        const results = await applyCodePatches(
            files,
            ['header-nav-tools-defensive'],
            SOURCE,
            mockLogger
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
            patchId: 'header-nav-tools-defensive',
            target: 'blocks/header/header.js',
            applied: true,
        });
        expect(files.get('blocks/header/header.js')).toContain(
            'if (!navTools) navTools = document.createElement'
        );
    });

    it('returns empty results when patchIds is empty', async () => {
        const files = new Map<string, string>();
        const results = await applyCodePatches(files, [], SOURCE, mockLogger);
        expect(results).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reports applied:true + alreadyApplied when the replacement is already in place', async () => {
        // Re-running create/reset over a repo whose blocks were patched on a
        // previous run: the precondition is gone BECAUSE the patch is in place.
        // That is success (the desired end state exists), not a warning.
        mockExternalLedger([
            {
                id: 'header-nav-tools-defensive',
                target: 'blocks/header/header.js',
                description: 'Tolerate missing nav-tools',
                precondition: `const navTools = nav.querySelector('.nav-tools');`,
                replacement: `let navTools = nav.querySelector('.nav-tools');\n  if (!navTools) navTools = document.createElement('div');`,
            },
        ]);

        const patchedContent = `function decorate() { let navTools = nav.querySelector('.nav-tools');\n  if (!navTools) navTools = document.createElement('div'); }`;
        const files = new Map<string, string>([['blocks/header/header.js', patchedContent]]);

        const results = await applyCodePatches(
            files,
            ['header-nav-tools-defensive'],
            SOURCE,
            mockLogger
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
            patchId: 'header-nav-tools-defensive',
            target: 'blocks/header/header.js',
            applied: true,
            alreadyApplied: true,
        });
        // Content untouched — no double-application.
        expect(files.get('blocks/header/header.js')).toBe(patchedContent);
    });

    it('does NOT report alreadyApplied when the precondition is still present (normal apply wins)', async () => {
        // Degenerate file containing BOTH strings: the precondition must be
        // replaced (normal apply), not skipped.
        mockExternalLedger([
            { id: 'p', target: 'scripts/a.js', description: 'D', precondition: 'OLD', replacement: 'NEW' },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'NEW then OLD']]);

        const results = await applyCodePatches(files, ['p'], SOURCE, mockLogger);

        expect(results[0]).toEqual({ patchId: 'p', target: 'scripts/a.js', applied: true });
        expect(files.get('scripts/a.js')).toBe('NEW then NEW');
    });
});

// ==========================================================================
// applyCodePatches — failure cases (proceed-and-warn discipline)
// ==========================================================================

describe('applyCodePatches — failure cases', () => {
    it('returns applied:false with reason when precondition does not match', async () => {
        mockExternalLedger([
            {
                id: 'p',
                target: 'scripts/a.js',
                description: 'D',
                precondition: 'NOT_THERE',
                replacement: 'X',
            },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'some other content']]);

        const results = await applyCodePatches(files, ['p'], SOURCE, mockLogger);

        expect(results).toHaveLength(1);
        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toContain('Precondition not found');
        expect(files.get('scripts/a.js')).toBe('some other content');
    });

    it('returns applied:false with reason when target file not in working set', async () => {
        mockExternalLedger([
            {
                id: 'p',
                target: 'scripts/missing.js',
                description: 'D',
                precondition: 'X',
                replacement: 'Y',
            },
        ]);
        const files = new Map<string, string>();

        const results = await applyCodePatches(files, ['p'], SOURCE, mockLogger);

        expect(results).toHaveLength(1);
        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toContain('not in working set');
    });

    it('records non-applied result for each requested ID when external fetch fails', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
        const files = new Map<string, string>();

        const results = await applyCodePatches(files, ['p-a', 'p-b'], SOURCE, mockLogger);

        expect(results).toHaveLength(2);
        expect(results.every((r) => r.applied === false)).toBe(true);
        expect(
            results.every((r) => r.reason!.includes('unavailable') || r.reason!.includes('fetch'))
        ).toBe(true);
    });

    it('warns about and records non-applied result for unknown patch IDs', async () => {
        mockExternalLedger([
            {
                id: 'known',
                target: 'scripts/a.js',
                description: 'D',
                precondition: 'foo',
                replacement: 'bar',
            },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'foo']]);

        const results = await applyCodePatches(files, ['known', 'unknown'], SOURCE, mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown'));
        const unknownResult = results.find((r) => r.patchId === 'unknown');
        expect(unknownResult).toBeDefined();
        expect(unknownResult!.applied).toBe(false);
        expect(unknownResult!.reason).toContain('not in external ledger');
    });
});

// ==========================================================================
// Composition — multiple patches per file (v1 behavior)
// ==========================================================================

describe('applyCodePatches — composition', () => {
    it('composes multiple patches targeting the same file (sequential apply)', async () => {
        mockExternalLedger([
            { id: 'p1', target: 'scripts/a.js', description: '', precondition: 'one', replacement: 'ONE' },
            { id: 'p2', target: 'scripts/a.js', description: '', precondition: 'two', replacement: 'TWO' },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'one and two']]);

        const results = await applyCodePatches(files, ['p1', 'p2'], SOURCE, mockLogger);

        expect(results.every((r) => r.applied)).toBe(true);
        expect(files.get('scripts/a.js')).toBe('ONE and TWO');
    });
});

// ==========================================================================
// Idempotency — re-applying detects already-patched
// ==========================================================================

describe('applyCodePatches — idempotency', () => {
    it('is idempotent: re-running on an already-patched file reports success (alreadyApplied), untouched', async () => {
        const patch: CodePatch = {
            id: 'p',
            target: 'scripts/a.js',
            description: '',
            precondition: 'OLD',
            replacement: 'NEW',
        };
        mockExternalLedger([patch]);

        // First apply: succeeds
        const files = new Map<string, string>([['scripts/a.js', 'this is OLD content']]);
        const first = await applyCodePatches(files, ['p'], SOURCE, mockLogger);
        expect(first[0].applied).toBe(true);
        expect(first[0].alreadyApplied).toBeUndefined();
        expect(files.get('scripts/a.js')).toBe('this is NEW content');

        // Second apply on the now-patched content: the replacement is in place,
        // so this is success — NOT a "didn't apply" warning (the b2b-tester
        // false-positive: create over an existing repo re-runs prior patches).
        const second = await applyCodePatches(files, ['p'], SOURCE, mockLogger);
        expect(second[0].applied).toBe(true);
        expect(second[0].alreadyApplied).toBe(true);
        expect(files.get('scripts/a.js')).toBe('this is NEW content');
    });
});

// ==========================================================================
// Deterministic on multi-occurrence
// ==========================================================================

describe('applyCodePatches — multi-occurrence precondition', () => {
    it('replaces only the first occurrence when precondition appears multiple times (deterministic via String.replace)', async () => {
        mockExternalLedger([
            { id: 'p', target: 'scripts/a.js', description: '', precondition: 'foo', replacement: 'BAR' },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'foo and foo and foo']]);

        const results = await applyCodePatches(files, ['p'], SOURCE, mockLogger);

        expect(results[0].applied).toBe(true);
        expect(files.get('scripts/a.js')).toBe('BAR and foo and foo');
    });
});

// ==========================================================================
// Critical-flag escape hatch (D1)
// ==========================================================================

describe('applyCodePatches — critical flag', () => {
    it('throws CodePatchCriticalError when a critical:true patch fails (precondition mismatch)', async () => {
        mockExternalLedger([
            {
                id: 'must-apply',
                target: 'scripts/a.js',
                description: 'Load-bearing',
                precondition: 'NOT_THERE',
                replacement: 'X',
                critical: true,
            },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'something else']]);

        await expect(
            applyCodePatches(files, ['must-apply'], SOURCE, mockLogger)
        ).rejects.toBeInstanceOf(CodePatchCriticalError);
    });

    it('throws CodePatchCriticalError when a critical:true patch target file is missing', async () => {
        mockExternalLedger([
            {
                id: 'must-apply',
                target: 'scripts/missing.js',
                description: 'Load-bearing',
                precondition: 'X',
                replacement: 'Y',
                critical: true,
            },
        ]);
        const files = new Map<string, string>();

        await expect(
            applyCodePatches(files, ['must-apply'], SOURCE, mockLogger)
        ).rejects.toBeInstanceOf(CodePatchCriticalError);
    });

    it('does not throw for non-critical failures (default behavior — proceed and warn)', async () => {
        mockExternalLedger([
            {
                id: 'p',
                target: 'scripts/a.js',
                description: '',
                precondition: 'NOT_THERE',
                replacement: 'X',
            },
        ]);
        const files = new Map<string, string>([['scripts/a.js', 'something else']]);

        await expect(applyCodePatches(files, ['p'], SOURCE, mockLogger)).resolves.toEqual([
            expect.objectContaining({ patchId: 'p', applied: false }),
        ]);
    });
});

// ==========================================================================
// Per-source caching (deduplication of concurrent fetches)
// ==========================================================================

describe('per-source caching', () => {
    it('deduplicates concurrent fetches to a single HTTP request', async () => {
        const fetchMock = mockExternalLedger([
            { id: 'p', target: 'scripts/a.js', description: '', precondition: 'x', replacement: 'y' },
        ]);

        const source: CodePatchSource = {
            owner: 'dedup-owner',
            repo: 'dedup-repo',
            path: 'dedup-path',
        };

        const results = await Promise.all([
            getCodePatches(['p'], source, mockLogger),
            getCodePatches(['p'], source, mockLogger),
            getCodePatches(['p'], source, mockLogger),
            getCodePatches(['p'], source, mockLogger),
            getCodePatches(['p'], source, mockLogger),
        ]);

        for (const patches of results) {
            expect(patches).toHaveLength(1);
            expect(patches[0].id).toBe('p');
        }
        // Dedup is about the CONTENT fetch. The release-ref lookup is a separate
        // call (and is itself cached per repo), so count content requests rather
        // than total requests.
        const contentCalls = fetchMock.mock.calls
            .map((c: unknown[]) => String(c[0]))
            .filter((u: string) => u.includes('raw.githubusercontent'));
        expect(contentCalls).toHaveLength(1);
    });

    it('evicts failed promise from cache so the next call retries', async () => {
        // First call fails
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
        const source: CodePatchSource = {
            owner: 'retry-owner',
            repo: 'retry-repo',
            path: 'retry-path',
        };
        await getCodePatches(['p'], source, mockLogger);

        // Second call now succeeds — proves the failed promise was evicted
        const successFetch = mockExternalLedger([
            { id: 'p', target: 'scripts/a.js', description: '', precondition: 'x', replacement: 'y' },
        ]);
        const patches = await getCodePatches(['p'], source, mockLogger);

        expect(patches).toHaveLength(1);
        expect(successFetch).toHaveBeenCalled();
    });
});

/**
 * Target policy enforcement (see patchTargetPolicy.ts).
 *
 * The ledger is fetched from a public repo, so a compromised or mistaken entry
 * could name a file that has nothing to do with storefront JavaScript. The two
 * that matter are `package.json` — a dependency addition runs arbitrary code at
 * install time — and `.github/workflows/*`, which is write access to the
 * colleague's CI secrets. Refusal happens here, at the point of consumption,
 * because CI on the patches repo cannot be trusted to survive the compromise
 * it would be guarding against.
 */
describe('applyCodePatches — target policy', () => {
    it('refuses a patch targeting package.json and leaves the file untouched', async () => {
        mockExternalLedger([
            {
                id: 'malicious',
                target: 'package.json',
                precondition: '"dependencies"',
                replacement: '"dependencies": { "evil": "1.0.0" }',
            } as CodePatch,
        ]);
        const files = new Map([['package.json', '{ "dependencies": {} }']]);

        const results = await applyCodePatches(files, ['malicious'], SOURCE, mockLogger);

        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toMatch(/permitted directories|path escape|not a \.js/i);
        // The refusal must be a refusal, not a warning next to a write.
        expect(files.get('package.json')).toBe('{ "dependencies": {} }');
    });

    it('refuses a patch targeting a GitHub workflow', async () => {
        mockExternalLedger([
            {
                id: 'ci-takeover',
                target: '.github/workflows/deploy.yml',
                precondition: 'on:',
                replacement: 'on: [push]',
            } as CodePatch,
        ]);
        const files = new Map([['.github/workflows/deploy.yml', 'on:\n']]);

        const results = await applyCodePatches(files, ['ci-takeover'], SOURCE, mockLogger);

        expect(results[0].applied).toBe(false);
        expect(files.get('.github/workflows/deploy.yml')).toBe('on:\n');
    });

    it('refuses a target that escapes the repo', async () => {
        mockExternalLedger([
            {
                id: 'traversal',
                target: '../../.ssh/authorized_keys',
                precondition: 'x',
                replacement: 'y',
            } as CodePatch,
        ]);
        const files = new Map([['../../.ssh/authorized_keys', 'x']]);

        const results = await applyCodePatches(files, ['traversal'], SOURCE, mockLogger);

        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toMatch(/path escape/i);
    });

    it('still applies a legitimate patch', async () => {
        mockExternalLedger([
            {
                id: 'legit',
                target: 'scripts/commerce.js',
                precondition: 'const a = 1;',
                replacement: 'const a = 2;',
            } as CodePatch,
        ]);
        const files = new Map([['scripts/commerce.js', 'const a = 1;']]);

        const results = await applyCodePatches(files, ['legit'], SOURCE, mockLogger);

        expect(results[0].applied).toBe(true);
        expect(files.get('scripts/commerce.js')).toBe('const a = 2;');
    });
});
