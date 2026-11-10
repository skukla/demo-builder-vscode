/**
 * The removal confirm's body (datapack-engine step 05): today's one sentence, then whatever the
 * read found. The question is the dialog's title (`viewFrame`); saving first or not is the
 * footer's two buttons (`buildActions`). When the demo's pack is not the SC's, saving makes a new
 * pack of theirs, named in the field here (Save As, `.rptc/plans/datapack-save-as/`).
 *
 * `CheckboxRow` is the house row the plan names. Its labels are long sentences here and it has no
 * variant for that; none is needed, since a label wraps.
 *
 * @module features/data-installer/ui/components/RemovalConfirmBody
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';
import type { ChangedKind } from '../../removalChanges';
import { dataTypeLabel } from '../dataTypeLabel';
import type { RemovalConfirmView } from '../hooks/useRemovalConfirm';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { LeadText } from '@/core/ui/components/ui/LeadText';

/** The confirm's sentence over the list of changes (walk F110), for an import and for a removal. */
export const CHANGES_LEAD = {
    import: "You changed these since this demo's last save. Importing replaces them.",
    remove: "You changed these since this demo's last save. Uninstalling takes them out too.",
} as const;

/** The confirm's sentence when the check could not run; its title says so (review, 2026-11-10). */
export const UNCHECKED_LEAD = {
    import: "Importing replaces anything you changed since this demo's last save.",
    remove: "Uninstalling removes anything you changed since this demo's last save.",
} as const;

/** Names a data type shows in full; past that, how many more (the dialog design rules' count). */
const NAMES_SHOWN = 3;

/** One data type's changes as its line: "24-mb01, 24-mb02, 24-ug01 and 2 more", or a count alone. */
export function changedLine(kind: ChangedKind): string {
    const named = kind.names.slice(0, NAMES_SHOWN);
    if (named.length === 0) return kind.count.toLocaleString('en-US');
    const more = kind.count - named.length;
    return more > 0 ? `${named.join(', ')} and ${more.toLocaleString('en-US')} more` : named.join(', ');
}

/** The changes, one row per data type, in the setup guide's two-column list (walk F110). */
function ChangedList({ kinds }: { kinds: readonly ChangedKind[] }): React.JSX.Element {
    return (
        <FactList>
            {kinds.map((kind) => (
                <Fact key={kind.kind} label={dataTypeLabel(kind.kind)}>
                    {changedLine(kind)}
                </Fact>
            ))}
        </FactList>
    );
}

export function RemovalConfirmBody({ deletes, view, forImport = false }: { deletes: readonly string[]; view: RemovalConfirmView; forImport?: boolean }): React.JSX.Element {
    const { content, choice } = view;
    return (
        <div className="dialog-stack">
            {deletes.map((line) => <LeadText key={line}>{line}</LeadText>)}
            {content.kind === 'read-failed' ? <LeadText>{forImport ? UNCHECKED_LEAD.import : UNCHECKED_LEAD.remove}</LeadText> : null}
            {content.kind === 'will-save' ? <LeadText>Your changes will be saved to {content.packName} first.</LeadText> : null}
            {content.kind === 'changes' ? (
                <>
                    {content.kinds ? (
                        <>
                            <LeadText>{forImport ? CHANGES_LEAD.import : CHANGES_LEAD.remove}</LeadText>
                            <ChangedList kinds={content.kinds} />
                        </>
                    ) : (
                        <LeadText>{content.sentence}</LeadText>
                    )}
                    {content.packName ? (
                        <CheckboxRow label="Always Save Without Asking" isSelected={choice.always} onChange={view.onToggleAlways} />
                    ) : (
                        // Not the SC's pack, so saving makes a new one of theirs: Save As, named here.
                        <TextField
                            label="Save Changes As"
                            value={choice.saveAsName ?? ''}
                            onChange={view.onSaveAsName}
                            width="100%"
                        />
                    )}
                </>
            ) : null}
        </div>
    );
}
