/**
 * The prompt in front of "Add another ERP" (AB-16, AB-64, AB-75): the ERP integration is added
 * once, and each further ERP is added from its card under a name the SC types, with one more
 * question — which products belong to it. The name must be new to the project, compared
 * without case, by the same `erpNameProblem` the extension applies again before anything
 * runs, so this check is for the SC's benefit, not the gate.
 *
 * The ownership picker ({@link ErpOwnershipPicker}) opens on the attribute (`defaultOwnsRule`).
 * Under it, "After adding" is the ONE place counts show (owner, 2026-10-18: simplify; the
 * options carried a count and a loading line each, three spinners at once). It previews what EVERY ERP will own once the new one is added
 * (`previewErpAdd`, the one resolver, the catch-all included), with a few SKUs each, what
 * nobody will own and what two rules will both claim. It follows the name (the attribute is
 * derived from it) and the rule as the SC changes them. The one narrowing the add does is
 * DONE by the handler from the store, so Add hands back only the name and the rule and nothing
 * about it waits on the read: while the store is still being read the preview says so and Add
 * still works (AB-72).
 *
 * Every string is in `ADD_ERP_COPY` or the picker's `PICKER_COPY`, in plain short sentences
 * (owner, 2026-10-09: the old dialog was cramped and spoke in riddles). The sections sit on
 * Spectrum's size-200 gap, as Assign products and Simulate downtime do (owner, 2026-10-18).
 *
 * The core Modal in a DialogContainer, the same host as {@link ConfirmActionDialog}, with
 * one accent action instead of a negative one: adding is not destructive.
 *
 * @module features/dashboard/ui/components/AddErpDialog
 */

import { DialogContainer, Flex, Text, TextField, View } from '@adobe/react-spectrum';
import React, { useMemo, useState } from 'react';
import { ErpOwnershipPicker, ruleOf, type OwnershipChoice, type StoreReadState } from './ErpOwnershipPicker';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { previewAsItStands, previewErpAdd, previewLines } from '@/features/app-builder/services/erpAddPreview';
import { erpListIdFor } from '@/features/app-builder/services/erpListId';
import { countOwnedAfterAdd, ownsProblem, rulesAfterAdd } from '@/features/app-builder/services/erpOwnership';
import { MAX_ERP_NAME, erpNameProblem, withSystemWord } from '@/features/app-builder/services/pairNames';
import { useErpOwnershipOptions } from '@/features/dashboard/ui/hooks/useErpOwnershipOptions';
import { NAME_IS_FIXED } from '@/features/project-creation/ui/components/integration-flow/stages/CatalogStage';
import type { ErpOwnershipOptions, ErpOwnsRule } from '@/types/erpOwnership';

