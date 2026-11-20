/**
 * SavePackageModal: Save as Package, the project dashboard's door to a card on the SC's own Welcome
 * step, to build new projects from (owner, 2026-11-18, EDS-72 decision 4). It moved out of Share
 * Demo, whose link step carried an "Add to My Welcome Step" box (owner: Share Demo is not the place
 * for it).
 *
 * A Steps window. The storefront is read on open behind the house wait, the same read Share Demo
 * makes (`useStorefrontState`); then Name and Description, prefilled from its draft as the link
 * step's are (`SavePackageForm`), and Save as Package beside Close, which writes the details file and
 * puts the card on the Welcome step (`saveDemoPackage`, `addToWelcome: true`). A project already on
 * the Welcome step shows Remove Package, the link step's undo moved here (`removeDemoPackage`).
 * However an act ends, the window becomes the house result (`ResultBody`), so no note ever arrives
 * under the fields and the form holds no room for one.
 *
 * @module features/dashboard/ui/components/share/SavePackageModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { onWelcomeLine, removedSentence, SAVE_PACKAGE_COPY } from './savePackageCopy';
import { SavePackageForm } from './SavePackageForm';
import { SHARE_COPY } from './shareCopy';
import { useSavePackage, type SavePackageOutcome, type UseSavePackage } from './useSavePackage';
import { useStorefrontState } from './useStorefrontRead';
import { ResultBody } from '@/core/ui/components/feedback/ResultBody';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DemoPackagePreview } from '@/types/webviewRequests';

export interface SavePackageModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/** A step's body, in the stage chrome Share Demo's steps use. */
function StepBody({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="intflow-stage-body export-body">{children}</div>;
}

/** How an act ended, as the house result. */
function OutcomeBody({ outcome }: { outcome: SavePackageOutcome }): React.ReactElement {
    switch (outcome.kind) {
        case 'saved':
            return (
                <ResultBody
                    status="success"
                    outcome={SAVE_PACKAGE_COPY.saved}
                    lines={outcome.fileKept ? [onWelcomeLine(outcome.name), SAVE_PACKAGE_COPY.fileKept] : [onWelcomeLine(outcome.name)]}
                />
            );
        case 'removed':
            return <ResultBody status="success" outcome={SAVE_PACKAGE_COPY.removed} lines={[removedSentence(outcome.result)]} />;
        case 'save-failed':
            return <ResultBody status="error" outcome={SAVE_PACKAGE_COPY.saveFailed} lines={[outcome.reason]} />;
        default:
            return <ResultBody status="error" outcome={SAVE_PACKAGE_COPY.removeFailed} lines={[outcome.reason]} />;
    }
}

/** A failure's Try Again repeats the act that failed; a success ends with Close alone. */
function outcomeButtons(outcome: SavePackageOutcome, flow: UseSavePackage): ActionButton[] {
    if (outcome.kind === 'save-failed') {
        return [{ label: SAVE_PACKAGE_COPY.tryAgain, variant: 'accent', onPress: flow.save, isPending: flow.busy === 'save' }];
    }
    if (outcome.kind === 'remove-failed') {
        return [{ label: SAVE_PACKAGE_COPY.tryAgain, variant: 'accent', onPress: flow.remove, isPending: flow.busy === 'remove' }];
    }
    return [];
}

/** The form once the storefront is read, or how its last act ended. */
function PackageForm({ preview, onClose }: { preview: DemoPackagePreview; onClose: () => void }): React.ReactElement {
    const flow = useSavePackage(preview);
    if (flow.outcome) {
        return (
            <StepsWindow
                key={flow.outcome.kind}
                // A success is a small window of its own (owner, 2026-11-20); its own key already
                // makes it a new window, so the form's held height does not carry over.
                compact={flow.outcome.kind === 'saved' || flow.outcome.kind === 'removed'}
                title={SAVE_PACKAGE_COPY.title}
                actionButtons={outcomeButtons(flow.outcome, flow)}
                onClose={onClose}
            >
                <OutcomeBody outcome={flow.outcome} />
            </StepsWindow>
        );
    }
    const saveButton: ActionButton = {
        label: SAVE_PACKAGE_COPY.save,
        variant: 'accent',
        onPress: flow.save,
        isDisabled: !flow.canSave && flow.busy !== 'save',
        isPending: flow.busy === 'save',
    };
    return (
        <StepsWindow key="form" title={SAVE_PACKAGE_COPY.title} actionButtons={[saveButton]} onClose={onClose}>
            <StepBody>
                <SavePackageForm flow={flow} />
            </StepBody>
        </StepsWindow>
    );
}

/** The window for each state of the read: its wait, why it could not be read, or the form. */
function SavePackageWindow({ onClose }: { onClose: () => void }): React.ReactElement {
    const { state } = useStorefrontState(true);
    if (state.status === 'ready') return <PackageForm preview={state.preview} onClose={onClose} />;
    if (state.status === 'failed') {
        return (
            <StepsWindow key="failed" title={SAVE_PACKAGE_COPY.title} onClose={onClose}>
                <StepBody>
                    <p className="dialog-problem text-negative" data-testid="share-link-failed">
                        {SHARE_COPY.storefrontFailed} {state.error}
                    </p>
                </StepBody>
            </StepsWindow>
        );
    }
    return (
        <StepsWindow key="loading" title={SAVE_PACKAGE_COPY.title} ready={false} waiting={WAIT_STAGES.readingDemo} onClose={onClose}>
            {null}
        </StepsWindow>
    );
}

/**
 * The dialog host: mounts the window only while open.
 *
 * @param props - open state and the close callback
 * @returns the dialog container
 */
export function SavePackageModal({ isOpen, onClose }: SavePackageModalProps): React.ReactElement {
    return <DialogContainer onDismiss={onClose}>{isOpen ? <SavePackageWindow onClose={onClose} /> : null}</DialogContainer>;
}
