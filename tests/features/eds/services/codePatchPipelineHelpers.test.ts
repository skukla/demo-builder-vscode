/**
 * Tests for the code-patch pipeline wrappers.
 *
 * The engine in `codePatchRegistry` is pure (operates on a Map<string,string>).
 * These wrappers handle the two pipeline-specific concerns:
 *
 *   - **Canonical phase** (pre-reset): patches against template files like
 *     `head.html`, `scripts/scripts.js`, `blocks/header/header.js` from the
 *     canonical Boilerplate. Fetches missing targets from the template repo
 *     and writes patched content back into the existing `fileOverrides` map.
 *
 *   - **Block phase** (post-install): patches against installed library
 *     blocks (anything under `blocks/`). Reads from + writes back to the
 *     destination repo via `GitHubFileOperations` (separate commits, idempotent
 *     via per-file SHA).
 *
 * Patches are routed by target prefix per plan step-02.md: targets starting
 * with `blocks/` are block-phase, everything else is canonical-phase.
 */

import {
    applyCanonicalCodePatches,
    applyBlockCodePatches,
} from '@/features/eds/services/codePatchPipelineHelpers';
import { _clearCodePatchCacheForTests } from '@/features/eds/services/codePatchRegistry';
import type { Logger } from '@/types';
import type { CodePatchSource } from '@/types/demoPackages';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { CodePatch } from '@/features/eds/services/codePatchRegistry';

const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

const SOURCE: CodePatchSource = {
    owner: 'skukla',
    repo: 'eds-demo-patches',
    path: 'citisignal',
};

const originalFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    _clearCodePatchCacheForTests();
    global.fetch = jest.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

function mockLedger(patches: CodePatch[]): jest.Mock {
    const mock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('code-patches.json')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ patches }),
            });
        }
        // Default: HTTP 404 (callers can override per test)
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });
    global.fetch = mock;
    return mock;
}

// ==========================================================================
// applyCanonicalCodePatches — pre-reset phase
// ==========================================================================

