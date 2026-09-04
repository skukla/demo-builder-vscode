/**
 * Shared setup for the useWizardState suites.
 *
 * The hook is pure state — no Spectrum, no message channel — so there is nothing
 * to mock here. (A `jest.mock('@/core/ui/utils/vscode-api')` sat in these suites
 * until 2026-09-04; deleting it changed no result, because useWizardState never
 * reaches the channel.) What the suites genuinely share is the SUT import, the
 * edit-project builder and the two render shapes.
 *
 * Specs import the hook FROM HERE rather than directly, per the split-family
 * convention: a `jest.mock` only hoists above the imports of its own module, so
 * a suite that reaches for the subject itself would bind before any future mock
 * added here could register.
 */

import { renderHook } from '@testing-library/react';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type { WizardState, WizardStep } from '@/types/webview';
import type { EditProjectConfig, ImportedSettings, WizardStepDefinition } from '@/types/wizard';

export { useWizardState };

/** The minimal step configuration: one enabled step, no conditions. */
export const WELCOME_ONLY = [
    { id: 'welcome', name: 'Welcome', enabled: true },
] as WizardStepDefinition[];

/** An edit project wrapping the settings a suite wants to seed from. */
export function editProjectWith(settings: ImportedSettings): EditProjectConfig {
    return {
        projectName: 'edit-me',
        projectTitle: 'Edit Me',
        projectPath: '/projects/edit-me',
        settings,
    };
}

/** Render the hook over the welcome-only step config and return its result ref. */
export function renderWizard(props: Parameters<typeof useWizardState>[0] = {}) {
    return renderHook(() => useWizardState({ wizardSteps: WELCOME_ONLY, ...props }));
}

/** The initial state the hook computes for these props. */
export function stateFor(props: Parameters<typeof useWizardState>[0] = {}): WizardState {
    return renderWizard(props).result.current.state;
}

/** Just the ids of a derived step list, for order-sensitive assertions. */
export function stepIds(steps: Array<{ id: WizardStep }>): WizardStep[] {
    return steps.map((s) => s.id);
}
