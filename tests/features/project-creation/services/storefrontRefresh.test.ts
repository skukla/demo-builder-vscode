/**
 * refreshStorefront — what reads the mesh's address is brought up to date after a
 * mesh is added or removed. An Edge Delivery storefront is republished; a headless
 * frontend's settings files are written again. The headless case used to go to the
 * republish, which has no storefront to publish: it warned "EDS metadata missing"
 * and the frontend kept the old address.
 */

jest.mock('@/features/project-creation/helpers/envFileRegeneration', () => ({
    regenerateProjectEnvFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn().mockResolvedValue({ success: true }),
}));

import type * as vscode from 'vscode';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers/envFileRegeneration';
import {
    refreshStorefront,
    type StorefrontRefreshDeps,
} from '@/features/project-creation/services/storefrontRefresh';
import type { ComponentRegistry } from '@/types/components';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

const REGISTRY = { envVars: {} } as unknown as ComponentRegistry;

function deps(): StorefrontRefreshDeps {
    return {
        loadRegistry: jest.fn().mockResolvedValue(REGISTRY),
        logger: createMockLogger(),
        secrets: {} as vscode.SecretStorage,
        saveProject: jest.fn().mockResolvedValue(undefined),
        ensureDaLiveSession: jest.fn().mockResolvedValue({ authenticated: true }),
    };
}

beforeEach(() => jest.clearAllMocks());

describe('refreshStorefront', () => {
    it("writes a headless project's settings files again, and publishes nothing", async () => {
        const given = deps();
        const project = createMockProject({ selectedStack: 'headless-paas' });

        const result = await refreshStorefront(project, given);

        expect(result).toStrictEqual({ success: true });
        expect(regenerateProjectEnvFiles).toHaveBeenCalledWith(project, REGISTRY, given.logger, given.secrets);
        expect(republishStorefrontConfig).not.toHaveBeenCalled();
    });

    it('says so when the settings files could not be written', async () => {
        (regenerateProjectEnvFiles as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));

        const result = await refreshStorefront(createMockProject({ selectedStack: 'headless-paas' }), deps());

        expect(result).toStrictEqual({
            success: false,
            error: 'the settings files were not written: EACCES',
        });
    });

    it('republishes an Edge Delivery storefront, and writes no settings files', async () => {
        const given = deps();
        const project = createMockProject({ selectedStack: 'eds-paas' });

        await refreshStorefront(project, given);

        expect(republishStorefrontConfig).toHaveBeenCalledWith({
            project,
            secrets: given.secrets,
            logger: given.logger,
            persist: given.saveProject,
            ensureDaLiveSession: given.ensureDaLiveSession,
        });
        expect(regenerateProjectEnvFiles).not.toHaveBeenCalled();
    });
});
