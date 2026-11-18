/**
 * The Share dialog's "Send a link" form, once the storefront has been read.
 *
 * Top to bottom (walk F228): any check that needs the SC first, since it applies
 * before the link leaves; the repository as a labelled fact (`FactList`), with what
 * became of the press (its button is the window's footer button) under it; the
 * Welcome box with one quiet line on what it does; the name and description,
 * always shown (walk F229); then the undo with what became of that under it. What the link does is said on step 1, on its
 * card. The button names the write when the press will make one (owner,
 * 2026-10-22: a copy button must not silently write). The checks are the ones
 * Save as demo package showed: each an amber notice, its title the extension's
 * when the check has one, with its fix (walk F227); a pack only the SC can see
 * offers Share Datapack (walk F229); the notices are `ShareChecks`, which the file form
 * shows too, for the datapack alone (walk F230). The Welcome box is the house
 * checkbox row. The link stays plain text, not a copy-on-click value: the footer
 * button copies it, and saves the details first when they are missing, which a
 * second copy beside it would skip. Outcomes of a press are note lines beside
 * the thing they are about (dialog design rules).
 *
 * @module features/dashboard/ui/components/share/ShareLinkForm
 */

import { TextArea, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { ShareChecks } from './ShareChecks';
import { SHARE_COPY } from './shareCopy';
import type { ShareDatapackFix } from './useShareDatapack';
import type { UseShareLink } from './useShareLink';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import type { DemoPackagePreview, RemoveDemoPackageResult } from '@/types/webviewRequests';

/** The button's words: copied for a moment, else the act it will do. Its spinner says it is working. */
export function buttonLabel(flow: UseShareLink): string {
    if (flow.copied) return SHARE_COPY.copied;
    return flow.needsSave ? SHARE_COPY.saveAndCopy : SHARE_COPY.copyLink;
}

/** What the undo did, in one sentence. */
function removedSentence(result: RemoveDemoPackageResult): string {
    const file = result.file === 'skipped' ? SHARE_COPY.removedFileSkipped : SHARE_COPY.removedFile;
    return result.removedFromList ? `${file} and ${SHARE_COPY.removedCard}.` : `${file}.`;
}

/** The name and description, always shown (owner, walk F229: hidden behind a link, they went unseen). */
function Details({ flow }: { flow: UseShareLink }): React.ReactElement {
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

/** What became of the press: why the link could not be prepared, or why the file was left alone. */
function PressNotes({ flow }: { flow: UseShareLink }): React.ReactElement {
    return (
        <>
            {flow.error?.title === 'save' ? (
                <p className="dialog-problem text-negative" data-testid="share-error">{SHARE_COPY.copyFailed} {flow.error.message}</p>
            ) : null}
            {flow.skipped ? (
                <p className="dialog-problem text-notice" data-testid="share-skipped">{SHARE_COPY.skippedTitle} {flow.skipped}</p>
            ) : null}
        </>
    );
}

/** What became of the undo: what it did, or why it could not. */
function RemoveNotes({ flow }: { flow: UseShareLink }): React.ReactElement {
    return (
        <>
            {flow.error?.title === 'remove' ? (
                <p className="dialog-problem text-negative" data-testid="share-error">{SHARE_COPY.removeFailed} {flow.error.message}</p>
            ) : null}
            {flow.removed ? (
                <p className="dialog-note" data-testid="share-removed">{removedSentence(flow.removed)}</p>
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
            <FactList>
                <Fact label={SHARE_COPY.repository}>
                    <code className="export-link-text">{preview.link}</code>
                </Fact>
            </FactList>
            <PressNotes flow={flow} />
            <CheckboxRow
                label={SHARE_COPY.welcome}
                detail={SHARE_COPY.welcomeWhy}
                isSelected={flow.welcome}
                onChange={() => flow.setWelcome(!flow.welcome)}
            />
            <Details flow={flow} />
            <RemoveNotes flow={flow} />
            {flow.canRemove ? (
                <div className="share-remove-row">
                    <button
                        type="button"
                        className="inline-action-link share-remove"
                        onClick={flow.remove}
                        disabled={flow.busy !== undefined}
                    >
                        {SHARE_COPY.remove}
                    </button>
                    {flow.busy === 'remove' ? <Spinner size="S" aria-label={SHARE_COPY.remove} /> : null}
                </div>
            ) : null}
        </div>
    );
}
