import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AdobeOrgStep } from '@/features/authentication/ui/steps/AdobeOrgStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient (the step must not post messages directly on select)
const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        onMessage: jest.fn(),
    },
}));

// Mock useSelectionStep hook
jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock ConfigurationSummary
jest.mock('@/core/ui/components/wizard', () => ({
    ConfigurationSummary: () => <div data-testid="config-summary">Summary</div>,
}));

// Mock LoadingDisplay
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

interface OrgItem {
    id: string;
    code: string;
    name: string;
    selectable: boolean;
    reason?: string;
}

const selectableOrgs: OrgItem[] = [
    { id: 'o1', code: 'C1', name: 'Org One', selectable: true },
    { id: 'o2', code: 'C2', name: 'Org Two', selectable: true },
];

const baseState: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: undefined,
    organizationsCache: undefined,
    currentStep: 'adobe-org' as WizardState['currentStep'],
};

function makeSelectionMock(overrides: Record<string, unknown> = {}) {
    return {
        items: selectableOrgs,
        filteredItems: selectableOrgs,
        isLoading: false,
        showLoading: false,
        isRefreshing: false,
        hasLoadedOnce: true,
        error: null,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        load: jest.fn(),
        refresh: jest.fn(),
        selectItem: jest.fn(),
        ...overrides,
    };
}

function renderStep(state: Partial<WizardState> = baseState, updateState = jest.fn(), setCanProceed = jest.fn()) {
    return render(
        <Provider theme={defaultTheme}>
            <AdobeOrgStep
                state={state as WizardState}
                updateState={updateState}
                setCanProceed={setCanProceed}
            />
        </Provider>,
    );
}

describe('AdobeOrgStep', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseSelectionStep.mockReturnValue(makeSelectionMock());
    });

    it('loads organizations via the get-organizations message type', () => {
        renderStep();
        const opts = mockUseSelectionStep.mock.calls[0][0];
        expect(opts.messageType).toBe('get-organizations');
        expect(opts.cacheKey).toBe('organizationsCache');
        expect(opts.searchFilterKey).toBe('orgSearchFilter');
    });

    it('enables auto-select of a single org (no double-prompt)', () => {
        renderStep();
        const opts = mockUseSelectionStep.mock.calls[0][0];
        expect(opts.autoSelectSingle).toBe(true);
    });

    it('renders the list of organizations', () => {
        renderStep();
        expect(screen.getByText('Org One')).toBeInTheDocument();
        expect(screen.getByText('Org Two')).toBeInTheDocument();
    });

    it('cascade-clears project, workspace, mesh and their caches when org changes', () => {
        const updateState = jest.fn();
        renderStep(baseState, updateState);
        const opts = mockUseSelectionStep.mock.calls[0][0];

        opts.onSelect({ id: 'o1', code: 'C1', name: 'Org One', selectable: true });

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                adobeOrg: expect.objectContaining({ id: 'o1', code: 'C1', name: 'Org One' }),
                adobeProject: undefined,
                adobeWorkspace: undefined,
                apiMesh: undefined,
                projectsCache: undefined,
                workspacesCache: undefined,
            }),
        );
    });

    it('does NOT post a backend message on select (deferred to Continue)', () => {
        const updateState = jest.fn();
        renderStep(baseState, updateState);
        const opts = mockUseSelectionStep.mock.calls[0][0];
        opts.onSelect(selectableOrgs[0]);
        expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('enables proceed only when an org is selected', () => {
        const setCanProceed = jest.fn();
        renderStep({ ...baseState, adobeOrg: { id: 'o1', code: 'C1', name: 'Org One' } }, jest.fn(), setCanProceed);
        expect(setCanProceed).toHaveBeenCalledWith(true);
    });

    it('disables proceed when no org is selected', () => {
        const setCanProceed = jest.fn();
        renderStep(baseState, jest.fn(), setCanProceed);
        expect(setCanProceed).toHaveBeenCalledWith(false);
    });

    it('renders non-selectable orgs disabled with a reason', () => {
        const mixed: OrgItem[] = [
            { id: 'o1', code: 'C1', name: 'Org One', selectable: true },
            {
                id: 'bad',
                code: 'B',
                name: 'Filtered Org',
                selectable: false,
                reason: 'Sign in with a different account.',
            },
        ];
        mockUseSelectionStep.mockReturnValue(makeSelectionMock({ items: mixed, filteredItems: mixed }));

        renderStep();

        expect(screen.getByText('Filtered Org')).toBeInTheDocument();
        expect(screen.getByText('Sign in with a different account.')).toBeInTheDocument();
    });

    it('shows the loading state', () => {
        mockUseSelectionStep.mockReturnValue(
            makeSelectionMock({ items: [], filteredItems: [], showLoading: true, hasLoadedOnce: false }),
        );
        renderStep();
        expect(screen.getByTestId('loading-display')).toBeInTheDocument();
    });

    it('shows the empty state when no orgs are returned', () => {
        mockUseSelectionStep.mockReturnValue(
            makeSelectionMock({ items: [], filteredItems: [], hasLoadedOnce: true }),
        );
        renderStep();
        expect(screen.getByText('No Organizations Found')).toBeInTheDocument();
    });

    it('shows the error state', () => {
        mockUseSelectionStep.mockReturnValue(
            makeSelectionMock({ items: [], filteredItems: [], error: 'Network error' }),
        );
        renderStep();
        expect(screen.getByText('Network error')).toBeInTheDocument();
    });
});
