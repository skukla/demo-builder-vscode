/**
 * ConnectStoreStepContent — Part 4: what the component TELLS its hooks, and
 * what it recomputes when its inputs move.
 *
 * The other three suites render and read the DOM. The decisions below are only
 * visible in the arguments two hooks receive and in what happens on the SECOND
 * render: a memo whose dependency list is empty still produces the right answer
 * on mount and the wrong one forever after, which no single-render test can
 * see. So `useAutoStoreDetect` and `useCredentialService` are mocked here (they
 * are real in the other suites) and asserted on their arguments.
 *
 * `lookupComponentConfigValue` is wired to actually READ the configs it is
 * handed, because `liveConfigs ?? {}` is indistinguishable from `{}` when the
 * lookup ignores its first argument.
 */

import {
    mockUseComponentConfig,
    mockUseStoreDiscovery,
} from './ConnectStoreStepContent.sharedMocks';
import { mockLookupComponentConfigValue } from './ConnectStoreStepContent.testUtils';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    ACCS_ENDPOINT_KEY,
    ACCS_STORE_VIEW_CODE,
    accsEndpointField,
    accsServiceGroup,
    catalogServiceGroup,
    type MockServiceGroup,
} from './ConnectStoreStepContent.testUtils';
import { ACCS_OAUTH_CLIENT_ID } from '@/core/config/envVarKeys';

const mockUseAutoStoreDetect = jest.fn();
const mockUseCredentialService = jest.fn();

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: (...args: unknown[]) => mockUseAutoStoreDetect(...args),
}));

jest.mock('@/features/components/ui/hooks/useCredentialService', () => ({
    useCredentialService: (...args: unknown[]) => mockUseCredentialService(...args),
}));

jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({ field }: any) => (
        <div data-testid={`config-field-${field.key}`}>{field.label}</div>
    ),
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: any) => <div data-testid="loading-display">{message}</div>,
}));

