/**
 * The prompt in front of "Add another ERP" (AB-16, AB-64, AB-75): the ERP integration is added
 * once, and each further ERP is added from its card under a name the SC types, with one more
 * question — which products belong to it. The name must be new to the project, compared
 * without case, by the same `erpNameProblem` the extension applies again before anything
 * runs, so this check is for the SC's benefit, not the gate.
 *
 * The ownership picker ({@link ErpOwnershipPicker}) opens on the attribute (`defaultOwnsRule`).
 * Under it, "After adding" previews what EVERY ERP will own once the new one is added
 * (`previewErpAdd`, the one resolver, the catch-all included), with a few SKUs each, what
 * nobody will own and what two rules will both claim. It follows the name (the attribute is
 * derived from it) and the rule as the SC changes them. The one narrowing the add does is
 * DONE by the handler from the store, so Add hands back only the name and the rule and nothing
 * about it waits on the read: while the store is still being read the preview says so and Add
 * still works (AB-72).
 *
 * Every string is in `ADD_ERP_COPY` or the picker's `PICKER_COPY`, in plain short sentences
 * (owner, 2026-10-09: the old dialog was cramped and spoke in riddles). The sections sit on
 * Spectrum's size-300 gap, as the other Integrations-screen modals do.
 *
 * The core Modal in a DialogContainer, the same host as {@link ConfirmActionDialog}, with
 * one accent action instead of a negative one: adding is not destructive.
 *
 * @module features/dashboard/ui/components/AddErpDialog
 */

import { DialogContainer, Flex, Heading, Text, TextField } from '@adobe/react-spectrum';
import React, { useMemo, useState } from 'react';
import { ErpOwnershipPicker, ruleOf, type OwnershipChoice, type StoreReadState } from './ErpOwnershipPicker';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { ownsNothingNext, previewErpAdd, previewSentences } from '@/features/app-builder/services/erpAddPreview';
import { erpListIdFor } from '@/features/app-builder/services/erpListId';
import { countOwnedAfterAdd, ownsProblem } from '@/features/app-builder/services/erpOwnership';
import { MAX_ERP_NAME, erpNameProblem, withSystemWord } from '@/features/app-builder/services/pairNames';
import { useErpOwnershipOptions } from '@/features/dashboard/ui/hooks/useErpOwnershipOptions';
import type { ErpOwnershipOptions, ErpOwnsRule } from '@/types/erpOwnership';

/** Every string the dialog shows, in one place. */
export const ADD_ERP_COPY = {
    title: 'Add another ERP',
    intro: (integration: string) =>
        `Demo Builder deploys a new ERP in its own Adobe workspace, and ${integration} sends it the orders for its products.`,
    nameLabel: 'ERP name',
    addedAs: (name: string) => `It is added as ${name}.`,
    afterAdding: 'After adding',
    readingStore: 'Reading the store',
    readFailed: 'The preview needs the store, and it could not be read. You can still add the ERP.',
    add: 'Add',
};

/** The ERP integration an ERP is added to, while the prompt is open. */
export interface AddErpTarget {
    id: string;
    name: string;
}

export interface AddErpDialogProps {
    /** The integration the ERP is added to, while the prompt is open. */
    target?: AddErpTarget;
    /** Names already in the project, which a new ERP may not reuse. */
    takenNames: string[];
    onAdd: (name: string, owns: ErpOwnsRule) => void;
    onClose: () => void;
}

/** The attribute: the default, and the one rule that needs nothing from the store. */
const ATTRIBUTE_FIRST: OwnershipChoice = { mode: 'attribute', websites: [] };

/** One empty list for every render, so the picker's effects do not see a new reference each time. */
const NONE: never[] = [];

/** Every count is 0 when the store has not answered. */
const NOTHING = (): number => 0;

/**
 * Host the prompt; present it while an integration is targeted.
 *
 * @param props - the integration, the taken names, and the two callbacks
 * @returns the dialog container
 */
export function AddErpDialog({ target, takenNames, onAdd, onClose }: AddErpDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {target !== undefined && (
                <AddErpForm target={target} takenNames={takenNames} onAdd={onAdd} onClose={onClose} />
            )}
        </DialogContainer>
    );
}

