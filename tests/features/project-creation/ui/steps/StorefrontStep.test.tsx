/**
 * StorefrontStep Tests (R1b — two tiles + focused modals)
 *
 * The Storefront step renders two {@link ConfigTile}s — a Storefront tile (status
 * from {@link isStorefrontConfigured}) and a Block Libraries tile (always
 * "configured"; optional, never gates Continue). Each tile opens a focused Modal:
 * the Storefront modal hosts the GitHub + DA.live service cards + RepoSelectionInline;
 * the Block Libraries modal hosts BlockLibrariesStepContent.
 *
 * The Continue gate uses isStorefrontConfigured(state) — github + dalive
 * authenticated in edsConfig AND storefrontRepoValid true. Block-library selection
 * does NOT affect the gate. RepoSelectionInline.onValidityChange persists
 * storefrontRepoValid via updateState so the verdict survives modal close + nav.
 *
 * The auth hooks, RepoSelectionInline, the service cards, and Modal/DialogContainer
 * are mocked to lightweight stubs so the tests assert the STEP's wiring (tiles,
 * gate, modal open/close, persistence) rather than re-testing children.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { StorefrontStep } from '@/features/project-creation/ui/steps/StorefrontStep';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

// Services consumed by useProjectBuilder (real hook runs) + block-lib derivation.
jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => [
        { id: 'lib-a', name: 'Library A', description: 'Adds A blocks' },
    ]),
    getNativeBlockLibraries: jest.fn(() => [
        { id: 'native-1', name: 'Native Blocks' },
    ]),
    getDefaultBlockLibraryIds: jest.fn(() => []),
}));

jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => false),
}));

// Auth hooks — mutable mock state objects.
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
    verifiedOrg: undefined,
    error: undefined,
    setupComplete: false,
    bookmarkletUrl: undefined,
    openDaLive: jest.fn(),
    storeTokenWithOrg: jest.fn(),
    resetAuth: jest.fn(),
    cancelAuth: jest.fn(),
};

jest.mock('@/features/eds/ui/hooks/useGitHubAuth', () => ({
    useGitHubAuth: jest.fn(() => mockGitHubAuth),
}));

jest.mock('@/features/eds/ui/hooks/useDaLiveAuth', () => ({
    useDaLiveAuth: jest.fn(() => mockDaLiveAuth),
}));

// Service cards — stub so we assert presence within the storefront modal.
jest.mock('@/features/eds/ui/components', () => ({
    GitHubServiceCard: (props: { isAuthenticated: boolean }) => (
        <div data-testid="github-card" data-authed={String(props.isAuthenticated)}>GitHub</div>
    ),
    DaLiveServiceCard: (props: { isAuthenticated: boolean }) => (
        <div data-testid="dalive-card" data-authed={String(props.isAuthenticated)}>DA.live</div>
    ),
}));

// RepoSelectionInline — stub exposing buttons to flip validity.
jest.mock('@/features/eds/ui/steps/RepoSelectionInline', () => ({
    RepoSelectionInline: (props: { onValidityChange: (valid: boolean) => void }) => (
        <div data-testid="repo-selection-inline">
            <button type="button" data-testid="repo-valid" onClick={() => props.onValidityChange(true)}>
                repo valid
            </button>
            <button type="button" data-testid="repo-invalid" onClick={() => props.onValidityChange(false)}>
                repo invalid
            </button>
        </div>
    ),
}));

// Modal + DialogContainer — render children inline only when present so we can
// assert what each modal hosts without portal/tray machinery.
jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: (props: { title: string; children: React.ReactNode; onClose: () => void }) => (
        <div data-testid={`modal-${props.title.replace(/\s+/g, '-').toLowerCase()}`}>
            <button type="button" data-testid="modal-close" onClick={props.onClose}>
                close
            </button>
            {props.children}
        </div>
    ),
}));

jest.mock('@adobe/react-spectrum', () => {
    const actual = jest.requireActual('@adobe/react-spectrum');
    return {
        ...actual,
        DialogContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

const veniaStack: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia with PaaS backend',
    frontend: 'venia',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [],
};

const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    storefronts: {
        'eds-paas': { name: 'CS EDS', description: '', source: mockGitSource },
        'venia-paas': { name: 'CS Venia', description: '', source: mockGitSource },
    },
};

const PACKAGES = [citisignal];
const STACKS = [edsStack, veniaStack];

/** edsConfig with both services authenticated (configured-ready fixture). */
function authedEdsConfig() {
    return {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: 'my-storefront',
        daLiveOrg: '',
        daLiveSite: '',
        repoMode: 'existing' as const,
        githubAuth: { isAuthenticated: true, user: { login: 'testuser' } },
        daLiveAuth: { isAuthenticated: true },
    };
}

