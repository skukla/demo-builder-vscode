/**
 * LinkStage — the dialog's first stage. In add mode, two choice cards ask
 * where the demo is (a link, or a zip file), the same shape as Export's "How
 * will you hand it over?", and only the chosen way's form shows below: the
 * link field, or the zip's one option. The zip's action is the footer's main
 * button. Change mode takes a link only, so it has no cards.
 *
 * The demos already added are NOT listed here: each is a card on the Welcome
 * step directly behind the dialog, and removing one happens on that card
 * (owner, 2026-09-14).
 *
 * @module features/project-creation/ui/components/add-demo/LinkStage
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { ChoiceCard } from '../ChoiceCard';
import { COPY, type AddDemoDraft, type AddDemoMode, type AddDemoWay } from './addDemoFlow';
import { GitHubLinkField } from '@/core/ui/components/forms/GitHubLinkField';
import type { AddedDemo } from '@/types/projectFile';

export interface LinkStageProps {
    /** The demos already added: only the duplicate guard reads them. */
    addedDemos: AddedDemo[];
    source?: AddDemoDraft['source'];
    onSourceChange: (source: AddDemoDraft['source']) => void;
    mode?: AddDemoMode;
    /** The zip way (add mode only): absent in change mode, where a zip makes no sense. */
    zip?: {
        way: AddDemoWay;
        onWayChange: (way: AddDemoWay) => void;
        makePublic: boolean;
        onMakePublicChange: (on: boolean) => void;
    };
}

function WayChoice({ way, onWayChange }: Pick<NonNullable<LinkStageProps['zip']>, 'way' | 'onWayChange'>): React.ReactElement {
    return (
        <div>
            <p className="intflow-section-label">{COPY.wayQuestion}</p>
            <div className="intflow-kind-choices">
                <ChoiceCard name={COPY.wayLink} description={COPY.wayLinkWhy} selected={way === 'link'} onSelect={() => onWayChange('link')} testId="add-demo-way-link" />
                <ChoiceCard name={COPY.wayZip} description={COPY.wayZipWhy} selected={way === 'zip'} onSelect={() => onWayChange('zip')} testId="add-demo-way-zip" />
            </div>
        </div>
    );
}

function ZipForm({ zip }: { zip: NonNullable<LinkStageProps['zip']> }): React.ReactElement {
    return (
        <Checkbox isSelected={zip.makePublic} onChange={zip.onMakePublicChange} data-testid="zip-public">
            {COPY.zipPublic}
        </Checkbox>
    );
}

/**
 * The link stage body.
 *
 * @param props - the added demos (duplicate guard), the draft source, and the zip way
 * @returns the stage
 */
export function LinkStage({ addedDemos, source, onSourceChange, mode = 'add', zip }: LinkStageProps): React.ReactElement {
    const zipWay = mode === 'add' && zip !== undefined;
    return (
        <div className="add-demo-stage">
            {mode === 'change' ? <p className="intflow-stage-lead">{COPY.change.lead}</p> : null}
            {zipWay ? <WayChoice way={zip.way} onWayChange={zip.onWayChange} /> : null}
            {zipWay && zip.way === 'zip' ? (
                <ZipForm zip={zip} />
            ) : (
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
            )}
        </div>
    );
}
