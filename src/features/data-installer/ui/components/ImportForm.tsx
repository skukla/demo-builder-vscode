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

import { ActionButton, Checkbox, Item, Picker } from '@adobe/react-spectrum';
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
            <Picker
                label="Target website"
                placeholder={websitePlaceholder(isLoading, defaultSite?.name)}
                isDisabled={isLoading}
                selectedKey={websiteCode || null}
                onSelectionChange={(key) => onWebsiteChange(String(key ?? ''))}
            >
                {websites.map((site) => (
                    <Item key={site.code} textValue={site.name}>
                        {site.name}
                    </Item>
                ))}
            </Picker>
            <Picker
                label="Store view"
                placeholder={storePlaceholder(isLoading, chosen ? storeViews[0]?.name : undefined)}
                isDisabled={isLoading || !websiteCode}
                selectedKey={storeCode || null}
                onSelectionChange={(key) => onStoreChange(String(key ?? ''))}
            >
                {storeViews.map((view) => (
                    <Item key={view.code} textValue={view.name}>
                        {view.name}
                    </Item>
                ))}
            </Picker>
        </div>
    );
}

/** Names the default WEBSITE, never "base" and never the default store view. */
function websitePlaceholder(isLoading: boolean, defaultName?: string): string {
    if (isLoading) {
        return 'Loading websites…';
    }
    return defaultName ? `${defaultName} (default)` : 'Instance default';
}

function storePlaceholder(isLoading: boolean, firstViewName?: string): string {
    if (isLoading) {
        return 'Loading…';
    }
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
            {/* No target block and no Change escape. The project already fixes
                where data lands; changing that means changing the project, which
                belongs on the dashboard rather than behind a link in here. The
                22-character instance id it used to print was not something
                anyone could verify by eye either. */}
            <p className="datapack-import-warning">
                There is no undo — check with whoever owns this instance before importing.
            </p>
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

