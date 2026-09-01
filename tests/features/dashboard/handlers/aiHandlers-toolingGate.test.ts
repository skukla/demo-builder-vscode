/**
 * aiHandlers — regenerate-path AI-tooling gate.
 *
 * The ai-defaults install used to be EDS-storefront-only; it now applies to any
 * App Builder-adjacent project (storefront, mesh, or attached App Builder
 * component) via projectNeedsAppBuilderTooling. The storefront and bare-project
 * cases are pinned in aiHandlers-setup.test.ts; this file covers the widened
 * gate.
 */

import {
    handleRegenerateAiFiles,
    generateAIContextFiles,
    installAiDefaultsMcpTools,
    createAiHandlerContext,
    seedCommandExecutor,
} from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';
import { COMPONENT_IDS } from '@/core/constants';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

describe('handleRegenerateAiFiles — tooling gate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCommandExecutor();
    });

    it('runs the tooling install for a mesh project without a storefront', async () => {
        (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);
        (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });

        const meshProject = {
            name: 'Test Project',
            path: '/projects/test',
            componentInstances: {
                [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                    path: '/projects/test/components/mesh',
                },
            },
        };
        const context = createAiHandlerContext({
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue(meshProject),
                saveProjectConfigOnly: jest.fn(),
            }) as unknown as HandlerContext['stateManager'],
        });

        await handleRegenerateAiFiles(context);

        expect(installAiDefaultsMcpTools).toHaveBeenCalledWith(
            meshProject.path,
            meshProject,
            expect.anything(),
            expect.any(Function)
        );
    });
});
