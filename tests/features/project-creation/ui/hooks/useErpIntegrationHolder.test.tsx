/**
 * useErpIntegrationHolder — does another local project already run an ERP
 * integration on this Commerce instance? (AB-78)
 *
 * Asserted: the wizard asks only on Integrations once a backend is chosen, with
 * exactly its choices; the dashboard asks about the open project; the answer names
 * the message and greys out every ERP integration catalog entry (the real catalog);
 * no holder, a failed request, or no question at all is no answer; and each mount
 * asks again, because other projects change while a webview stays open.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import {
    ASK_ABOUT_OPEN_PROJECT,
    selectsErpIntegration,
    useErpIntegrationHolder,
    wizardHolderRequest,
} from '@/features/project-creation/ui/hooks/useErpIntegrationHolder';
import type { WizardState } from '@/types/webview';
import type { CheckErpIntegrationHolderResponse } from '@/types/webviewRequests';

const MESSAGE = 'justrite already has an ERP integration on this Commerce instance. Add your ERP there instead.';
const NOTE = 'justrite already has one on this Commerce instance';
const CONFIGS = {
    'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://na1.api.commerce.adobe.com/tenant-x/graphql' },
};

function wizard(overrides: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'build-your-project',
        activeBuildArea: 'integrations',
        components: { backend: 'adobe-commerce-accs' },
        componentConfigs: CONFIGS,
        ...overrides,
    } as WizardState;
}

function held(): CheckErpIntegrationHolderResponse {
    return { success: true, data: { holder: 'justrite', message: MESSAGE, note: NOTE } };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
});

describe('wizardHolderRequest', () => {
    it('asks on Integrations with the backend, its values and the project being edited', () => {
        expect(wizardHolderRequest(wizard({ editProjectPath: '/projects/x' }))).toEqual({
            backend: 'adobe-commerce-accs',
            componentConfigs: CONFIGS,
            editProjectPath: '/projects/x',
        });
    });

    it('asks nothing on another area', () => {
        expect(wizardHolderRequest(wizard({ activeBuildArea: 'commerce' }))).toBeUndefined();
    });

    it('asks nothing before a backend is chosen', () => {
        expect(wizardHolderRequest(wizard({ components: {} }))).toBeUndefined();
    });
});

describe('selectsErpIntegration', () => {
    it('is true for the ERP integration and false for anything else', () => {
        expect(selectsErpIntegration(['erp-integration'])).toBe(true);
        expect(selectsErpIntegration(['commerce-integration-starter-kit', 'demo-erp'])).toBe(false);
        expect(selectsErpIntegration(undefined)).toBe(false);
    });
});

describe('useErpIntegrationHolder', () => {
    it('answers the message and greys out the ERP integration, and nothing else', async () => {
        mockRequest.mockResolvedValue(held());

        const { result } = renderHook(() => useErpIntegrationHolder(wizardHolderRequest(wizard())));
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledWith('check-erp-integration-holder', wizardHolderRequest(wizard()));
        expect(result.current?.message).toBe(MESSAGE);
        expect(result.current?.unavailable).toEqual({ 'erp-integration': NOTE });
    });

    it("asks the dashboard's question about the open project", async () => {
        mockRequest.mockResolvedValue(held());

        renderHook(() => useErpIntegrationHolder(ASK_ABOUT_OPEN_PROJECT));
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledWith('check-erp-integration-holder', {});
    });

    it('asks nothing when there is no question', () => {
        const { result } = renderHook(() => useErpIntegrationHolder(undefined));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current).toBeUndefined();
    });

    it('is no answer when no project holds the instance — control', async () => {
        mockRequest.mockResolvedValue({ success: true, data: {} });

        const { result } = renderHook(() => useErpIntegrationHolder(ASK_ABOUT_OPEN_PROJECT));
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(result.current).toBeUndefined();
    });

    it('is no answer when the request fails', async () => {
        mockRequest.mockRejectedValue(new Error('gone'));

        const { result } = renderHook(() => useErpIntegrationHolder(ASK_ABOUT_OPEN_PROJECT));
        await act(async () => {});

        expect(result.current).toBeUndefined();
    });

    it('clears the answer when the instance changes to one nobody holds', async () => {
        mockRequest.mockResolvedValueOnce(held()).mockResolvedValueOnce({ success: true, data: {} });
        const other = { ...CONFIGS, 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://other/graphql' } };

        const { result, rerender } = renderHook(({ state }) => useErpIntegrationHolder(wizardHolderRequest(state)), {
            initialProps: { state: wizard() },
        });
        await act(async () => {});
        expect(result.current?.message).toBe(MESSAGE);

        rerender({ state: wizard({ componentConfigs: other }) });
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(result.current).toBeUndefined();
    });

    it('asks again on the next mount, since other projects can change meanwhile', async () => {
        mockRequest.mockResolvedValue(held());

        const first = renderHook(() => useErpIntegrationHolder(ASK_ABOUT_OPEN_PROJECT));
        await act(async () => {});
        first.unmount();
        renderHook(() => useErpIntegrationHolder(ASK_ABOUT_OPEN_PROJECT));
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(2);
    });
});
