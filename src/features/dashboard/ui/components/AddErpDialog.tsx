/**
 * The prompt in front of "Add another ERP" (AB-16, AB-64): the ERP integration is added once,
 * and each further ERP is added from its card under a name the SC types, with one more
 * question — which products belong to it. The name must be new to the project, compared
 * without case, by the same `erpNameProblem` the extension applies again before anything
 * runs, so this check is for the SC's benefit, not the gate.
 *
 * The ownership picker ({@link ErpOwnershipPicker}) opens with a default the store decides
 * (`defaultOwnsRule`), its counts read once from Commerce as the dialog opens. Once there are
 * two ERPs each owns only what its rule says, so an existing ERP that still owns everything is
 * shown the rule it will be given (`existingRulesToChange`), saved together with the new one.
 *
 * The core Modal in a DialogContainer, the same host as {@link ConfirmActionDialog}, with
 * one accent action instead of a negative one: adding is not destructive.
 *
 * @module features/dashboard/ui/components/AddErpDialog
 */

import { DialogContainer, Flex, Text, TextField } from '@adobe/react-spectrum';
import React, { useMemo, useState } from 'react';
import { ErpOwnershipPicker, ruleOf, type OwnershipChoice } from './ErpOwnershipPicker';
import { Modal } from '@/core/ui/components/ui/Modal';
import { erpListIdFor } from '@/features/app-builder/services/erpListId';
import {
    describeOwns,
    existingRulesToChange,
    ownsProblem,
} from '@/features/app-builder/services/erpOwnership';
import { MAX_ERP_NAME, erpNameProblem, withSystemWord } from '@/features/app-builder/services/pairNames';
import { useErpOwnershipOptions } from '@/features/dashboard/ui/hooks/useErpOwnershipOptions';
import type { ErpOwnershipOptions, ErpOwnsEntry, ErpOwnsRule } from '@/types/erpOwnership';

/** Said once there is an ERP to show beside the new one. */
export const TWO_ERPS_NOTE = 'Once there are two ERPs, each owns only what its rule says.';

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
    onAdd: (name: string, owns: ErpOwnsRule, existingOwns: ErpOwnsEntry[]) => void;
    onClose: () => void;
}


/** The attribute: the default, and the one rule that needs nothing from the store. */
const ATTRIBUTE_FIRST: OwnershipChoice = { mode: 'attribute', websites: [] };

/** One empty list for every render, so the picker's effects do not see a new reference each time. */
const NONE: never[] = [];

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

/** An existing ERP's line: its rule now, or the one it is given and what that means for it. */
function existingErpLine(erp: ErpOwnershipOptions['erps'][number], change: ErpOwnsEntry | undefined): string {
    if (!change) return `${erp.name}: ${describeOwns(erp.owns)}`;
    // Ownership is applied across every ERP as the add ends (AB-70): the products it no longer
    // owns are marked discontinued there, nothing waits for a reset.
    return `${erp.name}: ${describeOwns(change.owns)} (now ${describeOwns(erp.owns)}; its products are re-sorted as the ERP is added)`;
}

/** The existing ERPs beside the new one: each one's rule now, and the one it is given. */
function ExistingErps({ options, changes }: {
    options: ErpOwnershipOptions;
    changes: ErpOwnsEntry[];
}): React.ReactElement | null {
    if (options.erps.length === 0) return null;
    return (
        <Flex direction="column" gap="size-50">
            <Text>{TWO_ERPS_NOTE}</Text>
            {options.erps.map((erp) => (
                <Text key={erp.erp}>
                    {existingErpLine(erp, changes.find((entry) => entry.erp === erp.erp))}
                </Text>
            ))}
        </Flex>
    );
}

/** The open prompt: mounted per opening, so each starts empty. */
function AddErpForm({ target, takenNames, onAdd, onClose }: AddErpDialogProps & { target: AddErpTarget }) {
    const [name, setName] = useState('');
    const [choice, setChoice] = useState<OwnershipChoice>(ATTRIBUTE_FIRST);
    const { options, error, loading } = useErpOwnershipOptions(target.id);

    // The name the ERP is given — ending in "ERP", as the extension enforces — drives
    // the list id and the duplicate check, so both match what is actually added.
    const saved = withSystemWord(name, 'ERP');
    const listId = erpListIdFor(saved, options?.takenListIds ?? NONE);
    // The attribute is derived live from the name; it is the default (owner, 2026-10-09), so
    // nothing waits on the store to pick a mode.
    const attribute = `erp_owner=${listId}`;

    const rule = useMemo(() => ruleOf(choice, attribute), [choice, attribute]);
    const changes = useMemo(
        () => (options ? existingRulesToChange({ websites: options.websites, erps: options.erps }, rule) : []),
        [options, rule],
    );
    // Shown once something is typed; Add stays off while the name is blank either way.
    const problem = saved ? erpNameProblem(saved, takenNames) : undefined;
    const ready = saved.length > 0 && !problem && !ownsProblem(rule);
    const add = (): void => {
        if (ready) onAdd(saved, rule, changes);
    };
    return (
        <Modal
            title="Add another ERP"
            size="M"
            fitContent
            onClose={onClose}
            actionButtons={[{ label: 'Add', variant: 'accent', onPress: add, isDisabled: !ready }]}
        >
            <Flex direction="column" gap="size-150">
                <Text>
                    A new ERP of its own, in its own Adobe workspace, that {target.name} sends
                    orders to. It is filled from Commerce once it is deployed.
                </Text>
                <TextField
                    label="ERP name"
                    value={name}
                    onChange={setName}
                    maxLength={MAX_ERP_NAME}
                    autoFocus
                    width="100%"
                    validationState={problem ? 'invalid' : undefined}
                    errorMessage={problem}
                    description={saved && saved !== name.trim() ? `Added as “${saved}”.` : undefined}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') add();
                    }}
                />
                <ErpOwnershipPicker
                    choice={choice}
                    onChange={setChoice}
                    attribute={attribute}
                    websites={options?.websites ?? NONE}
                    products={loading ? null : (options?.products ?? NONE)}
                />
                {error && <Text>{error}</Text>}
                {options && <ExistingErps options={options} changes={changes} />}
            </Flex>
        </Modal>
    );
}
