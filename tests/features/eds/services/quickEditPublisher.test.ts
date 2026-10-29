/**
 * Quick Edit vendoring step tests — Experience Workspace WYSIWYG wiring.
 *
 * Mirrors `pdp404HandlerPublisher`'s install suite: covers the orchestrator
 * (`installQuickEdit`) end-to-end against a GitHub file-operations fake. The
 * pure transform it applies is covered by `quickEditSnippet.test.ts`.
 *
 * Contract (Step 1 of experience-workspace-default-authoring):
 *   - `scripts/scripts.js` gets its edits in one write.
 *   - `tools/quick-edit/quick-edit.js` is written net-new (idempotent via
 *     content/SHA).
 *   - Applies to ALL EDS storefronts (no overlay/IMS inputs — brand-agnostic).
 *   - Non-fatal at every step: any failure logs and returns
 *     `{ installed: false, reason }`. Never throws.
 */

import {
    QUICK_EDIT_JS_PATH,
    SCRIPTS_JS_PATH,
    installQuickEdit,
} from '@/features/eds/services/quickEditPublisher';
import {
    QUICK_EDIT_LOAD_PAGE_ANCHOR,
    QUICK_EDIT_LOAD_PAGE_EXPORTED,
    QUICK_EDIT_BRANCH_MARKER,
    QUICK_EDIT_SIDEKICK_MARKER,
    QUICK_EDIT_FIRSTIMAGE_ANCHOR,
    QUICK_EDIT_FIRSTIMAGE_MARKER,
    buildQuickEditScriptsJs,
} from '@/features/eds/services/quickEditSnippet';
import { createMockLogger } from '../../../helpers/loggerFake';
import { CANONICAL_SCRIPTS_JS } from './quickEditScriptsFixture';

import { createMockGithub, type GithubFake } from '../../../helpers/githubFake';
const mockLogger = createMockLogger();

