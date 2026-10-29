/**
 * The slow reads a project screen starts when it opens, so they are ready before the SC asks:
 * the org's Adobe API list ({@link warmOrgServicesCatalog}), the Commerce sign-in
 * ({@link warmCommerceSignIn}) and the store read behind Add another ERP
 * ({@link warmErpOwnershipOptions}). One moment: the dashboard and the Integrations screen both
 * call this, and each warm-up joins a read already running, so opening both screens costs one
 * of each. The store read signs in through the same single flight as the sign-in warm-up.
 *
 * None is awaited, and none reports.
 */

import { warmCommerceSignIn } from './warmCommerceSignIn';
import { warmErpOwnershipOptions } from './warmErpOwnershipOptions';
import { warmOrgServicesCatalog } from './warmOrgServicesCatalog';
import type { HandlerContext } from '@/types/handlers';

export function warmProjectReads(context: HandlerContext): void {
    void warmOrgServicesCatalog(context);
    void warmCommerceSignIn(context);
    void warmErpOwnershipOptions(context);
}
