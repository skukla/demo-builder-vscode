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
    const call = await openErpCall(context, payload, 'read what the ERPs own');
    if ('error' in call) return call.error;
    try {
        const options = await readErpOwnershipOptionsForProject(
            call.project,
            call.id,
            call.auth,
            ServiceLocator.getAuthenticationService(),
        );
        if ('refusal' in options) return { success: false, error: options.refusal };
        return { success: true, data: options };
    } catch (error) {
        return { success: false, error: `Could not read what the ERPs own: ${errorText(error)}` };
    }
};
