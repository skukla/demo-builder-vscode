/**
 * Share's notes have their room from the first frame (rules 13 and 14; step-07 follow-up): a note
 * that arrives after the form opens (why the details file was left alone) is drawn in
 * the hidden step the window measures as it opens (`reserve`), so the held window never scrolls
 * for it. Since walk F228 each step is its own window, so only the chosen form is reserved, and
 * the choice step reserves nothing.
 *
 * The height is held in the first layout effect, after which the hidden steps go, so this suite
 * keeps the window measuring (`useFixedHeight` never locks) to read what was reserved.
 */

jest.mock('@/core/ui/components/ui/useFixedHeight', () => ({
    useFixedHeight: () => ({ ref: { current: null }, locked: false }),
}));

import { within } from '@testing-library/react';
import { renderShare, renderShareFile, renderShareLink, resetShareMocks } from './ShareModal.testUtils';

/** The hidden steps the window measured as it opened. */
function reserved(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.modal-steps-ghost'));
}

beforeEach(resetShareMocks);

describe('ShareModal: room for its notes from the first frame', () => {
    it('reserves nothing on the choice step', async () => {
        await renderShare();

        expect(reserved()).toHaveLength(0);
    });

    // Walk F232 kept one hidden copy per state a press can leave. Since EDS-72 the undo is Save as
    // Package's, so a press leaves one state: the note on what became of the save.
    it('reserves only the link form, with the note a press can leave, and no undo', async () => {
        await renderShareLink();
        expect(reserved()).toHaveLength(1);
        const [pressed] = reserved();

        expect(within(pressed).getByTestId('share-skipped')).toBeInTheDocument();
        expect(within(pressed).queryByText(/Remove/)).toBeNull();
        expect(pressed.querySelector('[data-testid="export-file-form"]')).toBeNull();
    });

    // Walk F238 (owner: "quite large for its content"): the file form holds no room. Nothing ticked
    // greys Save File, and how a save ended, either way, is the result window (F236), so no line
    // ever arrives under the boxes and the window fits them.
    it('reserves nothing for the file form: no line arrives under its boxes', async () => {
        await renderShareFile();
        expect(reserved()).toHaveLength(0);
    });
});
