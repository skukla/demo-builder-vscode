/**
 * EDS Reset Service — the final steps and the RESULT.
 *
 * CDN verification, the optional mesh redeploy, state persistence, the
 * skipped-config-write signal, and the mapping of each failure to the result
 * the handler surfaces. Steps 0 through 11 live in
 * `edsResetService-orchestration.test.ts`.
 */

import {
    mockPublishConfig,
    mockRedeployApiMesh,
    mockResetRepoToTemplate,
    mockVerifyCdnResources,
    resetOrchestrationMocks,
    runReset,
} from './edsResetService.orchestrationHarness';

import { PAAS_GRAPHQL_ENDPOINT } from '@/core/config/envVarKeys';
import { GitHubAppNotInstalledError } from '@/features/eds/services/types';
import { meshDeps } from './edsResetService.testUtils';
import { createMockProject } from '../../../../helpers/projectFake';

jest.setTimeout(5000);

beforeEach(resetOrchestrationMocks);

describe('executeEdsReset - CDN verification', () => {
    it('does not verify the CDN unless asked', async () => {
        await runReset();

        expect(mockVerifyCdnResources).not.toHaveBeenCalled();
    });

    it('verifies config.json on the CDN when asked and reports the outcome', async () => {
        const { context, progress } = await runReset({ verifyCdn: true });

        expect(mockVerifyCdnResources).toHaveBeenCalledWith(
            'test-owner',
            'test-repo',
            context.logger
        );
        expect(progress).toContainEqual({
            step: 11,
            totalSteps: 11,
            message: 'Verifying configuration...',
        });
        expect(progress).toContainEqual({
            step: 11,
            totalSteps: 11,
            message: 'Configuration verified',
        });
    });

    it('reports a still-propagating config when CDN verification times out', async () => {
        mockVerifyCdnResources.mockResolvedValue({ configVerified: false });

        const { result, progress } = await runReset({ verifyCdn: true });

        expect(progress).toContainEqual({
            step: 11,
            totalSteps: 11,
            message: 'Configuration propagating...',
        });
        expect(progress).not.toContainEqual(
            expect.objectContaining({ message: 'Configuration verified' })
        );
        expect(result.success).toBe(true);
    });
});

describe('executeEdsReset - mesh redeploy', () => {
    it('does not redeploy the mesh unless asked, and says so on the result', async () => {
        const { result, progress } = await runReset();

        expect(mockRedeployApiMesh).not.toHaveBeenCalled();
        expect(result).toStrictEqual({
            success: true,
            filesReset: 5,
            contentCopied: 3,
            meshRedeployed: false,
        });
        expect(progress[0].totalSteps).toBe(11);
    });

    it('redeploys the mesh with the project, repo, counts and deps, adding a twelfth step', async () => {
        const { result, progress, project, context } = await runReset({ redeployMesh: true });

        expect(mockRedeployApiMesh).toHaveBeenCalledWith(
            project,
            'test-owner',
            'test-repo',
            context,
            expect.any(Function),
            5,
            3,
            meshDeps
        );
        expect(result).toStrictEqual({
            success: true,
            filesReset: 5,
            contentCopied: 3,
            meshRedeployed: true,
        });
        expect(progress[0].totalSteps).toBe(12);
    });

    it('returns the partial result from a failed mesh redeploy without saving the project', async () => {
        const partial = {
            success: true,
            filesReset: 5,
            contentCopied: 3,
            meshRedeployed: false,
            error: 'Reset completed but mesh redeployment failed: boom',
            errorType: 'MESH_REDEPLOY_FAILED',
        };
        mockRedeployApiMesh.mockResolvedValue(partial);

        const { result, context } = await runReset({ redeployMesh: true });

        expect(result).toBe(partial);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});

describe('executeEdsReset - state persistence and the result', () => {
    it('saves the project as published with the storefront env vars from its configs', async () => {
        const project = createMockProject({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            componentConfigs: {
                'commerce-paas': { [PAAS_GRAPHQL_ENDPOINT]: 'https://commerce.example/graphql' },
            },
        });

        const { context } = await runReset({ project });

        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(project.edsStorefrontStatusSummary).toBe('published');
        expect(project.edsStorefrontState?.envVars).toStrictEqual({
            [PAAS_GRAPHQL_ENDPOINT]: 'https://commerce.example/graphql',
        });
    });

    it('still saves a project that has no component configs at all', async () => {
        const project = createMockProject({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            componentConfigs: undefined,
        });

        const { result, context } = await runReset({ project });

        expect(result.success).toBe(true);
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(project.edsStorefrontState?.envVars).toStrictEqual({});
    });

    it('surfaces a skipped config write on the otherwise successful result', async () => {
        mockPublishConfig.mockResolvedValue({ configWritten: false });

        const { result } = await runReset();

        expect(result).toStrictEqual({
            success: true,
            filesReset: 5,
            contentCopied: 3,
            meshRedeployed: false,
            errorType: 'CONFIG_WRITE_FAILED',
            error:
                'The site configuration could not be written, so product detail pages ' +
                'will not load. Run "Demo Builder: Repair Site Configuration" to finish it.',
        });
    });
});

describe('executeEdsReset - error mapping', () => {
    it('maps a missing GitHub App to a structured result carrying the install URL', async () => {
        mockResetRepoToTemplate.mockRejectedValue(
            new GitHubAppNotInstalledError(
                'test-owner',
                'test-repo',
                'https://github.com/apps/aem-code-sync'
            )
        );

        const { result } = await runReset();

        expect(result).toStrictEqual({
            success: false,
            error: 'GitHub App not installed. Code sync requires the AEM Code Sync app.',
            errorType: 'GITHUB_APP_NOT_INSTALLED',
            errorDetails: {
                owner: 'test-owner',
                repo: 'test-repo',
                installUrl: 'https://github.com/apps/aem-code-sync',
            },
        });
    });

    it('maps any other failure to a plain error result', async () => {
        mockResetRepoToTemplate.mockRejectedValue(new Error('tree API 500'));

        const { result } = await runReset();

        expect(result).toStrictEqual({ success: false, error: 'tree API 500' });
    });
});
