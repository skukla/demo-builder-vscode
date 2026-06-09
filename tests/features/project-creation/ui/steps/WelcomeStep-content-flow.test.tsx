/**
 * WelcomeStep — content-SC "Join" flow suppresses the brand gallery (Step 4c.4).
 *
 * When seeded with flow:'content' + upstream, the joiner inherits brand + architecture,
 * so the brand-pick gallery is replaced by a read-only "you're joining X" summary; the
 * joiner only names their own site. canProceed still works (package + stack are seeded).
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { WizardState } from '@/types/webview';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({ useSelectableDefault: () => ({}) }));

const packages = [
    { id: 'default', name: 'Default', description: 'Generic', icon: 'default', configDefaults: {}, storefronts: {} },
    { id: 'citisignal', name: 'CitiSignal', description: 'Telco', icon: 'citisignal', configDefaults: {}, storefronts: {} },
] as unknown as DemoPackage[];
const stacks = [{ id: 'eds-accs', name: 'Edge Delivery + ACCS', description: '', icon: 'eds', frontend: 'eds-storefront', backend: 'adobe-commerce-accs', dependencies: [], features: [] }] as unknown as Stack[];

const contentState = {
    currentStep: 'welcome',
    projectName: 'my-site',
    wizardMode: 'create',
    flow: 'content',
    upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
    selectedPackage: 'citisignal',
    selectedStack: 'eds-accs',
    componentConfigs: {},
    adobeAuth: { isAuthenticated: false, isChecking: false },
} as unknown as WizardState;

const renderStep = (state: WizardState, setCanProceed = jest.fn()) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <WelcomeStep state={state} updateState={jest.fn()} setCanProceed={setCanProceed} packages={packages} stacks={stacks} />
        </Provider>,
    );

describe('WelcomeStep — content (Join) flow', () => {
    it('suppresses the brand gallery and shows the inherited-brand summary', () => {
        renderStep(contentState);
        // The inherited summary (unique to the content view) is shown...
        expect(screen.getByText(/citisignal-upstream/)).toBeInTheDocument();
        expect(screen.getByText(/joining/i)).toBeInTheDocument();
        // ...and the gallery's other package cards are NOT rendered (gallery suppressed).
        expect(screen.queryByText('Default')).not.toBeInTheDocument();
    });

    it('still lets the joiner name their own site (project name field present)', () => {
        renderStep(contentState);
        expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    });

    it('can proceed (package + stack are seeded; only the name is user-entered)', () => {
        const setCanProceed = jest.fn();
        renderStep(contentState, setCanProceed);
        expect(setCanProceed).toHaveBeenCalledWith(true);
    });

    it('commerce flow (no upstream) still renders the brand gallery', () => {
        const commerceState = { ...contentState, flow: undefined, upstream: undefined } as unknown as WizardState;
        renderStep(commerceState);
        expect(screen.getByText('Default')).toBeInTheDocument(); // gallery cards present
    });
});