function baseState(initial: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'storefront',
        projectName: '',
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        adobeAuth: { isAuthenticated: false, isChecking: false },
        edsConfig: {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: '',
            daLiveOrg: '',
            daLiveSite: '',
            repoMode: 'existing',
            githubAuth: { isAuthenticated: false },
        },
        ...initial,
    } as WizardState;
}

function setup(initial: Partial<WizardState> = {}) {
    const stateRef = { current: baseState(initial) };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    const setCanProceed = jest.fn();

    const ui = (
        <Provider theme={defaultTheme}>
            <StorefrontStep
                state={stateRef.current}
                updateState={updateState}
                setCanProceed={setCanProceed}
                packages={PACKAGES}
                stacks={STACKS}
            />
        </Provider>
    );
    const utils = render(ui);
    return { ...utils, updateState, setCanProceed, stateRef };
}

beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockGitHubAuth, {
        isChecking: false,
        isAuthenticating: false,
        isAuthenticated: false,
        user: undefined,
        error: undefined,
    });
    Object.assign(mockDaLiveAuth, {
        isChecking: false,
        isAuthenticating: false,
        isAuthenticated: false,
        verifiedOrg: undefined,
        error: undefined,
        setupComplete: false,
    });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorefrontStep', () => {
    describe('nav + inline storefront setup', () => {
        it('renders the Storefront and Block Libraries sub-steps in the nav', () => {
            setup();
            expect(document.querySelector('[data-step="storefront"]')).toBeInTheDocument();
            expect(document.querySelector('[data-step="block-libraries"]')).toBeInTheDocument();
        });

        it('shows the storefront setup inline by default (no tile to open)', () => {
            setup();
            expect(screen.getByTestId('github-card')).toBeInTheDocument();
            expect(screen.getByTestId('dalive-card')).toBeInTheDocument();
            expect(screen.getByTestId('repo-selection-inline')).toBeInTheDocument();
        });

        it('persists storefrontRepoValid via updateState when the repo reports valid', () => {
            const { updateState } = setup();
            act(() => {
                fireEvent.click(screen.getByTestId('repo-valid'));
            });
            expect(updateState).toHaveBeenCalledWith({ storefrontRepoValid: true });
        });

        it('persists storefrontRepoValid=false when the repo reports invalid', () => {
            const { updateState } = setup();
            act(() => {
                fireEvent.click(screen.getByTestId('repo-invalid'));
            });
            expect(updateState).toHaveBeenCalledWith({ storefrontRepoValid: false });
        });
    });

    describe('block-libraries sub-step', () => {
        // The baseState stack is EDS; activating block-libraries shows its body.
        const onBlockLibs = { activeStorefrontStep: 'block-libraries' as const };

        it('renders BlockLibrariesStepContent on the block-libraries sub-step (EDS)', () => {
            setup(onBlockLibs);
            expect(screen.getByText('Native Blocks')).toBeInTheDocument();
            expect(screen.getByText('Library A')).toBeInTheDocument();
        });

        it('routes an available-library toggle through useProjectBuilder', () => {
            const { updateState } = setup({ ...onBlockLibs, selectedBlockLibraries: [] });
            fireEvent.click(screen.getByRole('checkbox', { name: /Library A/i }));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    selectedBlockLibraries: expect.arrayContaining(['lib-a']),
                }),
            );
        });

        it('renders native libraries as checked and disabled', () => {
            setup(onBlockLibs);
            const nativeCheckbox = screen.getByRole('checkbox', { name: /Native Blocks/i });
            expect(nativeCheckbox).toBeChecked();
            expect(nativeCheckbox).toBeDisabled();
        });

        it('switches the active sub-step when a nav step is clicked', () => {
            const { updateState } = setup(onBlockLibs);
            fireEvent.click(document.querySelector('[data-step="storefront"]')!);
            expect(updateState).toHaveBeenCalledWith({ activeStorefrontStep: 'storefront' });
        });
    });

    describe('Continue gate (isStorefrontConfigured — block libs do NOT gate)', () => {
        it('should be false on mount when nothing is configured', () => {
            const { setCanProceed } = setup();
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should be false when github+dalive authed but repo not yet valid', () => {
            const { setCanProceed } = setup({ edsConfig: authedEdsConfig() });
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should be true when github+dalive authed AND storefrontRepoValid true', () => {
            const { setCanProceed } = setup({
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });

        it('should be false when only github authed (dalive not)', () => {
            const { setCanProceed } = setup({
                edsConfig: {
                    ...authedEdsConfig(),
                    daLiveAuth: { isAuthenticated: false },
                },
                storefrontRepoValid: true,
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should NOT be affected by block-library selection', () => {
            // Fully configured storefront + zero block libraries → still true.
            const { setCanProceed } = setup({
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
                selectedBlockLibraries: [],
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });

});
