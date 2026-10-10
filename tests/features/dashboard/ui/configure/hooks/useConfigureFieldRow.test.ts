/**
 * useConfigureFieldRow — the field row and the collaborators it is wired to.
 *
 * The three hooks it composes each own a request to the extension and have their
 * own suites; here they are doubles, because what this hook decides is HOW they
 * are called (which org, which configs, which saved secrets, whether to probe at
 * all) and what reaches the row. So the tests assert the ARGUMENTS each double
 * received and the props on the element `renderFieldRow` returns — the row is
 * inspected as an element, not rendered, so no Spectrum preamble is needed.
 */

import { renderHook } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ACCS_OAUTH_CLIENT_ID } from '@/core/config/envVarKeys';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import {
    useCredentialService,
    type CredentialServiceState,
} from '@/features/components/ui/hooks/useCredentialService';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';
import {
    useConfigureFieldRow,
    type UseConfigureFieldRowProps,
} from '@/features/dashboard/ui/configure/hooks/useConfigureFieldRow';
import { createMockProject } from '../../../../../helpers/projectFake';

const mockFetchStores = jest.fn();
const mockForceFetch = jest.fn();
const mockIsStoreGroup = jest.fn(() => false);
const mockWebsiteItems = jest.fn(() => []);
const mockGroupItems = jest.fn(() => []);
const mockViewItems = jest.fn(() => []);
const mockCredential: CredentialServiceState = {
    loading: false,
    status: { served: true, verdict: 'served' },
};

jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => ({
        isFetching: true,
        fetchError: 'unreachable',
        hasStoreData: false,
        fetchStores: mockFetchStores,
        getWebsiteItems: mockWebsiteItems,
        getStoreGroupItems: mockGroupItems,
        getStoreViewItems: mockViewItems,
        isStoreGroup: mockIsStoreGroup,
    }),
}));
jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: jest.fn(() => ({ autoDetectKey: 'k-1', forceFetch: mockForceFetch })),
}));
jest.mock('@/features/components/ui/hooks/useCredentialService', () => ({
    useCredentialService: jest.fn(() => mockCredential),
}));

const urlField: UniqueField = {
    key: 'ADOBE_COMMERCE_URL',
    label: 'Commerce URL',
    type: 'url',
    required: true,
    componentIds: ['headless'],
};
const oauthField: UniqueField = { ...urlField, key: ACCS_OAUTH_CLIENT_ID, type: 'text' };

const plainGroup: ServiceGroup = { id: 'adobe-commerce', label: 'Commerce', fields: [urlField] };
const accsGroup: ServiceGroup = { id: 'accs', label: 'ACCS', fields: [urlField, oauthField] };

const SECRET_FLAGS = { backend: { ADMIN_PASSWORD: true } };
const CONFIGS = { headless: { ADOBE_COMMERCE_URL: 'https://example.com' } };
const ERRORS = { ADOBE_COMMERCE_URL: 'Please enter a valid URL' };
const TOUCHED = new Set<string>(['ADOBE_COMMERCE_URL']);
const getFieldValue = jest.fn(() => 'https://example.com');
const updateField = jest.fn();
const normalizeUrlField = jest.fn();

function render(serviceGroups: ServiceGroup[] = [plainGroup]) {
    const props: UseConfigureFieldRowProps = {
        project: createMockProject({ adobe: { organization: 'org-1@AdobeOrg' } }),
        componentConfigs: CONFIGS,
        componentSecretFlags: SECRET_FLAGS,
        serviceGroups,
        getFieldValue,
        updateField,
        validationErrors: ERRORS,
        touchedFields: TOUCHED,
        normalizeUrlField,
    };
    return renderHook(() => useConfigureFieldRow(props));
}

describe('useConfigureFieldRow', () => {
    beforeEach(() => jest.clearAllMocks());

    it('runs store detection against the saved configs, the project org and its saved secrets', () => {
        render();

        expect(useAutoStoreDetect).toHaveBeenCalledWith({
            configs: CONFIGS,
            orgId: 'org-1@AdobeOrg',
            fetchStores: mockFetchStores,
            hasStoreData: false,
            isFetching: true,
            secretFlags: SECRET_FLAGS,
        });
    });

    it('returns the detection key as the Business Structure signal', () => {
        const { result } = render();

        expect(result.current.autoDetectKey).toBe('k-1');
    });

    it('does not probe the shared credential when no group declares the OAuth field', () => {
        render([plainGroup]);

        expect(useCredentialService).toHaveBeenCalledWith(false, 'org-1@AdobeOrg');
    });

    it('probes the shared credential for the project org when a group declares it', () => {
        render([plainGroup, accsGroup]);

        expect(useCredentialService).toHaveBeenCalledWith(true, 'org-1@AdobeOrg');
    });

    it('renders a store-config row carrying everything the row needs', () => {
        const { result } = render();

        const row = result.current.renderFieldRow(urlField, plainGroup) as ReactElement;

        expect(row.type).toBe(StoreConfigFieldRow);
        expect(row.props).toStrictEqual({
            field: urlField,
            group: plainGroup,
            credentialService: mockCredential,
            secretFlags: SECRET_FLAGS,
            autoDetectKey: 'k-1',
            isFetching: true,
            hasStoreData: false,
            fetchError: 'unreachable',
            isStoreGroup: mockIsStoreGroup,
            getFieldValue,
            updateField,
            validationErrors: ERRORS,
            touchedFields: TOUCHED,
            normalizeUrlField,
            getWebsiteItems: mockWebsiteItems,
            getStoreGroupItems: mockGroupItems,
            getStoreViewItems: mockViewItems,
            onRefresh: mockForceFetch,
        });
    });
});
