/**
 * InlineNotice: where its action sits.
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

    it('puts the action under the text with actionBelow', () => {
        renderNotice(true);

        const actions = screen.getByRole('button', { name: 'Fix it' }).closest('.inline-notice-actions');
        expect(actions?.parentElement).toHaveClass('inline-notice-body');
    });
});
