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
import React, { useState } from 'react';
import type { TargetWebsite } from '../hooks/useImportScopes';
import { FormField } from '@/core/ui/components/forms/FormField';

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
function TargetScopeFields({
    websites,
    websiteCode,
    storeCode,
    onWebsiteChange,
    onStoreChange,
}: {
    websites: TargetWebsite[];
    websiteCode: string;
    storeCode: string;
    onWebsiteChange: (code: string) => void;
    onStoreChange: (code: string) => void;
}): React.JSX.Element | null {
    if (websites.length === 0) {
        return null;
    }
    const storeViews = websites.find((site) => site.code === websiteCode)?.storeViews ?? [];

    return (
        <div className="datapack-import-scope">
            <Picker
                label="Target website"
                placeholder="Default (base)"
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
                placeholder={websiteCode ? 'Choose a store view' : 'Choose a website first'}
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
            <p className="datapack-import-scope-hint">
                Only websites that already exist on this instance appear here. To land this pack
                on its own website, create it in Commerce first, then choose it.
            </p>
        </div>
    );
}

/** The form view: the derived target plus the type checkboxes. */
export function ImportForm({
    projectName,
    instance,
    onInstanceChange,
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
}: {
    projectName?: string;
    instance: string;
    onInstanceChange: (value: string) => void;
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
}): React.JSX.Element {
    return (
        <>
            <ImportTargetField
                projectName={projectName}
                instance={instance}
                onChange={onInstanceChange}
            />
            <TargetScopeFields
                websites={websites}
                websiteCode={websiteCode}
                storeCode={storeCode}
                onWebsiteChange={onWebsiteChange}
                onStoreChange={onStoreChange}
            />
            <div className="datapack-import-types">
                <div className="datapack-import-types-head">
                    <span className="datapack-import-label">Data types</span>
                    <ActionButton isQuiet onPress={onToggleAll}>
                        {allSelected ? 'Clear all' : 'Select all'}
                    </ActionButton>
                </div>
                {/* Two columns: a pack ships up to 14 types, and one column
                    turns a glance into a scroll. */}
                <div className="datapack-import-type-grid">
                    {availableTypes.map((type) => (
                        <Checkbox
                            key={type}
                            isSelected={selected.includes(type)}
                            onChange={(isSelected) => onToggle(type, isSelected)}
                        >
                            {type}
                        </Checkbox>
                    ))}
                </div>
                {needsCustomerGroups(availableTypes, selected) ? (
                    <p className="datapack-import-type-warning">
                        Products whose tier prices name a customer group fail to import without
                        it — and one failure fails the whole type. Add customer_groups unless you
                        know this pack has no tier prices.
                    </p>
                ) : null}
            </div>
        </>
    );
}

/**
 * Where the import will be written — shown, not typed, when the project knows.
 *
 * The summary leads with the project NAME because a 22-character nanoid is not
 * something anyone can confirm is right, and keeps the id underneath (monospace
 * — checked character by character against the console) because the id is what
 * actually decides where data lands. `Change` swaps in the editable field; a
 * project that derives nothing gets the field directly, or it could not be
 * imported into at all. The typed value is sent verbatim — never trimmed or
 * reformatted on the way out.
 */
function ImportTargetField({
    projectName,
    instance,
    onChange,
}: {
    projectName?: string;
    instance: string;
    onChange: (value: string) => void;
}): React.JSX.Element {
    const [overriding, setOverriding] = useState(false);

    if (!projectName || !instance || overriding) {
        return (
            <FormField
                fieldKey="commerceInstance"
                label="Commerce instance"
                type="text"
                value={instance}
                onChange={onChange}
                required
                description="Where this data will be written. There is no undo — check it with whoever owns the target."
            />
        );
    }

    return (
        <div className="datapack-import-target">
            <div className="datapack-import-types-head">
                <span className="datapack-import-label">Target</span>
                <ActionButton isQuiet onPress={() => setOverriding(true)}>
                    Change
                </ActionButton>
            </div>
            <div className="datapack-import-target-name">{projectName}</div>
            <div className="datapack-import-target-id">Commerce instance {instance}</div>
            <div className="datapack-import-target-warning">
                There is no undo — check the target with whoever owns it.
            </div>
        </div>
    );
}
