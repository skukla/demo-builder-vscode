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
 * Built like `AddErpDialog`: the core Modal in a DialogContainer, one accent action. While reading
 * the dialog is the Modal's wait, with no words and nothing else on screen (dialog design rules,
 * owner 2026-11-01). A read that failed and nothing to assign are the title's outcome, with what
 * is left to know under it, in a small dialog with Close alone. No intro under the title (owner,
 * 2026-10-19: "still feels busy"): the title says what it does, and the website is in the count.
 * The attribute-set warning is a problem note over the list it is about, with its fix beside it.
 *
 * @module features/dashboard/ui/components/AssignErpProductsModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useMemo, useState } from 'react';
import { AssignProductList } from './AssignProductList';
import { Modal, type ModalStatus, type ModalWait } from '@/core/ui/components/ui/Modal';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import { previewAssignment } from '@/features/app-builder/services/erpAssignSelection';
import { setsInWords } from '@/features/app-builder/services/erpOwnerAttributeSets';
import { useErpAssignOptions } from '@/features/dashboard/ui/hooks/useErpAssignOptions';
import type { ErpDemoControlTarget } from '@/features/dashboard/ui/hooks/useErpDemoControls';
import type { ErpAssignOptions, ErpAssignPreview, ErpProductSelection } from '@/types/erpAssign';

/** A count as the SC reads it: digits with separators. */
function digits(count: number): string {
    return count.toLocaleString('en-US');
}

/** Every string the modal shows, in one place. */
export const ASSIGN_COPY = {
    title: (name: string) => `Assign Products to ${name}`,
    readFailed: "Couldn't Read Commerce",
    nothingToAssign: (name: string) => `Nothing to Assign to ${name}`,
    setsBody: (sets: string) =>
        `erp_owner is missing from the attribute sets ${sets}, so Commerce drops their tags.`,
    setsAction: 'Add erp_owner to Those Sets',
    action: (count: number) => (count === 1 ? 'Assign 1 Product' : `Assign ${digits(count)} Products`),
    actionIdle: 'Assign',
};

/**
 * What the ticks would do, in one line: how many, and where they come from. The title already
 * says where they go (owner, 2026-10-19: "They move to…" was wordy).
 */
export function selectionLine(preview: ErpAssignPreview): string {
    const count = preview.toWrite;
    if (count === 0) return '';
    const parts = preview.movedFrom.map((moved) => `${digits(moved.count)} from ${moved.name}`);
    const fromNobody = count - preview.movedFrom.reduce((sum, moved) => sum + moved.count, 0);
    if (fromNobody > 0) parts.push(`${digits(fromNobody)} from no ERP`);
    if (parts.length === 1) {
        const from = parts[0].slice(parts[0].indexOf(' from ') + 1);
        return count === 1 ? `1 selected, ${from}.` : `${digits(count)} selected, all ${from}.`;
    }
    return `${digits(count)} selected: ${parts.join(', ')}.`;
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

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = WAIT_STAGES.readingProducts;

/** The dialog's outcome when there is no list to show: a read that failed, or why nothing can be assigned. */
interface NoList {
    title: string;
    status: ModalStatus;
    body?: string;
}

function noListOf(state: { options: ErpAssignOptions | null; error: string | null }, name: string): NoList | null {
    if (state.error) return { title: ASSIGN_COPY.readFailed, status: 'error', body: state.error };
    if (state.options && state.options.ownerValue === undefined) {
        return { title: ASSIGN_COPY.nothingToAssign(name), status: 'warning', body: state.options.refusal };
    }
    return null;
}

/** The open modal: mounted per opening, so each starts empty. */
function AssignForm({ target, onClose, onAssign, onAddSets }: AssignErpProductsModalProps & { target: ErpDemoControlTarget }) {
    const read = useErpAssignOptions(target.id, target.erp);
    const { options } = read;
    const noList = noListOf(read, target.name);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const selection = useMemo<ErpProductSelection | undefined>(
        () => (selected.size > 0 ? { by: 'skus', skus: [...selected] } : undefined),
        [selected],
    );
    const value = options?.ownerValue;
    const preview = useMemo(() => {
        if (!options || value === undefined || !selection) return undefined;
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
    if (noList) {
        return (
            <Modal title={noList.title} status={noList.status} size="S" fitContent onClose={onClose}>
                <p className="dialog-line">{noList.body}</p>
            </Modal>
        );
    }
    return (
        <Modal
            title={ASSIGN_COPY.title(target.name)}
            size="L"
            wide
            fitContent
            waiting={options ? false : READING}
            onClose={onClose}
            actionButtons={[{ label: count > 0 ? ASSIGN_COPY.action(count) : ASSIGN_COPY.actionIdle, variant: 'accent', onPress: assign, isDisabled: count === 0 }]}
        >
            {options && (
                <div className="assign-products-body">
                    {options.setsWithoutOwner.length > 0 && (
                        <div className="assign-sets-note">
                            <p className="dialog-problem text-notice" data-testid="assign-sets-note">{ASSIGN_COPY.setsBody(setsInWords(options.setsWithoutOwner))}</p>
                            <button type="button" className="inline-action-link" onClick={() => onAddSets(target.id)}>
                                {ASSIGN_COPY.setsAction}
                            </button>
                        </div>
                    )}
                    <AssignProductList
                        options={options}
                        value={value ?? ''}
                        selected={selected}
                        onChange={setSelected}
                        summary={preview && (
                            <div className="assign-summary" data-testid="assign-preview">
                                {selectionLine(preview)}
                            </div>
                        )}
                    />
                </div>
            )}
        </Modal>
    );
}
