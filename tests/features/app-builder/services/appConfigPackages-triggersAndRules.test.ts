/**
 * listDeclaredTriggersAndRules — the timers and rules an app declares.
 *
 * In app.config.yaml they sit inside a package block, beside its actions. In
 * Runtime they are namespace-level: deleting the package leaves them behind.
 * On 2026-09-21 a failed undeploy left the ERP's one-minute timer and its rule
 * firing at a removed action, and removal's leftover clean-up — which read only
 * package names — could not see them. This reader is what lets it.
 *
 * The config shapes are the two real apps': demo-erp declares them in its own
 * `application` block; commerce-erp-integration declares them inside an
 * extension's `$include`d file.
 */

import { mockRead } from './appConfigPackages.testUtils';
import * as yaml from 'yaml';
import { listDeclaredTriggersAndRules } from '@/features/app-builder/services/appConfigPackages';

beforeEach(() => jest.clearAllMocks());

describe('listDeclaredTriggersAndRules', () => {
    it("reads a standalone app's triggers and rules from its package blocks", async () => {
        mockRead.mockResolvedValueOnce(
            yaml.stringify({
                application: {
                    runtimeManifest: {
                        packages: {
                            'demo-erp': {
                                triggers: { 'events-retry-timer': { feed: '/whisk.system/alarms/interval' } },
                                rules: { 'events-retry-on-timer': { trigger: 'events-retry-timer' } },
                                actions: { 'retry-job': {} },
                            },
                        },
                    },
                },
            }),
        );

        await expect(listDeclaredTriggersAndRules('/app')).resolves.toEqual({
            triggers: ['events-retry-timer'],
            rules: ['events-retry-on-timer'],
        });
    });

    it("follows an extension's $include to the packages that declare them", async () => {
        mockRead
            .mockResolvedValueOnce(
                yaml.stringify({
                    extensions: { 'commerce/extensibility/1': { $include: 'src/ext.config.yaml' } },
                }),
            )
            .mockResolvedValueOnce(
                yaml.stringify({
                    runtimeManifest: {
                        packages: {
                            erp: {
                                triggers: { 'erp-refresh-timer': {} },
                                rules: { 'erp-refresh-on-timer': {} },
                            },
                            webhook: { actions: {} },
                        },
                    },
                }),
            );

        await expect(listDeclaredTriggersAndRules('/app')).resolves.toEqual({
            triggers: ['erp-refresh-timer'],
            rules: ['erp-refresh-on-timer'],
        });
        expect(mockRead).toHaveBeenLastCalledWith('/app/src/ext.config.yaml', 'utf-8');
    });

    it('answers none for packages that declare only actions', async () => {
        mockRead.mockResolvedValueOnce(
            yaml.stringify({ application: { runtimeManifest: { packages: { kit: { actions: {} } } } } }),
        );

        await expect(listDeclaredTriggersAndRules('/app')).resolves.toStrictEqual({
            triggers: [],
            rules: [],
        });
    });

    it('ignores a triggers or rules value that is not a map', async () => {
        mockRead.mockResolvedValueOnce(
            yaml.stringify({
                application: {
                    runtimeManifest: { packages: { a: { triggers: ['x'], rules: 'y' }, b: null } },
                },
            }),
        );

        await expect(listDeclaredTriggersAndRules('/app')).resolves.toStrictEqual({
            triggers: [],
            rules: [],
        });
    });

    it('a missing app.config answers none, not a throw', async () => {
        mockRead.mockRejectedValueOnce(new Error('ENOENT'));

        await expect(listDeclaredTriggersAndRules('/app')).resolves.toStrictEqual({
            triggers: [],
            rules: [],
        });
    });
});
