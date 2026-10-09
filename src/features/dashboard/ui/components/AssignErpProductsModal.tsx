/**
 * "Assign products" on an ERP's card (AB-74): the SC picks products by category, by brand, by
 * the start of their SKUs, or by pasting SKUs; the modal says how many that is, shows a few,
 * and says which ERP owns them today (moving a product from one ERP to another is allowed, and
 * said); Assign hands the selection to the screen, which runs the write in its progress modal.
 *
 * The preview is worked out here, from the products the extension read once as the modal
 * opened (`useErpAssignOptions`), by the same `previewAssignment` the handler runs again before
 * it writes, so the count the SC confirms is the count written. Attribute sets without
 * `erp_owner` are named at the top with the fix, since their products cannot be written.
 *
 * Built like `AddErpDialog`: the core Modal in a DialogContainer, one accent action. Loading is
 * the house `LoadingDisplay`, a problem the house `InlineNotice` (reuse-first).
 *
 * @module features/dashboard/ui/components/AssignErpProductsModal
 */

import { Button, DialogContainer, Flex, Item, Picker, Radio, RadioGroup, Text, TextArea, TextField } from '@adobe/react-spectrum';
import React, { useMemo, useState } from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { previewAssignment, selectionProblem } from '@/features/app-builder/services/erpAssignSelection';
import { setsInWords } from '@/features/app-builder/services/erpOwnerAttributeSets';
import { useErpAssignOptions } from '@/features/dashboard/ui/hooks/useErpAssignOptions';
import type { ErpDemoControlTarget } from '@/features/dashboard/ui/hooks/useErpDemoControls';
import type { ErpAssignOptions, ErpAssignPreview, ErpProductSelection } from '@/types/erpAssign';

/** Every string the modal shows, in one place. */
export const ASSIGN_COPY = {
    title: (name: string) => `Assign products to ${name}`,
    intro: (value: string) =>
        `Pick the products this ERP should own. Demo Builder tags them erp_owner=${value} in Commerce.`,
    loading: 'Reading the products in Commerce',
    readFailed: "Couldn't read Commerce",
    pickBy: 'Pick products by',
    byCategory: 'Category',
    byBrand: 'Brand',
    byPrefix: 'Start of the SKU',
    bySkus: 'A list of SKUs',
    categoryField: 'Which category',
    brandField: 'Which brand',
    prefixField: 'SKUs that start with',
    skusField: 'The SKUs',
    skusHint: 'One SKU per line, or separated by commas.',
    setsTitle: 'Some products cannot be tagged yet',
    setsBody: (sets: string) =>
        `erp_owner is not in the attribute sets ${sets}. Commerce drops a tag written to their products.`,
    setsAction: 'Add erp_owner to those sets',
    action: (count: number) => (count === 1 ? 'Assign 1 product' : `Assign ${count} products`),
    actionIdle: 'Assign',
};

/** The preview in sentences, for the SC to read before Assign. */
export function previewLines(preview: ErpAssignPreview, value: string): string[] {
    const lines = [`${preview.matched} ${preview.matched === 1 ? 'product matches' : 'products match'}.`];
    if (preview.toWrite > 0) {
        lines.push(`${preview.toWrite} will be tagged erp_owner=${value}. For example: ${preview.examples.join(', ')}.`);
    }
    for (const moved of preview.movedFrom) {
        lines.push(`${moved.count} of them move from ${moved.name}.`);
    }
    if (preview.alreadyTagged > 0) lines.push(`${preview.alreadyTagged} already belong to ${preview.erp.name}.`);
    if (preview.outsideSets.count > 0) {
        lines.push(`${preview.outsideSets.count} cannot be tagged until erp_owner is in their attribute set.`);
    }
    if (preview.unknownSkus.length > 0) lines.push(`Commerce has no product for ${preview.unknownSkus.join(', ')}.`);
    return lines;
}

/** The SKUs pasted: one per line or comma, blanks dropped. */
function skusOf(text: string): string[] {
    return text.split(/[\n,]/u).map((sku) => sku.trim()).filter(Boolean);
}

type By = ErpProductSelection['by'];

