/**
 * Quick Edit anchor-match guard.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The two `scripts/scripts.js` edits Quick Edit applies (add `export` to
 * `loadPage`; append the `?quick-edit` dynamic-import branch) used to ride
 * the per-brand `code-patches.json` ledgers in `skukla/eds-demo-patches`,
 * whose LKG gate verified — on every canonical bump — that the patch
 * preconditions still matched the upstream boilerplate. Step 1 of
 * experience-workspace-default-authoring moved those edits into the
 * extension (`quickEditPublisher.ts`), so they no longer ride that gate.
 *
 * This test is the replacement safety net: it loads the pinned-canonical
 * `hlxsites/aem-boilerplate-commerce` `scripts/scripts.js` fixture and
 * asserts BOTH literal anchors the vendoring step searches for still exist
 * in it. If a future LKG bump changes the `loadPage` declaration or the
 * post-`loadPage()` call-site shape, this test fails — the deliberate
 * signal to update the anchors in lockstep.
 *
 * The fixture is pinned to the LKG SHA the extension already uses
 * (`tests/fixtures/eds/canonical/README.md` documents the pin + refresh
 * procedure). Anchor correctness is load-bearing: a silently-drifted anchor
 * means Quick Edit never wires into newly-created storefronts.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
    QUICK_EDIT_LOAD_PAGE_ANCHOR,
    QUICK_EDIT_BRANCH_ANCHOR,
} from '@/features/eds/services/quickEditPublisher';

/** LKG SHA the canonical fixture is pinned to (see fixture README). */
const PINNED_LKG_SHA = '760601940fa7264ea900c9d4b6bf735a5e78f46b';

const CANONICAL_SCRIPTS_JS = readFileSync(
    resolve(__dirname, '../../../../fixtures/eds/canonical/aem-boilerplate-commerce-scripts.js'),
    'utf-8',
);

describe('Quick Edit anchor-match against pinned-canonical boilerplate', () => {
    it('documents the LKG SHA the fixture is pinned to', () => {
        // The pin lives in the fixture README; this assertion keeps the SHA
        // visible at the point of failure so a refresh is obvious.
        expect(PINNED_LKG_SHA).toMatch(/^[0-9a-f]{40}$/);
    });

    it('the canonical scripts.js still contains the loadPage export anchor', () => {
        expect(CANONICAL_SCRIPTS_JS).toContain(QUICK_EDIT_LOAD_PAGE_ANCHOR);
    });

    it('the loadPage export anchor matches exactly once (unambiguous first-match)', () => {
        const count = CANONICAL_SCRIPTS_JS.split(QUICK_EDIT_LOAD_PAGE_ANCHOR).length - 1;
        expect(count).toBe(1);
    });

    it('the canonical loadPage is NOT already exported (the edit is still needed)', () => {
        expect(CANONICAL_SCRIPTS_JS).not.toContain('export async function loadPage');
    });

    it('the canonical scripts.js still contains the branch-insertion anchor', () => {
        expect(CANONICAL_SCRIPTS_JS).toContain(QUICK_EDIT_BRANCH_ANCHOR);
    });

    it('the branch-insertion anchor matches exactly once (unambiguous first-match)', () => {
        const count = CANONICAL_SCRIPTS_JS.split(QUICK_EDIT_BRANCH_ANCHOR).length - 1;
        expect(count).toBe(1);
    });

    it('the canonical scripts.js does not already contain a quick-edit branch', () => {
        expect(CANONICAL_SCRIPTS_JS).not.toContain('quick-edit');
    });
});
