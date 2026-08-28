/**
 * useIntegrationFlow — api-edit mode (re-open the picker for an existing
 * integration's APIs).
 *
 * A custom/import result row's APIs "Change" opens the modal in `api-edit` mode
 * with an {@link ApiEditTarget}. The hook seeds the picker from the target's
 * current picks, walks a single-stage order (api-access only), and Save writes
 * `selectedConsoleApis[componentId]` — even an EMPTY set clears the key. No
 * builder toggle runs (the integration already exists) and there is no Back.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import type { RenderHookResult } from '@testing-library/react';
import { useIntegrationFlow } from '@/features/project-creation/ui/components/integration-flow/useIntegrationFlow';
import type {
    ApiEditTarget,
    UseIntegrationFlowArgs,
    UseIntegrationFlowReturn,
} from '@/features/project-creation/ui/components/integration-flow/useIntegrationFlow';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

// The picker fetch (list-org-console-apis) is issued by ApiPickerStage, not the
// hook — the hook never calls webviewClient in api-edit — but the module is
// imported transitively, so stub it to a no-op.
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: jest.fn(), postMessage: jest.fn(), onMessage: () => () => {} },
}));

const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
    adobeProject: { id: 'proj-1', name: 'proj-one', title: 'Project One' },
    adobeWorkspace: { id: 'ws-1', name: 'Stage', title: 'Stage' },
};

interface Setup {
    result: RenderHookResult<UseIntegrationFlowReturn, { state: WizardState }>['result'];
    updateState: jest.Mock;
    builder: {
        onAppBuilderComponentToggle: jest.Mock;
        onAddCustomAppBuilderComponent: jest.Mock;
    };
    onClose: jest.Mock;
    stateRef: { current: WizardState };
}

function setup(editTarget: ApiEditTarget, initial: Partial<WizardState> = {}): Setup {
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'build-your-project',
            projectName: '',
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            ...SIGNED_IN,
            ...initial,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    const builder = {
        onAppBuilderComponentToggle: jest.fn(),
        onAddCustomAppBuilderComponent: jest.fn(),
    };
    const onClose = jest.fn();
    const { result } = renderHook(() =>
        useIntegrationFlow({
            state: stateRef.current,
            updateState,
            mode: 'api-edit',
            editTarget,
            meshComponent: undefined,
            catalog: EMPTY_CATALOG,
                reservedIds: new Set<string>(),
            builder,
            onClose,
        } as UseIntegrationFlowArgs)
    );
    return { result, updateState, builder, onClose, stateRef };
}

const TARGET: ApiEditTarget = {
    componentId: 'acme-widget',
    kind: 'custom',
    picks: ['FireflyServicesSDK'],
};

describe('useIntegrationFlow — api-edit mode', () => {
    it('opens on the picker seeded with the target picks, footer "Save", no Back', () => {
        const s = setup(TARGET, { selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'] } });
        expect(s.result.current.stage).toBe('api-access');
        expect(s.result.current.draft.selectedApis).toEqual(['FireflyServicesSDK']);
        expect(s.result.current.draft.kind).toBe('custom');
        expect(s.result.current.continueLabel).toBe('Save');
        expect(s.result.current.canGoBack).toBe(false);
    });

    it('Save writes the (edited) picks under the target id and closes — no builder toggle', () => {
        const s = setup(TARGET, { selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'] } });
        act(() => s.result.current.toggleApi('PhotoshopSDK')); // add a second pick
        act(() => s.result.current.onContinue()); // Save
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK', 'PhotoshopSDK'] },
        });
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('removing every pick clears the key (Save writes without the id)', () => {
        const s = setup(TARGET, {
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'], 'other-app': ['XSDK'] },
        });
        act(() => s.result.current.toggleApi('FireflyServicesSDK')); // un-pick the only one
        act(() => s.result.current.onContinue()); // Save
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'other-app': ['XSDK'] },
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('preserves other integrations’ picks when saving one', () => {
        const s = setup(TARGET, {
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'], 'erp-sync': ['ErpSDK'] },
        });
        act(() => s.result.current.onContinue()); // Save unchanged picks
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'], 'erp-sync': ['ErpSDK'] },
        });
    });
});