/** The picks as a selection; `undefined` until the chosen way has something picked. */
function selectionOf(by: By, picks: { category: string; brand: string; prefix: string; skus: string }): ErpProductSelection | undefined {
    if (by === 'category') return picks.category ? { by, categoryId: Number(picks.category) } : undefined;
    if (by === 'brand') return picks.brand ? { by, brand: picks.brand } : undefined;
    if (by === 'skuPrefix') return picks.prefix.trim() ? { by, prefix: picks.prefix } : undefined;
    const skus = skusOf(picks.skus);
    return skus.length ? { by, skus } : undefined;
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

/** The way-specific control: a picker, a field or a list. */
function PickControl({ by, options, picks, setPicks }: {
    by: By;
    options: ErpAssignOptions;
    picks: { category: string; brand: string; prefix: string; skus: string };
    setPicks: (next: typeof picks) => void;
}): React.ReactElement {
    if (by === 'category' || by === 'brand') {
        const items = by === 'category' ? options.categories : options.brands;
        return (
            <Picker
                label={by === 'category' ? ASSIGN_COPY.categoryField : ASSIGN_COPY.brandField}
                items={items}
                selectedKey={by === 'category' ? picks.category : picks.brand}
                onSelectionChange={(key) => setPicks({ ...picks, [by]: String(key) })}
                width="100%"
            >
                {(choice) => <Item key={choice.value}>{`${choice.label} (${choice.count})`}</Item>}
            </Picker>
        );
    }
    if (by === 'skuPrefix') {
        return <TextField label={ASSIGN_COPY.prefixField} value={picks.prefix} onChange={(prefix) => setPicks({ ...picks, prefix })} width="100%" />;
    }
    return (
        <TextArea
            label={ASSIGN_COPY.skusField}
            description={ASSIGN_COPY.skusHint}
            value={picks.skus}
            onChange={(skus) => setPicks({ ...picks, skus })}
            width="100%"
        />
    );
}

/** The open modal: mounted per opening, so each starts empty. */
function AssignForm({ target, onClose, onAssign, onAddSets }: AssignErpProductsModalProps & { target: ErpDemoControlTarget }) {
    const { options, error, loading } = useErpAssignOptions(target.id, target.erp);
    const [by, setBy] = useState<By>('category');
    const [picks, setPicks] = useState({ category: '', brand: '', prefix: '', skus: '' });
    const selection = useMemo(() => selectionOf(by, picks), [by, picks]);
    const value = options?.ownerValue;
    const preview = useMemo(() => {
        if (!options || !value || !selection || selectionProblem(selection)) return undefined;
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
            size="M"
            fitContent
            onClose={onClose}
            actionButtons={[{ label: count > 0 ? ASSIGN_COPY.action(count) : ASSIGN_COPY.actionIdle, variant: 'accent', onPress: assign, isDisabled: count === 0 }]}
        >
            {loading && <LoadingDisplay message={ASSIGN_COPY.loading} />}
            {error && <InlineNotice title={ASSIGN_COPY.readFailed}>{error}</InlineNotice>}
            {options?.refusal && <Text>{options.refusal}</Text>}
            {options && value && (
                <Flex direction="column" gap="size-200">
                    <Text>{ASSIGN_COPY.intro(value)}</Text>
                    {options.setsWithoutOwner.length > 0 && (
                        <InlineNotice
                            title={ASSIGN_COPY.setsTitle}
                            actionBelow
                            action={<Button variant="secondary" onPress={() => onAddSets(target.id)}>{ASSIGN_COPY.setsAction}</Button>}
                        >
                            {ASSIGN_COPY.setsBody(setsInWords(options.setsWithoutOwner))}
                        </InlineNotice>
                    )}
                    <RadioGroup label={ASSIGN_COPY.pickBy} value={by} onChange={(next) => setBy(next as By)} orientation="horizontal">
                        <Radio value="category">{ASSIGN_COPY.byCategory}</Radio>
                        <Radio value="brand">{ASSIGN_COPY.byBrand}</Radio>
                        <Radio value="skuPrefix">{ASSIGN_COPY.byPrefix}</Radio>
                        <Radio value="skus">{ASSIGN_COPY.bySkus}</Radio>
                    </RadioGroup>
                    <PickControl by={by} options={options} picks={picks} setPicks={setPicks} />
                    {preview && (
                        <Flex direction="column" gap="size-50" data-testid="assign-preview">
                            {previewLines(preview, value).map((line) => <Text key={line}>{line}</Text>)}
                        </Flex>
                    )}
                </Flex>
            )}
        </Modal>
    );
}
