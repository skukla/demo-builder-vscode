/**
 * FoundStage — the dialog's second stage, once the probe has read a demo it can build on: the name
 * and description, what was found, and the B2B switch only when nothing said. The wait for the probe
 * and anything it refused are the dialog's own (`AddDemoModal`, `addDemoOutcome`); the rows are the
 * Build step's summary rows.
 *
 * @module features/project-creation/ui/components/add-demo/FoundStage
 */

import { Checkbox, Switch, TextArea, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { SummaryRowItem } from '../BuildYourProjectSummary';
import {
    COPY,
    foundRows,
    updateDemoPackageLabel,
    type AddDemoDraft,
    type AddDemoMode,
} from './addDemoFlow';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import type { SharedDemoRead } from '@/types/webviewRequests';

export interface FoundStageProps {
    read: SharedDemoRead;
    draft: AddDemoDraft;
    onNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    onB2bChange: (on: boolean) => void;
    onUpdateDemoPackageChange?: (update: boolean) => void;
    mode?: AddDemoMode;
    /** Change mode: the demo package on the Welcome step to offer updating; no box without one. */
    demoPackageName?: string;
    /** The zip was a bundle with setup: say so. The footer offers to start a project from it. */
    carriesSetup?: boolean;
}

/**
 * The found stage body.
 *
 * @param props - what was read, the draft, and the change callbacks
 * @returns the stage
 */
export function FoundStage({
    read,
    draft,
    onNameChange,
    onDescriptionChange,
    onB2bChange,
    onUpdateDemoPackageChange,
    mode = 'add',
    demoPackageName,
    carriesSetup = false,
}: FoundStageProps): React.ReactElement {
    return (
        <div className="add-demo-stage">
            <TextField
                label={COPY.nameLabel}
                value={draft.name}
                onChange={onNameChange}
                width="100%"
            />
            <TextArea
                label={COPY.descriptionLabel}
                value={draft.description}
                onChange={onDescriptionChange}
                width="100%"
                data-testid="demo-description"
            />
            <div className="add-demo-found">
                <SectionLabel>{COPY.found}</SectionLabel>
                {foundRows(read).map((row) => (
                    <SummaryRowItem key={row.label} row={row} showDone={false} testId={`found-${row.label}`} />
                ))}
                {read.warnings.length > 0 ? (
                    <div data-testid="found-warnings">
                        {read.warnings.map((warning) => (
                            <p key={warning} className="add-demo-note">{warning}</p>
                        ))}
                    </div>
                ) : null}
            </div>
            {read.b2b === 'unknown' ? (
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
            {carriesSetup ? <p className="add-demo-note" data-testid="bundle-setup">{COPY.bundleSetup}</p> : null}
        </div>
    );
}
