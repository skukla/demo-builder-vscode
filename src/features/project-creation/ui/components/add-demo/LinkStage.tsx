/**
 * LinkStage — the dialog's first stage: the link field, and the demos already
 * remembered as the same choice cards the integration kind picker uses
 * (picking one selects that card on the grid and closes the dialog).
 *
 * @module features/project-creation/ui/components/add-demo/LinkStage
 */

import React from 'react';
import { ChoiceCard } from '../ChoiceCard';
import { COPY, type AddDemoDraft, type AddDemoMode } from './addDemoFlow';
import { GitHubLinkField } from '@/core/ui/components/forms/GitHubLinkField';
import { addedDemoId } from '@/features/components/services/storefrontResolver';
import type { AddedDemo } from '@/types/projectFile';

export interface LinkStageProps {
    addedDemos: AddedDemo[];
    source?: AddDemoDraft['source'];
    onSourceChange: (source: AddDemoDraft['source']) => void;
    /** Pick a demo already remembered: selects its card and closes. */
    onPickRemembered: (demo: AddedDemo) => void;
    mode?: AddDemoMode;
}

/**
 * The link stage body.
 *
 * @param props - the remembered demos, the draft source, and the two callbacks
 * @returns the stage
 */
export function LinkStage({
    addedDemos,
    source,
    onSourceChange,
    onPickRemembered,
    mode = 'add',
}: LinkStageProps): React.ReactElement {
    return (
        <div className="add-demo-stage">
            <p className="intflow-stage-lead">{mode === 'change' ? COPY.change.lead : COPY.lead}</p>
            <GitHubLinkField
                label={COPY.linkLabel}
                placeholder={COPY.linkPlaceholder}
                invalidMessage={COPY.invalidLink}
                duplicateMessage={COPY.duplicateLink}
                isDuplicate={(parsed) =>
                    addedDemos.some(
                        (demo) =>
                            demo.source.owner.toLowerCase() === parsed.owner.toLowerCase() &&
                            demo.source.repo.toLowerCase() === parsed.repo.toLowerCase(),
                    )
                }
                acceptSiteAddress
                source={source}
                onSourceChange={onSourceChange}
            />
            {addedDemos.length > 0 ? (
                <div className="add-demo-remembered">
                    <p className="intflow-section-label">{COPY.remembered}</p>
                    <div className="intflow-kind-choices">
                        {addedDemos.map((demo) => (
                            <ChoiceCard
                                key={addedDemoId(demo)}
                                name={demo.name}
                                description={`${demo.source.owner}/${demo.source.repo}`}
                                onSelect={() => onPickRemembered(demo)}
                                testId={`remembered-demo-${demo.source.owner}-${demo.source.repo}`}
                            />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
