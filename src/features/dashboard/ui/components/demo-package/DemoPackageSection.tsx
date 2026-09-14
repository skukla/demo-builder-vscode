/**
 * DemoPackageSection — the "Storefront as demo package" part of the Export
 * dialog: the prefilled name and description, the checks a project built from
 * the card will need, the link once saved, and the Save and Remove buttons. Edge Delivery projects only; the dialog leaves the section
 * out for a headless project.
 *
 * @module features/dashboard/ui/components/demo-package/DemoPackageSection
 */

import { Button, ButtonGroup, TextArea, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { useDemoPackage, type PackageOutcome, type UseDemoPackage } from './useDemoPackage';
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
    linkHow: 'Colleagues paste this link into "Add a demo".',
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

function OutcomeNotice({ outcome, link }: { outcome?: PackageOutcome; link: string }): React.ReactElement | null {
    if (!outcome) return null;
    if (outcome.kind === 'removed') {
        return (
            <InlineNotice tone="info" title={PACKAGE_COPY.removed} testId="package-removed">
                {outcome.file === 'skipped' ? PACKAGE_COPY.removedSkipped : PACKAGE_COPY.removedHow}
            </InlineNotice>
        );
    }
    if (outcome.file === 'skipped') {
        return (
            <InlineNotice tone="warning" title={PACKAGE_COPY.skippedTitle} testId="package-skipped">
                {outcome.fileReason}
            </InlineNotice>
        );
    }
    return <LinkNotice link={link} />;
}

function Actions({ flow }: { flow: UseDemoPackage }): React.ReactElement | null {
    if (flow.load.status !== 'ready') return null;
    return (
        <ButtonGroup align="end">
            {flow.load.saved ? (
                <Button variant="secondary" onPress={flow.remove} isDisabled={Boolean(flow.busy)}>
                    {PACKAGE_COPY.remove}
                </Button>
            ) : null}
            <Button variant="accent" onPress={flow.save} isDisabled={!flow.canSave}>
                {flow.load.saved ? PACKAGE_COPY.update : PACKAGE_COPY.save}
            </Button>
        </ButtonGroup>
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
            {load.saved && !flow.outcome ? <LinkNotice link={load.link} /> : null}
            <OutcomeNotice outcome={flow.outcome} link={load.link} />
            {flow.actionError ? (
                <InlineNotice tone="warning" title={PACKAGE_COPY.failed} testId="package-error">
                    {flow.actionError}
                </InlineNotice>
            ) : null}
        </>
    );
}

/**
 * The storefront part of the Export dialog.
 *
 * @returns the section body with its own Save and Remove buttons
 */
export function DemoPackageSection(): React.ReactElement {
    const flow = useDemoPackage();
    return (
        <div className="demo-package-body" data-testid="demo-package-section">
            <Body flow={flow} />
            <Actions flow={flow} />
        </div>
    );
}
