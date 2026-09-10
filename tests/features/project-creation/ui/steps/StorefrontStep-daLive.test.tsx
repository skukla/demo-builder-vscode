/**
 * The StorefrontStep wiring the first suite does not reach: the DA.live card's
 * five callbacks, the block-library toggles, and the derivations that decide
 * which package and stack the libraries are read for.
 *
 * All of it was uncovered. The DA.live handlers are the ones that matter most —
 * they decide whether pressing "Set up" opens the bookmarklet helper page or
 * DA.live itself, and getting that backwards strands the SC on a page that
 * cannot give them a token.
 *
 * The two collaborator hooks are asserted on the ARGUMENTS they receive, not on
 * what they answer: a mocked hook returns the same object however it is called.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { WizardState } from '@/types/webview';

const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

const mockGetAvailable = jest.fn((..._args: unknown[]) => [
    { id: 'lib-a', name: 'Library A', description: 'A' },
]);
const mockGetNative = jest.fn((..._args: unknown[]) => [{ id: 'native-1', name: 'Native Blocks' }]);
jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: (...args: unknown[]) => mockGetAvailable(...args),
    getNativeBlockLibraries: (...args: unknown[]) => mockGetNative(...args),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getPackageDefaultBlockLibraryIds: jest.fn(() => []),
}));

const mockGitHubAuth = {
    isChecking: false,
    isAuthenticating: false,
    isAuthenticated: false,
    user: undefined as undefined | { login: string },
    orgs: undefined as undefined | string[],
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
    bookmarkletUrl: undefined as undefined | string,
    openDaLive: jest.fn(),
    storeTokenWithOrg: jest.fn(),
    resetAuth: jest.fn(),
    cancelAuth: jest.fn(),
};
const mockUseGitHubAuth = jest.fn((..._args: unknown[]) => mockGitHubAuth);
const mockUseDaLiveAuth = jest.fn((..._args: unknown[]) => mockDaLiveAuth);
jest.mock('@/features/eds/ui/hooks/useGitHubAuth', () => ({
    useGitHubAuth: (...args: unknown[]) => mockUseGitHubAuth(...args),
}));
jest.mock('@/features/eds/ui/hooks/useDaLiveAuth', () => ({
    useDaLiveAuth: (...args: unknown[]) => mockUseDaLiveAuth(...args),
}));

const mockOnBlockLibrariesChange = jest.fn();
const mockOnCustomBlockLibrariesChange = jest.fn();
const mockUseProjectBuilder = jest.fn((..._args: unknown[]) => ({
    onBlockLibrariesChange: mockOnBlockLibrariesChange,
    onCustomBlockLibrariesChange: mockOnCustomBlockLibrariesChange,
}));
jest.mock('@/features/project-creation/ui/steps/useProjectBuilder', () => ({
    useProjectBuilder: (...args: unknown[]) => mockUseProjectBuilder(...args),
}));

/** The DA.live card, printing what it was handed and exposing every callback. */
jest.mock('@/features/eds/ui/components/DaLiveServiceCard', () => ({
    DaLiveServiceCard: (props: {
        isAuthenticating: boolean;
        showInput: boolean;
        availableOrgs: string[];
        onSetup: () => void;
        onSubmit: (org: string, token: string) => void;
        onReset: () => void;
        onCancelInput: () => void;
        onOpenBookmarkletSetup?: () => void;
    }) => (
        <div
            data-testid="dalive-card"
            data-authenticating={String(props.isAuthenticating)}
            data-show-input={String(props.showInput)}
            data-orgs={JSON.stringify(props.availableOrgs)}
            data-has-bookmarklet={String(Boolean(props.onOpenBookmarkletSetup))}
        >
            <button onClick={props.onSetup}>dalive-setup</button>
            <button onClick={() => props.onSubmit('acme', 'tok-1')}>dalive-submit</button>
            <button onClick={props.onReset}>dalive-reset</button>
            <button onClick={props.onCancelInput}>dalive-cancel</button>
            <button onClick={() => props.onOpenBookmarkletSetup?.()}>dalive-bookmarklet</button>
        </div>
    ),
}));
jest.mock('@/core/ui/components/layout/StepAreaShell', () => ({
    StepAreaShell: (props: { viewKey: string; rail: React.ReactNode; children: React.ReactNode }) => (
        <div data-testid="area-shell" data-view-key={props.viewKey}>
            {props.rail}
            {props.children}
        </div>
    ),
}));
jest.mock('@/features/eds/ui/components/GitHubServiceCard', () => ({
    GitHubServiceCard: () => <div data-testid="github-card">GitHub</div>,
}));
jest.mock('@/features/eds/ui/steps/RepoSelectionInline', () => ({
    RepoSelectionInline: (props: { phase: string }) => (
        <div data-testid="repo-selection-inline" data-phase={props.phase} />
    ),
}));

