/**
 * Step Filtering Tests
 *
 * Tests for filtering wizard steps based on stack requirements.
 * Follows TDD methodology - these tests are written BEFORE implementation.
 */

import { filterStepsForStack } from '@/features/project-creation/ui/wizard/stepFiltering';
import type { Stack } from '@/types/stacks';

// Import the type from the implementation (will be created)
import type { WizardStepWithCondition } from '@/features/project-creation/ui/wizard/stepFiltering';

// Test fixtures for stacks
const headlessStack: Stack = {
    id: 'headless',
    name: 'Headless',
    description: 'NextJS storefront with API Mesh and Commerce PaaS',
    frontend: 'citisignal-nextjs',
    backend: 'adobe-commerce-paas',
    dependencies: ['commerce-mesh', 'demo-inspector'],
    // Note: NO requiresGitHub or requiresDaLive
};

const edgeDeliveryStack: Stack = {
    id: 'edge-delivery',
    name: 'Edge Delivery',
    description: 'EDS storefront with Commerce Drop-ins and ACCS',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: ['demo-inspector'],
    requiresGitHub: true,
    requiresDaLive: true,
};

// Test fixtures for wizard steps
const allSteps: WizardStepWithCondition[] = [
    {
        id: 'welcome',
        name: 'Welcome',
        // No condition - always shown
    },
    {
        id: 'prerequisites',
        name: 'Prerequisites',
        // No condition - always shown
    },
    {
        id: 'github-auth',
        name: 'GitHub Authentication',
        condition: {
            stackRequires: 'requiresGitHub',
        },
    },
    {
        id: 'da-live-setup',
        name: 'DA.live Setup',
        condition: {
            stackRequires: 'requiresDaLive',
        },
    },
    {
        id: 'adobe-setup',
        name: 'Adobe Setup',
        // No condition - always shown
    },
    {
        id: 'review',
        name: 'Review',
        // No condition - always shown
    },
];

