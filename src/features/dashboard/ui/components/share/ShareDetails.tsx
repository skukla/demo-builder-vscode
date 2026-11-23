/**
 * The name and description a demo package is saved under: Share Demo's link step and Save as
 * Package show the same two fields (EDS-72), always shown (owner, walk F229: hidden behind a link,
 * they went unseen).
 *
 * @module features/dashboard/ui/components/share/ShareDetails
 */

import { TextArea, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { SHARE_COPY } from './shareCopy';
import type { UseShareDraft } from './useShareDraft';

/**
 * Name (required) and Description, full width.
 *
 * @param props.flow - the draft and its setters (`useShareDraft`)
 * @returns the two fields
 */
export function ShareDetails({ flow }: { flow: UseShareDraft }): React.ReactElement {
    return (
        <div className="share-details">
            <TextField
                label={SHARE_COPY.name}
                value={flow.draft.name}
                onChange={flow.setName}
                isRequired
                width="100%"
                data-testid="share-name"
            />
            <TextArea
                label={SHARE_COPY.description}
                value={flow.draft.description}
                onChange={flow.setDescription}
                width="100%"
                data-testid="share-description"
            />
        </div>
    );
}
