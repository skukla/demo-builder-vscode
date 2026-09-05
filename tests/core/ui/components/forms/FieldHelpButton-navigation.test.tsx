/**
 * Walking through a multi-step help dialog.
 *
 * The footer is the whole contract: which step is showing, which way you can
 * move from it, and whether the accent button says there is more to come. All
 * three are computed from one index, so an off-by-one shows up as a step the
 * user cannot reach or a "Done" that is not.
 */
import React from 'react';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../../helpers/react-test-utils';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';

const THREE_STEPS = {
    title: 'Three Steps',
    steps: [{ text: 'the first step' }, { text: 'the second step' }, { text: 'the third step' }],
};

function counter(): string {
    return document.querySelector('.step-counter')?.textContent ?? '';
}

function button(name: RegExp): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
}

async function openHelp(settled: string) {
    fireEvent.click(screen.getByRole('button', { name: /Help for Test Field/i }));
    await waitFor(() => {
        expect(screen.getByText(settled)).toBeInTheDocument();
    });
}

async function press(name: RegExp, settled: string) {
    fireEvent.click(button(name));
    await waitFor(() => {
        expect(screen.getByText(settled)).toBeInTheDocument();
    });
}

describe('FieldHelpButton step navigation', () => {
    describe('the first step', () => {
        beforeEach(async () => {
            renderWithProviders(<FieldHelpButton help={THREE_STEPS} fieldLabel="Test Field" />);
            await openHelp('the first step');
        });

        it('counts from one, not from the index it stores', () => {
            expect(counter()).toBe('Step 1 of 3');
        });

        it('offers no way back, because there is nothing behind it', () => {
            expect(button(/Previous/i)).toBeDisabled();
        });

        it('offers a way forward', () => {
            expect(button(/Next/i)).toBeEnabled();
        });

        // "Done" on the first of three would claim the user has read them all.
        it('labels the accent button "Got it", not "Done"', () => {
            expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^Done$/i })).not.toBeInTheDocument();
        });

        it('advances exactly one step at a time', async () => {
            await press(/Next/i, 'the second step');

            expect(counter()).toBe('Step 2 of 3');
            expect(screen.queryByText('the first step')).not.toBeInTheDocument();
            expect(button(/Previous/i)).toBeEnabled();
        });
    });

    describe('the last step', () => {
        beforeEach(async () => {
            renderWithProviders(<FieldHelpButton help={THREE_STEPS} fieldLabel="Test Field" />);
            await openHelp('the first step');
            await press(/Next/i, 'the second step');
            await press(/Next/i, 'the third step');
        });

        it('has arrived at the end, and says so', () => {
            expect(counter()).toBe('Step 3 of 3');
        });

        it('offers no way forward, because there is nothing ahead of it', () => {
            expect(button(/Next/i)).toBeDisabled();
        });

        it('labels the accent button "Done"', () => {
            expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Got it/i })).not.toBeInTheDocument();
        });

        it('steps back exactly one at a time', async () => {
            await press(/Previous/i, 'the second step');

            expect(counter()).toBe('Step 2 of 3');
            expect(button(/Next/i)).toBeEnabled();
        });

        /**
         * The dialog is reopened far more often than it is read to the end, and
         * a reopen that resumed mid-sequence would look like content is missing.
         */
        it('starts again from the first step when reopened', async () => {
            fireEvent.click(screen.getByRole('button', { name: /Done/i }));

            await openHelp('the first step');

            expect(counter()).toBe('Step 1 of 3');
        });
    });

    /**
     * One step is not a sequence: no counter, no navigation, and the accent
     * button is the only way out.
     */
    describe('a single step', () => {
        beforeEach(async () => {
            renderWithProviders(
                <FieldHelpButton
                    help={{ title: 'One Step', steps: [{ text: 'the only step' }] }}
                    fieldLabel="Test Field"
                />,
            );
            await openHelp('the only step');
        });

        it('shows no step counter', () => {
            expect(document.querySelector('.step-counter')).not.toBeInTheDocument();
        });

        it('shows neither Previous nor Next', () => {
            expect(screen.queryByRole('button', { name: /Previous/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
        });

        // Nothing was stepped through, so nothing was "Done".
        it('labels the accent button "Got it"', () => {
            expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^Done$/i })).not.toBeInTheDocument();
        });
    });
});
