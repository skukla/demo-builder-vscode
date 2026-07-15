/**
 * Edit Draft pick/apply helpers
 *
 * Pure (no React, no vscode) helpers that project the editable slice of
 * {@link WizardState} to/from an {@link EditDraft}. `pickEditDraft` copies only
 * the defined editable keys (omitting undefined ones so a later merge never
 * clobbers a base value); `applyEditDraft` merges a draft over a base state.
 *
 * @module features/project-creation/ui/wizard/editDraft
 */

import type { WizardState, EditDraft } from '@/types/webview';

/**
 * The editable WizardState keys that make up an {@link EditDraft}. Declared as a
 * `Record<keyof EditDraft, true>` so adding a field to the `Pick<...>` union in
 * `@/types/webview` without listing it here fails `tsc` — the two sources cannot
 * drift silently. (Secrets like `componentConfigs`/`commerceConfig` are excluded
 * at the type level in `EditDraft`, so they can never appear here.)
 */
const EDIT_DRAFT_KEY_SET: Record<keyof EditDraft, true> = {
    projectName: true,
    selectedPackage: true,
    selectedBackend: true,
    selectedStack: true,
    selectedAddons: true,
    selectedBlockLibraries: true,
    selectedOptionalDependencies: true,
    selectedAppBuilderComponents: true,
    appBuilderComponentSources: true,
    selectedConsoleApis: true,
    customBlockLibraries: true,
    packageConfigDefaults: true,
    components: true,
    edsConfig: true,
    adobeOrg: true,
    adobeProject: true,
    adobeWorkspace: true,
    commerceConnectValid: true,
    commerceStoreViewChosen: true,
    storefrontRepoValid: true,
    storefrontCodeSyncValid: true,
    committedCommerceSteps: true,
};

const EDIT_DRAFT_KEYS = Object.keys(EDIT_DRAFT_KEY_SET) as (keyof EditDraft)[];

/**
 * Extract the editable slice of a WizardState, omitting keys whose value is
 * undefined so a later {@link applyEditDraft} merge never overwrites a base
 * value with undefined.
 *
 * @param state - The current wizard state
 * @returns A new EditDraft containing only defined editable fields
 */
export function pickEditDraft(state: WizardState): EditDraft {
    const draft: Record<string, unknown> = {};
    for (const key of EDIT_DRAFT_KEYS) {
        const value = state[key];
        if (value !== undefined) {
            draft[key] = value;
        }
    }
    return draft as EditDraft;
}

/**
 * Merge a draft over a base wizard state (draft wins). When no draft is provided,
 * returns a shallow copy of the base unchanged. Because {@link pickEditDraft}
 * omits undefined keys, spreading a draft never wipes a base value.
 *
 * @param base - The base wizard state
 * @param draft - The edit draft to overlay, or undefined for no changes
 * @returns A new WizardState with the draft applied
 */
export function applyEditDraft(base: WizardState, draft: EditDraft | undefined): WizardState {
    return draft ? { ...base, ...draft } : { ...base };
}
