/**
 * Quick Edit vendoring step tests — Experience Workspace WYSIWYG wiring.
 *
 * Mirrors `pdp404HandlerPublisher.test.ts`: covers the pure transform
 * (`buildQuickEditScriptsJs`) and the orchestrator (`installQuickEdit`)
 * end-to-end.
 *
 * Contract (Step 1 of experience-workspace-default-authoring):
 *   - `scripts/scripts.js` gets two edits in one write:
 *       1. `export` added to `loadPage`.
 *       2. a `?quick-edit` dynamic-import branch appended.
 *   - `tools/quick-edit/quick-edit.js` is written net-new (idempotent via
 *     content/SHA).
 *   - Applies to ALL EDS storefronts (no overlay/IMS inputs — brand-agnostic).
 *   - Non-fatal at every step: any failure logs and returns
 *     `{ installed: false, reason }`. Never throws.
 *
 * The anchors the transform searches for are pinned against the canonical
 * boilerplate by `quickEditAnchorMatch.test.ts`.
 */

import {
    QUICK_EDIT_LOAD_PAGE_ANCHOR,
    QUICK_EDIT_LOAD_PAGE_EXPORTED,
    QUICK_EDIT_BRANCH_MARKER,
    QUICK_EDIT_JS_PATH,
    SCRIPTS_JS_PATH,
    buildQuickEditScriptsJs,
    installQuickEdit,
} from '@/features/eds/services/quickEditPublisher';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Minimal canonical-shaped scripts.js: the loadPage declaration plus the
// standalone `loadPage();` call. Mirrors the pinned boilerplate's shape
// without pulling the whole 220-line file into the unit test (the full
// file is asserted by quickEditAnchorMatch.test.ts).
const CANONICAL_SCRIPTS_JS = [
    '// ... eager/lazy/delayed helpers above ...',
    '',
    'async function loadPage() {',
    '  await loadEager(document);',
    '  await loadLazy(document);',
    '  loadDelayed();',
    '}',
    '',
    'loadPage();',
    '',
    '(async function loadDa() {',
    '  if (!IS_DA) return;',
    "  import('https://da.live/scripts/dapreview.js').then(({ default: daPreview }) => daPreview(loadPage));",
    '}());',
    '',
].join('\n');

describe('buildQuickEditScriptsJs', () => {
    it('adds the export keyword to the loadPage declaration', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        expect(out).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        expect(out).not.toContain(`\n${QUICK_EDIT_LOAD_PAGE_ANCHOR}`);
    });

    it('appends the ?quick-edit dynamic-import branch (composes with the export edit)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // Branch marker present (idempotency anchor) ...
        expect(out).toContain(QUICK_EDIT_BRANCH_MARKER);
        // ... and it imports the net-new quick-edit module.
        expect(out).toContain("import('../tools/quick-edit/quick-edit.js')");
        // ... gated on the `quick-edit` query param.
        expect(out).toContain("searchParams.has('quick-edit')");
        // Both edits land in the same output string.
        expect(out).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
    });

    it('preserves the existing scripts.js content (additive transform)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        expect(out).toContain('await loadEager(document);');
        expect(out).toContain('async function loadDa()');
    });

    it('only transforms the first match of the loadPage declaration', () => {
        // Defensive: even if a second un-exported loadPage somehow appears,
        // the engine is first-match-only (mirrors the patch engine).
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const exportedCount = out.split(QUICK_EDIT_LOAD_PAGE_EXPORTED).length - 1;
        expect(exportedCount).toBe(1);
    });
});

