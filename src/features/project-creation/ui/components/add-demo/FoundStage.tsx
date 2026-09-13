/**
 * FoundStage — the dialog's second stage: "Reading the demo…" while the
 * probe runs, then the found panel (name, what we found, the B2B switch only
 * when nothing said, the keep-a-copy tick box), or the refusal.
 *
 * Feedback views are the house ones (`LoadingDisplay`, `StatusDisplay`,
 * `InlineNotice`); the rows are the Build step's summary rows.
 *
 * @module features/project-creation/ui/components/add-demo/FoundStage
 */

import { Checkbox, Switch, TextField } from '@adobe/react-spectrum';
import React from 'react';
import {
    COPY,
    defaultDemoName,
    foundRows,
    isBuildable,
    kindMatches,
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
    onB2bChange: (on: boolean) => void;
    onKeepCopyChange: (keep: boolean) => void;
    onUpdateRememberedChange?: (update: boolean) => void;
    mode?: AddDemoMode;
    /** Change mode: the project's kind, which the found demo must match. */
    currentKind?: StorefrontKind;
}

/** What is missing, from what the probe found, in a sentence. */
function refusalDetails(read: SharedDemoRead): string[] {
    if (read.missing && read.missing.length > 0) {
        return [`It is missing ${read.missing.join(', ')}.`, ...read.warnings];
    }
    return read.warnings;
}

function KeepCopyBox({
    read,
    draft,
    onKeepCopyChange,
}: Pick<FoundStageProps, 'draft' | 'onKeepCopyChange'> & { read: SharedDemoRead }): React.ReactElement | null {
    const viewer = read.viewer;
    // The SC's own repository is the source; nothing to copy.
    if (viewer?.ownsRepo) return null;
    if (viewer?.existingFork) {
        return (
            <Checkbox isSelected isDisabled data-testid="keep-copy">
                {`You already have your own copy at ${viewer.existingFork}; it will be used.`}
            </Checkbox>
        );
    }
    const account = viewer?.login ? `your GitHub account (${viewer.login})` : 'your GitHub account';
    return (
        <div className="add-demo-keep-copy">
            <Checkbox isSelected={draft.keepCopy} onChange={onKeepCopyChange} data-testid="keep-copy">
                {COPY.keepCopy}
            </Checkbox>
            <p className="add-demo-note">{`Your copy goes to ${account}.`}</p>
        </div>
    );
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
    onB2bChange,
    onKeepCopyChange,
    onUpdateRememberedChange,
    mode = 'add',
    currentKind,
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
            <div className="add-demo-found">
                <p className="intflow-section-label">{COPY.found}</p>
                {foundRows(result).map((row) => (
                    <div key={row.label} className="sum-row" data-testid={`found-${row.label}`}>
                        <span className="sum-rowlabel">
                            <span className="sum-label">{row.label}</span>
                        </span>
                        {row.value ? (
                            <span className="sum-value">{row.value}</span>
                        ) : (
                            <span className="sum-value empty">Not set</span>
                        )}
                    </div>
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
            <KeepCopyBox read={result} draft={draft} onKeepCopyChange={onKeepCopyChange} />
            {mode === 'change' ? (
                <Checkbox
                    isSelected={draft.updateRemembered}
                    onChange={onUpdateRememberedChange}
                    data-testid="update-remembered"
                >
                    {COPY.change.updateRemembered}
                </Checkbox>
            ) : null}
            {addError ? (
                <InlineNotice title={mode === 'change' ? 'Not changed' : 'Not added'} testId="add-error">
                    {addError}
                </InlineNotice>
            ) : null}
        </div>
    );
}
