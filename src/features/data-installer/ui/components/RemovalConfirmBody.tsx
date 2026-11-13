/**
 * The removal confirm's body (datapack-engine step 05): today's one sentence, then whatever the
 * read found. The question is the dialog's title (`viewFrame`); saving first or not is the
 * footer's two buttons (`buildActions`). When the demo's pack is not the SC's, saving makes a new
 * pack of theirs, named in the field here (Save As, `.rptc/plans/datapack-save-as/`).
 *
 * The changes are counted by type, no names, and there is no "Always" box: saving without asking
 * is the setting only (step 03, S6; decisions J2-1, J2-3).
 *
 * @module features/data-installer/ui/components/RemovalConfirmBody
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';
import type { ChangedKind } from '../../removalChanges';
import { dataTypeLabel } from '../dataTypeLabel';
import type { RemovalConfirmView } from '../hooks/useRemovalConfirm';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { LeadText } from '@/core/ui/components/ui/LeadText';

/** The confirm's sentence over the list of changes (walk F110), for an import and for a removal. */
export const CHANGES_LEAD = {
    import: 'Installing replaces these changes.',
    remove: 'Uninstalling removes these changes.',
} as const;

/** The confirm's sentence when the check could not run; its title says so (review, 2026-11-10). */
export const UNCHECKED_LEAD = {
    import: 'Installing replaces any changes you made.',
    remove: 'Uninstalling removes any changes you made.',
} as const;

/** The changes, one row per data type and its count, in the setup guide's two-column list (walk F110). */
function ChangedList({ kinds }: { kinds: readonly ChangedKind[] }): React.JSX.Element {
    return (
        <FactList>
            {kinds.map((kind) => (
                <Fact key={kind.kind} label={dataTypeLabel(kind.kind)}>
                    {kind.count.toLocaleString('en-US')}
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
                    {content.packName ? null : (
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