describe('installQuickEdit', () => {
    const repoOwner = 'skukla';
    const repoName = 'citisignal-b2b';

    let mockGithub: GithubFake;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGithub = createMockGithub({
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
        });
    });

    it('adds the export to loadPage and writes the transformed scripts.js with the existing SHA', async () => {
        const result = await installQuickEdit(
            mockGithub, repoOwner, repoName, mockLogger,
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
            mockGithub, repoOwner, repoName, mockLogger,
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
            mockGithub, repoOwner, repoName, mockLogger,
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
            mockGithub, repoOwner, repoName, mockLogger,
        );

        expect(result).toEqual({ installed: false, reason: 'already installed' });
        const scriptsCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCommits).toHaveLength(0);
    });

    it('re-vendors a partially-wired scripts.js (export + IIFE present, sidekick listener missing)', async () => {
        // The user's exact case: a prior incomplete vendoring left the export
        // and the ?quick-edit IIFE branch but never the Sidekick listener. The
        // "already installed" gate now requires BOTH markers, so this file is
        // re-transformed to add the listener.
        const partial = [
            'async function loadLazy(doc) {',
            '  loadHeader(doc.querySelector(\'header\'));',
            '}',
            '',
            QUICK_EDIT_LOAD_PAGE_EXPORTED,
            '  await loadLazy(document);',
            '}',
            '',
            'loadPage();',
            '',
            QUICK_EDIT_BRANCH_MARKER,
            '(() => {})();',
            '// === end Quick Edit dynamic import ===',
            '',
        ].join('\n');
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) {
                return Promise.resolve({ content: partial, sha: 'scripts-sha' });
            }
            return Promise.resolve(null);
        });

        const result = await installQuickEdit(
            mockGithub, repoOwner, repoName, mockLogger,
        );

        expect(result).toEqual({ installed: true });
        const scriptsCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCall).toBeDefined();
        const writtenContent = scriptsCall![3] as string;
        // The listener was added ...
        expect(writtenContent).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(writtenContent).toContain("addEventListener('custom:quick-edit'");
        // ... without duplicating the already-present IIFE branch.
        expect(writtenContent.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
    });

    it('re-vendors a fully-wired-but-for-the-guard scripts.js (export + IIFE + listener present, first-paint guard missing)', async () => {
        // Every repo wired before this change — including the user's: export,
        // ?quick-edit IIFE branch and Sidekick listener all present, but the
        // first-paint guard never applied. The "already installed" gate now
        // requires the firstimage marker too, so this file is re-transformed.
        const partial = [
            'async function loadEager(doc) {',
            '    document.body.classList.add(\'appear\');',
            `    ${QUICK_EDIT_FIRSTIMAGE_ANCHOR}`,
            '  }',
            '',
            'async function loadLazy(doc) {',
            `  ${QUICK_EDIT_SIDEKICK_MARKER}`,
            "  document.querySelector('aem-sidekick');",
            '}',
            '',
            QUICK_EDIT_LOAD_PAGE_EXPORTED,
            '  await loadEager(document);',
            '}',
            '',
            'loadPage();',
            '',
            QUICK_EDIT_BRANCH_MARKER,
            '(() => {})();',
            '// === end Quick Edit dynamic import ===',
            '',
        ].join('\n');
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) {
                return Promise.resolve({ content: partial, sha: 'scripts-sha' });
            }
            return Promise.resolve(null);
        });

        const result = await installQuickEdit(
            mockGithub, repoOwner, repoName, mockLogger,
        );

        // Not short-circuited as "already installed" — the guard gets added.
        expect(result).toEqual({ installed: true });
        const scriptsCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCall).toBeDefined();
        const writtenContent = scriptsCall![3] as string;
        // The first-paint guard was added ...
        expect(writtenContent).toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);
        expect(writtenContent).toContain("classList.contains('quick-edit')");
        expect(writtenContent).not.toContain(QUICK_EDIT_FIRSTIMAGE_ANCHOR);
        // ... without duplicating the three already-present edits.
        expect(writtenContent.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
        expect(writtenContent.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1).toBe(1);
    });

    it('re-vendors a scripts.js missing ONLY the ?quick-edit branch', async () => {
        // "Already installed" is all four edits, not most of them. Each of the
        // four flags has to be able to fail on its own, or a repo that carries
        // three of the markers is declared done and the missing edit is never
        // repaired. This is the branch-shaped hole; the sidekick- and
        // guard-shaped ones are covered above.
        const missingBranch = [
            CANONICAL_SCRIPTS_JS.replace(QUICK_EDIT_LOAD_PAGE_ANCHOR, QUICK_EDIT_LOAD_PAGE_EXPORTED),
            QUICK_EDIT_SIDEKICK_MARKER,
            QUICK_EDIT_FIRSTIMAGE_MARKER,
        ].join('\n');
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) {
                return Promise.resolve({ content: missingBranch, sha: 'scripts-sha' });
            }
            return Promise.resolve(null);
        });

        const result = await installQuickEdit(
            mockGithub, repoOwner, repoName, mockLogger,
        );

        expect(result).toEqual({ installed: true });
        const scriptsCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCall).toBeDefined();
        const writtenContent = scriptsCall![3] as string;
        // The missing edit is added exactly once and the three present ones are
        // left alone — no duplicated markers.
        expect(writtenContent.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
        expect(writtenContent.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1).toBe(1);
        expect(writtenContent.split(QUICK_EDIT_FIRSTIMAGE_MARKER).length - 1).toBe(1);
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
            mockGithub, repoOwner, repoName, mockLogger,
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
            mockGithub, repoOwner, repoName, mockLogger,
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
            mockGithub, repoOwner, repoName, mockLogger,
        );

        expect(result).toEqual({ installed: false, reason: 'loadPage anchor missing' });
        const scriptsCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === SCRIPTS_JS_PATH);
        expect(scriptsCommits).toHaveLength(0);
    });

    it('writes to the storefront locations the vendored import resolves to', async () => {
        // The paths are the contract with the storefront, not test-local
        // names: scripts.js imports '../tools/quick-edit/quick-edit.js', so
        // the module must land at exactly that repo path.
        await installQuickEdit(mockGithub, repoOwner, repoName, mockLogger);

        const writtenPaths = mockGithub.createOrUpdateFile.mock.calls.map(c => c[2]);
        expect(writtenPaths).toStrictEqual(['scripts/scripts.js', 'tools/quick-edit/quick-edit.js']);
    });

    it('is non-fatal when createOrUpdateFile rejects for scripts.js: caught, returns GitHub commit failed reason', async () => {
        mockGithub.createOrUpdateFile.mockImplementation((_o, _r, path) => {
            if (path === SCRIPTS_JS_PATH) return Promise.reject(new Error('GitHub 422 conflict'));
            return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
        });

        const result = await installQuickEdit(
            mockGithub, repoOwner, repoName, mockLogger,
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
            mockGithub, repoOwner, repoName, mockLogger,
        );

        expect(result).toEqual({ installed: true });
    });
});
