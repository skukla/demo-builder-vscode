/**
 * apiSubscriber Test Suite (Step 07)
 *
 * The two-path-by-platformList, union-reconcile API subscriber. Per the D1
 * spike (Q5, DEFINITIVE/CORRECTION sections):
 * - resolve an App Builder component's requiredApis -> service infos via getServicesForOrg;
 * - partition by each service's platformList: apiKey/AdobeID services (incl.
 *   API Mesh GraphQLServiceSDK) vs oauth_server_to_server (e.g.
 *   AdobeIOManagementAPISDK);
 * - subscribe the UNION of all appBuilderComponents' requiredApis + baseline
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
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

const MGMT = 'AdobeIOManagementAPISDK';
const MESH = 'GraphQLServiceSDK';

function meshAppBuilderComponent(): AppBuilderComponentCatalogEntry {
    return {
        id: 'mesh',
        name: 'API Mesh',
        description: '',
        kind: 'mesh',
        source: { owner: 'o', repo: 'r', branch: 'main' },
        requiredApis: [MESH],
    };
}

function integrationAppBuilderComponent(apis: string[]): AppBuilderComponentCatalogEntry {
    return {
        id: 'erp',
        name: 'ERP',
        description: '',
        kind: 'integration',
        source: { owner: 'o', repo: 'erp', branch: 'main' },
        requiredApis: apis,
    };
}

const SERVICES_FOR_ORG = [
    { code: MESH, name: 'API Mesh', platformList: ['apiKey'], domainMandatory: true },
    { code: MGMT, name: 'I/O Management API', platformList: ['oauth_server_to_server'] },
    { code: 'SomeOtherSDK', platformList: ['oauth_server_to_server'] },
];

describe('apiSubscriber', () => {
    describe('computeRequiredApis (union + baseline)', () => {
        it('should union every appBuilderComponent requiredApis plus the baseline', () => {
            const result = computeRequiredApis([
                meshAppBuilderComponent(),
                integrationAppBuilderComponent(['SomeOtherSDK']),
            ]);
            expect(result).toContain(MESH);
            expect(result).toContain('SomeOtherSDK');
            expect(result).toContain(BASELINE_API);
            expect(BASELINE_API).toBe(MGMT);
        });

        it('should always include the baseline even with no appBuilderComponents', () => {
            expect(computeRequiredApis([])).toEqual([MGMT]);
        });

        it('should dedupe APIs declared by multiple appBuilderComponents', () => {
            const result = computeRequiredApis([
                integrationAppBuilderComponent([MESH]),
                meshAppBuilderComponent(),
            ]);
            expect(result.filter((a) => a === MESH)).toHaveLength(1);
        });

        it('should union runtime-added extras (additionalConsoleApis) into every reconcile', () => {
            // The subscribe PUTs the FULL union — an extra omitted once would be
            // silently stripped. Extras ride alongside catalog APIs, deduped.
            const result = computeRequiredApis(
                [meshAppBuilderComponent()],
                ['FireflyAPISDK', MESH]
            );
            expect(result).toContain('FireflyAPISDK');
            expect(result).toContain(MESH);
            expect(result).toContain(BASELINE_API);
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
            expect(() => resolveServiceInfos(['NotARealSDK'], SERVICES_FOR_ORG)).toThrow(
                /NotARealSDK/
            );
        });

        it('should carry the org service display name through', () => {
            const [meshInfo] = resolveServiceInfos([MESH], SERVICES_FOR_ORG);
            expect(meshInfo.name).toBe('API Mesh');
        });

        it('should leave name undefined when the org service has none', () => {
            const [otherInfo] = resolveServiceInfos(['SomeOtherSDK'], SERVICES_FOR_ORG);
            expect(otherInfo.name).toBeUndefined();
        });
    });

    describe('partitionByPlatform', () => {
        it('should put GraphQLServiceSDK in apiKey and AdobeIOManagementAPISDK in s2s', () => {
            const infos: ServiceInfo[] = resolveServiceInfos([MESH, MGMT], SERVICES_FOR_ORG);
            const { apiKey, oauthS2S } = partitionByPlatform(infos);
            expect(apiKey.map((s) => s.sdkCode)).toEqual([MESH]);
            expect(oauthS2S.map((s) => s.sdkCode)).toEqual([MGMT]);
        });

        // A service listing NEITHER platform reaches neither subscribe endpoint, so
        // no PUT covers it — yet it used to be reported as subscribed all the same.
        // Reporting it is the whole fix: the caller can only warn about a silent
        // skip it is told about.
        it('reports a service that matches NEITHER platform', () => {
            const orphan: ServiceInfo = {
                sdkCode: 'OrphanSDK',
                name: 'Orphan',
                platformList: [],
                domainMandatory: false,
            };

            const { apiKey, oauthS2S, unmatched } = partitionByPlatform([orphan]);

            expect(apiKey).toEqual([]);
            expect(oauthS2S).toEqual([]);
            expect(unmatched.map((s) => s.sdkCode)).toEqual(['OrphanSDK']);
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
                // Default: credential carries nothing yet → the subscribe paths proceed.
                getSubscribedServiceCodes: jest.fn().mockResolvedValue([]),
                ensureOAuthCredentialId: jest.fn().mockResolvedValue('s2s-int-id'),
                createAdobeIdCredential: jest.fn().mockResolvedValue('apikey-int-id'),
                subscribeOAuthServerToServerIntegrationToServices: jest
                    .fn()
                    .mockResolvedValue(undefined),
                subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            } as unknown as jest.Mocked<ApiSubscriberClient>;
        });

        it('should subscribe the s2s baseline with id_integration and free-service shape', async () => {
            await subscribeRequiredApis(
                [integrationAppBuilderComponent(['SomeOtherSDK'])],
                orgTarget,
                client
            );

            expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
                'org1',
                's2s-int-id',
                expect.arrayContaining([
                    { sdkCode: MGMT, licenseConfigs: null, roles: null },
                    { sdkCode: 'SomeOtherSDK', licenseConfigs: null, roles: null },
                ])
            );
        });

        it('should create an apiKey credential then subscribe GraphQLServiceSDK via the AdobeId path', async () => {
            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            expect(client.createAdobeIdCredential).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws1',
                expect.objectContaining({ platform: 'apiKey', domain: expect.any(String) })
            );
        });

        it('scopes the credential name to the workspace and reuses the legacy fixed name', async () => {
            // AdobeID names are project-unique; a fixed name collides on the 2nd
            // workspace (409). The name is workspace-scoped, with the legacy name as a
            // reuse alias so existing single-workspace credentials are not duplicated.
            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            const credArgs = client.createAdobeIdCredential.mock.calls[0][3] as {
                name: string;
                reuseNames?: string[];
            };
            expect(credArgs.name).toBe('demo-builder-api-mesh-ws1');
            expect(credArgs.reuseNames).toEqual(['demo-builder-api-mesh']);
            expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith(
                'org1',
                'apikey-int-id',
                expect.arrayContaining([{ sdkCode: MESH, licenseConfigs: null, roles: null }])
            );
        });

        it('should pass a derived localhost domain (not example.com) for the mandatory mesh domain', async () => {
            await subscribeRequiredApis(
                [meshAppBuilderComponent()],
                orgTarget,
                client,
                'localhost:4000'
            );

            const credArgs = client.createAdobeIdCredential.mock.calls[0][3] as { domain: string };
            expect(credArgs.domain).toBe('localhost:4000');
            expect(credArgs.domain).not.toBe('example.com');
        });

        it('should default the domain to localhost:3000 when none is supplied', async () => {
            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            const credArgs = client.createAdobeIdCredential.mock.calls[0][3] as { domain: string };
            expect(credArgs.domain).toBe('localhost:3000');
        });

        it('should NOT skip mesh: a mesh-only set still subscribes GraphQLServiceSDK via apiKey', async () => {
            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);
            expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalled();
        });

        it('skips the s2s subscribe PUT when the baseline is already subscribed', async () => {
            (client.getSubscribedServiceCodes as jest.Mock).mockResolvedValue([MGMT, MESH]);

            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            expect(client.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
        });

        it('skips the apiKey subscribe PUT when the mesh API is already subscribed', async () => {
            (client.getSubscribedServiceCodes as jest.Mock).mockResolvedValue([MGMT, MESH]);

            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            expect(client.subscribeAdobeIdIntegrationToServices).not.toHaveBeenCalled();
        });

        it('still subscribes when the credential is missing a required code', async () => {
            // Has the baseline but NOT the mesh API → the apiKey path must subscribe.
            (client.getSubscribedServiceCodes as jest.Mock).mockResolvedValue([MGMT]);

            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalled();
        });

        it('subscribes when the current subscription set is unknown ([] fail-safe)', async () => {
            (client.getSubscribedServiceCodes as jest.Mock).mockResolvedValue([]);

            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);

            expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalled();
            expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalled();
        });

        it('should still subscribe the s2s baseline for a mesh-only set', async () => {
            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);
            expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
                'org1',
                's2s-int-id',
                expect.arrayContaining([{ sdkCode: MGMT, licenseConfigs: null, roles: null }])
            );
        });

        it('should be idempotent: calling twice does not throw and converges to the union', async () => {
            await subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);
            await expect(
                subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client)
            ).resolves.not.toThrow();

            // Each call subscribes the FULL union (reconcile, not a delta).
            const lastS2S =
                client.subscribeOAuthServerToServerIntegrationToServices.mock.calls.at(-1);
            expect(lastS2S?.[2]).toEqual(
                expect.arrayContaining([{ sdkCode: MGMT, licenseConfigs: null, roles: null }])
            );
        });

        it('should not create an apiKey credential when no apiKey service is required', async () => {
            await subscribeRequiredApis(
                [integrationAppBuilderComponent(['SomeOtherSDK'])],
                orgTarget,
                client
            );
            expect(client.createAdobeIdCredential).not.toHaveBeenCalled();
        });

        it('should return the resolved API list (union incl. baseline) with names', async () => {
            const result = await subscribeRequiredApis(
                [meshAppBuilderComponent()],
                orgTarget,
                client
            );

            expect(result).toHaveLength(2);
            expect(result).toEqual(
                expect.arrayContaining([
                    { code: MGMT, name: 'I/O Management API' },
                    { code: MESH, name: 'API Mesh' },
                ])
            );
        });

        it('should return name-less entries with name undefined', async () => {
            const result = await subscribeRequiredApis(
                [integrationAppBuilderComponent(['SomeOtherSDK'])],
                orgTarget,
                client
            );

            const other = result.find((api) => api.code === 'SomeOtherSDK');
            expect(other).toBeDefined();
            expect(other?.name).toBeUndefined();
        });

        describe('onProgress (per-service subscribe ticks, for a live UI)', () => {
            it('emits done:false then done:true for each subscribed code', async () => {
                const events: Array<{ code: string; done: boolean }> = [];
                await subscribeRequiredApis(
                    [meshAppBuilderComponent()],
                    orgTarget,
                    client,
                    undefined,
                    [],
                    (event) => {
                        events.push(event);
                    }
                );

                // Baseline (OAuth) and mesh (apiKey) each get a start + done tick.
                expect(events).toContainEqual({ code: MGMT, done: false });
                expect(events).toContainEqual({ code: MGMT, done: true });
                expect(events).toContainEqual({ code: MESH, done: false });
                expect(events).toContainEqual({ code: MESH, done: true });
            });

            it('runs the OAuth and apiKey groups CONCURRENTLY (apiKey does not wait for the OAuth PUT)', async () => {
                // Gate the OAuth subscribe PUT so it stays pending.
                let releaseOAuth!: () => void;
                const oauthGate = new Promise<void>((resolve) => {
                    releaseOAuth = resolve;
                });
                (
                    client.subscribeOAuthServerToServerIntegrationToServices as jest.Mock
                ).mockReturnValue(oauthGate);

                const done = subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client);
                // Flush microtasks: the OAuth PUT is still gated, but the apiKey group
                // must have already reached its OWN subscribe PUT — serial code could not.
                await new Promise((resolve) => setImmediate(resolve));
                expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalled();

                releaseOAuth();
                await done;
            });

            it('AWAITS each tick before its group proceeds — async delivery is flushed first (race-proof)', async () => {
                // A listener that ships the tick over a channel (async). If emitProgress
                // fire-and-forgot the tick, the (sync) subscribe PUT would run before the
                // async push; awaiting flushes the tick first. Asserted WITHIN the mesh
                // group, so it holds regardless of cross-group concurrency.
                const order: string[] = [];
                const onProgress = async (e: { code: string; done: boolean }): Promise<void> => {
                    await Promise.resolve();
                    order.push(`${e.code}:${e.done}`);
                };
                (client.subscribeAdobeIdIntegrationToServices as jest.Mock).mockImplementation(
                    async () => {
                        order.push('mesh-subscribe');
                    }
                );

                await subscribeRequiredApis(
                    [meshAppBuilderComponent()],
                    orgTarget,
                    client,
                    undefined,
                    [],
                    onProgress
                );

                // The mesh 'start' tick was delivered before the mesh subscribe PUT ran.
                expect(order.indexOf(`${MESH}:false`)).toBeGreaterThanOrEqual(0);
                expect(order.indexOf(`${MESH}:false`)).toBeLessThan(
                    order.indexOf('mesh-subscribe')
                );
            });

            it('still reports done:true for a code that was already subscribed', async () => {
                (client.getSubscribedServiceCodes as jest.Mock).mockResolvedValue([MGMT, MESH]);
                const events: Array<{ code: string; done: boolean }> = [];
                await subscribeRequiredApis(
                    [meshAppBuilderComponent()],
                    orgTarget,
                    client,
                    undefined,
                    [],
                    (event) => {
                        events.push(event);
                    }
                );

                // No PUT runs, but the UI must still see each code land.
                expect(client.subscribeAdobeIdIntegrationToServices).not.toHaveBeenCalled();
                expect(events).toContainEqual({ code: MGMT, done: true });
                expect(events).toContainEqual({ code: MESH, done: true });
            });

            it('is optional — omitting it subscribes exactly as before', async () => {
                await expect(
                    subscribeRequiredApis([meshAppBuilderComponent()], orgTarget, client)
                ).resolves.toHaveLength(2);
            });
        });
    });
});
