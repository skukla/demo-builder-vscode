/**
 * Quick Edit snippet authoring — the text vendored into a storefront, no I/O.
 *
 * Holds the four `scripts/scripts.js` anchors and their idempotency markers,
 * the blocks inserted at them, the net-new `tools/quick-edit/quick-edit.js`
 * body, and the pure transform that applies the edits. Extracted from
 * `quickEditPublisher` on the `pdp404Snippet` model: this text changes when
 * Adobe's documented Quick Edit wiring or the boilerplate's `scripts.js`
 * changes; the installer changes when the GitHub write does.
 *
 * The edits are faithful to Adobe's documented Quick Edit wiring
 * (docs.da.live/about/early-access/quick-edit, "Option 2: Existing Projects"):
 *   1. Add `export` to the `loadPage` declaration.
 *   2. Append a `?quick-edit` query-param dynamic-import branch that imports
 *      `../tools/quick-edit/quick-edit.js`.
 *   3. Insert a Sidekick `custom:quick-edit` event listener at the top of
 *      `loadLazy` — the path the EW canvas uses to enter Quick Edit. Without
 *      it the EW Layout (WYSIWYG) view renders blank.
 *   4. Wrap `loadEager`'s `waitForFirstImage` call in a quick-edit guard that
 *      skips the first-image wait under the EW canvas — without it the first
 *      section (hero) doesn't paint until the user reloads.
 *
 * The anchors are pinned against the canonical boilerplate by
 * `quickEditSnippet-anchorMatch.test.ts`.
 *
 * @module features/eds/services/quickEditSnippet
 */

/**
 * Literal anchor for edit #1 — the canonical un-exported `loadPage`
 * declaration in `hlxsites/aem-boilerplate-commerce` `scripts/scripts.js`.
 *
 * Stable string pinned by `quickEditSnippet-anchorMatch.test.ts` against the
 * LKG-pinned canonical fixture. DO NOT edit without bumping the canonical
 * fixture (and the anchor-match test will tell you the moment it drifts).
 */
export const QUICK_EDIT_LOAD_PAGE_ANCHOR = 'async function loadPage() {';

/** Result of edit #1 — `loadPage` with the `export` keyword added. */
export const QUICK_EDIT_LOAD_PAGE_EXPORTED = 'export async function loadPage() {';

/**
 * Literal anchor for edit #2 — the canonical standalone `loadPage();` call.
 * The `?quick-edit` branch is inserted immediately after it. Stable string
 * pinned by `quickEditSnippet-anchorMatch.test.ts`. DO NOT edit without bumping the
 * canonical fixture.
 */
export const QUICK_EDIT_BRANCH_ANCHOR = 'loadPage();';

/**
 * Idempotency marker for edit #2. Lets `installQuickEdit` detect "branch
 * already present" without relying on the boilerplate's own substrings
 * (which could legitimately appear elsewhere). Bookends the appended branch.
 */
export const QUICK_EDIT_BRANCH_MARKER = '// === Quick Edit dynamic import (Demo Builder) ===';

/**
 * Literal anchor for edit #3 — the canonical `loadLazy` declaration. The
 * Sidekick `custom:quick-edit` listener block is inserted at the top of
 * loadLazy's body (immediately after this line). This is the listener the EW
 * canvas relies on — the canvas dispatches `custom:quick-edit` on the
 * Sidekick, and without this listener the Layout (WYSIWYG) view renders blank.
 *
 * Verified byte-identical in BOTH the pinned canonical fixture
 * (`aem-boilerplate-commerce-scripts.js:175`) and the live B2B template.
 * Pinned by `quickEditSnippet-anchorMatch.test.ts`. DO NOT edit without bumping the
 * canonical fixture.
 */
export const QUICK_EDIT_LOADLAZY_ANCHOR = 'async function loadLazy(doc) {';

/**
 * Idempotency marker for edit #3. Lets `installQuickEdit` detect "sidekick
 * listener already present" so a previously-vendored-but-incomplete repo (the
 * common case: export + IIFE present, listener missing) gets the listener
 * added on re-run, while a fully-vendored repo is left untouched.
 */
