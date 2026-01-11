/**
 * Type Guards Tests - Project Accessor Helpers
 *
 * Tests for project data accessor utilities:
 * - getComponentVersion (component version extraction)
 * - getProjectFrontendPort (frontend port extraction)
 * - getComponentIds (component ID list)
 *
 * SOP §4: These helpers replace deep optional chaining patterns
 * Target Coverage: 90%+
 */

import {
    getComponentVersion,
    getProjectFrontendPort,
    getComponentIds,
    getComponentConfigPort,
    isEdsStackId,
    isEdsProject,
    getEdsLiveUrl,
    getEdsPreviewUrl,
} from '@/types/typeGuards';
import { Project } from '@/types/base';

describe('typeGuards - Project Accessors', () => {

    // =================================================================
    // getComponentVersion Tests (SOP §4 compliance - Step 4)
    // =================================================================

    describe('getComponentVersion', () => {
        it('should return version when component exists', () => {
            const project = {
                componentVersions: {
                    'headless': { version: '1.2.3' }
                }
            } as Project;
            expect(getComponentVersion(project, 'headless')).toBe('1.2.3');
        });

        it('should return undefined for undefined project', () => {
            expect(getComponentVersion(undefined, 'headless')).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getComponentVersion(null, 'headless')).toBeUndefined();
        });

        it('should return undefined when component not found', () => {
            const project = {
                componentVersions: {
                    'other-component': { version: '1.0.0' }
                }
            } as Project;
            expect(getComponentVersion(project, 'headless')).toBeUndefined();
        });

        it('should return undefined when componentVersions is undefined', () => {
            const project = {} as Project;
            expect(getComponentVersion(project, 'headless')).toBeUndefined();
        });
    });

    // =================================================================
    // getProjectFrontendPort Tests (SOP §4 compliance - Step 1)
    // =================================================================

    describe('getProjectFrontendPort', () => {
        it('should return port when frontend component exists', () => {
            const project = {
                componentInstances: {
                    'headless': { type: 'frontend', port: 3000 }
                }
            } as Project;
            expect(getProjectFrontendPort(project)).toBe(3000);
        });

        it('should return undefined for undefined project', () => {
            expect(getProjectFrontendPort(undefined)).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getProjectFrontendPort(null)).toBeUndefined();
        });

        it('should return undefined when frontend component not found', () => {
            const project = {
                componentInstances: {
                    'other-component': { port: 8080 }
                }
            } as Project;
            expect(getProjectFrontendPort(project)).toBeUndefined();
        });

        it('should return undefined when componentInstances is undefined', () => {
            const project = {} as Project;
            expect(getProjectFrontendPort(project)).toBeUndefined();
        });
    });

    // =================================================================
    // getComponentIds Tests (SOP §4 compliance)
    // =================================================================

    describe('getComponentIds', () => {
        it('should return component IDs when instances exist', () => {
            const instances = {
                'headless': { status: 'running' },
                'commerce-mesh': { status: 'deployed' }
            } as Record<string, any>;
            expect(getComponentIds(instances)).toEqual(['headless', 'commerce-mesh']);
        });

        it('should return empty array for undefined', () => {
            expect(getComponentIds(undefined)).toEqual([]);
        });

        it('should return empty array for null', () => {
            expect(getComponentIds(null)).toEqual([]);
        });

        it('should return empty array for empty object', () => {
            expect(getComponentIds({})).toEqual([]);
        });
    });

    // =================================================================
    // getComponentConfigPort Tests (SOP §4 compliance - Step 5)
    // =================================================================

    describe('getComponentConfigPort', () => {
        it('should return port when component config exists', () => {
            const configs = {
                'headless': { PORT: 3000 }
            };
            expect(getComponentConfigPort(configs, 'headless')).toBe(3000);
        });

        it('should return undefined for undefined configs', () => {
            expect(getComponentConfigPort(undefined, 'headless')).toBeUndefined();
        });

        it('should return undefined when component not found', () => {
            const configs = {
                'other-component': { PORT: 8080 }
            };
            expect(getComponentConfigPort(configs, 'headless')).toBeUndefined();
        });

        it('should return undefined when PORT not set', () => {
            const configs = {
                'headless': { OTHER_PROP: 'value' }
            };
            expect(getComponentConfigPort(configs, 'headless')).toBeUndefined();
        });

        it('should handle empty configs object', () => {
            expect(getComponentConfigPort({}, 'headless')).toBeUndefined();
        });
    });

    // =================================================================
    // isEdsStackId Tests (SOP §4 compliance - low-level EDS detection)
    // =================================================================

    describe('isEdsStackId', () => {
        it('should return true for eds-dalive stack ID', () => {
            expect(isEdsStackId('eds-dalive')).toBe(true);
        });

        it('should return true for eds-github stack ID', () => {
            expect(isEdsStackId('eds-github')).toBe(true);
        });

        it('should return true for any eds- prefixed stack ID', () => {
            expect(isEdsStackId('eds-future-variant')).toBe(true);
        });

        it('should return false for headless stack ID', () => {
            expect(isEdsStackId('headless')).toBe(false);
        });

        it('should return false for headless-paas stack ID', () => {
            expect(isEdsStackId('headless-paas')).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isEdsStackId(undefined)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isEdsStackId(null)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(isEdsStackId('')).toBe(false);
        });
    });

    // =================================================================
    // isEdsProject Tests (SOP §4 compliance - EDS detection)
    // =================================================================

    describe('isEdsProject', () => {
        it('should return true for eds-dalive stack', () => {
            const project = { selectedStack: 'eds-dalive' } as Project;
            expect(isEdsProject(project)).toBe(true);
        });

        it('should return true for eds-github stack', () => {
            const project = { selectedStack: 'eds-github' } as Project;
            expect(isEdsProject(project)).toBe(true);
        });

        it('should return true for any eds- prefixed stack', () => {
            const project = { selectedStack: 'eds-future-variant' } as Project;
            expect(isEdsProject(project)).toBe(true);
        });

        it('should return false for headless stack', () => {
            const project = { selectedStack: 'headless' } as Project;
            expect(isEdsProject(project)).toBe(false);
        });

        it('should return false for headless-paas stack', () => {
            const project = { selectedStack: 'headless-paas' } as Project;
            expect(isEdsProject(project)).toBe(false);
        });

        it('should return false for undefined project', () => {
            expect(isEdsProject(undefined)).toBe(false);
        });

        it('should return false for null project', () => {
            expect(isEdsProject(null)).toBe(false);
        });

        it('should return false when selectedStack is undefined', () => {
            const project = {} as Project;
            expect(isEdsProject(project)).toBe(false);
        });
    });

    // =================================================================
    // getEdsLiveUrl Tests (SOP §4 compliance - EDS metadata access)
    // =================================================================

    describe('getEdsLiveUrl', () => {
        it('should return live URL from EDS component metadata', () => {
            const project = {
                selectedStack: 'eds-dalive',
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'Edge Delivery Services',
                        status: 'deployed',
                        metadata: {
                            liveUrl: 'https://main--my-site--owner.aem.live',
                        },
                    },
                },
            } as unknown as Project;
            expect(getEdsLiveUrl(project)).toBe('https://main--my-site--owner.aem.live');
        });

        it('should return undefined for undefined project', () => {
            expect(getEdsLiveUrl(undefined)).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getEdsLiveUrl(null)).toBeUndefined();
        });

        it('should return undefined when not an EDS project', () => {
            const project = {
                selectedStack: 'headless',
                componentInstances: {
                    eds: {
                        metadata: {
                            liveUrl: 'https://main--my-site--owner.aem.live',
                        },
                    },
                },
            } as unknown as Project;
            expect(getEdsLiveUrl(project)).toBeUndefined();
        });

        it('should return undefined when EDS component has no metadata', () => {
            const project = {
                selectedStack: 'eds-dalive',
                componentInstances: {
                    eds: {
                        id: 'eds',
                        status: 'deployed',
                    },
                },
            } as unknown as Project;
            expect(getEdsLiveUrl(project)).toBeUndefined();
        });

        it('should return undefined when no EDS component exists', () => {
            const project = {
                selectedStack: 'eds-dalive',
                componentInstances: {},
            } as unknown as Project;
            expect(getEdsLiveUrl(project)).toBeUndefined();
        });

        it('should return undefined when componentInstances is undefined', () => {
            const project = {
                selectedStack: 'eds-dalive',
            } as Project;
            expect(getEdsLiveUrl(project)).toBeUndefined();
        });
    });

    // =================================================================
    // getEdsPreviewUrl Tests (SOP §4 compliance - EDS metadata access)
    // =================================================================

    describe('getEdsPreviewUrl', () => {
        it('should return preview URL from EDS component metadata', () => {
            const project = {
                selectedStack: 'eds-dalive',
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'Edge Delivery Services',
                        status: 'deployed',
                        metadata: {
                            previewUrl: 'https://main--my-site--owner.aem.page',
                        },
                    },
                },
            } as unknown as Project;
            expect(getEdsPreviewUrl(project)).toBe('https://main--my-site--owner.aem.page');
        });

        it('should return undefined for undefined project', () => {
            expect(getEdsPreviewUrl(undefined)).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getEdsPreviewUrl(null)).toBeUndefined();
        });

        it('should return undefined when not an EDS project', () => {
            const project = {
                selectedStack: 'headless',
            } as Project;
            expect(getEdsPreviewUrl(project)).toBeUndefined();
        });

        it('should return undefined when EDS component has no previewUrl', () => {
            const project = {
                selectedStack: 'eds-dalive',
                componentInstances: {
                    eds: {
                        metadata: {
                            liveUrl: 'https://main--my-site--owner.aem.live',
                            // no previewUrl
                        },
                    },
                },
            } as unknown as Project;
            expect(getEdsPreviewUrl(project)).toBeUndefined();
        });
    });
});
