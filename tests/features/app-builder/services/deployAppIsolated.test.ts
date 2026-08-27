/**
 * deployAppComponentIsolated — the ONE isolating app-deploy seam (ADR-011 D3 Step 03).
 *
 * Package isolation is the prune boundary in the shared Adobe I/O workspace:
 * `aio app deploy` prunes only entities in the app's own package, so EVERY
 * integration deploy must rewrite `app.config.yaml` to a distinct derived
 * `ow.package` before the deploy tail runs. This seam is shared by BOTH deploy
 * surfaces (the keyed runner deps wiring and the singular `deployAppHeadless`)
 * so no un-isolated path survives.
 *
 * Strict TDD: written BEFORE the module exists.
 */

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    applyIsolatedPackages: jest.fn(),
}));
jest.mock('@/features/app-builder/services/appDeployment', () => ({
    deployAppComponent: jest.fn(),
}));

import { applyIsolatedPackages } from '@/features/app-builder/services/appConfigPackages';
import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import { deployAppComponentIsolated } from '@/features/app-builder/services/deployAppIsolated';
import type { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

const mockApply = applyIsolatedPackages as jest.MockedFunction<typeof applyIsolatedPackages>;
const mockDeploy = deployAppComponent as jest.MockedFunction<typeof deployAppComponent>;

function createLogger(): Logger {
    return { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() } as never;
}

const commandManager = { execute: jest.fn() } as unknown as CommandExecutor;

describe('deployAppComponentIsolated', () => {
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createLogger();
        mockApply.mockResolvedValue(true);
        mockDeploy.mockResolvedValue({
            success: true,
            data: { url: 'https://app.example', deployedUrls: { web: 'https://app.example' } },
        });
    });

    it('applies package isolation BEFORE running the app deploy tail', async () => {
        await deployAppComponentIsolated('/proj/components/erp', 'erp-pkg', commandManager, logger);

        expect(mockApply).toHaveBeenCalledTimes(1);
        expect(mockDeploy).toHaveBeenCalledTimes(1);
        expect(mockApply.mock.invocationCallOrder[0]).toBeLessThan(
            mockDeploy.mock.invocationCallOrder[0],
        );
    });

    it('hands the component path and the derived ow.package to the isolation transform', async () => {
        await deployAppComponentIsolated('/proj/components/erp', 'erp-pkg', commandManager, logger);

        expect(mockApply).toHaveBeenCalledWith('/proj/components/erp', 'erp-pkg');
    });

    it('forwards path, command manager, logger, progress and node version to the deploy tail', async () => {
        const onProgress = jest.fn();
        await deployAppComponentIsolated(
            '/proj/components/erp',
            'erp-pkg',
            commandManager,
            logger,
            onProgress,
            '24',
        );

        expect(mockDeploy).toHaveBeenCalledWith(
            '/proj/components/erp',
            commandManager,
            logger,
            onProgress,
            '24',
        );
    });

    it('still deploys when there is nothing to isolate (standalone-ness is guaranteed at the add door)', async () => {
        mockApply.mockResolvedValue(false);

        const result = await deployAppComponentIsolated(
            '/proj/components/erp',
            'erp-pkg',
            commandManager,
            logger,
        );

        expect(mockDeploy).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('returns the deploy tail result unchanged on success', async () => {
        const result = await deployAppComponentIsolated(
            '/proj/components/erp',
            'erp-pkg',
            commandManager,
            logger,
        );

        expect(result).toEqual({
            success: true,
            data: { url: 'https://app.example', deployedUrls: { web: 'https://app.example' } },
        });
    });

    it('returns the deploy tail failure unchanged', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'deploy boom' });

        const result = await deployAppComponentIsolated(
            '/proj/components/erp',
            'erp-pkg',
            commandManager,
            logger,
        );

        expect(result).toEqual({ success: false, error: 'deploy boom' });
    });
});
