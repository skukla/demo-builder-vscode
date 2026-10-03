/**
 * "Which products belong to this ERP?" inside Add another ERP (AB-64): one question, three
 * choices, each with the count of products it would give, counted here from the products the
 * extension read once (one search per option is too slow for a 300-product catalogue). The
 * counts use the fill's own predicate (`countOwned` → `ownershipFilter`), so what the dialog
 * promises is what the fill delivers.
 *
 * - Sold on these websites — a checkbox per website → `structure_owns: websites`
 * - Carrying this attribute — `erp_owner=<the ERP's list id>`, read-only → `attribute`
 * - Stocked in these inventory sources — a checkbox per source → `sources`
 *
 * @module features/dashboard/ui/components/ErpOwnershipPicker
 */

import { Checkbox, Flex, Radio, RadioGroup, Text } from '@adobe/react-spectrum';
import React from 'react';
import { countOwned } from '@/features/app-builder/services/erpOwnership';
import type { ErpOwnedProductRow, ErpOwnsMode, ErpOwnsRule } from '@/types/erpOwnership';

/** The picker's state: the mode, and the codes ticked under each list mode (kept while switching). */
export interface OwnershipChoice {
    mode: ErpOwnsMode;
    websites: string[];
    sources: string[];
}

export interface ErpOwnershipPickerProps {
    choice: OwnershipChoice;
    onChange: (next: OwnershipChoice) => void;
    /** `erp_owner=<list id>`, derived from the typed name. */
    attribute: string;
    websites: Array<{ code: string; name: string }>;
    sources: Array<{ code: string; name: string }>;
    /** Null while the products are still being read: every count then reads "…". */
    products: ErpOwnedProductRow[] | null;
}

/** The hint at the top: the one question that decides between the modes. */
export const SPLIT_HINT =
    'Should one order ever be split between ERPs? No: websites. Yes: attribute or sources.';

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
        case 'sources':
            return { mode: 'sources', sources: choice.sources };
        case 'attribute':
            return { mode: 'attribute', attribute };
        default:
            return { mode: 'all' };
    }
}

/** One option's checkbox list: a box per code, each with the count that code alone would give. */
function CodeList({ items, ticked, onTick, countFor, kind }: {
    items: Array<{ code: string; name: string }>;
    ticked: string[];
    onTick: (codes: string[]) => void;
    countFor: (code: string) => string;
    kind: 'website' | 'source';
}): React.ReactElement {
    if (items.length === 0) return <Text>The store has no {kind}s.</Text>;
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
    sources,
    products,
}: ErpOwnershipPickerProps): React.ReactElement {
    const websitesCount = countOf(products, { mode: 'websites', websites: choice.websites });
    const sourcesCount = countOf(products, { mode: 'sources', sources: choice.sources });
    const attributeCount = countOf(products, { mode: 'attribute', attribute });
    return (
        <Flex direction="column" gap="size-100">
            <Text>{SPLIT_HINT}</Text>
            <RadioGroup
                label="Which products belong to this ERP?"
                value={choice.mode}
                onChange={(mode) => onChange({ ...choice, mode: mode as ErpOwnsMode })}
            >
                <Radio value="websites">Sold on these websites — {productsLabel(websitesCount)}</Radio>
                <Radio value="attribute">
                    Carrying this attribute: {attribute} — {productsLabel(attributeCount)}
                </Radio>
                <Radio value="sources">
                    Stocked in these inventory sources — {productsLabel(sourcesCount)}
                </Radio>
            </RadioGroup>
            {choice.mode === 'websites' && (
                <CodeList
                    kind="website"
                    items={websites}
                    ticked={choice.websites}
                    onTick={(codes) => onChange({ ...choice, websites: codes })}
                    countFor={(code) => countOf(products, { mode: 'websites', websites: [code] })}
                />
            )}
            {choice.mode === 'sources' && (
                <CodeList
                    kind="source"
                    items={sources}
                    ticked={choice.sources}
                    onTick={(codes) => onChange({ ...choice, sources: codes })}
                    countFor={(code) => countOf(products, { mode: 'sources', sources: [code] })}
                />
            )}
        </Flex>
    );
}
