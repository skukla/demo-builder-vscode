/**
 * StorefrontSetupStep — start-guard coverage.
 *
 * The `storefront-setup-start` request REQUIRES a complete EDS config
 * (repoName + daLiveOrg + daLiveSite). The wizard's Continue gate makes an
 * incomplete config unreachable in practice, which is exactly the kind of
 * branch that rots silently — so this pins the sender's edge conversion
 * (`toStartEdsConfig`): refuse with a visible error instead of posting a
 * payload the handler would reject.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ---- Spectrum + icon mocks (only what the tree renders) ----
jest.mock('@adobe/react-spectrum', () => ({
    Text: ({ children }: any) => <span>{children}</span>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
}));
jest.mock('@spectrum-icons/workflow/AlertCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-alert" />,
}));
jest.mock('@spectrum-icons/workflow/CheckmarkCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-check" />,
}));
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: any) => <div data-testid="loading">{message}</div>,
}));
jest.mock('@/core/ui/components/layout/CenteredFeedbackContainer', () => ({
    CenteredFeedbackContainer: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/core/ui/components/layout/SingleColumnLayout', () => ({
    SingleColumnLayout: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/features/eds/ui/components', () => ({
    GitHubAppInstallDialog: () => <div data-testid="github-app-dialog" />,
}));

// ---- vscode-api mock: record posts ----
const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (type: string, payload?: unknown) => mockPostMessage(type, payload),
        onMessage: () => () => undefined,
    },
}));

import { StorefrontSetupStep } from '@/features/eds/ui/steps/StorefrontSetupStep';
import type { WizardState } from '@/types/webview';

const makeState = (edsConfig: WizardState['edsConfig']): WizardState => ({
    currentStep: 'storefront-setup',
    projectName: 'test-project',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    edsConfig,
});

function renderStep(edsConfig: WizardState['edsConfig']) {
    return render(
        <StorefrontSetupStep
            state={makeState(edsConfig)}
            updateState={jest.fn()}
            onBack={jest.fn()}
            setCanProceed={jest.fn()}
        />
    );
}

beforeEach(() => {
    mockPostMessage.mockClear();
});

describe('StorefrontSetupStep — start guard', () => {
    it('posts storefront-setup-start when the config is complete (positive control)', () => {
        renderStep({
            accsHost: 'https://accs.example.com',
            storeViewCode: 'default',
            customerGroup: 'general',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
        });

        expect(mockPostMessage).toHaveBeenCalledWith(
            'storefront-setup-start',
            expect.objectContaining({
                projectName: 'test-project',
                edsConfig: expect.objectContaining({
                    repoName: 'test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                }),
            })
        );
    });

    it('refuses to start on an incomplete config and shows the error instead', () => {
        renderStep({
            accsHost: 'https://accs.example.com',
            storeViewCode: 'default',
            customerGroup: 'general',
            // repoName missing — the request contract requires it
            repoName: '',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
        });

        expect(mockPostMessage).not.toHaveBeenCalledWith(
            'storefront-setup-start',
            expect.anything()
        );
        expect(screen.getByText('Storefront Setup Failed')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Storefront configuration is incomplete — go back and finish the Storefront step.'
            )
        ).toBeInTheDocument();
    });

    it('refuses when edsConfig is absent entirely', () => {
        renderStep(undefined);

        expect(mockPostMessage).not.toHaveBeenCalledWith(
            'storefront-setup-start',
            expect.anything()
        );
        expect(screen.getByText('Storefront Setup Failed')).toBeInTheDocument();
    });
});
