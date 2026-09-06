/**
 * ConfigureScreen — the arguments it hands its collaborators.
 *
 * Three of this screen's decisions are invisible on screen because the thing
 * that consumes them is a hook: the focus-trap configuration, whether the
 * brokered-credential service should run at all, and the App Builder field
 * groups the rail is built from. A mock answers the same whatever it is handed,
 * so each is asserted on the ARGUMENT rather than on a rendered consequence.
 */

import './ConfigureScreen.mocks';
import { render } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import { useCredentialService } from '@/features/components/ui/hooks/useCredentialService';
import { ACCS_OAUTH_CLIENT_ID } from '@/core/config/envVarKeys';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { mockProject, mockComponentsData, railTabLabels } from './ConfigureScreen.testUtils';

jest.mock('@/features/components/ui/hooks/useCredentialService', () => ({
    useCredentialService: jest.fn(() => ({ loading: false })),
}));

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({ autoDetectKey: undefined, forceFetch: jest.fn() }),
}));

const focusTrap = useFocusTrap as jest.Mock;
const credentialService = useCredentialService as jest.Mock;

function renderScreen(props: Partial<React.ComponentProps<typeof ConfigureScreen>> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <ConfigureScreen
                project={mockProject}
                componentsData={mockComponentsData}
                {...props}
            />
        </Provider>
    );
}

/** mockComponentsData plus one backend field, chosen by key. */
function componentsDataWithBackendField(key: string, label: string) {
    return {
        ...mockComponentsData,
        backends: [
            {
                ...mockComponentsData.backends[0],
                configuration: {
                    requiredEnvVars: ['ADOBE_COMMERCE_ADMIN_USERNAME', key],
                    optionalEnvVars: [],
                },
            },
        ],
        envVars: {
            ...mockComponentsData.envVars,
            [key]: {
                key,
                label,
                type: 'text' as const,
                required: true,
                group: 'adobe-commerce',
            },
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    focusTrap.mockReturnValue({ current: null });
    credentialService.mockReturnValue({ loading: false });
});

describe('ConfigureScreen — the focus trap', () => {
    // Every field on this screen is inside the trap, so it must CONTAIN focus
    // without STEALING it: autoFocus would drag the caret into the first field
    // on every re-open. Nothing on screen reflects the configuration.
    it('is enabled and containing, but does not grab focus', () => {
        renderScreen();

        expect(focusTrap).toHaveBeenCalledWith({
            enabled: true,
            autoFocus: false,
            containFocus: true,
        });
    });
});

describe('ConfigureScreen — the brokered credential service', () => {
    it('runs when a service group asks for the brokered client id', () => {
        renderScreen({
            componentsData: componentsDataWithBackendField(ACCS_OAUTH_CLIENT_ID, 'Client ID'),
        });

        expect(credentialService).toHaveBeenCalledWith(true, mockProject.adobe?.organization);
    });

    // The control. Every other field on the same group must NOT switch it on —
    // an `every` in place of the `some` would read exactly this case wrongly.
    it('stays off when no group asks for it', () => {
        renderScreen({
            componentsData: componentsDataWithBackendField('SOME_OTHER_KEY', 'Other'),
        });

        expect(credentialService).toHaveBeenCalledWith(false, mockProject.adobe?.organization);
    });

    it('switches on when a later render brings the field with it', () => {
        const { rerender } = renderScreen();
        expect(credentialService).toHaveBeenLastCalledWith(
            false,
            mockProject.adobe?.organization
        );

        rerender(
            <Provider theme={defaultTheme}>
                <ConfigureScreen
                    project={mockProject}
                    componentsData={componentsDataWithBackendField(
                        ACCS_OAUTH_CLIENT_ID,
                        'Client ID'
                    )}
                />
            </Provider>
        );

        expect(credentialService).toHaveBeenLastCalledWith(true, mockProject.adobe?.organization);
    });
});

describe('ConfigureScreen — App Builder sections', () => {
    const erpEntry: AppBuilderComponentCatalogEntry = {
        id: 'erp-integration',
        name: 'ERP Integration',
        description: 'Test integration',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp', branch: 'main' },
        envSchema: [{ name: 'ERP_HOST', type: 'text', label: 'ERP Host' }],
    };

    it('gives each catalog entry with visible fields its own rail tab', () => {
        renderScreen({ appBuilderComponentCatalog: [erpEntry] });

        expect(railTabLabels()).toContain('ERP Integration');
    });

    // Configure re-sends `init` without remounting React, so a catalog that
    // arrives on a later render has to reach the rail.
    it('picks up a catalog that arrives after the first render', () => {
        const { rerender } = renderScreen();
        expect(railTabLabels()).not.toContain('ERP Integration');

        rerender(
            <Provider theme={defaultTheme}>
                <ConfigureScreen
                    project={mockProject}
                    componentsData={mockComponentsData}
                    appBuilderComponentCatalog={[erpEntry]}
                />
            </Provider>
        );

        expect(railTabLabels()).toContain('ERP Integration');
    });
});
