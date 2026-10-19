/**
 * "Assign products" on an ERP's card (AB-74): the project's store's products as a list the SC
 * searches, filters and selects (`AssignProductList`); the modal says how many are ticked and which ERP
 * owns them today (moving a product from one ERP to another is allowed, and said); Assign hands
 * the ticked SKUs to the screen, which runs the write in its progress modal.
 *
 * It picked by one way at a time until 2026-10-18 (a category, a brand, the start of the SKU or
 * a pasted list), and the SC could not see which SKUs there were. The agent's
 * `assign_erp_products` keeps those ways; the modal sends the list.
 *
 * The preview is worked out here, from the products the extension read once as the modal
 * opened (`useErpAssignOptions`), by the same `previewAssignment` the handler runs again before
 * it writes, so the count the SC confirms is the count written. Attribute sets without
 * `erp_owner` are named at the top with the fix, since their products cannot be written.
 *
 * Built like `AddErpDialog`: the core Modal in a DialogContainer, one accent action. Every state
 * holds the list's space, so the dialog does not change size as the read lands (owner,
 * 2026-10-19: the spinner sat high in a short dialog). While reading, the list's frame is
 * already there with the reading where the rows will be; a read that failed and nothing to
 * assign are centred in the space, as Manage APIs shows its own (`StatusDisplay`), with Close
 * alone. No intro under the title (owner, 2026-10-19: "still feels busy"): the title says what
 * it does, and the website is in the count. The attribute-set notice is the house `InlineNotice`.
 *
 * @module features/dashboard/ui/components/AssignErpProductsModal
 */

import { Button, DialogContainer } from '@adobe/react-spectrum';
import React, { useMemo, useState } from 'react';
import { AssignProductList } from './AssignProductList';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal } from '@/core/ui/components/ui/Modal';
import { previewAssignment } from '@/features/app-builder/services/erpAssignSelection';
import { setsInWords } from '@/features/app-builder/services/erpOwnerAttributeSets';
import { useErpAssignOptions } from '@/features/dashboard/ui/hooks/useErpAssignOptions';
import type { ErpDemoControlTarget } from '@/features/dashboard/ui/hooks/useErpDemoControls';
import type { ErpAssignOptions, ErpAssignPreview, ErpProductSelection } from '@/types/erpAssign';

/** Every string the modal shows, in one place. */
export const ASSIGN_COPY = {
    title: (name: string) => `Assign products to ${name}`,
    readFailed: "Couldn't read Commerce",
    nothingToAssign: (name: string) => `Nothing to assign to ${name}`,
    setsTitle: 'Some products cannot be tagged yet',
    setsBody: (sets: string) =>
        `erp_owner is not in the attribute sets ${sets}. Commerce drops a tag written to their products.`,
    setsAction: 'Add erp_owner to those sets',
    action: (count: number) => (count === 1 ? 'Assign 1 product' : `Assign ${count} products`),
    actionIdle: 'Assign',
};

/** What the ticks would do, in sentences: how many, and where they move from. */
export function selectionLines(preview: ErpAssignPreview): string[] {
    if (preview.toWrite === 0) return [];
    const lines = [`${preview.toWrite} selected. They move to ${preview.erp.name}.`];
    for (const moved of preview.movedFrom) {
        lines.push(`${moved.count} of them ${moved.count === 1 ? 'is' : 'are'} ${moved.name}'s now.`);
    }
    return lines;
}

export interface AssignErpProductsModalProps {
    /** The ERP being given products, while the modal is open. */
    target: ErpDemoControlTarget | null;
    onClose: () => void;
    /** Run the assignment; the screen opens its progress modal. */
    onAssign: (target: ErpDemoControlTarget, selection: ErpProductSelection) => void;
    /** Run the attribute-set fix for the integration. */
    onAddSets: (integrationId: string) => void;
}

/**
 * Host the modal; present it while an ERP is targeted.
 *
 * @param props - the ERP, and the close, assign and fix callbacks
 */
