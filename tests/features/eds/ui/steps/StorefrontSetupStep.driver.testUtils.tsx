/**
 * Driver shared by the StorefrontSetupStep behaviour suites.
 *
 * The pre-existing `StorefrontSetupStep.testUtils.tsx` deliberately holds only
 * the mocks EVERY spec already agreed on, and leaves `@/core/ui/utils/vscode-api`
 * inline because the two older specs fake it differently. The suites added for
 * the PL-22 burn-down all need the SAME vscode fake — one that records posts and
 * hands back the registered push handlers — so it lives here once instead of
 * three times.
 *
 * The step's only observable outputs are (a) what it renders and (b) what it
 * posts, so every assertion in these suites reads one of those two. The typed
 * `push*` helpers exist so a payload that does not match the real wire interface
 * fails `npm run typecheck:tests` rather than a screen.
 */

import { render, act } from '@testing-library/react';
import React from 'react';

const mockPostMessage = jest.fn();
const mockMessageHandlers = new Map<string, (data: unknown) => void>();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (type: string, payload?: unknown) => mockPostMessage(type, payload),
        onMessage: (type: string, handler: (data: unknown) => void) => {
            mockMessageHandlers.set(type, handler);
            return () => mockMessageHandlers.delete(type);
        },
    },
}));

// Imports sit below the mocks on purpose: ts-jest hoists `jest.mock` above the
// imports OF THIS MODULE only, so the component must be pulled in through the
// shared testUtils (which owns the Spectrum mocks) after this file's own mock
// is registered. `import/first` is not a configured rule here, so there is
// nothing to disable.
import { StorefrontSetupStep } from './StorefrontSetupStep.testUtils';
import type { EDSConfig, WizardState } from '@/types/webview';
import type {
    StorefrontGitHubAppRequiredPayload,
    StorefrontSetupCompletePayload,
    StorefrontSetupErrorPayload,
    StorefrontSetupProgressPayload,
} from '@/types/webviewPayloads';
import type {
    StorefrontSetupCancelPayload,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';

/** A config that satisfies the start request's required fields. */
export const COMPLETE_EDS_CONFIG: EDSConfig = {
    accsHost: 'https://accs.example.com',
    storeViewCode: 'default',
    customerGroup: 'general',
    repoName: 'test-repo',
    daLiveOrg: 'test-org',
    daLiveSite: 'test-site',
};

export function makeWizardState(overrides: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'storefront-setup',
        projectName: 'test-project',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        edsConfig: COMPLETE_EDS_CONFIG,
        ...overrides,
    };
}

export interface RenderStepOptions {
    state?: Partial<WizardState>;
    updateState?: (updates: Partial<WizardState>) => void;
    setCanProceed?: (canProceed: boolean) => void;
    onBack?: () => void;
    /** Render inside StrictMode, which double-invokes mount effects. */
    strict?: boolean;
}

export function renderStep(opts: RenderStepOptions = {}) {
    const updateState = opts.updateState ?? jest.fn();
    const setCanProceed = opts.setCanProceed ?? jest.fn();
    const onBack = opts.onBack ?? jest.fn();

    const element = (
        <StorefrontSetupStep
            state={makeWizardState(opts.state)}
            updateState={updateState}
            onBack={onBack}
            setCanProceed={setCanProceed}
        />
    );
    const view = render(opts.strict ? <React.StrictMode>{element}</React.StrictMode> : element);

    /** Re-render with a different state or a different callback identity. */
    const rerenderWith = (next: RenderStepOptions = {}): void => {
        view.rerender(
            <StorefrontSetupStep
                state={makeWizardState(next.state ?? opts.state)}
                updateState={next.updateState ?? updateState}
                onBack={next.onBack ?? onBack}
                setCanProceed={next.setCanProceed ?? setCanProceed}
            />,
        );
    };

    return { ...view, updateState, setCanProceed, onBack, rerenderWith };
}

function dispatch(type: string, payload: unknown): void {
    const handler = mockMessageHandlers.get(type);
    if (!handler) throw new Error(`No handler registered for '${type}'`);
    act(() => handler(payload));
}

export const pushProgress = (payload: StorefrontSetupProgressPayload): void =>
    dispatch('storefront-setup-progress', payload);
export const pushComplete = (payload: StorefrontSetupCompletePayload): void =>
    dispatch('storefront-setup-complete', payload);
export const pushError = (payload: StorefrontSetupErrorPayload): void =>
    dispatch('storefront-setup-error', payload);
export const pushGitHubAppRequired = (payload: StorefrontGitHubAppRequiredPayload): void =>
    dispatch('storefront-setup-github-app-required', payload);

function payloadsOfType(type: string): unknown[] {
    return mockPostMessage.mock.calls
        .filter((call: unknown[]) => call[0] === type)
        .map((call: unknown[]) => call[1]);
}

export const startPayloads = (): StorefrontSetupStartPayload[] =>
    payloadsOfType('storefront-setup-start') as StorefrontSetupStartPayload[];
export const cancelPayloads = (): StorefrontSetupCancelPayload[] =>
    payloadsOfType('storefront-setup-cancel') as StorefrontSetupCancelPayload[];

/** Message types the step currently has a live subscription for. */
export const subscribedMessageTypes = (): string[] => [...mockMessageHandlers.keys()].sort();

export function resetDriver(): void {
    mockPostMessage.mockClear();
    mockMessageHandlers.clear();
}
