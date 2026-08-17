/**
 * The import modal's FORM view — everything the user fills in before starting.
 *
 * Extracted from `ImportDatapackModal` when that file stood at 831 lines against
 * a 500-line cap. These four belong together and nowhere else: the target
 * summary, the website/store pickers, the data-type checkboxes, and the
 * cross-type warning that sits under them.
 *
 * The modal keeps the state machine and the views that are not the form; this
 * file keeps the form. Neither knows more about the other than the props below.
 *
 * @module features/data-installer/ui/components/ImportForm
 */

import { ActionButton, Checkbox, Item, Picker, ProgressCircle } from '@adobe/react-spectrum';
import React from 'react';
import { dataTypeLabel } from '../dataTypeLabel';
import type { TargetWebsite } from '../hooks/useImportScopes';

/**
 * Whether to warn that `products` was chosen without `customer_groups`.
 *
 * Measured 2026-08-14: Bodea's tier prices name the "Platinum Buyer" group, the
 * service resolves that name to an id at import time, and with no groups
 * imported the lookup failed and took the ENTIRE `products` type down — 56
 * products, zero landed. `validate` cannot catch it; it checks request shape,
 * not referential integrity.
 *
 * Only when the pack actually offers `customer_groups`: nothing else can be
 * suggested, and a warning naming an unavailable type is noise.
 */
function needsCustomerGroups(availableTypes: string[], selected: string[]): boolean {
    return (
        selected.includes('products') &&
        availableTypes.includes('customer_groups') &&
        !selected.includes('customer_groups')
    );
}

/**
 * Where the pack lands.
 *
 * Hidden entirely when nothing was discovered — no project, no credentials, or a
 * discovery that failed. Targeting is optional and an import without it still
 * works, so an empty picker would be a dead control demanding explanation.
 *
 * The hint is not decoration. `websites` is not an importable data type, so a
 * website the user has not created cannot appear here, and the failure mode is
 * "the one I want is missing" — which reads as a bug unless the missing step is
 * named. Per the service author: create it in Commerce first, then name it here.
 */
/** The service's own default website code, when the user picks nothing. */
const DEFAULT_WEBSITE_CODE = 'base';

/**
 * Where the pack lands.
 *
 * **Holds its space while discovery runs.** These used to appear only once the
 * scopes arrived, so the dialog jumped. `StoreSelectionRow` solves this by
 * disabling its pickers rather than hiding them, and this follows it.
 *
 * **Placeholders name the default WEBSITE.** They previously read "Default
 * (base)", which mixed the `base` website up with the `default` store view —
 * two different scopes that happen to share the idea of a default. Now the
 * website picker names whatever the instance calls its base website, and the
 * store view picker names its own default.
 *
 * Not `StoreStructureSelector`, though the conventions here are lifted from it
 * (name as the label, code as the value): that component renders nothing when
 * its item list is empty, which is exactly the loading state this has to fill.
 */
function TargetScopeFields({
    websites,
    websiteCode,
    storeCode,
    onWebsiteChange,
    onStoreChange,
    isLoading,
}: {
    websites: TargetWebsite[];
    websiteCode: string;
    storeCode: string;
    onWebsiteChange: (code: string) => void;
    onStoreChange: (code: string) => void;
    isLoading: boolean;
}): React.JSX.Element | null {
    // Nothing discovered and nothing pending: this instance offers no choice.
    if (websites.length === 0 && !isLoading) {
        return null;
    }
    const chosen = websites.find((site) => site.code === websiteCode);
    const storeViews = chosen?.storeViews ?? [];
    const defaultSite = websites.find((site) => site.code === DEFAULT_WEBSITE_CODE);

    return (
        <div className="datapack-import-scope">
            <ScopeField label="Target website" busyLabel="Loading websites" isLoading={isLoading}>
                <Picker
                    aria-label="Target website"
                    placeholder={websitePlaceholder(defaultSite?.name)}
                    selectedKey={websiteCode || null}
                    onSelectionChange={(key) => onWebsiteChange(String(key ?? ''))}
                >
                    {websites.map((site) => (
                        <Item key={site.code} textValue={site.name}>
                            {site.name}
                        </Item>
                    ))}
                </Picker>
            </ScopeField>
            <ScopeField label="Target store view" busyLabel="Loading store views" isLoading={isLoading}>
                <Picker
                    aria-label="Target store view"
                    placeholder={storePlaceholder(chosen ? storeViews[0]?.name : undefined)}
                    isDisabled={!websiteCode}
                    selectedKey={storeCode || null}
                    onSelectionChange={(key) => onStoreChange(String(key ?? ''))}
                >
                    {storeViews.map((view) => (
                        <Item key={view.code} textValue={view.name}>
                            {view.name}
                        </Item>
                    ))}
                </Picker>
            </ScopeField>
        </div>
    );
}

