/**
 * Shared fixtures for the stepFiltering suites.
 *
 * Both suites filter against the same two stacks — one that requires GitHub and
 * DA.live, one that requires neither — and both need the "which ids survived"
 * reduction. Keeping one copy is what stops the two suites drifting into
 * disagreeing about what an Edge Delivery stack looks like.
 */

import type { WizardStepWithCondition } from '@/features/project-creation/ui/wizard/stepFiltering';
import type { Stack } from '@/types/stacks';

/** A stack with NO requiresGitHub / requiresDaLive. */
export const headlessStack: Stack = {
    id: 'headless',
    name: 'Headless',
    description: 'NextJS storefront with API Mesh and Commerce PaaS',
    frontend: 'headless',
    backend: 'adobe-commerce-paas',
    dependencies: ['commerce-mesh'],
};

/** A stack that requires both GitHub and DA.live. */
export const edgeDeliveryStack: Stack = {
    id: 'edge-delivery',
    name: 'Edge Delivery',
    description: 'EDS storefront with Commerce Drop-ins and ACCS',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

/** The ids that survived a filter, in order. */
export const ids = (steps: WizardStepWithCondition[]): string[] => steps.map((s) => s.id);
