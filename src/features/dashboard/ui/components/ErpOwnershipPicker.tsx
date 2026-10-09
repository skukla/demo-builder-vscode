/**
 * "Which products belong to this ERP?" inside Add another ERP (AB-64): one question, two
 * choices. Each choice is its own line with one sentence under it saying what it means, and a
 * line under that with the count of products it would give, counted by the dialog from the
 * products the extension read once and across every ERP's rule (`countOwnedAfterAdd` →
 * `ownersAcross`, AB-72).
 *
 * - Tagged in Commerce — `erp_owner=<the ERP's list id>` → `attribute`; the default
 *   (owner, 2026-10-09)
 * - Sold on chosen websites — a checkbox per website → `structure_owns: websites`
 *
 * While the store is being read, the counts and the website list show the house loading view
 * (`LoadingDisplay`) with the same words; "The store has no websites." is said only when the
 * read answered with none, and a read that failed says why (AB-75, owner 2026-10-09: the list
 * used to say "no websites" while it was still loading).
 *
 * @module features/dashboard/ui/components/ErpOwnershipPicker
 */

import { Checkbox, Flex, Radio, RadioGroup, Text } from '@adobe/react-spectrum';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { productCount } from '@/features/app-builder/services/erpAddPreview';
import type { ErpOwnsMode, ErpOwnsRule } from '@/types/erpOwnership';

/** Every string the picker shows, in one place. */
export const PICKER_COPY = {
    question: 'Which products belong to this ERP?',
    attributeLabel: 'Products tagged in Commerce',
    attributeHelp: (attribute: string) =>
        `Products tagged ${attribute} in Commerce. One order can include products from several ERPs.`,
    websitesLabel: 'Products sold on chosen websites',
    websitesHelp: 'Every product sold on the websites you tick. Each order goes to one ERP.',
    owns: (count: number) => `It would own ${productCount(count)}.`,
    counting: 'Counting the products',
    readingWebsites: "Reading the store's websites",
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
    /** `erp_owner=<list id>`, derived from the typed name. */
    attribute: string;
    websites: Array<{ code: string; name: string }>;
    /** How many products the new ERP would own under a rule. */
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

/** The count line under an option: loading while the store is read, nothing when it failed. */
function CountLine({ store, count }: { store: StoreReadState; count: () => number }): React.ReactElement | null {
    if (store.status === 'reading') return <LoadingDisplay size="S" message={PICKER_COPY.counting} />;
    if (store.status === 'failed') return null;
    return <Text>{PICKER_COPY.owns(count())}</Text>;
}

/** One option's words: its name, the sentence under it, then its count line. */
function OptionText({ label, help, children }: { label: string; help: string; children: React.ReactNode }): React.ReactElement {
    return (
        <Flex direction="column" gap="size-50">
            <Text>{label}</Text>
            <Text UNSAFE_className="text-gray-700 text-sm">{help}</Text>
            {children}
        </Flex>
    );
}

/** The websites list: loading, refused, empty, or a box per website with what it alone gives. */
function WebsiteList({ items, ticked, onTick, countFor, store }: {
    items: Array<{ code: string; name: string }>;
    ticked: string[];
    onTick: (codes: string[]) => void;
    countFor: (code: string) => number;
    store: StoreReadState;
}): React.ReactElement {
    if (store.status === 'reading') return <LoadingDisplay size="S" message={PICKER_COPY.readingWebsites} />;
    if (store.status === 'failed') return <Text>{store.error}</Text>;
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
    attribute,
    websites,
    count,
    store,
}: ErpOwnershipPickerProps): React.ReactElement {
    return (
        <Flex direction="column" gap="size-150">
            {/* Radios are the group's DIRECT children: the group hands each one its state. */}
            <RadioGroup
                label={PICKER_COPY.question}
                value={choice.mode}
                onChange={(mode) => onChange({ ...choice, mode: mode as ErpOwnsMode })}
            >
                <Radio value="attribute">
                    <OptionText label={PICKER_COPY.attributeLabel} help={PICKER_COPY.attributeHelp(attribute)}>
                        <CountLine store={store} count={() => count({ mode: 'attribute', attribute })} />
                    </OptionText>
                </Radio>
                <Radio value="websites">
                    <OptionText label={PICKER_COPY.websitesLabel} help={PICKER_COPY.websitesHelp}>
                        <CountLine store={store} count={() => count({ mode: 'websites', websites: choice.websites })} />
                    </OptionText>
                </Radio>
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