/** The block-library view, printing its lists and exposing both toggles. */
jest.mock('@/features/project-creation/ui/components/BlockLibrariesStepContent', () => ({
    BlockLibrariesStepContent: (props: {
        nativeBlockLibraries: { id: string }[];
        availableBlockLibraries: { id: string }[];
        selectedBlockLibraries: string[];
        customBlockLibraries: { name: string }[];
        onBlockLibraryToggle: (id: string, selected: boolean) => void;
        onCustomLibraryToggle: (lib: unknown, selected: boolean) => void;
        onOpenCustomSettings: () => void;
    }) => (
        <div
            data-testid="block-libraries"
            data-native={JSON.stringify(props.nativeBlockLibraries.map((l) => l.id))}
            data-available={JSON.stringify(props.availableBlockLibraries.map((l) => l.id))}
            data-selected={JSON.stringify(props.selectedBlockLibraries)}
            data-custom={JSON.stringify(props.customBlockLibraries)}
        >
            <button onClick={() => props.onBlockLibraryToggle('lib-a', true)}>lib-on</button>
            <button onClick={() => props.onBlockLibraryToggle('lib-a', false)}>lib-off</button>
            <button
                onClick={() =>
                    props.onCustomLibraryToggle(
                        { name: 'New', source: { owner: 'acme', repo: 'new', branch: 'main' } },
                        true
                    )
                }
            >
                custom-on
            </button>
            <button
                onClick={() =>
                    props.onCustomLibraryToggle(
                        {
                            name: 'Renamed',
                            source: { owner: 'acme', repo: 'kept', branch: 'main' },
                        },
                        false
                    )
                }
            >
                custom-off
            </button>
            <button onClick={props.onOpenCustomSettings}>custom-settings</button>
        </div>
    ),
}));

// Below the mocks on purpose: they hoist above this file's imports only.
import { getBookmarkletSetupPageUrl } from '@/features/eds/ui/helpers/bookmarkletSetupPage';
import { StorefrontStep } from '@/features/project-creation/ui/steps/StorefrontStep';

import {
    PACKAGES,
    STACKS,
    citisignal,
    edsStack,
    storefrontState,
} from './StorefrontStep.testUtils';

const kept: CustomBlockLibrary = {
    name: 'Kept',
    source: { owner: 'acme', repo: 'kept', branch: 'main' },
};

const tree = (initial: Partial<WizardState>, updateState: jest.Mock) => (
    <Provider theme={defaultTheme}>
        <StorefrontStep
            state={storefrontState(initial)}
            updateState={updateState}
            setCanProceed={jest.fn()}
            packages={PACKAGES}
            stacks={STACKS}
        />
    </Provider>
);

const renderStep = (initial: Partial<WizardState> = {}) => {
    const updateState = jest.fn();
    const view = render(tree(initial, updateState));
    return {
        ...view,
        updateState,
        /** Re-render with different wizard state, as the shell does on every change. */
        restate: (next: Partial<WizardState>) => view.rerender(tree(next, updateState)),
    };
};

const daLiveCard = () => screen.getByTestId('dalive-card');
const libraries = () => screen.getByTestId('block-libraries');
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/** The step opens on `accounts`; this is the state that shows the libraries view. */
const ON_LIBRARIES: Partial<WizardState> = { activeStorefrontStep: 'block-libraries' };

