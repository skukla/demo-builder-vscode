/**
 * StorefrontStep Tests (v6 — vertical step list + 4 dedicated views)
 *
 * The Storefront step renders a {@link VerticalStepList} nav + the active sub-step's
 * dedicated view across 4 sub-steps: `accounts` → GitHubServiceCard + DaLiveServiceCard,
 * `repository`/`code-sync` → RepoSelectionInline (same element instance, only the `phase`
 * prop changes), `block-libraries` → BlockLibrariesStepContent.
 *
 * The Continue gate uses isStorefrontConfigured(state) — github + dalive authenticated
 * in edsConfig AND storefrontRepoValid true AND storefrontCodeSyncValid true. Block-
 * library selection does NOT affect the gate. RepoSelectionInline reports validity via
 * onRepoValidChange / onCodeSyncValidChange, persisted to state via updateState.
 *
 * The auth hooks, RepoSelectionInline, and the service cards are mocked to lightweight
 * stubs so the tests assert the STEP's wiring (nav, view routing, gate, persistence)
 * rather than re-testing children.
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
jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => [
        { id: 'lib-a', name: 'Library A', description: 'Adds A blocks' },
    ]),
    getNativeBlockLibraries: jest.fn(() => [{ id: 'native-1', name: 'Native Blocks' }]),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getPackageDefaultBlockLibraryIds: jest.fn(() => []),
}));

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => false),
}));

// Auth hooks — mutable mock state objects.
const mockGitHubAuth = {
    isChecking: false,
    isAuthenticating: false,
    isAuthenticated: false,
    user: undefined as undefined | { login: string },
    orgs: [] as string[],
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
        <div data-testid="github-card" data-authed={String(props.isAuthenticated)}>
            GitHub
        </div>
    ),
    DaLiveServiceCard: (props: { isAuthenticated: boolean }) => (
        <div data-testid="dalive-card" data-authed={String(props.isAuthenticated)}>
            DA.live
        </div>
    ),
}));

// RepoSelectionInline — stub exposing the phase + buttons to flip both validities.
jest.mock('@/features/eds/ui/steps/RepoSelectionInline', () => ({
    RepoSelectionInline: (props: {
        phase: string;
        onRepoValidChange: (valid: boolean) => void;
        onCodeSyncValidChange: (valid: boolean) => void;
    }) => (
        <div data-testid="repo-selection-inline" data-phase={props.phase}>
            <button
                type="button"
                data-testid="repo-valid"
                onClick={() => props.onRepoValidChange(true)}
            >
                repo valid
            </button>
            <button
                type="button"
                data-testid="repo-invalid"
                onClick={() => props.onRepoValidChange(false)}
            >
                repo invalid
            </button>
            <button
                type="button"
                data-testid="codesync-valid"
                onClick={() => props.onCodeSyncValidChange(true)}
            >
                code-sync valid
            </button>
        </div>
    ),
}));

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
    configDefaults: {},
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
        githubAuth: {
            isAuthenticated: true,
            user: { login: 'testuser', email: null, name: null, avatarUrl: null },
        },
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
    describe('nav + view routing', () => {
        it('renders the sub-steps in the nav — Code Sync included for an existing repo', () => {
            setup(); // baseState uses repoMode: 'existing'
            // Code Sync included since 2026-08-06: the existing-repo check moved to
            // selection, and the area gate always required it — hiding the step only
            // hid the reason the area would not complete.
            for (const id of ['accounts', 'repository', 'code-sync', 'block-libraries']) {
                expect(document.querySelector(`[data-step="${id}"]`)).toBeInTheDocument();
            }
        });

        it('includes the Code Sync sub-step in the nav for a new repo', () => {
            setup({ edsConfig: { repoMode: 'new' } as WizardState['edsConfig'] });
            for (const id of ['accounts', 'repository', 'code-sync', 'block-libraries']) {
                expect(document.querySelector(`[data-step="${id}"]`)).toBeInTheDocument();
            }
        });

        it('shows BOTH account cards on the accounts sub-step (the default)', () => {
            setup();
            // GitHub + DA.live are independent, parallel sign-ins — one sub-step, two cards.
            expect(screen.getByTestId('github-card')).toBeInTheDocument();
            expect(screen.getByTestId('dalive-card')).toBeInTheDocument();
            expect(screen.queryByTestId('repo-selection-inline')).not.toBeInTheDocument();
        });

        it('shows RepoSelectionInline with the repository phase on the repository sub-step', () => {
            setup({ activeStorefrontStep: 'repository', edsConfig: authedEdsConfig() });
            const inline = screen.getByTestId('repo-selection-inline');
            expect(inline).toBeInTheDocument();
            expect(inline).toHaveAttribute('data-phase', 'repository');
        });

        it('shows RepoSelectionInline with the code-sync phase on the code-sync sub-step', () => {
            setup({
                activeStorefrontStep: 'code-sync',
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
            });
            const inline = screen.getByTestId('repo-selection-inline');
            expect(inline).toBeInTheDocument();
            expect(inline).toHaveAttribute('data-phase', 'code-sync');
        });

        it('persists storefrontRepoValid via updateState when the repo reports valid', () => {
            const { updateState } = setup({
                activeStorefrontStep: 'repository',
                edsConfig: authedEdsConfig(),
            });
            act(() => {
                fireEvent.click(screen.getByTestId('repo-valid'));
            });
            expect(updateState).toHaveBeenCalledWith({ storefrontRepoValid: true });
        });

        it('persists storefrontCodeSyncValid via updateState when code-sync reports valid', () => {
            const { updateState } = setup({
                activeStorefrontStep: 'code-sync',
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
            });
            act(() => {
                fireEvent.click(screen.getByTestId('codesync-valid'));
            });
            expect(updateState).toHaveBeenCalledWith({ storefrontCodeSyncValid: true });
        });

        it('switches the active sub-step when a reached nav step is clicked', () => {
            // both authed → accounts is `done` (reachable), repository is `current`.
            const { updateState } = setup({
                activeStorefrontStep: 'repository',
                edsConfig: authedEdsConfig(),
            });
            fireEvent.click(document.querySelector('[data-step="accounts"]')!);
            expect(updateState).toHaveBeenCalledWith({ activeStorefrontStep: 'accounts' });
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
            // Block libraries render as selection cards (toggle buttons), not checkboxes.
            fireEvent.click(screen.getByRole('button', { name: /Library A/i }));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    selectedBlockLibraries: expect.arrayContaining(['lib-a']),
                })
            );
        });

        it('renders native libraries as selected, disabled cards', () => {
            setup(onBlockLibs);
            const nativeCard = screen.getByRole('button', { name: /Native Blocks/i });
            expect(nativeCard).toBeDisabled();
            expect(nativeCard).toHaveAttribute('aria-pressed', 'true');
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

        it('should be false when repo valid but code-sync not yet valid', () => {
            const { setCanProceed } = setup({
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should be true when github+dalive authed AND repo+code-sync valid', () => {
            const { setCanProceed } = setup({
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
                storefrontCodeSyncValid: true,
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
                storefrontCodeSyncValid: true,
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should NOT be affected by block-library selection', () => {
            // Fully configured storefront + zero block libraries → still true.
            const { setCanProceed } = setup({
                edsConfig: authedEdsConfig(),
                storefrontRepoValid: true,
                storefrontCodeSyncValid: true,
                selectedBlockLibraries: [],
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });
});
