/**
 * Which surface does a piece of webview text belong to? (PL-66)
 *
 * The UI tier cannot pick a webview frame by name: ExTester chooses by geometry,
 * and on 2026-09-08 that let the sidebar test read the wizard and pass. So every
 * read is checked against the surface it claims to be:
 *
 *   - `marker`  a phrase only that surface shows. Until it appears the frame is
 *               NOT READY — which is also how a loading spinner is waited out
 *               ("Loading Project Creation Wizard" carries no marker).
 *   - another surface's marker present means the test is reading the WRONG
 *               FRAME. That fails at once; waiting would not fix it.
 *
 * Markers are read from the source, not guessed:
 *   sidebar  'Utilities'       src/features/sidebar/ui/views/UtilityBar.tsx
 *   wizard   'Setup Progress'  WizardContainer.tsx `headerText` (CSS upper-cases
 *                              it on screen, so matching ignores case)
 *
 * Plain CommonJS because the mocha files ExTester runs are plain JS; the jest
 * test in `__control__/uiSurfaceText.control.test.ts` is what keeps it honest.
 * It lives in helpers/ rather than beside the UI tests because jest suites must
 * sit in a src/ mirror or a listed directory (tests/sop/mirror-placement.test.ts).
 */

const SURFACES = {
    sidebar: 'Utilities',
    wizard: 'Setup Progress',
};

/**
 * @param {string} text  what the frame's <body> rendered
 * @param {string} surface  a key of SURFACES
 * @returns {{ state: 'ready' | 'not-ready' | 'wrong-surface', reason: string }}
 */
function surfaceVerdict(text, surface) {
    const marker = SURFACES[surface];
    if (!marker) {
        throw new Error(`unknown surface "${surface}" — known: ${Object.keys(SURFACES).join(', ')}`);
    }
    const lower = text.toLowerCase();
    const foreign = Object.keys(SURFACES).find(
        (other) => other !== surface && lower.includes(SURFACES[other].toLowerCase()),
    );
    if (foreign) {
        return {
            state: 'wrong-surface',
            reason: `expected the ${surface} but the frame shows the ${foreign} ("${SURFACES[foreign]}")`,
        };
    }
    if (!lower.includes(marker.toLowerCase())) {
        return { state: 'not-ready', reason: `the ${surface} has not shown "${marker}" yet` };
    }
    return { state: 'ready', reason: `the ${surface} shows "${marker}"` };
}

module.exports = { SURFACES, surfaceVerdict };
