/**
 * Share's notes have their room from the first frame (rules 13 and 14; step-07 follow-up): a note
 * that arrives after the form opens (why the details file was left alone, what the undo did, the
 * undo itself once a save made one, what Save File wrote, "Select at least one part.") is drawn in
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
    return Array.from(document.querySelectorAll('.modal-steps-ghost')) as HTMLElement[];
}

beforeEach(resetShareMocks);

describe('ShareModal: room for its notes from the first frame', () => {
    it('reserves nothing on the choice step', async () => {
        await renderShare();

        expect(reserved()).toHaveLength(0);
    });

    it("reserves only the link form, with its press note, the undo, and what the undo did", async () => {
        await renderShareLink();
        expect(reserved()).toHaveLength(1);
        const link = reserved()[0];

        expect(within(link).getByTestId('share-skipped')).toBeInTheDocument();
        expect(within(link).getByText('Remove the Details from My Repository')).toBeInTheDocument();
        expect(within(link).getByTestId('share-removed')).toBeInTheDocument();
        expect(link.querySelector('[data-testid="export-file-form"]')).toBeNull();
    });

    it("reserves only the file form, with its two lines: nothing ticked, and what Save File wrote", async () => {
        await renderShareFile();
        expect(reserved()).toHaveLength(1);
        const file = reserved()[0];

        expect(within(file).getByText('Select at least one part.')).toBeInTheDocument();
        expect(within(file).getByTestId('export-saved')).toBeInTheDocument();
        expect(file.querySelector('[data-testid="share-link"]')).toBeNull();
    });
});
