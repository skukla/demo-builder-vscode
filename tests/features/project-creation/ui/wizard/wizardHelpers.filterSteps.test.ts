/**
 * Tests for filterStepsByComponents and isComponentSelected helpers
 * TDD: Component-Specific Wizard Steps feature
 */
import {
    filterStepsByComponents,
    isComponentSelected,
    WizardStepConfigWithRequirements,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { ComponentSelection } from '@/types/webview';

describe('filterStepsByComponents', () => {
    describe('backward compatibility - steps without requiredComponents', () => {
        const mockSteps: WizardStepConfigWithRequirements[] = [
            { id: 'welcome', name: 'Welcome', enabled: true },
            { id: 'component-selection', name: 'Components', enabled: true },
            { id: 'review', name: 'Review', enabled: true },
        ];

        it('should include all enabled steps without requiredComponents', () => {
            const result = filterStepsByComponents(mockSteps, undefined);

            expect(result).toHaveLength(3);
            expect(result.map(s => s.id)).toEqual(['welcome', 'component-selection', 'review']);
        });

        it('should exclude disabled steps', () => {
            const stepsWithDisabled: WizardStepConfigWithRequirements[] = [
                ...mockSteps,
                { id: 'hidden', name: 'Hidden', enabled: false },
            ];

            const result = filterStepsByComponents(stepsWithDisabled, undefined);

            expect(result).toHaveLength(3);
            expect(result.find(s => s.id === 'hidden')).toBeUndefined();
        });

        it('should handle empty steps array', () => {
            const result = filterStepsByComponents([], undefined);

            expect(result).toEqual([]);
        });
    });

    describe('single component requirement', () => {
        const mockSteps: WizardStepConfigWithRequirements[] = [
            { id: 'welcome', name: 'Welcome', enabled: true },
            { id: 'mesh-config', name: 'Mesh Config', enabled: true, requiredComponents: ['commerce-mesh'] },
        ];

        it('should show step when required component is in dependencies', () => {
            const selectedComponents: ComponentSelection = {
                dependencies: ['commerce-mesh'],
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result).toHaveLength(2);
            expect(result.find(s => s.id === 'mesh-config')).toBeDefined();
        });

        it('should show step when required component is frontend', () => {
            const stepsWithFrontend: WizardStepConfigWithRequirements[] = [
                { id: 'storefront-config', name: 'Storefront', enabled: true, requiredComponents: ['citisignal-nextjs'] },
            ];
            const selectedComponents: ComponentSelection = {
                frontend: 'citisignal-nextjs',
            };

            const result = filterStepsByComponents(stepsWithFrontend, selectedComponents);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('storefront-config');
        });

        it('should show step when required component is backend', () => {
            const stepsWithBackend: WizardStepConfigWithRequirements[] = [
                { id: 'backend-config', name: 'Backend', enabled: true, requiredComponents: ['commerce-backend'] },
            ];
            const selectedComponents: ComponentSelection = {
                backend: 'commerce-backend',
            };

            const result = filterStepsByComponents(stepsWithBackend, selectedComponents);

            expect(result).toHaveLength(1);
        });

        it('should hide step when required component is NOT selected', () => {
            const selectedComponents: ComponentSelection = {
                frontend: 'citisignal-nextjs',
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result).toHaveLength(1);
            expect(result.find(s => s.id === 'mesh-config')).toBeUndefined();
        });

        it('should hide step when no components selected', () => {
            const result = filterStepsByComponents(mockSteps, undefined);

            expect(result).toHaveLength(1);
            expect(result.find(s => s.id === 'mesh-config')).toBeUndefined();
        });

        it('should hide step when components object is empty', () => {
            const result = filterStepsByComponents(mockSteps, {});

            expect(result).toHaveLength(1);
            expect(result.find(s => s.id === 'mesh-config')).toBeUndefined();
        });
    });

    describe('multiple component requirements (AND logic)', () => {
        const mockSteps: WizardStepConfigWithRequirements[] = [
            {
                id: 'advanced-config',
                name: 'Advanced Config',
                enabled: true,
                requiredComponents: ['commerce-mesh', 'citisignal-nextjs'],
            },
        ];

        it('should show step when ALL required components are selected', () => {
            const selectedComponents: ComponentSelection = {
                frontend: 'citisignal-nextjs',
                dependencies: ['commerce-mesh'],
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result).toHaveLength(1);
        });

        it('should hide step when only SOME required components are selected', () => {
            const selectedComponents: ComponentSelection = {
                dependencies: ['commerce-mesh'],
                // citisignal-nextjs NOT selected
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result).toHaveLength(0);
        });

        it('should hide step when NONE of required components are selected', () => {
            const selectedComponents: ComponentSelection = {
                frontend: 'some-other-frontend',
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result).toHaveLength(0);
        });
    });

    describe('mixed scenarios - some steps with requirements, some without', () => {
        const mockSteps: WizardStepConfigWithRequirements[] = [
            { id: 'welcome', name: 'Welcome', enabled: true },
            { id: 'mesh-config', name: 'Mesh', enabled: true, requiredComponents: ['commerce-mesh'] },
            { id: 'storefront-config', name: 'Storefront', enabled: true, requiredComponents: ['citisignal-nextjs'] },
            { id: 'review', name: 'Review', enabled: true },
        ];

        it('should show only matching component-specific steps plus always-visible steps', () => {
            const selectedComponents: ComponentSelection = {
                dependencies: ['commerce-mesh'],
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result.map(s => s.id)).toEqual(['welcome', 'mesh-config', 'review']);
        });

        it('should show multiple component-specific steps when multiple components selected', () => {
            const selectedComponents: ComponentSelection = {
                frontend: 'citisignal-nextjs',
                dependencies: ['commerce-mesh'],
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result.map(s => s.id)).toEqual([
                'welcome',
                'mesh-config',
                'storefront-config',
                'review',
            ]);
        });

        it('should handle empty requiredComponents array as always-visible', () => {
            const stepsWithEmpty: WizardStepConfigWithRequirements[] = [
                { id: 'test', name: 'Test', enabled: true, requiredComponents: [] },
            ];

            const result = filterStepsByComponents(stepsWithEmpty, undefined);

            expect(result).toHaveLength(1);
        });
    });

    describe('integration scenarios', () => {
        it('should maintain step order from configuration', () => {
            const mockSteps: WizardStepConfigWithRequirements[] = [
                { id: 'step-a', name: 'A', enabled: true },
                { id: 'step-b', name: 'B', enabled: true, requiredComponents: ['component-x'] },
                { id: 'step-c', name: 'C', enabled: true },
                { id: 'step-d', name: 'D', enabled: true, requiredComponents: ['component-x'] },
            ];
            const selectedComponents: ComponentSelection = {
                dependencies: ['component-x'],
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result.map(s => s.id)).toEqual(['step-a', 'step-b', 'step-c', 'step-d']);
        });

        it('should filter disabled steps even if component requirements met', () => {
            const mockSteps: WizardStepConfigWithRequirements[] = [
                { id: 'enabled-config', name: 'Enabled', enabled: true, requiredComponents: ['comp'] },
                { id: 'disabled-config', name: 'Disabled', enabled: false, requiredComponents: ['comp'] },
            ];
            const selectedComponents: ComponentSelection = {
                dependencies: ['comp'],
            };

            const result = filterStepsByComponents(mockSteps, selectedComponents);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('enabled-config');
        });
    });
});

describe('isComponentSelected', () => {
    it('should find component in frontend', () => {
        const selection: ComponentSelection = {
            frontend: 'citisignal-nextjs',
        };

        expect(isComponentSelected('citisignal-nextjs', selection)).toBe(true);
    });

    it('should find component in backend', () => {
        const selection: ComponentSelection = {
            backend: 'commerce-backend',
        };

        expect(isComponentSelected('commerce-backend', selection)).toBe(true);
    });

    it('should find component in dependencies array', () => {
        const selection: ComponentSelection = {
            dependencies: ['commerce-mesh', 'other-dep'],
        };

        expect(isComponentSelected('commerce-mesh', selection)).toBe(true);
        expect(isComponentSelected('other-dep', selection)).toBe(true);
    });

    it('should find component in integrations array', () => {
        const selection: ComponentSelection = {
            integrations: ['aem-integration'],
        };

        expect(isComponentSelected('aem-integration', selection)).toBe(true);
    });

    it('should find component in appBuilderApps array', () => {
        const selection: ComponentSelection = {
            appBuilderApps: ['kukla-integration'],
        };

        expect(isComponentSelected('kukla-integration', selection)).toBe(true);
    });

    it('should return false for unselected component', () => {
        const selection: ComponentSelection = {
            frontend: 'citisignal-nextjs',
            dependencies: ['commerce-mesh'],
        };

        expect(isComponentSelected('not-selected', selection)).toBe(false);
    });

    it('should return false for undefined selection', () => {
        expect(isComponentSelected('any-component', undefined)).toBe(false);
    });

    it('should return false for empty selection', () => {
        expect(isComponentSelected('any-component', {})).toBe(false);
    });

    it('should return false when component field is undefined', () => {
        const selection: ComponentSelection = {
            frontend: undefined,
        };

        expect(isComponentSelected('any-component', selection)).toBe(false);
    });

    it('should handle selection with all fields populated', () => {
        const selection: ComponentSelection = {
            frontend: 'frontend-app',
            backend: 'backend-app',
            dependencies: ['dep1', 'dep2'],
            integrations: ['int1'],
            appBuilderApps: ['app1', 'app2'],
        };

        expect(isComponentSelected('frontend-app', selection)).toBe(true);
        expect(isComponentSelected('backend-app', selection)).toBe(true);
        expect(isComponentSelected('dep1', selection)).toBe(true);
        expect(isComponentSelected('dep2', selection)).toBe(true);
        expect(isComponentSelected('int1', selection)).toBe(true);
        expect(isComponentSelected('app1', selection)).toBe(true);
        expect(isComponentSelected('app2', selection)).toBe(true);
        expect(isComponentSelected('not-there', selection)).toBe(false);
    });
});
