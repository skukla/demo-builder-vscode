/**
 * The slow reads a project screen starts when it opens, so they are ready before the SC asks:
 * the org's Adobe API list ({@link warmOrgServicesCatalog}) and the Commerce sign-in
 * ({@link warmCommerceSignIn}). Two warm-ups, one moment: the dashboard and the Integrations
 * screen both call this, and each warm-up joins a read already running, so opening both
 * screens costs one of each.
 *
 * Neither is awaited, and neither reports.
 */

import { warmCommerceSignIn } from './warmCommerceSignIn';
import { warmOrgServicesCatalog } from './warmOrgServicesCatalog';
import type { HandlerContext } from '@/types/handlers';

export function warmProjectReads(context: HandlerContext): void {
    void warmOrgServicesCatalog(context);
    void warmCommerceSignIn(context);
}
