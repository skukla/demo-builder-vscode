/**
 * Add a Demo's windows (step-07 Win3; owner 2026-11-14, "Back on track"): the first stage is a
 * Steps window holding the height it opens at, both ways in (a link, a zip) reserved so switching
 * never grows it; what was found is much taller, so it opens as a window of its own at its own
 * size, unseen while the link is read. Back sits at the footer's start.
 *
 * jsdom has no layout, so the heights are a visual check (screenshots owed); this pins which stage
 * opens a new window (a new dialog element) and that each holds its height (`is-locked`).
 */

import { screen } from '@testing-library/react';
import {
    chooseWay,
    click,
    footerButtons,
    probeWith,
    READ,
    renderModal,
    resetModalMocks,
} from './AddDemoModal.testUtils';

const dialog = (): HTMLElement => screen.getByRole('dialog');

beforeEach(resetModalMocks);

describe('AddDemoModal: its windows', () => {
    it('puts Back at the footer start, before Cancel and Continue', () => {
        renderModal();

        expect(document.querySelector('.modal-footer-start')).toHaveTextContent('Back');
        expect(footerButtons()).toEqual(['Back', 'Cancel', 'Continue']);
    });

    it('holds the first stage at the height it opens at, through a change of way', async () => {
        renderModal();
        const first = dialog();
        expect(first).toHaveClass('is-locked');

        await chooseWay('zip');

        expect(dialog()).toBe(first);
        expect(first).toHaveClass('is-locked');
    });

    it('opens what was found as a window of its own, holding its own height', async () => {
        renderModal();
        const first = dialog();

        await probeWith({ success: true, result: READ });

        expect(screen.getByTestId('demo-description')).toBeInTheDocument();
        expect(dialog()).not.toBe(first);
        expect(dialog()).toHaveClass('is-locked');
    });

    it('goes Back to a first window of its own', async () => {
        renderModal();
        await probeWith({ success: true, result: READ });
        const found = dialog();

        await click('Back');

        expect(dialog()).not.toBe(found);
        expect(screen.getByPlaceholderText('https://github.com/name/demo')).toBeInTheDocument();
    });
});