export function AssignErpProductsModal({ target, onClose, onAssign, onAddSets }: AssignErpProductsModalProps): React.ReactElement {
    // Nothing mounted while closed, not an empty DialogContainer: the screen hosts this beside
    // its own dialogs, and an empty container still occupies the dialog slot (SetupGuideModal).
    if (target === null) return <></>;
    return (
        <DialogContainer onDismiss={onClose}>
            <AssignForm target={target} onClose={onClose} onAssign={onAssign} onAddSets={onAddSets} />
        </DialogContainer>
    );
}

/** What the list stands on while the products are read: the frame, empty. */
const READING: ErpAssignOptions = {
    erp: { id: '', name: '', listId: '' },
    categories: [],
    setsWithoutOwner: [],
    products: [],
    owners: {},
    names: {},
};

/** What the modal shows instead of the list: a read that failed, or why nothing can be assigned. */
function feedbackOf(state: { options: ErpAssignOptions | null; error: string | null }, name: string): React.ReactElement | null {
    if (state.error) return <StatusDisplay variant="error" height="100%" title={ASSIGN_COPY.readFailed} message={state.error} />;
    if (state.options && !state.options.ownerValue) {
        return <StatusDisplay variant="info" height="100%" title={ASSIGN_COPY.nothingToAssign(name)} message={state.options.refusal} />;
    }
    return null;
}

/** The open modal: mounted per opening, so each starts empty. */
function AssignForm({ target, onClose, onAssign, onAddSets }: AssignErpProductsModalProps & { target: ErpDemoControlTarget }) {
    const read = useErpAssignOptions(target.id, target.erp);
    const { options } = read;
    const feedback = feedbackOf(read, target.name);
    /** The options the list shows: the empty frame while reading, none for a failure or a refusal. */
    const listed = feedback ? null : (options ?? READING);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const selection = useMemo<ErpProductSelection | undefined>(
        () => (selected.size > 0 ? { by: 'skus', skus: [...selected] } : undefined),
        [selected],
    );
    const value = options?.ownerValue;
    const preview = useMemo(() => {
        if (!options || !value || !selection) return undefined;
        return previewAssignment({
            rows: options.products,
            selection,
            erp: options.erp,
            value,
            owners: new Map(Object.entries(options.owners)),
            names: new Map(Object.entries(options.names)),
            setsWithoutOwner: options.setsWithoutOwner,
        }).preview;
    }, [options, value, selection]);
    const count = preview?.toWrite ?? 0;
    const assign = (): void => {
        if (selection && count > 0) onAssign(target, selection);
    };
    return (
        <Modal
            title={ASSIGN_COPY.title(target.name)}
            size="L"
            wide
            onClose={onClose}
            actionButtons={feedback ? [] : [{ label: count > 0 ? ASSIGN_COPY.action(count) : ASSIGN_COPY.actionIdle, variant: 'accent', onPress: assign, isDisabled: count === 0 }]}
        >
            {feedback && (
                <div className="assign-products-body">
                    <CenteredFeedbackContainer fill>{feedback}</CenteredFeedbackContainer>
                </div>
            )}
            {listed && (
                <div className="assign-products-body">
                    {listed.setsWithoutOwner.length > 0 && (
                        <InlineNotice
                            title={ASSIGN_COPY.setsTitle}
                            actionBelow
                            action={<Button variant="secondary" onPress={() => onAddSets(target.id)}>{ASSIGN_COPY.setsAction}</Button>}
                        >
                            {ASSIGN_COPY.setsBody(setsInWords(listed.setsWithoutOwner))}
                        </InlineNotice>
                    )}
                    <AssignProductList
                        options={listed}
                        value={value ?? ''}
                        loading={read.loading}
                        selected={selected}
                        onChange={setSelected}
                        summary={preview && (
                            <div className="assign-summary" data-testid="assign-preview">
                                {selectionLines(preview).join(' ')}
                            </div>
                        )}
                    />
                </div>
            )}
        </Modal>
    );
}
