/**
 * The Share dialog's "Send a link" form, once the storefront has been read.
 *
 * Top to bottom (walk F228): any check that needs the SC first, since it applies
 * before the link leaves; the repository as the read-only field Edit Demo uses, its
 * label above like the fields under it (walk F231), with what became of the press
 * (its button is the window's footer button) under it; then the name and description,
 * always shown (walk F229). What the link does is said on step 1, on its card. The
 * "Add to My Welcome Step" box and the undo moved to Save as Package on the dashboard
 * (owner, 2026-11-18, EDS-72: Share Demo is not the place for it). The button names the
 * write when the press will make one (owner, 2026-10-22: a copy button must not silently
 * write). The checks are each an amber notice, its title the extension's when the check
 * has one, with its fix (walk F227); a pack only the SC can see offers Share Datapack
 * (walk F229); the notices are `ShareChecks`, which the file form shows too, for the
 * datapack alone (walk F230). The link is not a copy-on-click value: the footer button
 * copies it, and saves the details first when they are missing, which a second copy beside
 * it would skip. Outcomes of a press are note lines beside the thing they are about
 * (dialog design rules).
 *
 * @module features/dashboard/ui/components/share/ShareLinkForm
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';
import { ShareChecks } from './ShareChecks';
import { SHARE_COPY } from './shareCopy';
import { ShareDetails } from './ShareDetails';
import type { ShareDatapackFix } from './useShareDatapack';
import type { UseShareLink } from './useShareLink';
import type { DemoPackagePreview } from '@/types/webviewRequests';

/** The button's words: copied for a moment, else the act it will do. Its spinner says it is working. */
export function buttonLabel(flow: UseShareLink): string {
    if (flow.copied) return SHARE_COPY.copied;
    return flow.needsSave ? SHARE_COPY.saveAndCopy : SHARE_COPY.copyLink;
}

/** What became of the press: why the link could not be prepared, or why the file was left alone. */
function PressNotes({ flow }: { flow: UseShareLink }): React.ReactElement {
    return (
        <>
            {flow.error !== undefined ? (
                <p className="dialog-problem text-negative" data-testid="share-error">{SHARE_COPY.copyFailed} {flow.error}</p>
            ) : null}
            {flow.skipped ? (
                <p className="dialog-problem text-notice" data-testid="share-skipped">{SHARE_COPY.skipped}</p>
            ) : null}
        </>
    );
}

/**
 * The link form; its button is the window's footer button (step-07 Win2).
 *
 * @param props.preview - what the storefront read answered
 * @param props.flow - the form's state (`useShareLink`)
 * @param props.fix - Share Datapack, the fix on a pack only the SC can see (`useShareDatapack`)
 * @returns the form
 */
export function ShareLinkForm({
    preview,
    flow,
    fix,
}: {
    preview: DemoPackagePreview;
    flow: UseShareLink;
    fix: ShareDatapackFix;
}): React.ReactElement {
    return (
        <div className="export-link" data-testid="share-link">
            <ShareChecks checks={preview.checks} fix={fix} />
            <TextField label={SHARE_COPY.repository} value={preview.link} isReadOnly width="100%" />
            <PressNotes flow={flow} />
            <ShareDetails flow={flow} />
        </div>
    );
}