describe('StorefrontStep DA.live card', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDaLiveAuth.setupComplete = false;
        mockDaLiveAuth.bookmarkletUrl = undefined;
        mockDaLiveAuth.isAuthenticating = false;
        mockGitHubAuth.orgs = undefined;
    });

    it('should hand both auth hooks the wizard state and its updater', () => {
        const { updateState } = renderStep();

        expect(mockUseGitHubAuth).toHaveBeenCalledWith({
            state: expect.objectContaining({ selectedStack: 'eds-paas' }),
            updateState,
        });
        expect(mockUseDaLiveAuth).toHaveBeenCalledWith({
            state: expect.objectContaining({ selectedStack: 'eds-paas' }),
            updateState,
        });
    });

    it('should hand the builder hook the catalog and the settings defaults', () => {
        renderStep();

        expect(mockUseProjectBuilder.mock.calls[0][2]).toEqual({
            packages: PACKAGES,
            stacks: STACKS,
            blockLibraryDefaults: [],
            customBlockLibraryDefaults: [],
        });
    });

    it('should hand the builder hook empty catalogs when none were supplied', () => {
        render(
            <Provider theme={defaultTheme}>
                <StorefrontStep
                    state={storefrontState()}
                    updateState={jest.fn()}
                    setCanProceed={jest.fn()}
                />
            </Provider>
        );

        expect(mockUseProjectBuilder.mock.calls[0][2]).toEqual({
            packages: [],
            stacks: [],
            blockLibraryDefaults: [],
            customBlockLibraryDefaults: [],
        });
    });

    it('should start with the token input closed', () => {
        renderStep();

        expect(daLiveCard()).toHaveAttribute('data-show-input', 'false');
    });

    it('should open the bookmarklet helper page when setup is not finished', () => {
        mockDaLiveAuth.bookmarkletUrl = 'https://da.live/bookmarklet';

        renderStep();
        press('dalive-setup');

        expect(mockPostMessage).toHaveBeenCalledWith('openExternal', {
            url: getBookmarkletSetupPageUrl('https://da.live/bookmarklet'),
        });
        expect(mockDaLiveAuth.openDaLive).not.toHaveBeenCalled();
        expect(daLiveCard()).toHaveAttribute('data-show-input', 'true');
    });

    it('should open DA.live itself once setup is finished', () => {
        mockDaLiveAuth.bookmarkletUrl = 'https://da.live/bookmarklet';
        mockDaLiveAuth.setupComplete = true;

        renderStep();
        press('dalive-setup');

        expect(mockDaLiveAuth.openDaLive).toHaveBeenCalled();
        expect(mockPostMessage).not.toHaveBeenCalledWith('openExternal', expect.anything());
        expect(daLiveCard()).toHaveAttribute('data-show-input', 'true');
    });

    it('should open DA.live itself when there is no bookmarklet to set up', () => {
        renderStep();
        press('dalive-setup');

        expect(mockDaLiveAuth.openDaLive).toHaveBeenCalled();
        expect(mockPostMessage).not.toHaveBeenCalledWith('openExternal', expect.anything());
    });

    it('should store the submitted token against its org and close the input', () => {
        mockDaLiveAuth.bookmarkletUrl = 'https://da.live/bookmarklet';
        renderStep();
        press('dalive-setup');

        press('dalive-submit');

        expect(mockDaLiveAuth.storeTokenWithOrg).toHaveBeenCalledWith('tok-1', 'acme');
        expect(daLiveCard()).toHaveAttribute('data-show-input', 'false');
    });

    it('should reopen the input when the connection is reset', () => {
        renderStep();

        press('dalive-reset');

        expect(mockDaLiveAuth.resetAuth).toHaveBeenCalled();
        expect(daLiveCard()).toHaveAttribute('data-show-input', 'true');
    });

    it('should close the input and cancel the sign-in when cancelled', () => {
        renderStep();
        press('dalive-reset');

        press('dalive-cancel');

        expect(mockDaLiveAuth.cancelAuth).toHaveBeenCalled();
        expect(daLiveCard()).toHaveAttribute('data-show-input', 'false');
    });

    it('should offer the bookmarklet page only when there is a bookmarklet', () => {
        renderStep();
        expect(daLiveCard()).toHaveAttribute('data-has-bookmarklet', 'false');

        mockDaLiveAuth.bookmarkletUrl = 'https://da.live/bookmarklet';
        renderStep();

        expect(screen.getAllByTestId('dalive-card')[1]).toHaveAttribute(
            'data-has-bookmarklet',
            'true'
        );
    });

    it('should reopen the bookmarklet page on demand', () => {
        mockDaLiveAuth.bookmarkletUrl = 'https://da.live/bookmarklet';
        renderStep();

        press('dalive-bookmarklet');

        expect(mockPostMessage).toHaveBeenCalledWith('openExternal', {
            url: getBookmarkletSetupPageUrl('https://da.live/bookmarklet'),
        });
    });

    it('should stop reporting a sign-in in flight once the token input is open', () => {
        mockDaLiveAuth.isAuthenticating = true;
        renderStep();
        expect(daLiveCard()).toHaveAttribute('data-authenticating', 'true');

        press('dalive-reset');

        expect(daLiveCard()).toHaveAttribute('data-authenticating', 'false');
    });

    it('should pass an empty org list rather than nothing when GitHub reports none', () => {
        renderStep();

        expect(daLiveCard()).toHaveAttribute('data-orgs', '[]');
    });
});

