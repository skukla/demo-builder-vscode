/**
 * InlineNotice: where its action sits, and a title-only notice.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';

function renderNotice(actionBelow?: boolean) {
    return render(
        <Provider theme={defaultTheme}>
            <InlineNotice title="Needs attention" action={<button>Fix it</button>} actionBelow={actionBelow}>
                A long explanation.
            </InlineNotice>
        </Provider>,
    );
}

describe('InlineNotice', () => {
    it('puts the action beside the text by default', () => {
        renderNotice();

        const actions = screen.getByRole('button', { name: 'Fix it' }).closest('.inline-notice-actions');
        expect(actions?.parentElement).toHaveClass('inline-notice');
    });

    it('renders a title alone as one line, with no empty body line under it', () => {
        render(
            <Provider theme={defaultTheme}>
                <InlineNotice title="Guests won't see any products in this store view." testId="one-line" />
            </Provider>,
        );

        const notice = screen.getByTestId('one-line');
        expect(notice).toHaveTextContent("Guests won't see any products in this store view.");
        expect(notice.querySelector('.status-text')).toBeNull();
    });

    it('draws the success tone green, apart from info', () => {
        render(
            <Provider theme={defaultTheme}>
                <InlineNotice title="Done" tone="success" testId="ok" />
                <InlineNotice title="Note" tone="info" testId="note" />
            </Provider>,
        );

        expect(screen.getByTestId('ok')).toHaveClass('inline-notice--success');
        expect(screen.getByTestId('ok')).not.toHaveClass('inline-notice--info');
        // CONTROL: info keeps its own modifier.
        expect(screen.getByTestId('note')).toHaveClass('inline-notice--info');
    });

    it('puts the action under the text with actionBelow', () => {
        renderNotice(true);

        const actions = screen.getByRole('button', { name: 'Fix it' }).closest('.inline-notice-actions');
        expect(actions?.parentElement).toHaveClass('inline-notice-body');
    });
});