describe('applyCanonicalCodePatches', () => {
    it('returns empty results when no patch IDs requested', async () => {
        const fileOverrides = new Map<string, string>();
        const results = await applyCanonicalCodePatches(
            fileOverrides, 'tmpl-owner', 'tmpl-repo', [], SOURCE, mockLogger,
        );
        expect(results).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('filters out block-phase patches (targets starting with blocks/)', async () => {
        // Ledger has one canonical patch and one block patch — wrapper only runs canonical
        const fetchMock = jest.fn().mockImplementation((url: string) => {
            if (url.includes('code-patches.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        patches: [
                            { id: 'canon', target: 'head.html', description: '', precondition: 'OLD', replacement: 'NEW' },
                            { id: 'block', target: 'blocks/header/header.js', description: '', precondition: 'X', replacement: 'Y' },
                        ],
                    }),
                });
            }
            // head.html fetch
            return Promise.resolve({ ok: true, text: () => Promise.resolve('this is OLD content') });
        });
        global.fetch = fetchMock;

        const fileOverrides = new Map<string, string>();
        const results = await applyCanonicalCodePatches(
            fileOverrides, 'tmpl-owner', 'tmpl-repo', ['canon', 'block'], SOURCE, mockLogger,
        );

        // Only the canonical patch ran
        expect(results).toHaveLength(1);
        expect(results[0].patchId).toBe('canon');
        expect(results[0].applied).toBe(true);
        expect(fileOverrides.get('head.html')).toBe('this is NEW content');
    });

    it('fetches missing target files from the template repo (raw.githubusercontent)', async () => {
        const fetchMock = jest.fn().mockImplementation((url: string) => {
            if (url.includes('code-patches.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        patches: [
                            { id: 'p', target: 'head.html', description: '', precondition: 'FOO', replacement: 'BAR' },
                        ],
                    }),
                });
            }
            return Promise.resolve({ ok: true, text: () => Promise.resolve('content with FOO inside') });
        });
        global.fetch = fetchMock;

        const fileOverrides = new Map<string, string>();
        await applyCanonicalCodePatches(
            fileOverrides, 'tmpl-owner', 'tmpl-repo', ['p'], SOURCE, mockLogger,
        );

        // Verify the raw.githubusercontent fetch URL was constructed correctly
        const fetchCalls = fetchMock.mock.calls.map(c => c[0] as string);
        expect(fetchCalls.some(u => u === 'https://raw.githubusercontent.com/tmpl-owner/tmpl-repo/main/head.html')).toBe(true);
    });

    it('preserves existing fileOverrides entries (used as working set, not overwritten)', async () => {
        // fileOverrides has a pre-existing override for head.html. The wrapper
        // should patch THAT content, not re-fetch from template.
        const fetchMock = jest.fn().mockImplementation((url: string) => {
            if (url.includes('code-patches.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        patches: [
                            { id: 'p', target: 'head.html', description: '', precondition: 'OLD', replacement: 'NEW' },
                        ],
                    }),
                });
            }
            // Should NOT be called
            return Promise.resolve({ ok: true, text: () => Promise.resolve('template content') });
        });
        global.fetch = fetchMock;

        const fileOverrides = new Map<string, string>([
            ['head.html', 'pre-existing OLD content (from prior pipeline step)'],
        ]);
        await applyCanonicalCodePatches(
            fileOverrides, 'tmpl-owner', 'tmpl-repo', ['p'], SOURCE, mockLogger,
        );

        // Confirm patched output came from the pre-existing override
        expect(fileOverrides.get('head.html')).toBe('pre-existing NEW content (from prior pipeline step)');
        // And the raw.githubusercontent fetch for head.html was NOT made
        const headFetches = fetchMock.mock.calls.filter(c => (c[0] as string).endsWith('/head.html'));
        expect(headFetches).toHaveLength(0);
    });

    it('reports non-applied when template fetch fails (proceed-and-warn)', async () => {
        const fetchMock = jest.fn().mockImplementation((url: string) => {
            if (url.includes('code-patches.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        patches: [
                            { id: 'p', target: 'missing.html', description: '', precondition: 'X', replacement: 'Y' },
                        ],
                    }),
                });
            }
            // Template fetch fails
            return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
        });
        global.fetch = fetchMock;

        const fileOverrides = new Map<string, string>();
        const results = await applyCanonicalCodePatches(
            fileOverrides, 'tmpl-owner', 'tmpl-repo', ['p'], SOURCE, mockLogger,
        );

        expect(results).toHaveLength(1);
        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toContain('working set');  // Engine reports target-not-in-set
    });

    it('composes multiple canonical patches targeting the same file', async () => {
        const fetchMock = jest.fn().mockImplementation((url: string) => {
            if (url.includes('code-patches.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        patches: [
                            { id: 'p1', target: 'a.js', description: '', precondition: 'foo', replacement: 'FOO' },
                            { id: 'p2', target: 'a.js', description: '', precondition: 'bar', replacement: 'BAR' },
                        ],
                    }),
                });
            }
            return Promise.resolve({ ok: true, text: () => Promise.resolve('foo and bar') });
        });
        global.fetch = fetchMock;

        const fileOverrides = new Map<string, string>();
        const results = await applyCanonicalCodePatches(
            fileOverrides, 'tmpl-owner', 'tmpl-repo', ['p1', 'p2'], SOURCE, mockLogger,
        );

        expect(results.every(r => r.applied)).toBe(true);
        expect(fileOverrides.get('a.js')).toBe('FOO and BAR');
    });
});

// ==========================================================================
// applyBlockCodePatches — post-install phase
// ==========================================================================

