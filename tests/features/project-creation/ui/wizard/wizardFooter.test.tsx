/**
 * `WizardFooter`: the wizard's shared Cancel / Back / Continue row — which
 * buttons show, when they are disabled, what Continue is called, and that each
 * reaches its handler.
 *
 * Rendered on its own under real Spectrum. The WizardContainer layout and
 * navigation suites still drive the same footer through the wizard.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { press } from '../../../../helpers/reactSettle';
import { WizardFooter } from '@/features/project-creation/ui/wizard/wizardFooter';

type FooterProps = React.ComponentProps<typeof WizardFooter>;

const BASE: FooterProps & { onCancel: jest.Mock; onBack: jest.Mock; onNext: jest.Mock } = {
    canGoBack: false,
    canProceed: true,
    isConfirmingSelection: false,
    currentStepIndex: 0,
    stepCount: 5,
    wizardMode: 'create',
    currentStep: 'welcome',
    onCancel: jest.fn(),
    onBack: jest.fn(),
    onNext: jest.fn(),
};

const renderFooter = (overrides: Partial<FooterProps> = {}) =>
    render(
        <Provider theme={defaultTheme} colorScheme="dark">
            <WizardFooter {...BASE} {...overrides} />
        </Provider>
    );

describe('WizardFooter', () => {
    beforeEach(() => {
        BASE.onCancel.mockReset();
        BASE.onBack.mockReset();
        BASE.onNext.mockReset();
    });

    it('shows Cancel and Continue, and no Back, on the first step', () => {
        renderFooter();

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });

    it('shows Back once there is somewhere to go back to', () => {
        renderFooter({ canGoBack: true });

        expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    });

    it('disables Continue while the step says it cannot be left', () => {
        renderFooter({ canProceed: false });

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    it('disables every button while a selection is being confirmed', () => {
        renderFooter({ canGoBack: true, isConfirmingSelection: true });

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('calls Continue "Create" on the review step and "Save Changes" when editing', () => {
        const { unmount } = renderFooter({ currentStepIndex: 3, currentStep: 'review' });
        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
        unmount();

        renderFooter({ currentStepIndex: 3, currentStep: 'review', wizardMode: 'edit' });
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('reaches each handler from its button', async () => {
        renderFooter({ canGoBack: true });

        await press(screen.getByRole('button', { name: 'Cancel' }));
        await press(screen.getByRole('button', { name: 'Back' }));
        await press(screen.getByRole('button', { name: 'Continue' }));

        expect(BASE.onCancel).toHaveBeenCalledTimes(1);
        expect(BASE.onBack).toHaveBeenCalledTimes(1);
        expect(BASE.onNext).toHaveBeenCalledTimes(1);
    });
});
