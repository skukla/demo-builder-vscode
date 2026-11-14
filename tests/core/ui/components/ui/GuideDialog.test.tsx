/**
 * GuideDialog: the one way a guide is drawn (dialog design rules). Large, the lead then the steps
 * as rows with their bold titles, and Close alone. The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { GuideDialog, type GuideDialogProps } from '@/core/ui/components/ui/GuideDialog';

/** The one-column guide's props: the two-column option is drawn by its own helper below. */
type OneColumnProps = Extract<GuideDialogProps, { steps: unknown }>;

function renderGuide(props: Partial<OneColumnProps> = {}) {
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <GuideDialog
                isOpen
                title="Set Up Payment on Account"
                lead="Lets companies pay on credit."
                steps={[
                    { status: 'success', label: 'Turn It On', detail: 'Stores > Configuration > Sales' },
                    { status: 'pending', label: 'Set a Limit' },
                ]}
                onClose={onClose}
                {...props}
            />
        </Provider>,
    );
    return { onClose };
}

describe('GuideDialog', () => {
    it('renders nothing while closed', () => {
        renderGuide({ isOpen: false });

        expect(screen.queryByText('Set Up Payment on Account')).toBeNull();
    });

    it('is large, the lead then the steps as rows', () => {
        renderGuide();

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'L');
        const stack = document.querySelector('.dialog-stack');
        expect(stack?.firstElementChild).toHaveClass('lead-text');
        const steps = Array.from(document.querySelectorAll('.dialog-stack > ul.work-row-list > li'));
        expect(steps).toHaveLength(2);
        expect(steps[0]).toHaveTextContent('Turn It On');
        expect(steps[0]).toHaveTextContent('Stores > Configuration > Sales');
        expect(steps[1]).toHaveTextContent('Set a Limit');
    });

    it('CONTROL: draws no lead when given none', () => {
        renderGuide({ lead: undefined });

        expect(document.querySelector('.lead-text')).toBeNull();
        expect(document.querySelector('.dialog-stack')?.firstElementChild).toHaveClass('work-row-list');
    });

    it('offers Close alone, and Close closes', () => {
        const { onClose } = renderGuide();

        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Close']);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('draws a step\'s own buttons beside its row, main last, each calling its own handler', () => {
        const onOpen = jest.fn();
        const onCheck = jest.fn();
        renderGuide({
            steps: [
                { status: 'success', label: 'Turn It On' },
                {
                    status: 'pending',
                    label: 'Set a Limit',
                    actions: [
                        { label: 'Open Admin', variant: 'secondary', onPress: onOpen },
                        { label: 'Check', variant: 'accent', onPress: onCheck },
                    ],
                },
            ],
        });

        const steps = Array.from(document.querySelectorAll('.work-row-list > li'));
        expect(steps[0].querySelector('.guide-step-actions')).toBeNull();
        const buttons = Array.from(steps[1].querySelectorAll('.guide-step-actions [role="button"]'));
        expect(buttons.map((button) => button.textContent)).toEqual(['Open Admin', 'Check']);
        fireEvent.click(screen.getByRole('button', { name: 'Check' }));
        expect(onCheck).toHaveBeenCalledTimes(1);
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('puts the window\'s one action beside Close, after it', () => {
        const onApply = jest.fn();
        renderGuide({ action: { label: 'Apply All', variant: 'accent', onPress: onApply } });

        const footer = Array.from(document.querySelectorAll('.modal-footer-actions [role="button"]'));
        expect(footer.map((button) => button.textContent)).toEqual(['Close', 'Apply All']);
        fireEvent.click(screen.getByRole('button', { name: 'Apply All' }));
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('draws a step whole when it is more than a row, its label unshown', () => {
        renderGuide({ steps: [{ label: 'pack-root', drawn: <p>Root Category: ZZ Root</p> }] });

        expect(screen.getByText('Root Category: ZZ Root')).toBeInTheDocument();
        expect(screen.queryByText('pack-root')).toBeNull();
    });

    it('holds the height it opens at', () => {
        renderGuide();

        expect(document.querySelector('.modal-dialog')).toHaveClass('is-locked');
    });

    // Step-07 Win4: the demo setup guide's shape, as a Guide option. The step list on the left,
    // the chosen step on the right, what acts on the list at the footer's start, the chosen
    // step's buttons on the right, wide.
    describe('in two columns', () => {
        function renderColumns() {
            const onCheckAll = jest.fn();
            const onOpen = jest.fn();
            render(
                <Provider theme={defaultTheme}>
                    <GuideDialog
                        isOpen
                        columns="two"
                        title="Demo Setup: ERP"
                        list={<ul data-testid="steps"><li>Turn It On</li></ul>}
                        chosen={<p data-testid="chosen">Stores &gt; Configuration</p>}
                        listActions={[{ label: 'Check All Steps', variant: 'secondary', onPress: onCheckAll }]}
                        stepActions={[{ label: 'Open Commerce Admin', variant: 'accent', onPress: onOpen }]}
                        onClose={jest.fn()}
                    />
                </Provider>,
            );
            return { onCheckAll, onOpen };
        }

        it('draws the list on the left and the chosen step on the right, wide', () => {
            renderColumns();

            const columns = document.querySelector('.guide-columns') as HTMLElement;
            expect(columns.children[0]).toHaveClass('guide-columns-list');
            expect(columns.children[0]).toContainElement(screen.getByTestId('steps'));
            expect(columns.children[1]).toContainElement(screen.getByTestId('chosen'));
            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'L');
            expect(screen.getByRole('dialog')).toHaveClass('modal-wide');
        });

        it("puts the list's buttons at the footer start and the step's beside Close", () => {
            const { onCheckAll } = renderColumns();

            expect(document.querySelector('.modal-footer-start')).toHaveTextContent('Check All Steps');
            const footer = Array.from(document.querySelectorAll('.modal-footer-actions [role="button"]'));
            expect(footer.map((button) => button.textContent)).toEqual(['Check All Steps', 'Close', 'Open Commerce Admin']);
            fireEvent.click(screen.getByRole('button', { name: 'Check All Steps' }));
            expect(onCheckAll).toHaveBeenCalledTimes(1);
        });

        it('holds the height it opens at', () => {
            renderColumns();

            expect(document.querySelector('.modal-dialog')).toHaveClass('is-locked');
        });
    });
});