describe('applyBlockCodePatches', () => {
    function makeFileOps(initialFiles: Record<string, string>): GitHubFileOperations {
        const files = new Map(Object.entries(initialFiles));
        const ops = {
            getFileContent: jest.fn(async (owner: string, repo: string, path: string) => {
                const content = files.get(path);
                if (content === undefined) return null;
                return { content, sha: `sha-${path}` };
            }),
            createOrUpdateFile: jest.fn(async (owner: string, repo: string, path: string, content: string) => {
                files.set(path, content);
                return { sha: `new-sha-${path}`, commitSha: `commit-${path}` };
            }),
        };
        return ops as unknown as GitHubFileOperations;
    }

    it('returns empty results when no patch IDs requested', async () => {
        const ops = makeFileOps({});
        const results = await applyBlockCodePatches(
            ops, 'owner', 'repo', [], SOURCE, mockLogger,
        );
        expect(results).toEqual([]);
    });

    it('filters in only block-phase patches (target starts with blocks/)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                patches: [
                    { id: 'block-p', target: 'blocks/header/header.js', description: '', precondition: 'OLD', replacement: 'NEW' },
                    { id: 'canon', target: 'head.html', description: '', precondition: 'X', replacement: 'Y' },
                ],
            }),
        });
        const ops = makeFileOps({
            'blocks/header/header.js': 'this is OLD content',
        });

        const results = await applyBlockCodePatches(
            ops, 'owner', 'repo', ['block-p', 'canon'], SOURCE, mockLogger,
        );

        // Only the block-phase patch ran
        expect(results).toHaveLength(1);
        expect(results[0].patchId).toBe('block-p');
        expect(results[0].applied).toBe(true);
    });

    it('reads target via getFileContent, writes patched via createOrUpdateFile', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                patches: [
                    { id: 'p', target: 'blocks/header/header.js', description: '', precondition: 'OLD', replacement: 'NEW' },
                ],
            }),
        });
        const ops = makeFileOps({
            'blocks/header/header.js': 'this is OLD content',
        });

        await applyBlockCodePatches(ops, 'my-owner', 'my-repo', ['p'], SOURCE, mockLogger);

        expect(ops.getFileContent).toHaveBeenCalledWith('my-owner', 'my-repo', 'blocks/header/header.js');
        expect(ops.createOrUpdateFile).toHaveBeenCalledWith(
            'my-owner', 'my-repo',
            'blocks/header/header.js',
            'this is NEW content',
            expect.any(String),  // commit message
            'sha-blocks/header/header.js',  // pass-through SHA for update
        );
    });

    it('reports non-applied when block file is missing in destination repo', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                patches: [
                    { id: 'p', target: 'blocks/missing/missing.js', description: '', precondition: 'X', replacement: 'Y' },
                ],
            }),
        });
        const ops = makeFileOps({});

        const results = await applyBlockCodePatches(ops, 'owner', 'repo', ['p'], SOURCE, mockLogger);

        expect(results).toHaveLength(1);
        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toContain('working set');  // Engine: target not in map
        // No write attempted
        expect(ops.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('reports non-applied when precondition does not match the destination file', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                patches: [
                    { id: 'p', target: 'blocks/header/header.js', description: '', precondition: 'NOT_THERE', replacement: 'Y' },
                ],
            }),
        });
        const ops = makeFileOps({
            'blocks/header/header.js': 'completely different content',
        });

        const results = await applyBlockCodePatches(ops, 'owner', 'repo', ['p'], SOURCE, mockLogger);

        expect(results).toHaveLength(1);
        expect(results[0].applied).toBe(false);
        expect(results[0].reason).toContain('Precondition not found');
        expect(ops.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('does not call createOrUpdateFile when there are no block-phase patches', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                patches: [
                    { id: 'canon', target: 'head.html', description: '', precondition: 'X', replacement: 'Y' },
                ],
            }),
        });
        const ops = makeFileOps({});

        const results = await applyBlockCodePatches(ops, 'owner', 'repo', ['canon'], SOURCE, mockLogger);

        expect(results).toEqual([]);
        expect(ops.getFileContent).not.toHaveBeenCalled();
        expect(ops.createOrUpdateFile).not.toHaveBeenCalled();
    });
});
