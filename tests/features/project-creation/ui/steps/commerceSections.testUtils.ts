/**
 * Shared config fixtures for the commerceSections suites.
 *
 * Both suites drive the module from the REAL stacks.json / demo-packages.json —
 * the whole point of the module is that it is config-driven, so a hand-built
 * stack list would test the fixture rather than the brands that actually ship.
 * Held in one place so the two suites cannot drift into two different readings
 * of the same config.
 */

import stacksConfig from '@/features/components/config/stacks.json';
import demoPackagesConfig from '@/features/components/config/demo-packages.json';
import type { DemoPackage, DemoPackagesConfig } from '@/types/demoPackages';
import type { StacksConfig } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

export const STACKS = (stacksConfig as StacksConfig).stacks;
// Widen through `unknown` as demoPackageLoader and aiContextWriter both do: the
// inferred JSON literal is a union of per-package shapes, so each member is missing
// storefront keys the others declare and a direct cast stops overlapping once a
// package with a distinct storefront set is added.
const PACKAGES = (demoPackagesConfig as unknown as DemoPackagesConfig).packages;

export const PAAS = 'adobe-commerce-paas';
export const ACCS = 'adobe-commerce-accs';

/** One shipped demo package by id. */
export function pkg(id: string): DemoPackage {
    const found = PACKAGES.find((p) => p.id === id);
    if (!found) throw new Error(`test package not found: ${id}`);
    return found;
}

/** Cast one partial state to the full shape the module reads. */
export function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}