describe('stepFiltering', () => {
    describe('filterStepsForStack', () => {
        it('should exclude GitHub/DA.live steps for headless stack', () => {
            // Given: All steps including conditional GitHub and DA.live steps
            const steps = allSteps;

            // When: Filtering steps for headless stack (no requiresGitHub/requiresDaLive)
            const result = filterStepsForStack(steps, headlessStack);

            // Then: Should NOT include github-auth step
            const stepIds = result.map(s => s.id);
            expect(stepIds).not.toContain('github-auth');

            // And: Should NOT include da-live-setup step
            expect(stepIds).not.toContain('da-live-setup');

            // And: Should include unconditional steps
            expect(stepIds).toContain('welcome');
            expect(stepIds).toContain('prerequisites');
            expect(stepIds).toContain('adobe-setup');
            expect(stepIds).toContain('review');
        });

        it('should include GitHub/DA.live steps for edge-delivery stack', () => {
            // Given: All steps including conditional GitHub and DA.live steps
            const steps = allSteps;

            // When: Filtering steps for edge-delivery stack (has requiresGitHub=true, requiresDaLive=true)
            const result = filterStepsForStack(steps, edgeDeliveryStack);

            // Then: Should include github-auth step
            const stepIds = result.map(s => s.id);
            expect(stepIds).toContain('github-auth');

            // And: Should include da-live-setup step
            expect(stepIds).toContain('da-live-setup');

            // And: Should also include unconditional steps
            expect(stepIds).toContain('welcome');
            expect(stepIds).toContain('prerequisites');
            expect(stepIds).toContain('adobe-setup');
            expect(stepIds).toContain('review');
        });

        it('should return only unconditional steps when no stack selected', () => {
            // Given: All steps including conditional steps
            const steps = allSteps;

            // When: Filtering steps with no stack selected
            const result = filterStepsForStack(steps, undefined);

            // Then: Should only include steps without conditions
            const stepIds = result.map(s => s.id);
            expect(stepIds).toContain('welcome');
            expect(stepIds).toContain('prerequisites');
            expect(stepIds).toContain('adobe-setup');
            expect(stepIds).toContain('review');

            // And: Should NOT include conditional steps
            expect(stepIds).not.toContain('github-auth');
            expect(stepIds).not.toContain('da-live-setup');
        });

        it('should preserve step order', () => {
            // Given: Steps in a specific order
            const steps = allSteps;

            // When: Filtering steps for edge-delivery stack
            const result = filterStepsForStack(steps, edgeDeliveryStack);

            // Then: Should preserve original order (welcome first, review last)
            expect(result[0].id).toBe('welcome');
            expect(result[result.length - 1].id).toBe('review');

            // And: github-auth should come before da-live-setup
            const githubIndex = result.findIndex(s => s.id === 'github-auth');
            const daLiveIndex = result.findIndex(s => s.id === 'da-live-setup');
            expect(githubIndex).toBeLessThan(daLiveIndex);
        });

        it('should handle empty steps array', () => {
            // Given: Empty steps array
            const steps: WizardStepWithCondition[] = [];

            // When: Filtering steps
            const result = filterStepsForStack(steps, headlessStack);

            // Then: Should return empty array
            expect(result).toEqual([]);
        });

        it('should handle stack with only requiresGitHub', () => {
            // Given: A stack with only requiresGitHub
            const githubOnlyStack: Stack = {
                id: 'github-only',
                name: 'GitHub Only',
                description: 'Test stack',
                frontend: 'test-frontend',
                backend: 'test-backend',
                dependencies: [],
                requiresGitHub: true,
                // Note: NO requiresDaLive
            };

            // When: Filtering steps
            const result = filterStepsForStack(allSteps, githubOnlyStack);

            // Then: Should include github-auth but NOT da-live-setup
            const stepIds = result.map(s => s.id);
            expect(stepIds).toContain('github-auth');
            expect(stepIds).not.toContain('da-live-setup');
        });

        it('should handle stack with only requiresDaLive', () => {
            // Given: A stack with only requiresDaLive
            const daLiveOnlyStack: Stack = {
                id: 'da-live-only',
                name: 'DA.live Only',
                description: 'Test stack',
                frontend: 'test-frontend',
                backend: 'test-backend',
                dependencies: [],
                requiresDaLive: true,
                // Note: NO requiresGitHub
            };

            // When: Filtering steps
            const result = filterStepsForStack(allSteps, daLiveOnlyStack);

            // Then: Should include da-live-setup but NOT github-auth
            const stepIds = result.map(s => s.id);
            expect(stepIds).toContain('da-live-setup');
            expect(stepIds).not.toContain('github-auth');
        });

        it('should handle steps with conditions for non-existent stack properties', () => {
            // Given: A step with a condition for a property that might not exist
            const stepsWithUnknownCondition: WizardStepWithCondition[] = [
                {
                    id: 'welcome',
                    name: 'Welcome',
                },
                {
                    id: 'special-step',
                    name: 'Special Step',
                    condition: {
                        stackRequires: 'requiresGitHub',
                    },
                },
            ];

            // When: Filtering with a stack that has the property set to false (explicit)
            const stackWithFalseGitHub: Stack = {
                id: 'no-github',
                name: 'No GitHub',
                description: 'Test stack',
                frontend: 'test-frontend',
                backend: 'test-backend',
                dependencies: [],
                requiresGitHub: false,
            };

            const result = filterStepsForStack(stepsWithUnknownCondition, stackWithFalseGitHub);

            // Then: Should NOT include the conditional step
            const stepIds = result.map(s => s.id);
            expect(stepIds).toContain('welcome');
            expect(stepIds).not.toContain('special-step');
        });

        it('should include step when stackRequiresAny has at least one matching property', () => {
            // Given: A step with stackRequiresAny condition
            const stepsWithRequiresAny: WizardStepWithCondition[] = [
                {
                    id: 'welcome',
                    name: 'Welcome',
                },
                {
                    id: 'connect-services',
                    name: 'Connect Services',
                    condition: {
                        stackRequiresAny: ['requiresGitHub', 'requiresDaLive'],
                    },
                },
            ];

            // When: Filtering with a stack that has only requiresGitHub
            const githubOnlyStack: Stack = {
                id: 'github-only',
                name: 'GitHub Only',
                description: 'Test stack',
                frontend: 'test-frontend',
                backend: 'test-backend',
                dependencies: [],
                requiresGitHub: true,
            };

            const result = filterStepsForStack(stepsWithRequiresAny, githubOnlyStack);

            // Then: Should include connect-services since requiresGitHub is true
            const stepIds = result.map(s => s.id);
            expect(stepIds).toContain('connect-services');
        });

        it('should exclude step when stackRequiresAny has no matching properties', () => {
            // Given: A step with stackRequiresAny condition
            const stepsWithRequiresAny: WizardStepWithCondition[] = [
                {
                    id: 'welcome',
                    name: 'Welcome',
                },
                {
                    id: 'connect-services',
                    name: 'Connect Services',
                    condition: {
                        stackRequiresAny: ['requiresGitHub', 'requiresDaLive'],
                    },
                },
            ];

            // When: Filtering with a stack that has neither property
            const result = filterStepsForStack(stepsWithRequiresAny, headlessStack);

            // Then: Should NOT include connect-services
            const stepIds = result.map(s => s.id);
            expect(stepIds).not.toContain('connect-services');
        });
    });
});
