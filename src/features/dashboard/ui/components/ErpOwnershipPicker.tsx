/**
 * "Which products belong to this ERP?" inside Add another ERP (AB-64): one question, two
 * choices, each with the count of products it would give, counted here from the products the
 * extension read once (one search per option is too slow for a 300-product catalogue). The
 * counts use the fill's own predicate (`countOwned` → `ownershipFilter`), so what the dialog
 * promises is what the fill delivers.
 *
 * - Carrying this attribute — `erp_owner=<the ERP's list id>`, read-only → `attribute`; the
 *   default (owner, 2026-10-09)
 * - Sold on these websites — a checkbox per website → `structure_owns: websites`
 *
 * "Stocked in these inventory sources" was deleted on 2026-10-09 (AB-70).
 *
 * @module features/dashboard/ui/components/ErpOwnershipPicker
 */

import { Checkbox, Flex, Radio, RadioGroup, Text } from '@adobe/react-spectrum';
import React from 'react';
import { countOwned } from '@/features/app-builder/services/erpOwnership';
import type { ErpOwnedProductRow, ErpOwnsMode, ErpOwnsRule } from '@/types/erpOwnership';

/** The picker's state: the mode, and the websites ticked (kept while switching). */
export interface OwnershipChoice {
    mode: ErpOwnsMode;
    websites: string[];
}

export interface ErpOwnershipPickerProps {
    choice: OwnershipChoice;
    onChange: (next: OwnershipChoice) => void;
    /** `erp_owner=<list id>`, derived from the typed name. */
    attribute: string;
    websites: Array<{ code: string; name: string }>;
    /** Null while the products are still being read: every count then reads "…". */
    products: ErpOwnedProductRow[] | null;
}

/** The hint at the top: the one question that decides between the modes. */
export const SPLIT_HINT =
    'Should one order ever be split between ERPs? Yes: attribute. No: websites.';

/** A count, or "…" while the products are still being read. */
function countOf(products: ErpOwnedProductRow[] | null, rule: ErpOwnsRule): string {
    return products === null ? '…' : String(countOwned(products, rule));
}

/** A product count in words. */
function productsLabel(count: string): string {
    return count === '1' ? '1 product' : `${count} products`;
}

/** The rule a choice is, as the extension saves it. */
export function ruleOf(choice: OwnershipChoice, attribute: string): ErpOwnsRule {
    switch (choice.mode) {
        case 'websites':
            return { mode: 'websites', websites: choice.websites };
        case 'attribute':
            return { mode: 'attribute', attribute };
        default:
            return { mode: 'all' };
    }
}

/** The websites list: a box per code, each with the count that website alone would give. */
function WebsiteList({ items, ticked, onTick, countFor }: {
    items: Array<{ code: string; name: string }>;
    ticked: string[];
    onTick: (codes: string[]) => void;
    countFor: (code: string) => string;
}): React.ReactElement {
    if (items.length === 0) return <Text>The store has no websites.</Text>;
    return (
        <Flex direction="column" marginStart="size-300">
            {items.map((item) => (
                <Checkbox
                    key={item.code}
                    isSelected={ticked.includes(item.code)}
                    onChange={(on) =>
                        onTick(on ? [...ticked, item.code] : ticked.filter((code) => code !== item.code))
                    }
                >
                    {item.name} ({item.code}) — {productsLabel(countFor(item.code))}
                </Checkbox>
            ))}
        </Flex>
    );
}

/**
 * The picker.
 *
 * @param props - the choice, the lists, the attribute and the products to count
 * @returns the radio group with its lists
 */
export function ErpOwnershipPicker({
    choice,
    onChange,
    attribute,
    websites,
    products,
}: ErpOwnershipPickerProps): React.ReactElement {
    const websitesCount = countOf(products, { mode: 'websites', websites: choice.websites });
    const attributeCount = countOf(products, { mode: 'attribute', attribute });
    return (
        <Flex direction="column" gap="size-100">
            <Text>{SPLIT_HINT}</Text>
            <RadioGroup
                label="Which products belong to this ERP?"
                value={choice.mode}
                onChange={(mode) => onChange({ ...choice, mode: mode as ErpOwnsMode })}
            >
                <Radio value="attribute">
                    Carrying this attribute: {attribute} — {productsLabel(attributeCount)}
                </Radio>
                <Radio value="websites">Sold on these websites — {productsLabel(websitesCount)}</Radio>
            </RadioGroup>
            {choice.mode === 'websites' && (
                <WebsiteList
                    items={websites}
                    ticked={choice.websites}
                    onTick={(codes) => onChange({ ...choice, websites: codes })}
                    countFor={(code) => countOf(products, { mode: 'websites', websites: [code] })}
                />
            )}
        </Flex>
    );
}
