/**
 * FoundStage — the dialog's second stage: "Reading the storefront…" while the
 * probe runs, then the found panel (name, what we found, the B2B switch only
 * when nothing said), or the refusal.
 *
 * Feedback views are the house ones (`LoadingDisplay`, `StatusDisplay`,
 * `InlineNotice`); the rows are the Build step's summary rows.
 *
 * @module features/project-creation/ui/components/add-demo/FoundStage
 */

import { Button, Checkbox, Switch, TextArea, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { SummaryRowItem } from '../BuildYourProjectSummary';
import {
    COPY,
    defaultDemoName,
    foundRows,
    isBuildable,
    kindMatches,
    updateDemoPackageLabel,
    wrongKindMessage,
    type AddDemoDraft,
    type AddDemoMode,
} from './addDemoFlow';
import type { ProbeState } from './useAddDemoFlow';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import type { DemoPackage } from '@/types/demoPackages';
import type { StorefrontKind } from '@/types/projectFile';
import type { SharedDemoRead } from '@/types/webviewRequests';

export interface FoundStageProps {
    probe: ProbeState;
    draft: AddDemoDraft;
    packages: DemoPackage[];
    addError?: string;
    onNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    onB2bChange: (on: boolean) => void;
    onUpdateDemoPackageChange?: (update: boolean) => void;
    mode?: AddDemoMode;
    /** Change mode: the project's kind, which the found demo must match. */
    currentKind?: StorefrontKind;
    /** Change mode: the demo package on the Welcome step to offer updating; no box without one. */
    demoPackageName?: string;
    /** The zip was a bundle with setup: offer to start a project from it, on this card. */
    bundle?: { onStart: () => void; busy: boolean };
}

/** What is missing, from what the probe found, in a sentence. */
function refusalDetails(read: SharedDemoRead): string[] {
    if (read.missing && read.missing.length > 0) {
        return [`It is missing ${read.missing.join(', ')}.`, ...read.warnings];
    }
    return read.warnings;
}

/**
 * The found stage body.
 *
 * @param props - the probe state, the draft, the catalog, and the change callbacks
 * @returns the stage
 */
export function FoundStage({
    probe,
    draft,
    packages,
    addError,
    onNameChange,
    onDescriptionChange,
    onB2bChange,
    onUpdateDemoPackageChange,
    mode = 'add',
    currentKind,
    demoPackageName,
    bundle,
}: FoundStageProps): React.ReactElement {
    if (probe.status === 'idle' || probe.status === 'loading') {
        // The three-row contract: the step, the thing it is reading, what to expect.
        const repo = draft.source ? `${draft.source.owner}/${draft.source.repo}` : undefined;
        return <LoadingDisplay size="L" message={COPY.looking} subMessage={repo} helperText={COPY.lookingFor} />;
    }
    if (probe.status === 'failed') {
        // A missing sign-in is not a verdict on the demo: say what to do instead.
        return probe.needsAuth ? (
            <StatusDisplay variant="error" title={COPY.signInFirst} message={COPY.signInHow} height="auto" />
        ) : (
            <StatusDisplay variant="error" title={COPY.notADemo} message={probe.error} height="auto" />
        );
    }
    if (addError) {
        // The house error view; Back returns to the form, still filled in.
        return (
            <div data-testid="add-error">
                <StatusDisplay variant="error" title={mode === 'change' ? 'Not changed' : 'Not added'} message={addError} height="auto" />
            </div>
        );
    }
    const { result } = probe;
    if (result.outcome === 'unreadable') {
        return <StatusDisplay variant="error" title={COPY.notADemo} message={result.reason} height="auto" />;
    }
    if (result.outcome === 'shipped') {
        const name = packages.find((pkg) => pkg.id === result.shippedPackageId)?.name ?? 'a demo we ship';
        return (
            <InlineNotice tone="info" title={`This is the demo behind ${name}`} testId="shipped-notice">
                {mode === 'change'
                    ? COPY.change.shipped
                    : `Use the ${name} card instead; it comes with everything we keep up to date for it.`}
            </InlineNotice>
        );
    }
    if (!isBuildable(result)) {
        return (
            <StatusDisplay
                variant="error"
                title={COPY.notADemo}
                message="A demo is a storefront: an Edge Delivery site, or a Next.js site."
                details={refusalDetails(result)}
                height="auto"
            />
        );
    }
    if (mode === 'change' && currentKind && !kindMatches(result, currentKind)) {
        return (
            <StatusDisplay
                variant="error"
                title={COPY.change.wrongKindTitle}
                message={wrongKindMessage(currentKind)}
                height="auto"
            />
        );
    }
    return (
        <div className="add-demo-stage">
            <TextField
                label={COPY.nameLabel}
                value={draft.name}
                placeholder={defaultDemoName(result)}
                onChange={onNameChange}
                width="100%"
            />
            <TextArea
                label={COPY.descriptionLabel}
                value={draft.description}
                placeholder={result.description?.description}
                onChange={onDescriptionChange}
                width="100%"
                data-testid="demo-description"
            />
            <div className="add-demo-found">
                <p className="intflow-section-label">{COPY.found}</p>
                {foundRows(result).map((row) => (
                    <SummaryRowItem key={row.label} row={row} showDone={false} testId={`found-${row.label}`} />
                ))}
            </div>
            {result.warnings.length > 0 ? (
                <ul className="add-demo-warnings" data-testid="found-warnings">
                    {result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            ) : null}
            {result.b2b === 'unknown' ? (
                <div className="add-demo-b2b">
                    <Switch isSelected={draft.b2bOn} onChange={onB2bChange} data-testid="b2b-switch">
                        {COPY.b2bSwitch}
                    </Switch>
                    <p className="add-demo-note">{COPY.b2bWhy}</p>
                    <p className="add-demo-note">{COPY.b2bIfWrong}</p>
                </div>
            ) : null}
            {mode === 'change' && demoPackageName ? (
                <Checkbox
                    isSelected={draft.updateDemoPackage}
                    onChange={onUpdateDemoPackageChange}
                    data-testid="update-demo-package"
                >
                    {updateDemoPackageLabel(demoPackageName)}
                </Checkbox>
            ) : null}
            {bundle ? (
                <InlineNotice
                    tone="info"
                    title={COPY.bundleSetup}
                    testId="bundle-setup"
                    action={
                        <Button variant="accent" onPress={bundle.onStart} isDisabled={bundle.busy}>
                            {COPY.bundleStart}
                        </Button>
                    }
                >
                    {COPY.bundleSetupWhy}
                </InlineNotice>
            ) : null}

        </div>
    );
}
