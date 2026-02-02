/**
 * DA.live Org Config Service Tests
 *
 * Tests for the DaLiveOrgConfigService which stores org-level
 * configuration for DA.live organizations (editor.path, aem.repositoryId).
 */

// Mock vscode before imports
jest.mock('vscode', () => ({}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

import { DaLiveOrgConfigService, DaLiveOrgConfig } from '@/features/eds/services/daLiveOrgConfigService';
import type { ExtensionContext } from 'vscode';

describe('DaLiveOrgConfigService', () => {
    let service: DaLiveOrgConfigService;
    let mockContext: ExtensionContext;
    let globalStateStore: Map<string, unknown>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock global state store
        globalStateStore = new Map();

        // Create mock extension context
        mockContext = {
            globalState: {
                get: jest.fn((key: string) => globalStateStore.get(key)),
                update: jest.fn((key: string, value: unknown) => {
                    if (value === undefined) {
                        globalStateStore.delete(key);
                    } else {
                        globalStateStore.set(key, value);
                    }
                    return Promise.resolve();
                }),
            },
        } as unknown as ExtensionContext;

        service = new DaLiveOrgConfigService(mockContext);
    });

    describe('getOrgConfig', () => {
        it('should return null when no config stored', async () => {
            // Given: Empty globalState

            // When: getOrgConfig() called
            const result = await service.getOrgConfig('test-org');

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return stored config', async () => {
            // Given: Config stored in globalState
            const config: DaLiveOrgConfig = {
                editorPath: '/test-org/site=https://example.com',
                aemAuthorUrl: 'author-p12345-e67890.adobeaemcloud.com',
                updatedAt: '2025-01-01T00:00:00.000Z',
            };
            globalStateStore.set('daLive.orgConfig.test-org', config);

            // When: getOrgConfig() called
            const result = await service.getOrgConfig('test-org');

            // Then: Returns stored config
            expect(result).toEqual(config);
        });

        it('should return config for specific org only', async () => {
            // Given: Configs for multiple orgs
            const configA: DaLiveOrgConfig = { editorPath: '/org-a/site=...' };
            const configB: DaLiveOrgConfig = { editorPath: '/org-b/site=...' };
            globalStateStore.set('daLive.orgConfig.org-a', configA);
            globalStateStore.set('daLive.orgConfig.org-b', configB);

            // When: getOrgConfig() called for org-a
            const result = await service.getOrgConfig('org-a');

            // Then: Returns only org-a config
            expect(result?.editorPath).toBe('/org-a/site=...');
        });
    });

    describe('setOrgConfig', () => {
        it('should store config with timestamp', async () => {
            // Given: Config to store
            const config: DaLiveOrgConfig = {
                editorPath: '/test-org/site=https://example.com',
                aemAuthorUrl: 'author-p12345-e67890.adobeaemcloud.com',
            };

            // When: setOrgConfig() called
            await service.setOrgConfig('test-org', config);

            // Then: Config stored with updatedAt timestamp
            const stored = globalStateStore.get('daLive.orgConfig.test-org') as DaLiveOrgConfig;
            expect(stored.editorPath).toBe(config.editorPath);
            expect(stored.aemAuthorUrl).toBe(config.aemAuthorUrl);
            expect(stored.updatedAt).toBeDefined();
            expect(new Date(stored.updatedAt!).getTime()).toBeGreaterThan(0);
        });

        it('should overwrite existing config', async () => {
            // Given: Existing config
            globalStateStore.set('daLive.orgConfig.test-org', {
                editorPath: '/old/path=...',
            });

            // When: setOrgConfig() called with new config
            const newConfig: DaLiveOrgConfig = {
                editorPath: '/new/path=...',
                aemAuthorUrl: 'author-p99999-e88888.adobeaemcloud.com',
            };
            await service.setOrgConfig('test-org', newConfig);

            // Then: New config replaces old
            const stored = globalStateStore.get('daLive.orgConfig.test-org') as DaLiveOrgConfig;
            expect(stored.editorPath).toBe('/new/path=...');
            expect(stored.aemAuthorUrl).toBe('author-p99999-e88888.adobeaemcloud.com');
        });
    });

    describe('updateOrgConfig', () => {
        it('should merge with existing config', async () => {
            // Given: Existing config with editorPath
            globalStateStore.set('daLive.orgConfig.test-org', {
                editorPath: '/existing/path=...',
            });

            // When: updateOrgConfig() called with aemAuthorUrl only
            await service.updateOrgConfig('test-org', {
                aemAuthorUrl: 'author-p12345-e67890.adobeaemcloud.com',
            });

            // Then: Both fields preserved
            const stored = globalStateStore.get('daLive.orgConfig.test-org') as DaLiveOrgConfig;
            expect(stored.editorPath).toBe('/existing/path=...');
            expect(stored.aemAuthorUrl).toBe('author-p12345-e67890.adobeaemcloud.com');
        });

        it('should create config if none exists', async () => {
            // Given: No existing config

            // When: updateOrgConfig() called
            await service.updateOrgConfig('new-org', {
                editorPath: '/new-org/site=...',
            });

            // Then: Config created
            const stored = globalStateStore.get('daLive.orgConfig.new-org') as DaLiveOrgConfig;
            expect(stored.editorPath).toBe('/new-org/site=...');
        });

        it('should allow updating individual fields', async () => {
            // Given: Config with both fields
            globalStateStore.set('daLive.orgConfig.test-org', {
                editorPath: '/old/path=...',
                aemAuthorUrl: 'author-p11111-e22222.adobeaemcloud.com',
            });

            // When: updateOrgConfig() called to change editorPath only
            await service.updateOrgConfig('test-org', {
                editorPath: '/new/path=...',
            });

            // Then: editorPath updated, aemAuthorUrl preserved
            const stored = globalStateStore.get('daLive.orgConfig.test-org') as DaLiveOrgConfig;
            expect(stored.editorPath).toBe('/new/path=...');
            expect(stored.aemAuthorUrl).toBe('author-p11111-e22222.adobeaemcloud.com');
        });
    });

    describe('clearOrgConfig', () => {
        it('should remove config from storage', async () => {
            // Given: Config exists
            globalStateStore.set('daLive.orgConfig.test-org', {
                editorPath: '/test/path=...',
            });

            // When: clearOrgConfig() called
            await service.clearOrgConfig('test-org');

            // Then: Config removed
            expect(globalStateStore.has('daLive.orgConfig.test-org')).toBe(false);
        });

        it('should not throw when no config exists', async () => {
            // Given: No config

            // When/Then: clearOrgConfig() completes without error
            await expect(service.clearOrgConfig('nonexistent')).resolves.not.toThrow();
        });

        it('should not affect other orgs', async () => {
            // Given: Configs for multiple orgs
            globalStateStore.set('daLive.orgConfig.org-a', { editorPath: '/a=...' });
            globalStateStore.set('daLive.orgConfig.org-b', { editorPath: '/b=...' });

            // When: clearOrgConfig() called for org-a
            await service.clearOrgConfig('org-a');

            // Then: org-b config still exists
            expect(globalStateStore.has('daLive.orgConfig.org-a')).toBe(false);
            expect(globalStateStore.has('daLive.orgConfig.org-b')).toBe(true);
        });
    });

    describe('hasOrgConfig', () => {
        it('should return false when no config stored', async () => {
            // Given: No config

            // When: hasOrgConfig() called
            const result = await service.hasOrgConfig('test-org');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false when config exists but has no values', async () => {
            // Given: Empty config object
            globalStateStore.set('daLive.orgConfig.test-org', {});

            // When: hasOrgConfig() called
            const result = await service.hasOrgConfig('test-org');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return true when editorPath is set', async () => {
            // Given: Config with editorPath only
            globalStateStore.set('daLive.orgConfig.test-org', {
                editorPath: '/test=...',
            });

            // When: hasOrgConfig() called
            const result = await service.hasOrgConfig('test-org');

            // Then: Returns true
            expect(result).toBe(true);
        });

        it('should return true when aemAuthorUrl is set', async () => {
            // Given: Config with aemAuthorUrl only
            globalStateStore.set('daLive.orgConfig.test-org', {
                aemAuthorUrl: 'author-p12345-e67890.adobeaemcloud.com',
            });

            // When: hasOrgConfig() called
            const result = await service.hasOrgConfig('test-org');

            // Then: Returns true
            expect(result).toBe(true);
        });
    });

    describe('generateEditorPath', () => {
        it('should generate correct editor.path format', () => {
            // Given: DA.live org/site and IMS org
            const daOrg = 'demo-system-stores';
            const daSite = 'testing-citisignal';
            const imsOrg = 'demosystem';

            // When: generateEditorPath() called
            const result = service.generateEditorPath(daOrg, daSite, imsOrg);

            // Then: Returns correctly formatted path
            expect(result).toBe(
                '/demo-system-stores/testing-citisignal=' +
                'https://experience.adobe.com/#/@demosystem/aem/editor/canvas/' +
                'main--testing-citisignal--demo-system-stores.ue.da.live'
            );
        });

        it('should handle different org/site combinations', () => {
            // Given: Different org/site values
            const result = service.generateEditorPath('my-org', 'my-site', 'myimsorg');

            // Then: Path contains all components
            expect(result).toContain('/my-org/my-site=');
            expect(result).toContain('@myimsorg/aem/editor');
            expect(result).toContain('main--my-site--my-org.ue.da.live');
        });
    });

    describe('parseEditorPath', () => {
        it('should parse valid editor.path', () => {
            // Given: Valid editor.path
            const editorPath =
                '/demo-system-stores/testing-citisignal=' +
                'https://experience.adobe.com/#/@demosystem/aem/editor/canvas/' +
                'main--testing-citisignal--demo-system-stores.ue.da.live';

            // When: parseEditorPath() called
            const result = service.parseEditorPath(editorPath);

            // Then: Returns parsed components
            expect(result).not.toBeNull();
            expect(result?.daOrg).toBe('demo-system-stores');
            expect(result?.daSite).toBe('testing-citisignal');
            expect(result?.imsOrg).toBe('demosystem');
            expect(result?.editorUrl).toContain('experience.adobe.com');
        });

        it('should return null for invalid format', () => {
            // Given: Invalid editor.path (missing =)
            const invalid = '/some/path/without/equals';

            // When: parseEditorPath() called
            const result = service.parseEditorPath(invalid);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null for empty string', () => {
            // Given: Empty string

            // When: parseEditorPath() called
            const result = service.parseEditorPath('');

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should handle path without leading slash', () => {
            // Given: Path without leading slash
            const editorPath = 'org/site=https://example.com';

            // When: parseEditorPath() called
            const result = service.parseEditorPath(editorPath);

            // Then: Returns null (invalid format - must start with /)
            expect(result).toBeNull();
        });
    });

    describe('validateAemAuthorUrl', () => {
        it('should validate author environment format', () => {
            // Given: Valid author environment ID
            const id = 'author-p158081-e1683323.adobeaemcloud.com';

            // When: validateAemAuthorUrl() called
            const result = service.validateAemAuthorUrl(id);

            // Then: Returns true
            expect(result).toBe(true);
        });

        it('should validate delivery environment format', () => {
            // Given: Valid delivery environment ID
            const id = 'delivery-p12345-e67890.adobeaemcloud.com';

            // When: validateAemAuthorUrl() called
            const result = service.validateAemAuthorUrl(id);

            // Then: Returns true
            expect(result).toBe(true);
        });

        it('should reject invalid format', () => {
            // Given: Various invalid formats
            const invalidIds = [
                'author-12345-e67890.adobeaemcloud.com', // Missing 'p'
                'author-p12345-67890.adobeaemcloud.com', // Missing 'e'
                'publish-p12345-e67890.adobeaemcloud.com', // Invalid prefix
                'author-p12345-e67890.adobe.com', // Wrong domain
                'author-pABC-eDEF.adobeaemcloud.com', // Non-numeric
                '', // Empty
            ];

            // When/Then: Each returns false
            for (const id of invalidIds) {
                expect(service.validateAemAuthorUrl(id)).toBe(false);
            }
        });
    });

    describe('resetAll', () => {
        it('should clear configs for specified orgs', async () => {
            // Given: Configs for multiple orgs
            globalStateStore.set('daLive.orgConfig.org-a', { editorPath: '/a=...' });
            globalStateStore.set('daLive.orgConfig.org-b', { editorPath: '/b=...' });
            globalStateStore.set('daLive.orgConfig.org-c', { editorPath: '/c=...' });

            // When: resetAll() called with org-a and org-b
            await service.resetAll(['org-a', 'org-b']);

            // Then: org-a and org-b cleared, org-c preserved
            expect(globalStateStore.has('daLive.orgConfig.org-a')).toBe(false);
            expect(globalStateStore.has('daLive.orgConfig.org-b')).toBe(false);
            expect(globalStateStore.has('daLive.orgConfig.org-c')).toBe(true);
        });

        it('should handle empty org list', async () => {
            // Given: Config exists

            // When/Then: resetAll([]) completes without error
            await expect(service.resetAll([])).resolves.not.toThrow();
        });
    });
});