/** "After adding": what every ERP will own, or where the read is. */
function AfterAdding({ store, options, added }: {
    store: StoreReadState;
    options: ErpOwnershipOptions | null;
    added: { erp: string; name: string; owns: ErpOwnsRule };
}): React.ReactElement {
    const preview = useMemo(
        () => (options ? previewErpAdd(options.products, { websites: options.websites, erps: options.erps }, added) : undefined),
        [options, added],
    );
    let body: React.ReactNode;
    if (store.status === 'reading') body = <LoadingDisplay size="S" message={ADD_ERP_COPY.readingStore} />;
    else if (store.status === 'failed' || !preview) body = <Text>{ADD_ERP_COPY.readFailed}</Text>;
    else {
        const next = ownsNothingNext(preview, added.owns);
        body = (
            <Flex direction="column" gap="size-150" data-testid="add-erp-preview">
                {previewSentences(preview).map(({ line, detail, examples }) => (
                    <Flex key={line} direction="column">
                        <Text>{line}</Text>
                        {detail && <Text UNSAFE_className="text-gray-700 text-sm">{detail}</Text>}
                        {examples && <Text UNSAFE_className="text-gray-700 text-sm">{examples}</Text>}
                    </Flex>
                ))}
                {next && <Text>{next}</Text>}
            </Flex>
        );
    }
    return (
        <Flex direction="column" gap="size-100">
            <Heading level={4} margin={0}>{ADD_ERP_COPY.afterAdding}</Heading>
            {body}
        </Flex>
    );
}

/** Where the store read is, from the hook's three fields. */
function storeStateOf(loading: boolean, error: string | null): StoreReadState {
    if (loading) return { status: 'reading' };
    return error ? { status: 'failed', error } : { status: 'read' };
}

/** The open prompt: mounted per opening, so each starts empty. */
function AddErpForm({ target, takenNames, onAdd, onClose }: AddErpDialogProps & { target: AddErpTarget }) {
    const [name, setName] = useState('');
    const [choice, setChoice] = useState<OwnershipChoice>(ATTRIBUTE_FIRST);
    const { options, error, loading } = useErpOwnershipOptions(target.id);
    const store = storeStateOf(loading, error);

    // The name the ERP is given — ending in "ERP", as the extension enforces — drives
    // the list id and the duplicate check, so both match what is actually added.
    const saved = withSystemWord(name, 'ERP');
    const listId = erpListIdFor(saved, options?.takenListIds ?? NONE);
    // The attribute is derived live from the name; it is the default (owner, 2026-10-09), so
    // nothing waits on the store to pick a mode.
    const attribute = `erp_owner=${listId}`;

    const rule = useMemo(() => ruleOf(choice, attribute), [choice, attribute]);
    const added = useMemo(() => ({ erp: listId, name: saved || 'The new ERP', owns: rule }), [listId, saved, rule]);
    // What the new ERP would own under each option, once every ERP's rule is applied (AB-72).
    const count = useMemo(
        () =>
            options
                ? (candidate: ErpOwnsRule) =>
                      countOwnedAfterAdd(options.products, { websites: options.websites, erps: options.erps }, { erp: listId, owns: candidate })
                : NOTHING,
        [options, listId],
    );
    // Shown once something is typed; Add stays off while the name is blank either way.
    const problem = saved ? erpNameProblem(saved, takenNames) : undefined;
    const ready = saved.length > 0 && !problem && !ownsProblem(rule);
    const add = (): void => {
        if (ready) onAdd(saved, rule);
    };
    return (
        <Modal
            title={ADD_ERP_COPY.title}
            size="M"
            fitContent
            onClose={onClose}
            actionButtons={[{ label: ADD_ERP_COPY.add, variant: 'accent', onPress: add, isDisabled: !ready }]}
        >
            <Flex direction="column" gap="size-300">
                <Text>{ADD_ERP_COPY.intro(target.name)}</Text>
                <TextField
                    label={ADD_ERP_COPY.nameLabel}
                    value={name}
                    onChange={setName}
                    maxLength={MAX_ERP_NAME}
                    autoFocus
                    width="100%"
                    validationState={problem ? 'invalid' : undefined}
                    errorMessage={problem}
                    description={saved && saved !== name.trim() ? ADD_ERP_COPY.addedAs(saved) : undefined}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') add();
                    }}
                />
                <ErpOwnershipPicker
                    choice={choice}
                    onChange={setChoice}
                    attribute={attribute}
                    websites={options?.websites ?? NONE}
                    count={count}
                    store={store}
                />
                <AfterAdding store={store} options={options} added={added} />
            </Flex>
        </Modal>
    );
}
