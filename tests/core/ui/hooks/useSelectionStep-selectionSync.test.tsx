/**
 * useSelectionStep — selected-item sync and auto-selection decisions.
 *
 * The hook does two things when a fresh list arrives that no other suite drove:
 * it HYDRATES an id-only selection (a project imported by id, with no display
 * fields) and it re-selects when the item was renamed outside the extension.
 * Both run through `needsSelectedItemSync`, which had no test at all — 24
 * mutants in that helper and its caller survived or were never covered.
 *
 * Every assertion here names the ITEM handed to `onSelect`, not just that it
 * fired: the decision under test is WHICH item wins, and a call-count assertion
 * cannot see the hook picking the wrong one.
 */

import { useSelectionStep } from './useSelectionStep.testUtils';
import { baseState, captureChannels, resetMocks } from './useSelectionStep.testUtils';

import { renderHook, act, waitFor } from '@testing-library/react';
import { WizardState } from '@/types/webview';

/** An item carrying BOTH display fields the sync helper reads. */
interface NamedItem {
    id: string;
    title?: string;
    name?: string;
}

describe('useSelectionStep - selected item sync', () => {
    const mockUpdateState = jest.fn();
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
        mockOnSelect.mockClear();
    });

    /** Render with a selection already in place, then deliver `incoming` on the items channel. */
    function deliver(
        incoming: NamedItem[],
        selectedItem: NamedItem | undefined,
        extra: Partial<Parameters<typeof useSelectionStep<NamedItem>>[0]> = {},
    ) {
        const channels = captureChannels();
        const rendered = renderHook(() =>
            useSelectionStep<NamedItem>({
                cacheKey: 'projectsCache',
                messageType: 'test-items',
                errorMessageType: 'test-error',
                state: baseState as WizardState,
                updateState: mockUpdateState,
                selectedItem,
                onSelect: mockOnSelect,
                autoLoad: false,
                ...extra,
            }),
        );

        act(() => {
            channels.handlers['test-items']?.(incoming);
        });

        return rendered;
    }

    describe('hydration and rename', () => {
        it('hydrates an id-only selection from the matching item', async () => {
            const matching = { id: '2', title: 'Second', name: 'second' };

            deliver([{ id: '1', title: 'First' }, matching], { id: '2' });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(matching);
            });
        });

        it('re-selects when the matching item title changed outside the extension', async () => {
            const renamed = { id: '1', title: 'Renamed' };

            deliver([renamed], { id: '1', title: 'Original' });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(renamed);
            });
        });

        it('re-selects when only the name changed and the title is identical', async () => {
            const renamed = { id: '1', title: 'Same', name: 'new-name' };

            deliver([renamed], { id: '1', title: 'Same', name: 'old-name' });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(renamed);
            });
        });

        it('leaves an unchanged selection alone', () => {
            deliver([{ id: '1', title: 'Same', name: 'same' }], {
                id: '1',
                title: 'Same',
                name: 'same',
            });

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('does not treat a missing incoming title as a rename', () => {
            // The incoming item carries no title at all, and its name is unchanged.
            // Nothing has moved, so nothing should be re-selected.
            deliver([{ id: '2', name: 'same' }], { id: '2', title: 'Beta', name: 'same' });

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('leaves the selection alone when no incoming item carries its id', () => {
            deliver([{ id: '9', title: 'Ninth' }], { id: '1', title: 'Original' });

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('syncs the item whose id matches, not whichever came first', async () => {
            const matching = { id: '2', title: 'Second renamed' };

            deliver([{ id: '1', title: 'First' }, matching], { id: '2', title: 'Second' });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(matching);
            });
            expect(mockOnSelect).toHaveBeenCalledTimes(1);
        });
    });

    describe('auto-selection', () => {
        it('does not auto-select a lone item unless asked to', () => {
            deliver([{ id: '1', title: 'Only' }], undefined);

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('auto-selects a lone item when autoSelectSingle is on', async () => {
            const only = { id: '1', title: 'Only' };

            deliver([only], undefined, { autoSelectSingle: true });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(only);
            });
        });

        it('does not auto-select a single item out of several', () => {
            deliver(
                [
                    { id: '1', title: 'First' },
                    { id: '2', title: 'Second' },
                    { id: '3', title: 'Third' },
                ],
                undefined,
                { autoSelectSingle: true },
            );

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('does not run custom auto-select against a single item', () => {
            const autoSelectCustom = jest.fn((items: NamedItem[]) => items[0]);

            deliver([{ id: '1', title: 'Only' }], undefined, { autoSelectCustom });

            expect(autoSelectCustom).not.toHaveBeenCalled();
            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('hands custom auto-select the whole list and selects what it returns', async () => {
            const items = [
                { id: '1', title: 'First' },
                { id: '2', title: 'Second' },
            ];
            const autoSelectCustom = jest.fn((candidates: NamedItem[]) => candidates[1]);

            deliver(items, undefined, { autoSelectCustom });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(items[1]);
            });
            expect(autoSelectCustom).toHaveBeenCalledWith(items);
        });

        it('selects nothing when custom auto-select finds no candidate', () => {
            const autoSelectCustom = jest.fn(() => undefined);

            deliver(
                [
                    { id: '1', title: 'First' },
                    { id: '2', title: 'Second' },
                ],
                undefined,
                { autoSelectCustom },
            );

            expect(autoSelectCustom).toHaveBeenCalled();
            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('does not auto-select over an existing selection', () => {
            deliver([{ id: '9', title: 'Only' }], { id: '1', title: 'Original' }, {
                autoSelectSingle: true,
            });

            expect(mockOnSelect).not.toHaveBeenCalled();
        });
    });
});
