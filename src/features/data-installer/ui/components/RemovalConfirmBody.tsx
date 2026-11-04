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
import type { RemovalConfirmView } from '../hooks/useRemovalConfirm';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';

export function RemovalConfirmBody({ deletes, view }: { deletes: readonly string[]; view: RemovalConfirmView }): React.JSX.Element {
    const { content, choice } = view;
    return (
        <div className="dialog-stack">
            {deletes.map((line) => <LeadText key={line}>{line}</LeadText>)}
            {content.kind === 'read-failed' ? (
                <LeadText>
                    Couldn&rsquo;t check whether you changed anything in it since it was installed, so any changes would be lost. {content.reason}
                </LeadText>
            ) : null}
            {content.kind === 'will-save' ? <LeadText>Your changes will be saved to {content.packName} first.</LeadText> : null}
            {content.kind === 'changes' ? (
                <>
                    <LeadText>{content.sentence}</LeadText>
                    {content.packName ? (
                        <CheckboxRow label="Always Save Without Asking" isSelected={choice.always} onChange={view.onToggleAlways} />
                    ) : (
                        // Not the SC's pack, so saving makes a new one of theirs: Save As, named here.
                        <TextField
                            label="Save Changes As"
                            value={choice.saveAsName ?? content.suggestedName}
                            onChange={view.onSaveAsName}
                            width="100%"
                        />
                    )}
                </>
            ) : null}
        </div>
    );
}
