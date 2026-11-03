/**
 * The removal confirm's body (datapack-engine step 05): today's one sentence, then whatever the
 * read found. The question is the dialog's title (`viewFrame`).
 *
 * `CheckboxRow` is the house row the plan names. Its labels are long sentences here and it has no
 * variant for that; none is needed, since a label wraps.
 *
 * @module features/data-installer/ui/components/RemovalConfirmBody
 */

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
            {content.kind === 'will-save' ? <LeadText>Your changes will be saved to the {content.packName} pack first.</LeadText> : null}
            {content.kind === 'changes' ? (
                <>
                    <LeadText>{content.sentence}</LeadText>
                    <div>
                        <CheckboxRow label={`Save Changes to the ${content.packName} Datapack First`} isSelected={choice.saveFirst} onChange={view.onToggleSave} />
                        <CheckboxRow label="Don't Ask Again" isSelected={choice.always} isDisabled={!choice.saveFirst} onChange={view.onToggleAlways} />
                    </div>
                </>
            ) : null}
        </div>
    );
}
