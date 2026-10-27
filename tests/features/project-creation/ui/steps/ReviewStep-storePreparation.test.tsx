/**
 * ReviewStep — Create (or an Edit's Finish) that adds the ERP integration also applies the
 * demo setup to the store (owner, 2026-10-22), so Review says so before the SC confirms: the steps it applies,
 * and the ones that change something every website on the Commerce shares. Rendered against
 * the shipped catalog, so a catalog that stops declaring the steps fails here.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import type { WizardState } from '@/types/webview';

const BASE: Partial<WizardState> = {
    currentStep: 'review',
    projectName: 'justrite',
    selectedStack: 'headless-paas',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    componentConfigs: {},
};

function renderReview(state: Partial<WizardState>) {
    render(
        <Provider theme={defaultTheme}>
            <ReviewStep state={state as WizardState} updateState={jest.fn()} setCanProceed={jest.fn()} />
        </Provider>,
    );
}

describe('ReviewStep — the demo setup the ERP integration brings', () => {
    it('says the add applies the demo setup, naming the steps and the ones every website shares', () => {
        renderReview({ ...BASE, selectedAppBuilderComponents: ['erp-integration'] });

        const notice = screen.getByTestId('review-store-preparation');
        expect(notice).toHaveTextContent('ERP Integration also applies its demo setup to this Commerce store');
        expect(notice).toHaveTextContent('Price scope');
        expect(notice).toHaveTextContent('every website on this Commerce shares');
    });

    it('says nothing when the ERP integration is not being added', () => {
        renderReview({ ...BASE, selectedAppBuilderComponents: [] });

        expect(screen.queryByTestId('review-store-preparation')).not.toBeInTheDocument();
    });
});