export const QUICK_EDIT_SIDEKICK_MARKER = '// === Quick Edit Sidekick listener (Demo Builder) ===';

/**
 * Literal anchor for edit #4 — the canonical `loadEager` first-section load
 * call that blocks on `waitForFirstImage`. In quick-edit mode the EW canvas
 * stalls the first paint when this wait runs, so the guard skips it there.
 *
 * Verified byte-identical in BOTH the pinned canonical fixture
 * (`aem-boilerplate-commerce-scripts.js:158`) and the live storefront. Pinned
 * by `quickEditSnippet-anchorMatch.test.ts`. DO NOT edit without bumping the canonical
 * fixture.
 */
export const QUICK_EDIT_FIRSTIMAGE_ANCHOR =
    'await loadSection(main.querySelector(\'.section\'), waitForFirstImage);';

/**
 * Idempotency marker for edit #4. Lets `installQuickEdit` detect "first-paint
 * guard already present" so a repo vendored before this edit shipped (the
 * common case: export + IIFE + listener present, guard missing) gets the guard
 * added on re-run, while a fully-vendored repo is left untouched. Also makes
 * the transform re-entrant: once present, the bare anchor is gone so the
 * replacement can't re-match.
 */
export const QUICK_EDIT_FIRSTIMAGE_MARKER =
    '// === Quick Edit first-paint guard (Demo Builder) ===';

/**
 * Replacement for edit #4 — the `loadSection` call with `waitForFirstImage`
 * wrapped in a quick-edit guard. Preserves LCP behaviour everywhere except the
 * EW canvas, where it resolves immediately so the first section paints without
 * waiting on the hero image. 4-space indented to sit inside `loadEager`.
 *
 * Verbatim shape from da.live's Quick Edit docs ("skip the first-image wait in
 * quick-edit mode"). Leads with the idempotency marker.
 */
const QUICK_EDIT_FIRSTIMAGE_GUARD = `await loadSection(main.querySelector('.section'), (section) => {
      ${QUICK_EDIT_FIRSTIMAGE_MARKER}
      // The Experience Workspace canvas stalls the first paint if loadSection
      // blocks on waitForFirstImage in quick-edit mode; skip the wait there.
      if (document.body.classList.contains('quick-edit')) return Promise.resolve();
      return waitForFirstImage(section);
    });`;

/**
 * The Sidekick `custom:quick-edit` listener block inserted at the top of
 * `loadLazy`'s body.
 *
 * Verbatim from Adobe's documented Quick Edit wiring (docs.da.live, "Option 2:
 * Existing Projects"), 2-space indented to match the file. Registers a
 * listener for the `custom:quick-edit` event the EW canvas dispatches on the
 * `aem-sidekick` element; on fire it dynamically imports the vendored Quick
 * Edit module. Handles both the Sidekick-already-present and
 * Sidekick-arrives-later cases. Leads with the idempotency marker.
 */
const QUICK_EDIT_SIDEKICK_BLOCK = `
  ${QUICK_EDIT_SIDEKICK_MARKER}
  const loadQuickEdit = async (...args) => {
    // eslint-disable-next-line import/no-cycle
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };
  const addQuickEditSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };
  const quickEditSidekick = document.querySelector('aem-sidekick');
  if (quickEditSidekick) {
    addQuickEditSidekickListeners(quickEditSidekick);
  } else {
    document.addEventListener('sidekick-ready', () => {
      addQuickEditSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }`;

/**
 * The `?quick-edit` dynamic-import branch appended to `scripts/scripts.js`.
 *
 * Faithful to the documented standalone IIFE: when the URL carries a
 * `quick-edit` query param, dynamically import the Quick Edit module and run
 * its default export. No-op on every other page. Inserted right after the
 * existing `loadPage();` call so it composes with the export edit in a
 * single file write.
 */
const QUICK_EDIT_BRANCH = `

${QUICK_EDIT_BRANCH_MARKER}
(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();
// === end Quick Edit dynamic import ===`;

