/**
 * apiSubscriber Test Suite (Step 07)
 *
 * The two-path-by-platformList, union-reconcile API subscriber. Per the D1
 * spike (Q5, DEFINITIVE/CORRECTION sections):
 * - resolve a deployable's requiredApis -> service infos via getServicesForOrg;
 * - partition by each service's platformList: apiKey/AdobeID services (incl.
 *   API Mesh GraphQLServiceSDK) vs oauth_server_to_server (e.g.
 *   AdobeIOManagementAPISDK);
 * - subscribe the UNION of all deployables' requiredApis + baseline
 *   AdobeIOManagementAPISDK; idempotent reconcile.
 *
 * The SDK is MOCKED here — no live Adobe calls. We assert the correct
 * method/path/shape per service platform.
 */

import {
    computeRequiredApis,
    resolveServiceInfos,
    partitionByPlatform,
    subscribeRequiredApis,
    BASELINE_API,
    type ServiceInfo,
    type ApiSubscriberClient,
    type OrgTarget,
} from '@/features/app-builder/services/apiSubscriber';
import type { DeployableCatalogEntry } from '@/types/deployables';

const MGMT = 'AdobeIOManagementAPISDK';
const MESH = 'GraphQLServiceSDK';

function meshDeployable(): DeployableCatalogEntry {
    return {
        id: 'mesh',
        name: 'API Mesh',
        description: '',
        kind: 'mesh',
        source: { owner: 'o', repo: 'r' },
        requiredApis: [MESH],
    };
}

function integrationDeployable(apis: string[]): DeployableCatalogEntry {
    return {
        id: 'erp',
        name: 'ERP',
        description: '',
        kind: 'integration',
        source: { owner: 'o', repo: 'erp' },
        requiredApis: apis,
    };
}

const SERVICES_FOR_ORG = [
    { code: MESH, platformList: ['apiKey'], domainMandatory: true },
    { code: MGMT, platformList: ['oauth_server_to_server'] },
    { code: 'SomeOtherSDK', platformList: ['oauth_server_to_server'] },
];

