/**
 * CreateEntityBody — the body of the Add Integration flow's create window: the new Adobe project's
 * or workspace's name, and nothing else (walk F286). The window's own footer carries Back, Cancel
 * and Create, so the body has no buttons and no card of its own; a plain full-width `TextField`,
 * as the flow's naming stages use (`OptionalNameField` is not reused: that one is optional and
 * placeholder-driven, this name is required).
 *
 * The one other thing it shows is the failure after the project exists, when its workspace could
 * not be read: that goes to the window's title and footer (`DialogOutcomeBody`), with Retry.
 *
 * @module features/project-creation/ui/components/integration-flow/CreateEntityBody
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';
import type { CreatableEntity, EntityCreate } from './useEntityCreate';
import { DialogOutcomeBody, type ReportOutcome } from '@/core/ui/components/ui/DialogOutcome';
import type { AdobeAuthSessionState } from '@/types/webview';

/** The create window's title, per what it makes. */
export const CREATE_TITLES: Record<CreatableEntity, string> = {
    project: 'Create New Project',
    workspace: 'Create New Workspace',
};

/** The line under the field: where the new one will live. */
function hintOf(entity: CreatableEntity, state: AdobeAuthSessionState): string {
    if (entity === 'project') {
        const org = state.adobeOrg?.name;
        return org ? `Will be created in ${org}` : 'Name for your new Adobe I/O project';
    }
    const project = state.adobeProject?.title || state.adobeProject?.name;
    return project ? `Will be created under ${project}` : 'Name for your new workspace';
}

/**
 * The create window's body.
 *
 * @param props - the open create, wizard state (for the hint), and where an outcome goes
 * @returns the name field, or the setup failure's lines
 */
export function CreateEntityBody({
    entity,
    create,
    state,
    onOutcome,
}: {
    entity: CreatableEntity;
    create: EntityCreate;
    state: AdobeAuthSessionState;
    onOutcome: ReportOutcome;
}): React.ReactElement {
    const { setupFailure, error } = create;
    if (setupFailure) {
        return (
            <DialogOutcomeBody
                onOutcome={onOutcome}
                outcome={{
                    title: 'Project Setup Failed',
                    status: 'error',
                    lines: setupFailure.error ? [setupFailure.error] : [],
                    actions: [{ label: 'Retry', onPress: setupFailure.retry }],
                }}
            />
        );
    }
    const noun = entity === 'project' ? 'Project' : 'Workspace';
    return (
        <TextField
            label={`${noun} Name`}
            value={create.name}
            onChange={create.setName}
            description={hintOf(entity, state)}
            validationState={error ? 'invalid' : undefined}
            errorMessage={error}
            width="100%"
            isRequired
            autoFocus
            isDisabled={create.busy}
        />
    );
}
