/**
 * Eventing handlers (AB-6, headful half) — the integrations surface's window
 * onto the project workspace's I/O event providers and registrations.
 *
 * Same service the MCP event tools drive (`eventProviderLifecycle`), same
 * deps adapter (`createEventLifecycleDeps`) — two surfaces, one wiring, so
 * they cannot drift. Workspace-scoped deliberately: providers and
 * registrations belong to the project's Console workspace, not to any single
 * integration card, so the section lives beside the grid rather than inside
 * one card's drawer.
 *
 * Deletion confirms with a NATIVE modal here (unlike the MCP tools' consent
 * gate): a dashboard click is a person present by definition, and the modal
 * names exactly what is being deleted.
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';
import { createEventLifecycleDeps } from '@/features/authentication/handlers/eventLifecycleDeps';
import {
    deleteEventEntities,
    listEventEntities,
    type EventWorkspaceTarget,
} from '@/features/authentication/services/eventProviderLifecycle';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/** The current project's Console coordinates, or undefined with the reason set. */
async function projectTarget(
    context: HandlerContext,
): Promise<{ target?: EventWorkspaceTarget; error?: string }> {
    const project = await context.stateManager.getCurrentProject();
    const adobe = project?.adobe;
    if (!adobe?.organization || !adobe.projectId || !adobe.workspace) {
        return { error: 'This project has no Adobe Console context yet.' };
    }
    return {
        target: {
            orgId: adobe.organization,
            projectId: adobe.projectId,
            workspaceId: adobe.workspace,
        },
    };
}

/** List the workspace's event providers + registrations for the Eventing section. */
export const handleGetEventEntities: MessageHandler = async (context): Promise<HandlerResponse> => {
    const { target, error } = await projectTarget(context);
    if (!target) {
        return { success: true, data: { available: false, reason: error } };
    }
    try {
        const listing = await listEventEntities(
            createEventLifecycleDeps(ServiceLocator.getAuthenticationService()),
            target,
        );
        return { success: true, data: { available: true, ...listing } };
    } catch (err) {
        context.logger.error(
            'Failed to list event entities',
            err instanceof Error ? err : undefined,
        );
        return {
            success: true,
            data: {
                available: false,
                reason: 'Could not reach Adobe I/O Events — check your Adobe sign-in.',
            },
        };
    }
};

/**
 * Delete one provider or registration, after a native confirm naming it.
 * Cancelling answers `{ deleted: false, cancelled: true }` — not an error.
 */
export const handleDeleteEventEntity: MessageHandler<{
    kind?: 'provider' | 'registration';
    id?: string;
    label?: string;
}> = async (context, payload): Promise<HandlerResponse> => {
    const kind = payload?.kind;
    const id = payload?.id;
    if ((kind !== 'provider' && kind !== 'registration') || !id) {
        return { success: false, error: 'kind (provider|registration) and id are required' };
    }
    const { target, error } = await projectTarget(context);
    if (!target) {
        return { success: false, error };
    }

    const display = payload?.label || id;
    const choice = await vscode.window.showWarningMessage(
        `Delete event ${kind} "${display}"?`,
        {
            modal: true,
            detail:
                kind === 'provider'
                    ? 'Events of its types can no longer be published in this workspace.'
                    : 'Event delivery for this registration stops.',
        },
        'Delete',
    );
    if (choice !== 'Delete') {
        return { success: true, data: { deleted: false, cancelled: true } };
    }

    const items = await deleteEventEntities(
        createEventLifecycleDeps(ServiceLocator.getAuthenticationService()),
        target,
        kind === 'provider' ? { registrationIds: [], providerId: id } : { registrationIds: [id] },
    );
    const failed = items.find((item) => item.outcome === 'failed');
    if (failed) {
        return { success: false, error: failed.error ?? `Failed to delete the ${kind}.` };
    }
    return { success: true, data: { deleted: true, items } };
};