describe('apiSubscriber', () => {
    describe('computeRequiredApis (union + baseline)', () => {
        it('should union every deployable requiredApis plus the baseline', () => {
            const result = computeRequiredApis([
                meshDeployable(),
                integrationDeployable(['SomeOtherSDK']),
            ]);
            expect(result).toContain(MESH);
            expect(result).toContain('SomeOtherSDK');
            expect(result).toContain(BASELINE_API);
            expect(BASELINE_API).toBe(MGMT);
        });

        it('should always include the baseline even with no deployables', () => {
            expect(computeRequiredApis([])).toEqual([MGMT]);
        });

        it('should dedupe APIs declared by multiple deployables', () => {
            const result = computeRequiredApis([
                integrationDeployable([MESH]),
                meshDeployable(),
            ]);
            expect(result.filter((a) => a === MESH)).toHaveLength(1);
        });
    });

    describe('resolveServiceInfos (name -> sdkCode via getServicesForOrg)', () => {
        it('should map known API names to their service info', () => {
            const infos = resolveServiceInfos([MESH, MGMT], SERVICES_FOR_ORG);
            const codes = infos.map((i) => i.sdkCode);
            expect(codes).toContain(MESH);
            expect(codes).toContain(MGMT);
        });

        it('should carry platformList and domainMandatory through', () => {
            const [meshInfo] = resolveServiceInfos([MESH], SERVICES_FOR_ORG);
            expect(meshInfo.platformList).toEqual(['apiKey']);
            expect(meshInfo.domainMandatory).toBe(true);
        });

        it('should throw on an unknown API name', () => {
            expect(() => resolveServiceInfos(['NotARealSDK'], SERVICES_FOR_ORG)).toThrow(/NotARealSDK/);
        });
    });

    describe('partitionByPlatform', () => {
        it('should put GraphQLServiceSDK in apiKey and AdobeIOManagementAPISDK in s2s', () => {
            const infos: ServiceInfo[] = resolveServiceInfos([MESH, MGMT], SERVICES_FOR_ORG);
            const { apiKey, oauthS2S } = partitionByPlatform(infos);
            expect(apiKey.map((s) => s.sdkCode)).toEqual([MESH]);
            expect(oauthS2S.map((s) => s.sdkCode)).toEqual([MGMT]);
        });
    });

    describe('subscribeRequiredApis (orchestrator, mocked SDK client)', () => {
        let client: jest.Mocked<ApiSubscriberClient>;
        const orgTarget: OrgTarget = {
            orgId: 'org1',
            projectId: 'proj1',
            workspaceId: 'ws1',
        };

        beforeEach(() => {
            client = {
                getServicesForOrg: jest.fn().mockResolvedValue(SERVICES_FOR_ORG),
                ensureOAuthCredentialId: jest.fn().mockResolvedValue('s2s-int-id'),
                createAdobeIdCredential: jest.fn().mockResolvedValue('apikey-int-id'),
                subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
                subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            } as unknown as jest.Mocked<ApiSubscriberClient>;
        });

        it('should subscribe the s2s baseline with id_integration and free-service shape', async () => {
            await subscribeRequiredApis([integrationDeployable(['SomeOtherSDK'])], orgTarget, client);

            expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
                'org1',
                's2s-int-id',
                expect.arrayContaining([
                    { sdkCode: MGMT, licenseConfigs: null, roles: null },
                    { sdkCode: 'SomeOtherSDK', licenseConfigs: null, roles: null },
                ]),
            );
        });

        it('should create an apiKey credential then subscribe GraphQLServiceSDK via the AdobeId path', async () => {
            await subscribeRequiredApis([meshDeployable()], orgTarget, client);

            expect(client.createAdobeIdCredential).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws1',
                expect.objectContaining({ platform: 'apiKey', domain: expect.any(String) }),
            );
            expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith(
                'org1',
                'apikey-int-id',
                expect.arrayContaining([{ sdkCode: MESH, licenseConfigs: null, roles: null }]),
            );
        });

        it('should pass a derived localhost domain (not example.com) for the mandatory mesh domain', async () => {
            await subscribeRequiredApis([meshDeployable()], orgTarget, client, 'localhost:4000');

            const credArgs = client.createAdobeIdCredential.mock.calls[0][3] as { domain: string };
            expect(credArgs.domain).toBe('localhost:4000');
            expect(credArgs.domain).not.toBe('example.com');
        });

        it('should default the domain to localhost:3000 when none is supplied', async () => {
            await subscribeRequiredApis([meshDeployable()], orgTarget, client);

            const credArgs = client.createAdobeIdCredential.mock.calls[0][3] as { domain: string };
            expect(credArgs.domain).toBe('localhost:3000');
        });

        it('should NOT skip mesh: a mesh-only set still subscribes GraphQLServiceSDK via apiKey', async () => {
            await subscribeRequiredApis([meshDeployable()], orgTarget, client);
            expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalled();
        });

        it('should still subscribe the s2s baseline for a mesh-only set', async () => {
            await subscribeRequiredApis([meshDeployable()], orgTarget, client);
            expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
                'org1',
                's2s-int-id',
                expect.arrayContaining([{ sdkCode: MGMT, licenseConfigs: null, roles: null }]),
            );
        });

        it('should be idempotent: calling twice does not throw and converges to the union', async () => {
            await subscribeRequiredApis([meshDeployable()], orgTarget, client);
            await expect(
                subscribeRequiredApis([meshDeployable()], orgTarget, client),
            ).resolves.not.toThrow();

            // Each call subscribes the FULL union (reconcile, not a delta).
            const lastS2S = client.subscribeOAuthServerToServerIntegrationToServices.mock.calls.at(-1);
            expect(lastS2S?.[2]).toEqual(
                expect.arrayContaining([{ sdkCode: MGMT, licenseConfigs: null, roles: null }]),
            );
        });

        it('should not create an apiKey credential when no apiKey service is required', async () => {
            await subscribeRequiredApis([integrationDeployable(['SomeOtherSDK'])], orgTarget, client);
            expect(client.createAdobeIdCredential).not.toHaveBeenCalled();
        });
    });
});
