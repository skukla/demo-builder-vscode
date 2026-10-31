/**
 * The ACO add-on's on/off choice (PL-60, owner 2026-10-31 P1): one checkbox, off by default,
 * shown only where the project's stack offers ACO and its demo package allows it, and locked on
 * where the package requires it. The wizard's Catalog step and Configure both render it, so the
 * words and the rule are written once.
 *
 * It is the house `CheckboxRow` (name, quieter detail, and why it cannot change), whose styles
 * both host bundles already load (`checkbox-row.css`). A Spectrum `Switch` was considered and not
 * used: no screen here uses one for a setting, and the row is the vocabulary for "a choice with a
 * reason it is locked".
 *
 * @module features/components/ui/components/AcoAddonChoice
 */

import React from 'react';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import type { AddonOffer } from '@/types/stacks';

export interface AcoAddonChoiceProps {
    /** What the project's stack and package allow (`addonOffer`). */
    offer: AddonOffer;
    /** Whether ACO is on now. */
    isOn: boolean;
    /** Asked with the new value when the SC ticks or unticks it. */
    onChange: (on: boolean) => void;
    /** Locked while a change is being applied. */
    isBusy?: boolean;
    /** A line after the detail: what saving will do, or why the last change did not happen. */
    note?: string;
}

const LABEL = 'Read the catalog from Adobe Commerce Optimizer';
const DETAIL = 'Carts and orders stay with Commerce';
const REQUIRED = 'This demo package requires it';

/** The ACO checkbox, or nothing where the package does not offer ACO. */
export function AcoAddonChoice({ offer, isOn, onChange, isBusy, note }: AcoAddonChoiceProps): React.ReactElement | null {
    if (offer === 'not-offered') return null;
    const required = offer === 'required';
    return (
        <div data-testid="aco-addon-choice">
            <CheckboxRow
                label={LABEL}
                detail={DETAIL}
                reason={required ? REQUIRED : note}
                isSelected={required || isOn}
                isDisabled={required || isBusy === true}
                onChange={() => onChange(!isOn)}
            />
        </div>
    );
}
