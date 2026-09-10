/**
 * Shared fixtures and DOM helpers for the IntegrationsStep suites.
 *
 * The `jest.mock` preamble deliberately does NOT live here: a `jest.mock` call only
 * hoists above the imports of the file it appears in, so moving one into a shared
 * module registers it too late to intercept anything. Each suite keeps its own
 * module-external mocks and takes the fixtures and queries from here.
 */

import { screen, within } from '@testing-library/react';
import { press } from '../../../../helpers/reactSettle';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/** Real stack backend/frontend ids, so the real catalog resolves a mesh entry. */
export const MESH_STACK = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
} as unknown as Stack;

export const STACKS: Stack[] = [MESH_STACK];
export const PACKAGES = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];

/** The stack's mesh catalog entry (real catalog). */
export const MESH_ID = 'eds-commerce-mesh';
export const MESH_NAME = 'EDS Commerce API Mesh';

export const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
};

export const COMMITTED_DEST: Partial<WizardState> = {
    adobeProject: { id: 'proj-1', name: 'proj-one', title: 'Demo Project' },
    adobeWorkspace: { id: 'ws-1', name: 'Stage' },
};

export const CUSTOM_ADDED: Partial<WizardState> = {
    selectedAppBuilderComponents: ['acme-widget'],
    appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
};

export function baseState(overrides: Partial<WizardState> = {}): WizardState {
    return {
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        ...overrides,
    } as WizardState;
}

/** The shared `.integration-card` root, addressed by its name text. */
export function row(name: string): HTMLElement {
    return screen.getByText(name).closest('.integration-card') as HTMLElement;
}

/**
 * The surface's ONE destination line. Deliberately not scoped to a card: that it is
 * not per-card is the point, and a `document.querySelector` returning the first match
 * would hide a regression, so callers assert the count when that is the question.
 */
export function destinationLine(): HTMLElement {
    return document.querySelector('.int-destination') as HTMLElement;
}

/**
 * A card's kebab menu — scoped to that card.
 *
 * The Spectrum stub renders menus eagerly and inline, so every card contributes its
 * own `role="menu"`. Scoping is mandatory, not tidiness: an unscoped query throws
 * "Found multiple elements" the moment a second card exists.
 */
export function menuOf(cardEl: HTMLElement): HTMLElement {
    return within(cardEl).getByRole('menu');
}

/** Press one item in a card's kebab. */
export async function pickMenuItem(cardEl: HTMLElement, label: RegExp): Promise<void> {
    await press(within(menuOf(cardEl)).getByRole('menuitem', { name: label }));
}

/** The element StepAreaShell gives the area's `viewClassName`. */
export function areaView(): HTMLElement {
    return document.querySelector('.int-results') as HTMLElement;
}
