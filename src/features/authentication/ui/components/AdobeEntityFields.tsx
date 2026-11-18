/**
 * AdobeEntityFields — the Adobe I/O project and workspace lists of the deployment destination,
 * each with a "New" header button.
 *
 * New does not open a form here: the caller is a windowed flow (the Add Integration flow's
 * destination stage), and naming the new project or workspace is a short window of its own there
 * (walk F286, owner 2026-11-18: "the name needs to be on its own modal"). So each field only
 * reports New through `onNew`, from the header button and from the dialog's empty-list state.
 *
 * The "New" affordance is ALWAYS shown — we don't pre-flight a permission probe (that
 * was a multi-second `aio app list` CLI call that made the button lag). Permission is
 * validated where it matters: the `create-adobe-project` / `create-adobe-workspace`
 * handlers re-check it and return an `AUTH_FORBIDDEN`-coded error, which the create window
 * surfaces inline. Honest by attempt, not by prediction.
 *
 * @module features/authentication/ui/components/AdobeEntityFields
 */

import { Button, Text } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React from 'react';
import { AdobeProjectPicker } from './AdobeProjectPicker';
import { AdobeWorkspacePicker } from './AdobeWorkspacePicker';
import type { SelectionDialogFrame } from '@/core/ui/components/selection/selectionDialogHost';
import type { WizardSessionState, AdobeProject, WizardState } from '@/types/webview';

interface FieldProps {
    state: WizardSessionState;
    updateState: (updates: Partial<WizardState>) => void;
    /** New, from the header button or the dialog's empty list: the caller opens its create window. */
    onNew: () => void;
    /** Forwarded to the picker: the dialog whose title takes its error and empty states. */
    dialogHost?: SelectionDialogFrame;
}

/** The "New" header button over each list. */
function NewButton({ onPress }: { onPress: () => void }): React.ReactElement {
    return (
        <Button variant="accent" onPress={onPress}>
            <Add size="S" />
            <Text>New</Text>
        </Button>
    );
}

/**
 * The Adobe I/O project list, with New.
 *
 * @param props - wizard state + updater, New, and the picker's pending-pick overrides
 * @returns the project list
 */
export function AdobeProjectField({
    state,
    updateState,
    onNew,
    selectedProjectId,
    onProjectSelect,
    dialogHost,
}: FieldProps & {
    /** Forwarded to the picker: override the highlighted row (Adobe I/O pending pick). */
    selectedProjectId?: string;
    /** Forwarded to the picker: override the default commit (Adobe I/O writes pending). */
    onProjectSelect?: (project: AdobeProject) => void;
}): React.ReactElement {
    return (
        <AdobeProjectPicker
            state={state}
            updateState={updateState}
            headerAction={<NewButton onPress={onNew} />}
            selectedProjectId={selectedProjectId}
            onProjectSelect={onProjectSelect}
            dialogHost={dialogHost && { ...dialogHost, onCreate: onNew }}
        />
    );
}

/**
 * The Adobe I/O workspace list (under the selected project), with New.
 *
 * @param props - wizard state + updater, New, and the picker's pending-pick overrides
 * @returns the workspace list
 */
export function AdobeWorkspaceField({
    state,
    updateState,
    onNew,
    selectedWorkspaceId,
    onWorkspaceSelect,
    dialogHost,
}: FieldProps & {
    /** Forwarded to the picker: override the highlighted row (Adobe I/O pending default). */
    selectedWorkspaceId?: string;
    /** Forwarded to the picker: override the default commit (Adobe I/O writes pending). */
    onWorkspaceSelect?: (ws: { id: string; name: string; title?: string }) => void;
}): React.ReactElement {
    return (
        <AdobeWorkspacePicker
            state={state}
            updateState={updateState}
            headerAction={<NewButton onPress={onNew} />}
            selectedWorkspaceId={selectedWorkspaceId}
            onWorkspaceSelect={onWorkspaceSelect}
            dialogHost={dialogHost && { ...dialogHost, onCreate: onNew }}
        />
    );
}
