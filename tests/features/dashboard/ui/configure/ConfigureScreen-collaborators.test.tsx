/**
 * ConfigureScreen — the arguments it hands its collaborators.
 *
 * Two of this screen's decisions are invisible on screen because the thing
 * that consumes them is a hook: the focus-trap configuration, and the App
 * Builder field groups the rail is built from. A mock answers the same whatever it is handed,
 * so each is asserted on the ARGUMENT rather than on a rendered consequence.
 */

import './ConfigureScreen.mocks';
import { render } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import { mockProject, mockComponentsData, railTabLabels } from './ConfigureScreen.testUtils';

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({ autoDetectKey: undefined, forceFetch: jest.fn() }),
}));

const focusTrap = useFocusTrap as jest.Mock;

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

beforeEach(() => {
    jest.clearAllMocks();
    focusTrap.mockReturnValue({ current: null });
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

describe('ConfigureScreen — integrations', () => {
    it("gives an integration no rail tab: its settings live on its own tile (AB-21)", () => {
        renderScreen({
            project: {
                ...mockProject,
                appBuilderComponents: {
                    'erp-integration': { kind: 'integration', status: 'deployed', name: 'ERP integration', source: { owner: 'acme', repo: 'erp' } },
                },
                componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' } },
            },
        });

        expect(railTabLabels()).not.toContain('ERP integration');
        expect(railTabLabels()).toContain('Project');
    });
});
