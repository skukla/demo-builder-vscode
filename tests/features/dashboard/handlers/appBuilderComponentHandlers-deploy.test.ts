/**
 * appBuilderComponentHandlers — what a deploy ANSWERS.
 *
 * The routing (guards, the runner call, the status pushes) is pinned in
 * appBuilderComponentHandlers.test.ts. This file pins the answer itself in the
 * two places it was read loosely: a clean deploy, and a refusal that has to name
 * an integration the catalog does not list.
 */

import {
    handleDeployAppBuilderComponent,
    mockDeployAppBuilderComponent,
    mockGetAppBuilderComponentCatalog,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
    vscodeMock,
} from './appBuilderComponentHandlers.testUtils';

beforeEach(() => {
    resetHandlerMocks();
});

describe('handleDeployAppBuilderComponent — the answer', () => {
    // A runner that reports no warnings at all (the field absent, not empty) is the
    // ordinary case. It must read as a plain success: no warning for the agent to
    // relay and no pop-up for the SC.
    it('answers a plain success when the runner reports no warnings', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockDeployAppBuilderComponent.mockResolvedValue({ success: true });

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result).toStrictEqual({ success: true, data: undefined });
        expect(vscodeMock.window.showWarningMessage).not.toHaveBeenCalled();
    });

    // The catalog can pair a system with an integration it does not itself list (a
    // stack-filtered or retired entry). The refusal still has to name SOMETHING, so
    // it falls back to the integration's id rather than failing the request.
    it("names a stranded system's integration by its id when the catalog does not list it", async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    name: 'Justrite ERP',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                },
            },
        });
        mockGetAppBuilderComponentCatalog.mockReturnValue([
            { id: 'demo-erp', kind: 'system', boundTo: 'erp-integration', name: 'ERP' },
        ]);
        mockTestDeveloperPermissions(true);

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'demo-erp' });

        expect(result).toStrictEqual({
            success: false,
            error: 'Justrite ERP came with erp-integration, which is not in this project. Add erp-integration to finish — it reuses Justrite ERP.',
        });
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
    });
});