describe('StorefrontStep block libraries', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGitHubAuth.orgs = undefined;
    });

    it('should read the libraries for the SELECTED package and stack', () => {
        renderStep(ON_LIBRARIES);

        expect(mockGetAvailable).toHaveBeenCalledWith(edsStack, citisignal.id);
        expect(mockGetNative).toHaveBeenCalledWith(edsStack, citisignal.id);
        expect(libraries()).toHaveAttribute('data-available', '["lib-a"]');
        expect(libraries()).toHaveAttribute('data-native', '["native-1"]');
    });

    it('should render nothing for a stack that is not Edge Delivery', () => {
        renderStep({ ...ON_LIBRARIES, selectedStack: 'venia-paas' });

        expect(screen.queryByTestId('block-libraries')).not.toBeInTheDocument();
    });

    it('should render nothing when the stack is not in the catalog at all', () => {
        renderStep({ ...ON_LIBRARIES, selectedStack: 'not-a-stack' });

        expect(screen.queryByTestId('block-libraries')).not.toBeInTheDocument();
    });

    it('should offer no libraries when the selected package is not in the catalog', () => {
        renderStep({ ...ON_LIBRARIES, selectedPackage: 'not-a-package' });

        expect(libraries()).toHaveAttribute('data-available', '[]');
        expect(libraries()).toHaveAttribute('data-native', '[]');
        expect(mockGetAvailable).not.toHaveBeenCalled();
    });

    it('should show no selection rather than nothing when the state has none', () => {
        renderStep(ON_LIBRARIES);

        expect(libraries()).toHaveAttribute('data-selected', '[]');
        expect(libraries()).toHaveAttribute('data-custom', '[]');
    });

    it('should add a library to the existing selection', () => {
        renderStep({ ...ON_LIBRARIES, selectedBlockLibraries: ['already'] });

        press('lib-on');

        expect(mockOnBlockLibrariesChange).toHaveBeenCalledWith(['already', 'lib-a']);
    });

    it('should add to an empty selection when the state has none', () => {
        renderStep(ON_LIBRARIES);

        press('lib-on');

        expect(mockOnBlockLibrariesChange).toHaveBeenCalledWith(['lib-a']);
    });

    it('should remove only the library that was switched off', () => {
        renderStep({ ...ON_LIBRARIES, selectedBlockLibraries: ['already', 'lib-a'] });

        press('lib-off');

        expect(mockOnBlockLibrariesChange).toHaveBeenCalledWith(['already']);
    });

    it('should add a custom library to the existing selection', () => {
        renderStep({ ...ON_LIBRARIES, customBlockLibraries: [kept] });

        press('custom-on');

        expect(mockOnCustomBlockLibrariesChange).toHaveBeenCalledWith([
            kept,
            { name: 'New', source: { owner: 'acme', repo: 'new', branch: 'main' } },
        ]);
    });

    it('should remove a custom library by owner and repo, not by name', () => {
        const sameNameOtherOwner: CustomBlockLibrary = {
            name: 'Kept',
            source: { owner: 'other', repo: 'kept', branch: 'main' },
        };
        const sameOwnerOtherRepo: CustomBlockLibrary = {
            name: 'Sibling',
            source: { owner: 'acme', repo: 'sibling', branch: 'main' },
        };
        renderStep({
            ...ON_LIBRARIES,
            customBlockLibraries: [kept, sameNameOtherOwner, sameOwnerOtherRepo],
        });

        // The toggle sends a DIFFERENT name for the same owner/repo, and the two
        // neighbours each match on exactly ONE half of owner/repo.
        press('custom-off');

        expect(mockOnCustomBlockLibrariesChange).toHaveBeenCalledWith([
            sameNameOtherOwner,
            sameOwnerOtherRepo,
        ]);
    });

    it('should open the block-library settings on request', () => {
        renderStep(ON_LIBRARIES);

        press('custom-settings');

        expect(mockPostMessage).toHaveBeenCalledWith('open-block-library-settings');
    });
});

