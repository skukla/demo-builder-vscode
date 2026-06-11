/**
 * ConnectServicesStep — content-source choice (Slice 2, Step 07).
 *
 * On the join (content-flow) path the joiner declares the satellite's content
 * source: DA.live (default, today's flow exactly) or AEM Sites (reveals
 * author-URL + content-path fields — NO auth field: read is AEM-owned, the
 * config write reuses the existing Adobe IMS login). The choice gates
 * canProceed; selections seed `edsConfig.contentSourceType` /
 * `edsConfig.aemContentSource` so they ride the existing setup payload.
 *
 * The commerce flow renders no choice (regression: step unchanged).
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState } from '@/types/webview';

const mockGitHubAuth = {
    isChecking: false,
    isAuthenticating: false,
    isAuthenticated: false,
    user: undefined as undefined | { login: string },
    error: undefined,
    startOAuth: jest.fn(),
    changeAccount: jest.fn(),
};

const mockDaLiveAuth = {
    isChecking: false,
    isAuthenticating: false,
    isAuthenticated: false,
    verifiedOrg: undefined as undefined | string,
    error: undefined,
    setupComplete: false,
    bookmarkletUrl: undefined,
    openDaLive: jest.fn(),
    storeToken: jest.fn(),
    storeTokenWithOrg: jest.fn(),
    checkAuthStatus: jest.fn(),
    resetAuth: jest.fn(),
    cancelAuth: jest.fn(),
};

jest.mock('@/features/eds/ui/hooks/useGitHubAuth', () => ({
    useGitHubAuth: jest.fn(() => mockGitHubAuth),
}));

jest.mock('@/features/eds/ui/hooks/useDaLiveAuth', () => ({
    useDaLiveAuth: jest.fn(() => mockDaLiveAuth),
}));

import { ConnectServicesStep } from '@/features/eds/ui/steps/ConnectServicesStep';

const AEM_AUTHOR_URL = 'https://author-p57319-e1619941.adobeaemcloud.com';
const AEM_CONTENT_PATH = '/content/citisignal';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

function createJoinState(edsConfigOverrides: Record<string, unknown> = {}): WizardState {
    return {
        currentStep: 'eds-connect-services',
        projectName: 'satellite',
        flow: 'content',
        upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
        adobeAuth: { isAuthenticated: true, isChecking: false },
        edsConfig: {
            repoName: '',
            daLiveOrg: '',
            daLiveSite: '',
            ...edsConfigOverrides,
        },
    } as unknown as WizardState;
}

function connectBothServices(): void {
    Object.assign(mockGitHubAuth, { isAuthenticated: true, user: { login: 'joiner' } });
    Object.assign(mockDaLiveAuth, { isAuthenticated: true, verifiedOrg: 'content-sc' });
}

function renderStep(state: WizardState) {
    const updateState = jest.fn();
    const setCanProceed = jest.fn();
    renderWithProvider(
        <ConnectServicesStep state={state} updateState={updateState} setCanProceed={setCanProceed} />,
    );
    return { updateState, setCanProceed };
}

describe('ConnectServicesStep — content-source choice (join flow)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.assign(mockGitHubAuth, {
            isChecking: false, isAuthenticating: false, isAuthenticated: false,
            user: undefined, error: undefined,
        });
        Object.assign(mockDaLiveAuth, {
            isChecking: false, isAuthenticating: false, isAuthenticated: false,
            verifiedOrg: undefined, error: undefined, setupComplete: false,
        });
    });

    describe('choice rendering', () => {
        it('renders the content-source choice for the join (content) flow', () => {
            renderStep(createJoinState());

            const group = screen.getByRole('radiogroup');
            expect(within(group).getByRole('radio', { name: /DA\.live/ })).toBeInTheDocument();
            expect(within(group).getByRole('radio', { name: /AEM Sites/ })).toBeInTheDocument();
        });

        it('does NOT render the choice for the commerce flow (step unchanged — regression)', () => {
            const state = createJoinState();
            delete (state as unknown as Record<string, unknown>).flow;
            delete (state as unknown as Record<string, unknown>).upstream;

            renderStep(state);

            expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        });

        it('defaults to DA.live with no AEM fields (today\'s flow exactly)', () => {
            connectBothServices();
            const { setCanProceed } = renderStep(createJoinState());

            expect(screen.getByRole('radio', { name: /DA\.live/ })).toBeChecked();
            expect(screen.queryByLabelText(/author URL/i)).not.toBeInTheDocument();
            // DA.live default + both services connected ⇒ proceed (unchanged gating)
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });

    describe('AEM Sites selection', () => {
        it('seeds contentSourceType into edsConfig when choosing AEM Sites', () => {
            const { updateState } = renderStep(createJoinState());

            fireEvent.click(screen.getByRole('radio', { name: /AEM Sites/ }));

            expect(updateState).toHaveBeenCalledWith(expect.objectContaining({
                edsConfig: expect.objectContaining({ contentSourceType: 'aem-sites' }),
            }));
        });

        it('reveals author-URL + content-path fields — and NO auth/token field (R1)', () => {
            renderStep(createJoinState({ contentSourceType: 'aem-sites' }));

            expect(screen.getByLabelText(/author URL/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/content path/i)).toBeInTheDocument();
            // No credential affordance: read is AEM-owned, write reuses the existing login
            expect(screen.queryByLabelText(/token/i)).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
        });

        it('seeds aemContentSource.authorUrl into edsConfig as the user types', () => {
            const { updateState } = renderStep(createJoinState({ contentSourceType: 'aem-sites' }));

            fireEvent.change(screen.getByLabelText(/author URL/i), {
                target: { value: AEM_AUTHOR_URL },
            });

            expect(updateState).toHaveBeenCalledWith(expect.objectContaining({
                edsConfig: expect.objectContaining({
                    aemContentSource: expect.objectContaining({ authorUrl: AEM_AUTHOR_URL }),
                }),
            }));
        });

        it('seeds aemContentSource.contentPath into edsConfig as the user types', () => {
            const { updateState } = renderStep(createJoinState({
                contentSourceType: 'aem-sites',
                aemContentSource: { authorUrl: AEM_AUTHOR_URL, contentPath: '' },
            }));

            fireEvent.change(screen.getByLabelText(/content path/i), {
                target: { value: AEM_CONTENT_PATH },
            });

            expect(updateState).toHaveBeenCalledWith(expect.objectContaining({
                edsConfig: expect.objectContaining({
                    aemContentSource: expect.objectContaining({
                        authorUrl: AEM_AUTHOR_URL,
                        contentPath: AEM_CONTENT_PATH,
                    }),
                }),
            }));
        });
    });

    describe('canProceed gating', () => {
        it('blocks Continue while the AEM fields are empty (services connected)', () => {
            connectBothServices();
            const { setCanProceed } = renderStep(createJoinState({ contentSourceType: 'aem-sites' }));

            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('blocks Continue for a non-https author URL and shows the https requirement', () => {
            connectBothServices();
            const { setCanProceed } = renderStep(createJoinState({
                contentSourceType: 'aem-sites',
                aemContentSource: { authorUrl: 'http://author.example.com', contentPath: AEM_CONTENT_PATH },
            }));

            expect(setCanProceed).toHaveBeenLastCalledWith(false);
            expect(screen.getByText(/https/)).toBeInTheDocument();
        });

        it('enables Continue when both services are connected AND the AEM source is valid', () => {
            connectBothServices();
            const { setCanProceed } = renderStep(createJoinState({
                contentSourceType: 'aem-sites',
                aemContentSource: { authorUrl: AEM_AUTHOR_URL, contentPath: AEM_CONTENT_PATH },
            }));

            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });

        it('still requires the service connections with a valid AEM source', () => {
            // GitHub connected, DA.live NOT (registration still needs the DA.live identity)
            Object.assign(mockGitHubAuth, { isAuthenticated: true, user: { login: 'joiner' } });
            const { setCanProceed } = renderStep(createJoinState({
                contentSourceType: 'aem-sites',
                aemContentSource: { authorUrl: AEM_AUTHOR_URL, contentPath: AEM_CONTENT_PATH },
            }));

            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });
    });
});