/** Every string the dialog shows, in one place. */
export const ADD_ERP_COPY = {
    title: 'Add another ERP',
    nameLabel: 'ERP name',
    afterAdding: 'Products each ERP will own',
    readingStore: 'Reading the store',
    readFailed: "Couldn't read the store",
    stillAdd: 'You can still add the ERP.',
    add: 'Add',
    assign: 'Assign products',
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
    /**
     * Assign products to an ERP already added that owns nothing yet, by its name: the screen
     * closes this dialog and opens that one (owner, 2026-10-19).
     */
    onAssign?: (erpName: string) => void;
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
export function AddErpDialog({ target, takenNames, onAdd, onClose, onAssign }: AddErpDialogProps): React.ReactElement {
    // Nothing mounted while closed, not an empty DialogContainer: the screen hosts this beside
    // its own dialogs, and an empty container still occupies the dialog slot (SetupGuideModal).
    if (target === undefined) return <></>;
    return (
        <DialogContainer onDismiss={onClose}>
            <AddErpForm target={target} takenNames={takenNames} onAdd={onAdd} onClose={onClose} onAssign={onAssign} />
        </DialogContainer>
    );
}

/**
 * The space the wait holds: about the preview for two ERPs, the usual case, with a little room
 * above the spinner so it does not sit against the heading (owner, 2026-10-18).
 */
const PREVIEW_SPACE = '112px';

/**
 * "Products each ERP will own": one line per ERP, or where the read is. Until a name is typed
 * it shows the ERPs as they stand, not a nameless new one (owner, 2026-10-18). Shaped like its
 * siblings (the 2026-10-18 audit): one loading view, a failed read in an InlineNotice as
 * Assign products has, the preview as lines of text as Assign products has, and the section
 * label in the house class Export uses.
 */
function AfterAdding({ store, options, added, onAssign }: {
    store: StoreReadState;
    options: ErpOwnershipOptions | null;
    added?: { erp: string; name: string; owns: ErpOwnsRule };
    onAssign?: (erpName: string) => void;
}): React.ReactElement {
    const lines = useMemo(() => {
        if (!options) return undefined;
        const input = { websites: options.websites, erps: options.erps };
        const preview = added ? previewErpAdd(options.products, input, added) : previewAsItStands(options.products, input);
        const rules = added ? rulesAfterAdd(input, { erp: added.erp, owns: added.owns }) : options.erps;
        return previewLines(preview, rules, options.websites);
    }, [options, added]);
    let body: React.ReactNode;
    if (store.status === 'reading') {
        // Centred in a space about the preview's size, not pinned to the top of it
        // (owner, 2026-10-18), so the preview arriving barely moves the dialog. The display
        // keeps an empty line under its label, so centring alone leaves it looking high: the
        // padding sets it lower, between the heading and the buttons.
        body = (
            <CenteredFeedbackContainer height={PREVIEW_SPACE}>
                <View paddingTop="size-300">
                    <LoadingDisplay size="L" message={ADD_ERP_COPY.readingStore} />
                </View>
            </CenteredFeedbackContainer>
        );
    }
    else if (store.status === 'failed' || !lines) {
        const reason = store.status === 'failed' ? store.error : undefined;
        body = (
            <InlineNotice title={ADD_ERP_COPY.readFailed} hint={ADD_ERP_COPY.stillAdd} testId="add-erp-read-failed">
                {reason}
            </InlineNotice>
        );
    } else {
        // Name and count on one line, so both line up down the list; the meaning on its own
        // line in the help-text size, so it never wraps mid-thought (owner, 2026-10-18).
        body = (
            <Flex direction="column" gap="size-100" data-testid="add-erp-preview">
                {lines.map(({ who, count, says, assignable }) => (
                    <div key={who} data-testid="add-erp-preview-row">
                        <Flex justifyContent="space-between" gap="size-200">
                            <Text>{who}</Text>
                            <Text>{count}</Text>
                        </Flex>
                        <Flex alignItems="baseline">
                            <Text UNSAFE_className="text-gray-700 text-sm">{says}</Text>
                            {assignable && onAssign && (
                                // The screen's own inline action, as "Change" beside Deploys to: blue,
                                // at the hint's size, on the hint's line (owner, 2026-10-19: a quiet
                                // button was missed, an outlined one too big for the list).
                                <button
                                    type="button"
                                    className="inline-action-link"
                                    aria-label={`${ADD_ERP_COPY.assign} to ${who}`}
                                    onClick={() => onAssign(who)}
                                >
                                    {ADD_ERP_COPY.assign}
                                </button>
                            )}
                        </Flex>
                    </div>
                ))}
            </Flex>
        );
    }
    return (
        <div>
            <SectionLabel>{ADD_ERP_COPY.afterAdding}</SectionLabel>
            {body}
        </div>
    );
}

/** Where the store read is, from the hook's three fields. */
function storeStateOf(loading: boolean, error: string | null): StoreReadState {
    if (loading) return { status: 'reading' };
    return error ? { status: 'failed', error } : { status: 'read' };
}

/** The open prompt: mounted per opening, so each starts empty. */
function AddErpForm({ target, takenNames, onAdd, onClose, onAssign }: AddErpDialogProps & { target: AddErpTarget }) {
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
    // No name yet: the preview shows the ERPs as they stand, not a nameless new one.
    const added = useMemo(() => (saved ? { erp: listId, name: saved, owns: rule } : undefined), [listId, saved, rule]);
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
            {/* The body goes from a spinner to the preview, and the website list comes and
                goes: the floor keeps the dialog from jumping. The section gap is the one
                Assign products and Simulate downtime use (owner, 2026-10-18). */}
            <SteadyHeight align="start">
            <Flex direction="column" gap="size-200">
                <TextField
                    label={ADD_ERP_COPY.nameLabel}
                    value={name}
                    onChange={setName}
                    maxLength={MAX_ERP_NAME}
                    autoFocus
                    width="100%"
                    validationState={problem ? 'invalid' : undefined}
                    errorMessage={problem}
                    description={NAME_IS_FIXED}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') add();
                    }}
                />
                <ErpOwnershipPicker
                    choice={choice}
                    onChange={setChoice}
                    websites={options?.websites ?? NONE}
                    count={count}
                    store={store}
                />
                <AfterAdding store={store} options={options} added={added} onAssign={onAssign} />
            </Flex>
            </SteadyHeight>
        </Modal>
    );
}
