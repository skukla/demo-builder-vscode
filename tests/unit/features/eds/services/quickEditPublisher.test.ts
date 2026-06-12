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
    QUICK_EDIT_LOADLAZY_ANCHOR,
    QUICK_EDIT_SIDEKICK_MARKER,
    QUICK_EDIT_FIRSTIMAGE_ANCHOR,
    QUICK_EDIT_FIRSTIMAGE_MARKER,
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

// Minimal canonical-shaped scripts.js: the loadLazy + loadPage declarations
// plus the standalone `loadPage();` call. Mirrors the pinned boilerplate's
// shape without pulling the whole 220-line file into the unit test (the full
// file is asserted by quickEditAnchorMatch.test.ts).
const CANONICAL_SCRIPTS_JS = [
    '// ... eager/lazy/delayed helpers above ...',
    '',
    'async function loadEager(doc) {',
    '    document.body.classList.add(\'appear\');',
    `    ${QUICK_EDIT_FIRSTIMAGE_ANCHOR}`,
    '  }',
    '',
    'async function loadLazy(doc) {',
    '  loadHeader(doc.querySelector(\'header\'));',
    '  loadFooter(doc.querySelector(\'footer\'));',
    '}',
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

    it('inserts the Sidekick custom:quick-edit listener at the top of loadLazy', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // Idempotency marker present ...
        expect(out).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        // ... it registers the custom:quick-edit Sidekick listener ...
        expect(out).toContain("addEventListener('custom:quick-edit'");
        // ... and it imports the net-new quick-edit module.
        expect(out).toContain("import('../tools/quick-edit/quick-edit.js')");
    });

    it('places the sidekick listener immediately after the loadLazy declaration', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const anchorIdx = out.indexOf(QUICK_EDIT_LOADLAZY_ANCHOR);
        const markerIdx = out.indexOf(QUICK_EDIT_SIDEKICK_MARKER);
        expect(anchorIdx).toBeGreaterThanOrEqual(0);
        expect(markerIdx).toBeGreaterThan(anchorIdx);
        // The marker is the first thing inside the loadLazy body (nothing of
        // the original body precedes it).
        const between = out.slice(anchorIdx + QUICK_EDIT_LOADLAZY_ANCHOR.length, markerIdx);
        expect(between.trim()).toBe('');
    });

    it('only inserts the sidekick listener once (first-match-only)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const markerCount = out.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('does not double-insert when the sidekick listener is already present', () => {
        const once = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const twice = buildQuickEditScriptsJs(once);
        const markerCount = twice.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('adds the sidekick listener to a partially-vendored file (IIFE present, listener missing)', () => {
        // The user's exact case: an earlier incomplete vendoring added the
        // export + the ?quick-edit IIFE branch but never the Sidekick listener.
        // Simulate that state: a fully-vendored file with the entire sidekick
        // block excised (everything from the marker to the end of loadLazy's
        // listener wiring), leaving the export + IIFE branch untouched.
        const partial = [
            '// ... eager/lazy/delayed helpers above ...',
            '',
            QUICK_EDIT_LOADLAZY_ANCHOR,
            '  loadHeader(doc.querySelector(\'header\'));',
            '  loadFooter(doc.querySelector(\'footer\'));',
            '}',
            '',
            QUICK_EDIT_LOAD_PAGE_EXPORTED,
            '  await loadEager(document);',
            '  await loadLazy(document);',
            '  loadDelayed();',
            '}',
            '',
            'loadPage();',
            '',
            QUICK_EDIT_BRANCH_MARKER,
            '(() => {',
            "  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');",
            "  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());",
            '})();',
            '// === end Quick Edit dynamic import ===',
            '',
        ].join('\n');
        // Guard: the partial really is missing the listener but keeps the IIFE.
        expect(partial).not.toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(partial).toContain(QUICK_EDIT_BRANCH_MARKER);

        const repaired = buildQuickEditScriptsJs(partial);
        expect(repaired).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(repaired).toContain("addEventListener('custom:quick-edit'");
        // No duplicate IIFE branch was added.
        expect(repaired.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
    });

    it('replaces the waitForFirstImage anchor with the quick-edit first-paint guard', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // Guard marker present (idempotency anchor) ...
        expect(out).toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);
        // ... it gates on quick-edit mode ...
        expect(out).toContain("classList.contains('quick-edit')");
        // ... and skips the wait by resolving immediately.
        expect(out).toContain('return Promise.resolve();');
        // The bare anchor is gone — it was rewritten into the guarded callback.
        expect(out).not.toContain(QUICK_EDIT_FIRSTIMAGE_ANCHOR);
    });

    it('still calls waitForFirstImage in the guarded form (non-quick-edit path)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // The guard wraps, not removes, the original behavior.
        expect(out).toContain('waitForFirstImage(section)');
    });

    it('only replaces the first-image anchor once (first-match-only)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const markerCount = out.split(QUICK_EDIT_FIRSTIMAGE_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('does not double-apply the first-paint guard when the marker is already present', () => {
        const once = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const twice = buildQuickEditScriptsJs(once);
        const markerCount = twice.split(QUICK_EDIT_FIRSTIMAGE_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('adds the first-paint guard to a partially-vendored file (export + IIFE + listener present, guard missing)', () => {
        // Every repo wired before this change is in this state: export, IIFE
        // branch and Sidekick listener present, but the first-paint guard
        // missing. Simulate it: a file carrying all three earlier markers plus
        // the bare waitForFirstImage anchor, with no firstimage marker yet.
        const partial = [
            'async function loadEager(doc) {',
            '    document.body.classList.add(\'appear\');',
            `    ${QUICK_EDIT_FIRSTIMAGE_ANCHOR}`,
            '  }',
            '',
            QUICK_EDIT_LOADLAZY_ANCHOR,
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
        // Guard: the partial has the first three markers but NOT the firstimage one.
        expect(partial).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        expect(partial).toContain(QUICK_EDIT_BRANCH_MARKER);
        expect(partial).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(partial).not.toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);

        const repaired = buildQuickEditScriptsJs(partial);
        expect(repaired).toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);
        expect(repaired).toContain("classList.contains('quick-edit')");
        expect(repaired).not.toContain(QUICK_EDIT_FIRSTIMAGE_ANCHOR);
        // The earlier three edits were left untouched (not duplicated).
        expect(repaired.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
        expect(repaired.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1).toBe(1);
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
            mockGithub as never, repoOwner, repoName, mockLogger as never,
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
            mockGithub as never, repoOwner, repoName, mockLogger as never,
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
