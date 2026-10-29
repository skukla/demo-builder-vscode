/**
 * "Which products does it own?" inside Add another ERP (AB-64): one question, two one-line
 * choices, and one line under the group saying what the selected one means for orders. The counts live in the dialog's "After
 * adding", the one place they show (owner, 2026-10-18: each option used to carry its own count
 * and loading line). A website box still says what it alone gives, counted across every ERP's
 * rule (`countOwnedAfterAdd` → `ownersAcross`, AB-72).
 *
 * - Tagged in Commerce — `erp_owner=<the ERP's list id>` → `attribute`; the default
 *   (owner, 2026-10-09)
 * - Sold on chosen websites — a checkbox per website → `structure_owns: websites`
 *
 * While the store is being read, the website list show the house loading view
 * (`LoadingDisplay`) with the same words; "The store has no websites." is said only when the
 * read answered with none, and a read that failed says why (AB-75, owner 2026-10-09: the list
 * used to say "no websites" while it was still loading).
 *
 * @module features/dashboard/ui/components/ErpOwnershipPicker
 */

import { Checkbox, Flex, Radio, RadioGroup, Text } from '@adobe/react-spectrum';
import React from 'react';
import { productCount } from '@/features/app-builder/services/erpAddPreview';
import type { ErpOwnsMode, ErpOwnsRule } from '@/types/erpOwnership';

/** Every string the picker shows, in one place. */
export const PICKER_COPY = {
    question: 'Which products does it own?',
    attributeLabel: 'Products you assign to it',
    attributeHelp: 'One order can include products from several ERPs.',
    websitesLabel: 'Products sold on websites you choose',
    websitesHelp: 'Each order goes to one ERP.',
    noWebsites: 'The store has no websites.',
};

/** The picker's state: the mode, and the websites ticked (kept while switching). */
export interface OwnershipChoice {
    mode: ErpOwnsMode;
    websites: string[];
}

/** Where the store read is: still reading, read, or refused (with why). */
export type StoreReadState = { status: 'reading' } | { status: 'read' } | { status: 'failed'; error: string };

export interface ErpOwnershipPickerProps {
    choice: OwnershipChoice;
    onChange: (next: OwnershipChoice) => void;
    websites: Array<{ code: string; name: string }>;
    /** How many products the new ERP would own under a rule: each website box says what it alone gives. */
    count: (rule: ErpOwnsRule) => number;
    store: StoreReadState;
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

/** The one line under the group: what the selected choice means for orders. */
function helpFor(mode: ErpOwnsMode): string {
    return mode === 'websites' ? PICKER_COPY.websitesHelp : PICKER_COPY.attributeHelp;
}

/** The websites list: loading, refused, empty, or a box per website with what it alone gives. */
function WebsiteList({ items, ticked, onTick, countFor, store }: {
    items: Array<{ code: string; name: string }>;
    ticked: string[];
    onTick: (codes: string[]) => void;
    countFor: (code: string) => number;
    store: StoreReadState;
}): React.ReactElement | null {
    // The dialog shows the one loading view and the one failed-read notice; the list adds
    // neither, so the wait and the reason each show once (the 2026-10-18 audit).
    if (store.status !== 'read') return null;
    if (items.length === 0) return <Text>{PICKER_COPY.noWebsites}</Text>;
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
                    {`${item.name}: ${productCount(countFor(item.code))}`}
                </Checkbox>
            ))}
        </Flex>
    );
}

/**
 * The picker.
 *
 * @param props - the choice, the lists, the attribute, the counter and where the store read is
 * @returns the question with its two options
 */
export function ErpOwnershipPicker({
    choice,
    onChange,
    websites,
    count,
    store,
}: ErpOwnershipPickerProps): React.ReactElement {
    return (
        <Flex direction="column" gap="size-150">
            {/* Radios are the group's DIRECT children: the group hands each one its state. */}
            {/* One-line choices, as Assign products has; the meaning of the selected one sits
                under the group (owner, 2026-10-18: two lines a choice read as crowded). */}
            <RadioGroup
                label={PICKER_COPY.question}
                description={helpFor(choice.mode)}
                value={choice.mode}
                onChange={(mode) => onChange({ ...choice, mode: mode as ErpOwnsMode })}
            >
                <Radio value="attribute">{PICKER_COPY.attributeLabel}</Radio>
                <Radio value="websites">{PICKER_COPY.websitesLabel}</Radio>
            </RadioGroup>
            {choice.mode === 'websites' && (
                <WebsiteList
                    items={websites}
                    ticked={choice.websites}
                    onTick={(codes) => onChange({ ...choice, websites: codes })}
                    countFor={(code) => count({ mode: 'websites', websites: [code] })}
                    store={store}
                />
            )}
        </Flex>
    );
}