/**
 * A labelled scope field: the SPINNER STANDS IN FOR THE CONTROL while discovery
 * runs, and the control replaces it when the values arrive.
 *
 * The label is always present and always ours, so the swap happens under a
 * heading that never moves. That also fixes the styling: the label carries
 * `datapack-import-label`, the same class as "Data types", so the modal's three
 * labels cannot render differently. (Reaching Spectrum's own label through
 * `.spectrum-FieldLabel` was tried and left them at default size; the class IS
 * in the bundle, so the reason is unestablished rather than diagnosed. Owning
 * the element removes the question.) The `Picker` therefore takes `aria-label`
 * rather than a visible `label`.
 *
 * **The field holds its height across the swap.** These pickers used to appear
 * only once scopes arrived and the dialog jumped; the disabled-placeholder
 * version fixed that, and so must this — hence a min-height on the busy state
 * rather than a bare spinner that collapses.
 *
 * Earlier shapes, so they are not retried: a spinner absolutely positioned at
 * `right: 0` of the field landed ~600px from its label, because the field is
 * `flex: 1 1 0` — half the modal. Beside the label text it was correct but
 * competed with the label for the eye while the control below sat inert showing
 * an em dash for a value it did not have.
 */
function ScopeField({
    label,
    busyLabel,
    isLoading,
    children,
}: {
    label: string;
    busyLabel: string;
    isLoading: boolean;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <div className="datapack-scope-field">
            <span className="datapack-import-label">{label}</span>
            {isLoading ? (
                <span className="datapack-scope-loading">
                    <ProgressCircle size="S" isIndeterminate aria-label={busyLabel} />
                </span>
            ) : (
                children
            )}
        </div>
    );
}

/**
 * Names the default WEBSITE, never "base" and never the default store view.
 *
 * No loading case any more: the control does not exist while discovery runs, so
 * it has no placeholder to show. It used to read "Loading websites…" — the same
 * sentence as the store view's, in the field beside it, and static, so identical
 * whether the request was in flight or wedged.
 */
function websitePlaceholder(defaultName?: string): string {
    return defaultName ? `${defaultName} (default)` : 'Instance default';
}

function storePlaceholder(firstViewName?: string): string {
    return firstViewName ? `${firstViewName} (default)` : 'Choose a website first';
}

/** The form view: the derived target plus the type checkboxes. */
export function ImportForm({
    availableTypes,
    selected,
    allSelected,
    onToggle,
    onToggleAll,
    websites,
    websiteCode,
    storeCode,
    onWebsiteChange,
    onStoreChange,
    scopesLoading,
}: {
    availableTypes: string[];
    selected: string[];
    allSelected: boolean;
    onToggle: (type: string, isSelected: boolean) => void;
    onToggleAll: () => void;
    websites: TargetWebsite[];
    websiteCode: string;
    storeCode: string;
    onWebsiteChange: (code: string) => void;
    onStoreChange: (code: string) => void;
    scopesLoading: boolean;
}): React.JSX.Element {
    return (
        <>
            {/* No target block, no Change escape, and no standing warning line.
                The project already fixes where data lands; changing that means
                changing the project, which belongs on the dashboard rather than
                behind a link in here.

                "There is no undo — check with whoever owns this instance before
                importing" used to sit here. It was permanent furniture above a
                form the user opened deliberately, so it carried no information
                at the moment it was read. The destructive path that DOES need a
                warning — Reset — has its own armed confirmation naming the
                instance, and that is where the caution belongs. */}
            <TargetScopeFields
                websites={websites}
                websiteCode={websiteCode}
                storeCode={storeCode}
                onWebsiteChange={onWebsiteChange}
                onStoreChange={onStoreChange}
                isLoading={scopesLoading}
            />
            <div className="datapack-import-types">
                {/* Beside the label, not pushed to the far right: at the wide
                    modal width it sat a screen away from the heading it acts on
                    and was easy to miss entirely. */}
                <div className="datapack-import-types-head">
                    <span className="datapack-import-label">Data types</span>
                    <ActionButton isQuiet onPress={onToggleAll}>
                        {allSelected ? 'Clear all' : 'Select all'}
                    </ActionButton>
                </div>
                {/* The grid is shared with the export modal — see
                    .datapack-type-grid for why they are one class. */}
                <div className="datapack-type-grid">
                    {availableTypes.map((type) => (
                        <Checkbox
                            key={type}
                            isSelected={selected.includes(type)}
                            onChange={(isSelected) => onToggle(type, isSelected)}
                        >
                            {dataTypeLabel(type)}
                        </Checkbox>
                    ))}
                </div>
                {needsCustomerGroups(availableTypes, selected) ? (
                    <p className="datapack-import-type-warning">
                        Products whose tier prices name a customer group fail to import without
                        it — and one failure fails the whole type. Add {dataTypeLabel('customer_groups')}{' '}
                        unless you know this pack has no tier prices.
                    </p>
                ) : null}
            </div>
        </>
    );
}

