/**
 * The Share dialog's "Send a link" form, once the storefront has been read.
 *
 * Top to bottom: the link and its one button, the Welcome box, the name and
 * description behind a quiet link, any check that needs the SC, then the
 * notices and the undo. What the link does is said once, under the choice. The button names the write when the press will make
 * one (owner, 2026-10-22: a copy button must not silently write). The checks
 * are the ones Save as demo package showed, here because this is the moment
 * the SC is about to send the link (a private repository is said before the
 * link leaves).
 *
 * @module features/dashboard/ui/components/share/ShareLinkForm
 */

import { Button, Checkbox, TextArea, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { SHARE_COPY } from './shareCopy';
import { useShareLink, type UseShareLink } from './useShareLink';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { DemoPackageCheck, DemoPackagePreview, RemoveDemoPackageResult } from '@/types/webviewRequests';

/** The button's words: in flight, then copied for a moment, else the act it will do. */
function buttonLabel(flow: UseShareLink): string {
    if (flow.busy === 'save') return SHARE_COPY.saving;
    if (flow.copied) return SHARE_COPY.copied;
    return flow.needsSave ? SHARE_COPY.saveAndCopy : SHARE_COPY.copyLink;
}

/** What the undo did, in one sentence. */
function removedSentence(result: RemoveDemoPackageResult): string {
    const file = result.file === 'skipped' ? SHARE_COPY.removedFileSkipped : SHARE_COPY.removedFile;
    return result.removedFromList ? `${file} and ${SHARE_COPY.removedCard}.` : `${file}.`;
}

function CheckRow({ check }: { check: DemoPackageCheck }): React.ReactElement {
    return (
        <li className="demo-package-check" data-testid={`package-check-${check.id}`}>
            <StatusDot variant="warning" />
            <span>
                {check.message}
                {check.action === 'republish' ? <span className="demo-package-hint">{SHARE_COPY.republishHint}</span> : null}
            </span>
        </li>
    );
}

/** Only the checks that need the SC: a list of green ticks is noise (owner, 2026-10-22). */
function Checks({ checks }: { checks: DemoPackageCheck[] }): React.ReactElement | null {
    const open = checks.filter((check) => !check.ok);
    if (open.length === 0) return null;
    return (
        <div>
            <p className="demo-package-checks-title">{SHARE_COPY.checksTitle}</p>
            <ul className="demo-package-checks">
                {open.map((check) => (
                    <CheckRow key={`${check.id}-${check.repository ?? ''}`} check={check} />
                ))}
            </ul>
        </div>
    );
}

/** The name and description, behind a quiet link so the form stays the link first. */
function Details({ flow }: { flow: UseShareLink }): React.ReactElement {
    const [open, setOpen] = useState(false);
    if (!open) {
        return (
            <button type="button" className="inline-action-link share-details-toggle" onClick={() => setOpen(true)}>
                {SHARE_COPY.changeDetails}
            </button>
        );
    }
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

function Notices({ flow }: { flow: UseShareLink }): React.ReactElement {
    return (
        <>
            {flow.error ? (
                <InlineNotice
                    tone="warning"
                    title={flow.error.title === 'save' ? SHARE_COPY.copyFailed : SHARE_COPY.removeFailed}
                    testId="share-error"
                >
                    {flow.error.message}
                </InlineNotice>
            ) : null}
            {flow.skipped ? (
                <InlineNotice tone="warning" title={SHARE_COPY.skippedTitle} testId="share-skipped">
                    {flow.skipped}
                </InlineNotice>
            ) : null}
            {flow.removed ? (
                <InlineNotice tone="info" title={SHARE_COPY.removedTitle} testId="share-removed">
                    {removedSentence(flow.removed)}
                </InlineNotice>
            ) : null}
        </>
    );
}

/**
 * The link form.
 *
 * @param props.preview - what the storefront read answered
 * @returns the form
 */
export function ShareLinkForm({ preview }: { preview: DemoPackagePreview }): React.ReactElement {
    const flow = useShareLink(preview);
    return (
        <div className="export-link" data-testid="share-link">
            <div className="export-link-row">
                <code className="export-link-text">{preview.link}</code>
                <Button variant="accent" onPress={flow.press} isDisabled={!flow.canPress} data-testid="share-copy-link">
                    {buttonLabel(flow)}
                </Button>
            </div>
            <Checkbox isSelected={flow.welcome} onChange={flow.setWelcome} data-testid="share-welcome">
                {SHARE_COPY.welcome}
            </Checkbox>
            <Details flow={flow} />
            <Checks checks={preview.checks} />
            <Notices flow={flow} />
            {flow.canRemove ? (
                <button
                    type="button"
                    className="inline-action-link share-remove"
                    onClick={flow.remove}
                    disabled={flow.busy !== undefined}
                >
                    {flow.busy === 'remove' ? SHARE_COPY.removing : SHARE_COPY.remove}
                </button>
            ) : null}
        </div>
    );
}
