/**
 * Tests for checkApiMeshEnabled helper function
 *
 * Tests detection of API Mesh service in workspace configuration.
 */

import { checkApiMeshEnabled } from '@/features/mesh/handlers/checkHandlerHelpers';

describe('checkApiMeshEnabled', () => {
    describe('returns false when mesh service not found', () => {
        it('should return false when services array is empty', () => {
            const services: unknown[] = [];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: false });
        });

        it('should return false when services have no mesh-related entries', () => {
            const services = [
                { name: 'Analytics API', code: 'AnalyticsAPI' },
                { name: 'Asset Compute API', code: 'AssetComputeAPI' },
            ];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: false });
        });
    });

    describe('returns true when MeshAPI code found', () => {
        it('should detect mesh via code property', () => {
            const services = [
                { name: 'Some API', code: 'SomeAPI' },
                { code: 'MeshAPI' },
            ];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });

        it('should detect mesh via code_name property', () => {
            const services = [{ code_name: 'MeshAPI' }];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });
    });

    describe('detects mesh via name pattern', () => {
        it('should detect mesh when name includes "API Mesh"', () => {
            const services = [{ name: 'API Mesh Service' }];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });

        it('should detect mesh with partial name match', () => {
            const services = [
                { name: 'Adobe API Mesh for Adobe Developer App Builder' },
            ];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });
    });

    describe('uses config patterns when provided', () => {
        it('should use custom namePatterns from config', () => {
            const services = [{ name: 'Custom Mesh Gateway' }];
            const config = {
                services: {
                    apiMesh: {
                        detection: {
                            namePatterns: ['Custom Mesh'],
                            codes: ['MeshAPI'],
                            codeNames: ['MeshAPI'],
                        },
                    },
                },
            };

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });

        it('should use custom codes from config', () => {
            const services = [{ code: 'CustomMeshCode' }];
            const config = {
                services: {
                    apiMesh: {
                        detection: {
                            namePatterns: ['API Mesh'],
                            codes: ['CustomMeshCode'],
                            codeNames: ['MeshAPI'],
                        },
                    },
                },
            };

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });

        it('should fallback to defaults when config is undefined', () => {
            const services = [{ code: 'MeshAPI' }];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: true });
        });
    });

    describe('handles edge cases', () => {
        it('should handle services with missing properties gracefully', () => {
            const services = [
                { name: 'Incomplete Service' },
                { code: 'SomeCode' },
                {},
            ];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: false });
        });

        it('should be case-sensitive for code matching', () => {
            const services = [{ code: 'meshapi' }];
            const config = undefined;

            const result = checkApiMeshEnabled(services, config);

            expect(result).toEqual({ enabled: false });
        });
    });
});
