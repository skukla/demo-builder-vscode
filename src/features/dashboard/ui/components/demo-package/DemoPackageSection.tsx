/**
 * DemoPackageSection — the body of "Save as demo package": the prefilled name
 * and description, the checks a project built from the card will need, and the
 * link once saved. One view at a time, in the house vocabulary (owner,
 * 2026-09-14): the spinner while reading, saving or removing; the success state
 * when a save or a removal lands; the form otherwise. Its Save and Remove
 * buttons are the dialog's footer actions (DemoPackageModal's `packageActions`).
 *
 * @module features/dashboard/ui/components/demo-package/DemoPackageSection
 */

import { TextArea, TextField } from '@adobe/react-spectrum';
import React from 'react';
import type { PackageOutcome, UseDemoPackage } from './useDemoPackage';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { DemoPackageCheck } from '@/types/webviewRequests';

export const PACKAGE_COPY = {
    intro: 'Puts this storefront on your Welcome step as a card. Send the link and a colleague gets the same card. Your Commerce connection and Adobe project stay with you.',
    looking: 'Looking at your storefront',
    lookingFor: 'Reading the repository and the published pages.',
    cannot: "This storefront can't become a demo package",
    name: 'Name',
    description: 'Description',
    checksTitle: 'What colleagues get',
    republishHint: 'Republish, then save again.',
    savedTitle: "Saved. It's on your Welcome step now.",
    saving: 'Saving the demo package',
    savingFor: 'Writing its name and description into your repository.',
    removing: 'Removing the demo package',
    savedSuccess: 'Saved as a demo package',
    savedHow: `It's on your Welcome step. Colleagues paste this link into "Add a demo package".`,
    linkHow: 'Colleagues paste this link into "Add a demo package".',
    skippedTitle: 'Card saved; the file in your repository was left alone',
    removed: 'Demo package removed',
    removedHow: 'The card is off your Welcome step and the file is out of your repository. The storefront is untouched.',
    removedSkipped:
        "The card is off your Welcome step. The file in your repository isn't the one Demo Builder wrote, so it was left alone.",
    failed: "Couldn't do that",
    save: 'Save',
    update: 'Update',
    remove: 'Remove demo package',
} as const;

function CheckRow({ check }: { check: DemoPackageCheck }): React.ReactElement {
    return (
        <li className="demo-package-check" data-testid={`package-check-${check.id}`}>
            <StatusDot variant={check.ok ? 'success' : 'warning'} />
            <span>
                {check.message}
                {check.action === 'republish' ? <span className="demo-package-hint">{PACKAGE_COPY.republishHint}</span> : null}
            </span>
        </li>
    );
}

function LinkNotice({ link }: { link: string }): React.ReactElement {
    return (
        <InlineNotice tone="info" title={PACKAGE_COPY.savedTitle} hint={PACKAGE_COPY.linkHow} testId="package-link">
            <CopyableText>{link}</CopyableText>
        </InlineNotice>
    );
}

/** The result of a save or a removal, in the house status display. */
function OutcomeView({ outcome, link }: { outcome: PackageOutcome; link: string }): React.ReactElement {
    if (outcome.kind === 'removed') {
        return (
            <div data-testid="package-removed">
                <StatusDisplay
                    variant="success"
                    title={PACKAGE_COPY.removed}
                    message={outcome.file === 'skipped' ? PACKAGE_COPY.removedSkipped : PACKAGE_COPY.removedHow}
                    centerMessage
                    height="280px"
                />
            </div>
        );
    }
    const skipped = outcome.file === 'skipped';
    return (
        <div data-testid={skipped ? 'package-skipped' : 'package-saved'}>
            <StatusDisplay
                variant={skipped ? 'warning' : 'success'}
                title={skipped ? PACKAGE_COPY.skippedTitle : PACKAGE_COPY.savedSuccess}
                message={skipped ? outcome.fileReason : PACKAGE_COPY.savedHow}
                centerMessage
                height="280px"
            >
                <CopyableText>{link}</CopyableText>
            </StatusDisplay>
        </div>
    );
}

function Body({ flow }: { flow: UseDemoPackage }): React.ReactElement {
    const { load, draft } = flow;
    if (load.status === 'loading') {
        // The house modal loading state (GitHubAppInstallDialog, the AI modal):
        // the large centred spinner in a reserved-height box, so the dialog does
        // not jump when the form arrives.
        return (
            <CenteredFeedbackContainer height="280px">
                <LoadingDisplay size="L" message={PACKAGE_COPY.looking} helperText={PACKAGE_COPY.lookingFor} />
            </CenteredFeedbackContainer>
        );
    }
    if (load.status === 'failed') {
        return <StatusDisplay variant="error" title={PACKAGE_COPY.cannot} message={load.error} height="auto" />;
    }
    if (flow.busy) {
        // The write goes to GitHub and takes a moment; a form that sits still
        // meanwhile reads as a press that did nothing (owner, 2026-09-14).
        return (
            <CenteredFeedbackContainer height="280px">
                <LoadingDisplay
                    size="L"
                    message={flow.busy === 'save' ? PACKAGE_COPY.saving : PACKAGE_COPY.removing}
                    helperText={flow.busy === 'save' ? PACKAGE_COPY.savingFor : undefined}
                />
            </CenteredFeedbackContainer>
        );
    }
    if (flow.outcome) return <OutcomeView outcome={flow.outcome} link={load.link} />;
    return (
        <>
            <p className="export-section-text">{PACKAGE_COPY.intro}</p>
            <TextField
                label={PACKAGE_COPY.name}
                value={draft.name}
                onChange={flow.setName}
                isRequired
                width="100%"
                data-testid="package-name"
            />
            <TextArea
                label={PACKAGE_COPY.description}
                value={draft.description}
                onChange={flow.setDescription}
                width="100%"
                data-testid="package-description"
            />
            <div>
                <p className="demo-package-checks-title">{PACKAGE_COPY.checksTitle}</p>
                <ul className="demo-package-checks">
                    {load.checks.map((check) => (
                        <CheckRow key={`${check.id}-${check.repository ?? ''}`} check={check} />
                    ))}
                </ul>
            </div>
            {load.saved ? <LinkNotice link={load.link} /> : null}
            {flow.actionError ? (
                <InlineNotice tone="warning" title={PACKAGE_COPY.failed} testId="package-error">
                    {flow.actionError}
                </InlineNotice>
            ) : null}
        </>
    );
}

/**
 * The dialog body.
 *
 * @param props.flow - the dialog's state, owned by the modal so its footer can bind the actions
 * @returns the current view
 */
export function DemoPackageSection({ flow }: { flow: UseDemoPackage }): React.ReactElement {
    return (
        <div className="demo-package-body" data-testid="demo-package-section">
            <Body flow={flow} />
        </div>
    );
}
