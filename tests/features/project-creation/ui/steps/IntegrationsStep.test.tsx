/**
 * IntegrationsStep Tests (R1 — group-paced Step 5)
 *
 * R1 lands the Integrations group step as a MINIMAL placeholder: it exists in the
 * flow (gated `requiresAdobeAuth` so it appears only when the project has an App
 * Builder component) and never blocks Continue. The tiled typed-Add surface +
 * per-item config + Create gate arrive in R2. These tests pin the placeholder
 * contract: it renders an explanatory panel and reports a non-blocking gate.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import type { WizardState } from '@/types/webview';

const baseState = { currentStep: 'integrations' } as unknown as WizardState;

function renderStep(overrides: Partial<React.ComponentProps<typeof IntegrationsStep>> = {}) {
    const setCanProceed = jest.fn();
    render(
        <IntegrationsStep
            state={baseState}
            updateState={jest.fn()}
            setCanProceed={setCanProceed}
            {...overrides}
        />,
    );
    return { setCanProceed };
}

describe('IntegrationsStep (R1 placeholder)', () => {
    it('renders an explanatory panel', () => {
        renderStep();
        expect(screen.getByRole('heading', { name: /integrations/i })).toBeInTheDocument();
        expect(screen.getByText(/provisioned automatically at creation/i)).toBeInTheDocument();
    });

    it('reports a non-blocking gate (setCanProceed(true)) on mount', () => {
        const { setCanProceed } = renderStep();
        expect(setCanProceed).toHaveBeenCalledWith(true);
    });
});
