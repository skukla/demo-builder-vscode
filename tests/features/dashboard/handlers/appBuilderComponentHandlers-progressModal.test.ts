/**
 * PL-59 — an operation the SC started on the integrations screen narrates to that
 * screen's modal: each stage with its step and expectation line, then a terminal
 * state. No notification opens for it, and the card still gets its one line.
 */
import {
    handleDeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    mockEnsureAdobeIOAuth,
    mockSendAppBuilderComponentStatusUpdate,
    mockSendComponentOperationProgress,
    resetHandlerMocks,
    setupMocks,
    vscodeMock,
    withComponentProgress,
} from './appBuilderComponentHandlers.testUtils';
import { OPERATION_STAGES } from '@/features/app-builder/services/operationStages';
import { handleGetComponentOperationProgress } from '@/features/dashboard/handlers/componentOperationProgress';
import type { AppBuilderComponentState } from '@/types/base';

const STAGE = OPERATION_STAGES.deployingApp;

const DEPLOYED: Record<string, AppBuilderComponentState> = {
    'erp-sync': {
        kind: 'integration',
        status: 'deployed',
        name: 'ERP Sync',
        source: { owner: 'acme', repo: 'erp-sync' },
    },
};

function options(progress?: 'modal') {
    return {
        title: 'Deploying',
        id: 'erp-sync',
        label: 'ERP Sync',
        noun: 'Integration',
        logger: setupMocks().mockContext.logger,
        progress,
    };
}

beforeEach(() => {
    resetHandlerMocks();
});

describe('withComponentProgress — started from the integrations screen', () => {
    it('sends each stage with its step and expectation line to the modal', async () => {
        await withComponentProgress(options('modal'), async (report) => {
            report(STAGE.label, 'Running aio app deploy');
            return { success: true };
        });

        expect(mockSendComponentOperationProgress).toHaveBeenCalledWith({
            id: 'erp-sync',
            state: 'running',
            stage: STAGE.label,
            step: 'Running aio app deploy',
            expectation: STAGE.expectation,
        });
    });

    it("fills the step line with the stage's own detail when the report names none", async () => {
        await withComponentProgress(options('modal'), async (report) => {
            report(OPERATION_STAGES.subscribingApis.label);
            return { success: true };
        });

        expect(mockSendComponentOperationProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                stage: OPERATION_STAGES.subscribingApis.label,
                step: OPERATION_STAGES.subscribingApis.detail,
            }),
        );
    });

    it('ends with succeeded, and opens no notification', async () => {
        await withComponentProgress(options('modal'), async () => ({ success: true }));

        expect(mockSendComponentOperationProgress).toHaveBeenLastCalledWith({
            id: 'erp-sync',
            state: 'succeeded',
        });
        expect(vscodeMock.window.withProgress).not.toHaveBeenCalled();
    });

    it('ends with failed and the reason', async () => {
        await withComponentProgress(options('modal'), async () => ({
            success: false,
            error: 'Adobe refused this',
        }));

        expect(mockSendComponentOperationProgress).toHaveBeenLastCalledWith({
            id: 'erp-sync',
            state: 'failed',
            error: 'Adobe refused this',
        });
    });

    it('still gives the card its one line', async () => {
        await withComponentProgress(options('modal'), async () => ({ success: true }));

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            'Deploying Integration',
            undefined,
        );
    });

    it('keeps a failure so a reopened modal can read it, and forgets a success', async () => {
        const { mockContext } = setupMocks();
        await withComponentProgress(options('modal'), async () => ({
            success: false,
            error: 'boom',
        }));

        await expect(
            handleGetComponentOperationProgress(mockContext, { id: 'erp-sync' }),
        ).resolves.toStrictEqual({
            success: true,
            data: { id: 'erp-sync', state: 'failed', error: 'boom' },
        });

        await withComponentProgress(options('modal'), async () => ({ success: true }));

        await expect(
            handleGetComponentOperationProgress(mockContext, { id: 'erp-sync' }),
        ).resolves.toStrictEqual({ success: true, data: null });
    });
});

describe('withComponentProgress — everywhere else', () => {
    it('opens the notification and sends nothing to a modal', async () => {
        await withComponentProgress(options(), async (report) => {
            report(STAGE.label, 'Running aio app deploy');
            return { success: true };
        });

        expect(vscodeMock.window.withProgress).toHaveBeenCalled();
        expect(mockSendComponentOperationProgress).not.toHaveBeenCalled();
    });
});

describe('a modal-hosted request always ends', () => {
    it('marks the run running before the handler does anything', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync', progress: 'modal' });

        expect(mockSendComponentOperationProgress).toHaveBeenNthCalledWith(1, {
            id: 'erp-sync',
            state: 'running',
        });
    });

    it('ends with the refusal when the handler stops before the operation starts', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync', progress: 'modal' });

        expect(mockSendComponentOperationProgress).toHaveBeenLastCalledWith({
            id: 'erp-sync',
            state: 'failed',
            error: 'No project found',
        });
    });

    it('ends in plain words when the handler throws, and still throws', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockRejectedValue(
            new Error('ENOENT: .demo-builder.json'),
        );

        await expect(
            handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync', progress: 'modal' }),
        ).rejects.toThrow('ENOENT');
        expect(mockSendComponentOperationProgress).toHaveBeenLastCalledWith({
            id: 'erp-sync',
            state: 'failed',
            error: 'The operation stopped unexpectedly. Details are in Debug Logs.',
        });
    });

    it('replaces an earlier failure the moment a new run starts', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync', progress: 'modal' });
        let held: unknown;
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockImplementation(async () => {
            held = (await handleGetComponentOperationProgress(mockContext, { id: 'erp-sync' })).data;
            return undefined;
        });

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync', progress: 'modal' });

        expect(held).toStrictEqual({ id: 'erp-sync', state: 'running' });
    });

    it('sends nothing to a modal for a request that did not ask for one', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendComponentOperationProgress).not.toHaveBeenCalled();
    });

    it('shows a guard refusal in the modal only, with no warning pop-up', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync', progress: 'modal' });

        expect(vscodeMock.window.showWarningMessage).not.toHaveBeenCalled();
        expect(mockSendComponentOperationProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'erp-sync', state: 'failed' }),
        );
    });
});
