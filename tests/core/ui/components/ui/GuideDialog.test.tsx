/**
 * GuideDialog: the one way a guide is drawn (dialog design rules). Large, the lead then the steps
 * as rows with their bold titles, and Close alone. The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { GuideDialog, type GuideDialogProps } from '@/core/ui/components/ui/GuideDialog';

function renderGuide(props: Partial<GuideDialogProps> = {}) {
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
});