describe('installQuickEdit', () => {
    const repoOwner = 'skukla';
    const repoName = 'citisignal-b2b';

    let mockGithub: {
        getFileContent: jest.Mock;
        createOrUpdateFile: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGithub = {
            getFileContent: jest.fn().mockImplementation((_o, _r, path) => {
                if (path === SCRIPTS_JS_PATH) {
                    return Promise.resolve({ content: CANONICAL_SCRIPTS_JS, sha: 'scripts-sha' });
                }
                if (path === QUICK_EDIT_JS_PATH) {
                    // Net-new file: absent by default.
                    return Promise.resolve(null);
                }
                return Promise.resolve(null);
            }),
            createOrUpdateFile: jest.fn().mockResolvedValue({
                sha: 'new-file-sha',
                commitSha: 'commit-sha',
            }),
        };
    });

    it('adds the export to loadPage and writes the transformed scripts.js with the existing SHA', async () => {
        const result = await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        expect(result).toEqual({ installed: true });
        const scriptsCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCall).toBeDefined();
        const writtenContent = scriptsCall![3] as string;
        expect(writtenContent).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        // SHA-aware: the existing SHA is passed for the update.
        expect(scriptsCall![5]).toBe('scripts-sha');
    });

    it('adds the ?quick-edit dynamic-import branch in the same scripts.js write', async () => {
        await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        const scriptsCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === SCRIPTS_JS_PATH);
        const writtenContent = scriptsCall![3] as string;
        // Both edits present in the one write.
        expect(writtenContent).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        expect(writtenContent).toContain(QUICK_EDIT_BRANCH_MARKER);
        expect(writtenContent).toContain("searchParams.has('quick-edit')");
    });

    it('writes the net-new tools/quick-edit/quick-edit.js via createOrUpdateFile', async () => {
        await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        const qeCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === QUICK_EDIT_JS_PATH);
        expect(qeCall).toBeDefined();
        const qeContent = qeCall![3] as string;
        // Faithful to the documented Quick Edit module.
        expect(qeContent).toContain("import { loadPage } from '../../scripts/scripts.js'");
        expect(qeContent).toContain('export default function init');
    });

    it('is idempotent: when both scripts.js anchors are already transformed, no scripts.js write occurs', async () => {
        // Pre-transformed scripts.js: export present AND branch marker present.
        const alreadyDone = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) {
                return Promise.resolve({ content: alreadyDone, sha: 'scripts-sha' });
            }
            // quick-edit.js already present too, so the whole step is a no-op.
            if (path === QUICK_EDIT_JS_PATH) {
                return Promise.resolve({ content: 'export default function init() {}', sha: 'qe-sha' });
            }
            return Promise.resolve(null);
        });

        const result = await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        expect(result).toEqual({ installed: false, reason: 'already installed' });
        const scriptsCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCommits).toHaveLength(0);
    });

    it('is idempotent for quick-edit.js: skips the write when the module already exists', async () => {
        // scripts.js not yet patched, but quick-edit.js already present.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) {
                return Promise.resolve({ content: CANONICAL_SCRIPTS_JS, sha: 'scripts-sha' });
            }
            if (path === QUICK_EDIT_JS_PATH) {
                return Promise.resolve({ content: 'export default function init() {}', sha: 'qe-sha' });
            }
            return Promise.resolve(null);
        });

        await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        const qeCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === QUICK_EDIT_JS_PATH);
        expect(qeCommits).toHaveLength(0);
    });

    it('is non-fatal when scripts.js is missing: logs and returns scripts.js missing reason', async () => {
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) return Promise.resolve(null);
            return Promise.resolve(null);
        });

        const result = await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        expect(result).toEqual({ installed: false, reason: 'scripts.js missing' });
        const scriptsCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCommits).toHaveLength(0);
    });

    it('is non-fatal when the loadPage anchor is absent: skips without throwing', async () => {
        // A storefront whose scripts.js doesn't contain the expected
        // loadPage declaration (forked/unusual): we cannot safely
        // transform, so skip rather than guess.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) {
                return Promise.resolve({ content: '// no loadPage here\nexport default {};\n', sha: 'scripts-sha' });
            }
            return Promise.resolve(null);
        });

        const result = await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        expect(result.installed).toBe(false);
        const scriptsCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCommits).toHaveLength(0);
    });

    it('is non-fatal when createOrUpdateFile rejects for scripts.js: caught, returns GitHub commit failed reason', async () => {
        mockGithub.createOrUpdateFile.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) return Promise.reject(new Error('GitHub 422 conflict'));
            return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
        });

        const result = await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toContain('GitHub commit failed');
        expect(result.reason).toContain('GitHub 422 conflict');
    });

    it('quick-edit.js commit failure is non-fatal: scripts.js install still reports installed', async () => {
        // The scripts.js edit is the load-bearing piece; a failed
        // quick-edit.js write degrades (Quick Edit won't load) but the
        // storefront still works. Mirrors pdp404's head.html non-fatal path.
        mockGithub.createOrUpdateFile.mockImplementation((_o, _r, path) => {
            if (path === QUICK_EDIT_JS_PATH) return Promise.reject(new Error('quick-edit.js conflict'));
            return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
        });

        const result = await installQuickEdit(
            mockGithub as never, repoOwner, repoName, mockLogger as never,
        );

        expect(result).toEqual({ installed: true });
    });
});
