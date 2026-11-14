/**
 * Share's notes have their room from the first frame (rules 13 and 14; step-07 follow-up): a note
 * that arrives after the window opens (why the details file was left alone, what the undo did, the
 * undo itself once a save made one, what Save File wrote, "Select at least one part.") is drawn in
 * the hidden steps the window measures as it opens (`reserve`), so the held window never scrolls
 * for it.
 *
 * The height is held in the first layout effect, after which the hidden steps go, so this suite
 * keeps the window measuring (`useFixedHeight` never locks) to read what was reserved.
 */

jest.mock('@/core/ui/components/ui/useFixedHeight', () => ({
    useFixedHeight: () => ({ ref: { current: null }, locked: false }),
}));

import { within } from '@testing-library/react';
import { renderShare, resetShareMocks } from './ShareModal.testUtils';

/** The hidden steps the window measured as it opened, one per form. */
function reserved(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.modal-steps-ghost')) as HTMLElement[];
}

beforeEach(resetShareMocks);

describe('ShareModal: room for its notes from the first frame', () => {
    it('reserves both forms', async () => {
        await renderShare();

        expect(reserved()).toHaveLength(2);
    });

    it("reserves the link form's press note, the undo, and what the undo did", async () => {
        await renderShare();
        const link = reserved().find((step) => step.querySelector('[data-testid="share-link"]')) as HTMLElement;

        expect(within(link).getByTestId('share-skipped')).toBeInTheDocument();
        expect(within(link).getByText('Remove the Details from My Repository')).toBeInTheDocument();
        expect(within(link).getByTestId('share-removed')).toBeInTheDocument();
    });

    it("reserves the file form's two lines: nothing ticked, and what Save File wrote", async () => {
        await renderShare();
        const file = reserved().find((step) => step.querySelector('[data-testid="export-file-form"]')) as HTMLElement;

        expect(within(file).getByText('Select at least one part.')).toBeInTheDocument();
        expect(within(file).getByTestId('export-saved')).toBeInTheDocument();
    });
});
