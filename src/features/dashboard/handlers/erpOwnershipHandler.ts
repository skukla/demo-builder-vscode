/**
 * `getErpOwnershipOptions` — what "Add another ERP" shows before the add (AB-64): the store's
 * websites and inventory sources, each product's codes (so the dialog counts what each
 * ownership option would give), and the rule each existing ERP holds. A read: it changes
 * nothing, and the dialog can open without it (counts then read "…" and the default is the
 * attribute).
 *
 * @module features/dashboard/handlers/erpOwnershipHandler
 */

import { type ErpCallPayload, errorText, openErpCall } from './erpCall';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { formatDuration } from '@/core/utils/timeFormatting';
import { readErpOwnershipOptionsForProject } from '@/features/project-creation/services/erpOwnershipSync';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';

/**
 * Handle 'getErpOwnershipOptions' — read what the "Add another ERP" dialog offers. Takes the
 * ERP integration's id. Read-only.
 */
export const handleGetErpOwnershipOptions: MessageHandler<ErpCallPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    // Timed in two parts, sign-in then store, because it outran the dialog's wait on
    // Justrite and nothing said which part was slow (2026-10-18).
    const started = Date.now();
    const call = await openErpCall(context, payload, 'read what the ERPs own');
    if ('error' in call) return call.error;
    const signedIn = Date.now();
    const took = () => `sign-in ${formatDuration(signedIn - started)}, store ${formatDuration(Date.now() - signedIn)}`;
    try {
        const options = await readErpOwnershipOptionsForProject(
            call.project,
            call.id,
            call.auth,
            ServiceLocator.getAuthenticationService(),
        );
        if ('refusal' in options) {
            context.logger.warn(`[ERP] Add another ERP could not read the store (${took()}): ${options.refusal}`);
            return { success: false, error: options.refusal };
        }
        context.logger.info(`[ERP] Add another ERP read the store: ${options.products.length} products (${took()})`);
        return { success: true, data: options };
    } catch (error) {
        context.logger.warn(`[ERP] Add another ERP could not read the store (${took()}): ${errorText(error)}`);
        return { success: false, error: `Could not read what the ERPs own: ${errorText(error)}` };
    }
};
