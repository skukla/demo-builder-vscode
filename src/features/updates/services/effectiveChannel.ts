import * as vscode from 'vscode';
import { isRepoCollaborator } from './collaboratorGate';
import type { Logger } from '@/types/logger';
import type { UpdateChannel } from '@/types/releases';

/**
 * The channel a lookup actually uses. early-access is honored only for verified
 * collaborators; otherwise it falls back to beta. Never throws (the gate fails closed).
 */
export async function resolveEffectiveChannel(
    configured: UpdateChannel,
    secrets: vscode.SecretStorage,
    logger: Logger,
): Promise<UpdateChannel> {
    if (configured !== 'early-access') return configured;
    try {
        return (await isRepoCollaborator(secrets, logger)) ? 'early-access' : 'beta';
    } catch {
        // Defensive: the gate fails closed internally, but never let an
        // unexpected error block the update check. Fall back to beta.
        return 'beta';
    }
}