/**
 * Net-new `tools/quick-edit/quick-edit.js` module body.
 *
 * Verbatim from Adobe's documented Quick Edit wiring (docs.da.live, Step 2).
 * Loads the da.live Quick Edit plugin on demand and hands it the storefront's
 * `loadPage` so it can re-render after edits. Brand-agnostic — derives the
 * mountpoint from the running hostname, so no per-storefront templating.
 */
export const QUICK_EDIT_JS = `// eslint-disable-next-line import/no-cycle
import { loadPage } from '../../scripts/scripts.js';

const importMap = {
  imports: {
    'da-lit': 'https://da.live/deps/lit/dist/index.js',
    'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
  },
};

function addImportmap() {
  const importmapEl = document.createElement('script');
  importmapEl.type = 'importmap';
  importmapEl.textContent = JSON.stringify(importMap);
  document.head.appendChild(importmapEl);
}

async function loadModule(origin, payload) {
  const { default: loadQuickEdit } = await import(\`\${origin}/nx/public/plugins/quick-edit/quick-edit.js\`);
  loadQuickEdit(payload, loadPage);
}

function generateSidekickPayload() {
  let { hostname } = window.location;
  if (hostname === 'localhost') {
    hostname = document.querySelector('meta[property="hlx:proxyUrl"]').content;
  }
  const parts = hostname.split('.')[0].split('--');
  const [, repo, owner] = parts;

  return {
    detail: {
      config: {
        mountpoint: \`https://content.da.live/\${owner}/\${repo}/\`,
      },
      location: {
        pathname: window.location.pathname,
      },
    },
  };
}

export default function init(payload) {
  const { search } = window.location;
  const ref = new URLSearchParams(search).get('quick-edit');
  let origin;
  if (ref === 'on' || !ref) origin = 'https://da.live';
  if (ref === 'local') origin = 'http://localhost:6456';
  if (!origin) origin = \`https://\${ref}--da-nx--adobe.aem.live\`;
  addImportmap();
  loadModule(origin, payload || generateSidekickPayload());
}
`;

/**
 * Apply all four `scripts/scripts.js` edits to the existing file content.
 *
 * Pure transform (no I/O). First-match-only for each edit, like the patch
 * engine, and each edit is skipped when its marker is already present (so a
 * partially-vendored file gets exactly the missing edits, never duplicates).
 * Composes the edits:
 *   1. adds `export` to `loadPage`,
 *   2. appends the `?quick-edit` dynamic-import branch after the standalone
 *      `loadPage();` call,
 *   3. inserts the Sidekick `custom:quick-edit` listener at the top of
 *      `loadLazy`'s body (the edit the EW canvas relies on),
 *   4. wraps `loadEager`'s `waitForFirstImage` call in a quick-edit guard so
 *      the first section paints immediately under the EW canvas.
 */
export function buildQuickEditScriptsJs(existing: string): string {
    const exported = existing.includes(QUICK_EDIT_LOAD_PAGE_EXPORTED)
        ? existing
        : existing.replace(QUICK_EDIT_LOAD_PAGE_ANCHOR, QUICK_EDIT_LOAD_PAGE_EXPORTED);

    const withBranch = exported.includes(QUICK_EDIT_BRANCH_MARKER)
        ? exported
        : exported.replace(
            QUICK_EDIT_BRANCH_ANCHOR,
            `${QUICK_EDIT_BRANCH_ANCHOR}${QUICK_EDIT_BRANCH}`,
        );

    const withSidekick = withBranch.includes(QUICK_EDIT_SIDEKICK_MARKER)
        ? withBranch
        : withBranch.replace(
            QUICK_EDIT_LOADLAZY_ANCHOR,
            `${QUICK_EDIT_LOADLAZY_ANCHOR}${QUICK_EDIT_SIDEKICK_BLOCK}`,
        );

    return withSidekick.includes(QUICK_EDIT_FIRSTIMAGE_MARKER)
        ? withSidekick
        : withSidekick.replace(QUICK_EDIT_FIRSTIMAGE_ANCHOR, QUICK_EDIT_FIRSTIMAGE_GUARD);
}
