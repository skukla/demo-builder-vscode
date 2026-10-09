/**
 * The minimal canonical-shaped `scripts/scripts.js` both Quick Edit suites
 * transform: `quickEditSnippet.test.ts` (the pure transform) and
 * `quickEditPublisher.test.ts` (the GitHub installer).
 */

import { QUICK_EDIT_FIRSTIMAGE_ANCHOR } from '@/features/eds/services/quickEditSnippet';

// Minimal canonical-shaped scripts.js: the loadLazy + loadPage declarations
// plus the standalone `loadPage();` call. Mirrors the pinned boilerplate's
// shape without pulling the whole 220-line file into the unit test (the full
// file is asserted by quickEditSnippet-anchorMatch.test.ts).
export const CANONICAL_SCRIPTS_JS: string = [
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