// The OAuth pair renders as ONE unit from the id row (the "use my own instead"
// disclosure covers both halves), so it never reaches ConfigFieldRenderer.
jest.mock('@/features/components/ui/components/BrokeredCredentialFields', () => ({
    BrokeredCredentialFields: ({ idField }: any) => (
        <div data-testid={`brokered-credentials-${idField.key}`}>{idField.label}</div>
    ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-1234@AdobeOrg';

/** The ACCS group with the brokered OAuth pair's client id alongside the endpoint. */
const accsGroupWithOauth: MockServiceGroup = {
    ...accsServiceGroup,
    fields: [
        accsEndpointField,
        {
            key: ACCS_OAUTH_CLIENT_ID,
            label: 'OAuth Client ID',
            type: 'text',
            required: false,
            componentIds: ['accs'],
        },
        ...accsServiceGroup.fields.slice(1),
    ],
};

/** The ACCS group with no credential field at all. */
const accsGroupWithoutOauth: MockServiceGroup = accsServiceGroup;

const defaultProps = {
    selectedStackId: 'eds-accs',
    componentConfigs: {},
    adobeOrg: { id: ORG_ID },
    onComponentConfigsChange: jest.fn(),
    onValidationChange: jest.fn(),
};

let ConnectStoreStepContent: any;

beforeAll(async () => {
    const mod = await import(
        '@/features/project-creation/ui/components/ConnectStoreStepContent'
    );
    ConnectStoreStepContent = mod.ConnectStoreStepContent;
});

/** Read a value out of the configs actually handed to the lookup. */
function readsTheConfigsItIsGiven(): void {
    mockLookupComponentConfigValue.mockImplementation(
        (configs: Record<string, Record<string, string>> | undefined, key: string) =>
            configs?.accs?.[key]
    );
}

function renderContent(props: Record<string, unknown> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <ConnectStoreStepContent {...defaultProps} {...props} />
        </Provider>
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    // A truthy autoDetectKey means the connection fields are filled — store-group
    // rows stay hidden behind a falsy one, credential row included.
    mockUseAutoStoreDetect.mockReturnValue({
        autoDetectKey: ACCS_ENDPOINT_KEY,
        forceFetch: jest.fn(),
    });
    mockUseCredentialService.mockReturnValue({ loading: false });
    mockUseComponentConfig.isLoading = false;
    mockUseComponentConfig.loadError = null;
    mockUseComponentConfig.serviceGroups = [accsGroupWithoutOauth];
    mockUseComponentConfig.validationErrors = {};
    mockUseComponentConfig.componentConfigs = {};
    mockUseStoreDiscovery.isFetching = false;
    mockUseStoreDiscovery.fetchError = null;
    mockUseStoreDiscovery.hasStoreData = false;
    mockLookupComponentConfigValue.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------

describe('what the auto-detect hook is told', () => {
    it('hands it the hook-owned configs, not an empty object', async () => {
        // liveConfigs comes from useComponentConfig rather than the prop so a
        // freshly typed endpoint triggers detection without a parent round-trip.
        const live = { accs: { [ACCS_ENDPOINT_KEY]: 'https://accs.example.com/graphql' } };
        mockUseComponentConfig.componentConfigs = live;

        renderContent();

        expect(mockUseAutoStoreDetect).toHaveBeenCalledWith(
            expect.objectContaining({ configs: live, orgId: ORG_ID })
        );
    });
});

describe('when the credential-service probe fires', () => {
    it('is enabled only when a rendered field is the brokered OAuth client id', () => {
        mockUseComponentConfig.serviceGroups = [accsGroupWithOauth, catalogServiceGroup];

        renderContent();

        expect(mockUseCredentialService).toHaveBeenLastCalledWith(true, ORG_ID);
    });

    it('stays disabled when the catalog declares no credential field', () => {
        mockUseComponentConfig.serviceGroups = [accsGroupWithoutOauth, catalogServiceGroup];

        renderContent();

        expect(mockUseCredentialService).toHaveBeenLastCalledWith(false, ORG_ID);
    });

    it('turns on when the rendered fields gain the credential field', () => {
        // The probe is keyed off the RENDERED fields, so it has to follow them
        // when the catalog answers late — an empty dependency list pins the
        // mount-time answer forever.
        mockUseComponentConfig.serviceGroups = [accsGroupWithoutOauth];
        const { rerender } = renderContent();
        expect(mockUseCredentialService).toHaveBeenLastCalledWith(false, ORG_ID);

        mockUseComponentConfig.serviceGroups = [accsGroupWithOauth];
        rerender(
            <Provider theme={defaultTheme}>
                <ConnectStoreStepContent {...defaultProps} selectedStackId="eds-accs-2" />
            </Provider>
        );

        expect(mockUseCredentialService).toHaveBeenLastCalledWith(true, ORG_ID);
    });
});

describe('reporting section validity upward', () => {
    it('reports again with the new verdict when the errors change', () => {
        const onValidationChange = jest.fn();
        mockUseComponentConfig.serviceGroups = [accsGroupWithoutOauth];
        const { rerender } = renderContent({ onValidationChange });
        expect(onValidationChange).toHaveBeenCalledWith(
            expect.objectContaining({ connection: true })
        );

        mockUseComponentConfig.validationErrors = { [ACCS_ENDPOINT_KEY]: 'Required' };
        rerender(
            <Provider theme={defaultTheme}>
                <ConnectStoreStepContent
                    {...defaultProps}
                    onValidationChange={onValidationChange}
                    selectedStackId="eds-accs-2"
                />
            </Provider>
        );

        expect(onValidationChange).toHaveBeenCalledTimes(2);
        expect(onValidationChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ connection: false })
        );
    });
});

describe('surfacing the store-detection wait', () => {
    it('reports the fetch state on mount and again each time it flips', () => {
        const onStoreLoadingChange = jest.fn();
        const { rerender } = renderContent({ onStoreLoadingChange });

        mockUseStoreDiscovery.isFetching = true;
        rerender(
            <Provider theme={defaultTheme}>
                <ConnectStoreStepContent
                    {...defaultProps}
                    onStoreLoadingChange={onStoreLoadingChange}
                    selectedStackId="eds-accs-2"
                />
            </Provider>
        );

        expect(onStoreLoadingChange.mock.calls).toEqual([[false], [true]]);
    });

    it('shows the step-level loader for Business Structure until store data arrives', () => {
        // Not fetching AND no data yet is still a wait — the auto-detect has not
        // started. Requiring both would render an empty cascade instead.
        mockUseStoreDiscovery.isFetching = false;
        mockUseStoreDiscovery.hasStoreData = false;

        renderContent({ section: 'business-structure' });

        // The STEP-level loader (size L, centered), not StoreConfigFieldRow's
        // inline row spinner — which carries the same message, so asserting the
        // message alone cannot tell the two treatments apart.
        expect(
            within(screen.getByTestId('centered-feedback')).getByTestId('loading-display')
        ).toHaveTextContent('Detecting store structure...');
    });
});

describe('disclosing the catalog groups', () => {
    it('discloses them once the live configs carry a store view, and not before', () => {
        readsTheConfigsItIsGiven();
        mockUseComponentConfig.serviceGroups = [accsGroupWithoutOauth, catalogServiceGroup];
        mockUseComponentConfig.componentConfigs = { accs: {} };
        const { rerender } = renderContent();
        expect(screen.queryByText(catalogServiceGroup.label)).not.toBeInTheDocument();

        mockUseComponentConfig.componentConfigs = {
            accs: { [ACCS_STORE_VIEW_CODE]: 'default' },
        };
        rerender(
            <Provider theme={defaultTheme}>
                <ConnectStoreStepContent {...defaultProps} selectedStackId="eds-accs-2" />
            </Provider>
        );

        expect(screen.getByText(catalogServiceGroup.label)).toBeInTheDocument();
    });
});

describe('the Connection slice carries its credentials', () => {
    it('renders the endpoint and the OAuth field as one merged group', () => {
        // The rail has no Credentials tab: two slices of the SAME group have to
        // fold back together, or the group renders twice — or, worse, the user
        // gets no way to supply their own pair during creation.
        mockUseComponentConfig.serviceGroups = [accsGroupWithOauth];

        renderContent({ section: 'connection' });

        expect(screen.getByTestId(`config-field-${ACCS_ENDPOINT_KEY}`)).toBeInTheDocument();
        expect(
            screen.getByTestId(`brokered-credentials-${ACCS_OAUTH_CLIENT_ID}`)
        ).toBeInTheDocument();
        expect(screen.getAllByText(accsGroupWithOauth.label)).toHaveLength(1);
    });
});