describe('StorefrontStep derivations follow the state they are derived from', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGitHubAuth.orgs = undefined;
    });

    it('should re-read the libraries when the project moves to another package', () => {
        const { restate } = renderStep(ON_LIBRARIES);
        expect(mockGetAvailable).toHaveBeenCalledWith(edsStack, 'citisignal');

        restate({ ...ON_LIBRARIES, selectedPackage: 'bodea' });

        expect(mockGetAvailable).toHaveBeenCalledWith(edsStack, 'bodea');
        expect(mockGetNative).toHaveBeenCalledWith(edsStack, 'bodea');
    });

    it('should stop offering libraries when the project moves to a non-EDS stack', () => {
        const { restate } = renderStep(ON_LIBRARIES);
        expect(screen.getByTestId('block-libraries')).toBeInTheDocument();

        restate({ ...ON_LIBRARIES, selectedStack: 'venia-paas' });

        expect(screen.queryByTestId('block-libraries')).not.toBeInTheDocument();
    });

    it('should toggle against the selection as it stands, not as it was first rendered', () => {
        const { restate } = renderStep({ ...ON_LIBRARIES, selectedBlockLibraries: ['first'] });

        restate({ ...ON_LIBRARIES, selectedBlockLibraries: ['first', 'second'] });
        press('lib-on');

        expect(mockOnBlockLibrariesChange).toHaveBeenCalledWith(['first', 'second', 'lib-a']);
    });

    it('should toggle custom libraries against the list as it stands', () => {
        const { restate } = renderStep({ ...ON_LIBRARIES, customBlockLibraries: [] });

        restate({ ...ON_LIBRARIES, customBlockLibraries: [kept] });
        press('custom-on');

        expect(mockOnCustomBlockLibrariesChange).toHaveBeenCalledWith([
            kept,
            { name: 'New', source: { owner: 'acme', repo: 'new', branch: 'main' } },
        ]);
    });
});

describe('StorefrontStep crossfade key', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGitHubAuth.orgs = undefined;
    });

    const viewKey = () => screen.getByTestId('area-shell').getAttribute('data-view-key');

    it('should group repository and code-sync under one key so the repo view survives the flip', () => {
        const { restate } = renderStep({ activeStorefrontStep: 'repository' });
        expect(viewKey()).toBe('repo');

        restate({ activeStorefrontStep: 'code-sync' });

        expect(viewKey()).toBe('repo');
    });

    it('should give every other sub-step its own key, so it crossfades', () => {
        const { restate } = renderStep({ activeStorefrontStep: 'accounts' });
        expect(viewKey()).toBe('accounts');

        restate(ON_LIBRARIES);

        expect(viewKey()).toBe('block-libraries');
    });
});
