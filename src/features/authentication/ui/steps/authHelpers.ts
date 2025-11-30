/**
 * Helper functions for AdobeAuthStep component (SOP §5 compliance)
 */
import { AdobeAuthState } from '@/types/webview';

/**
 * Get organization selection message based on auth state (SOP §5 compliance)
 *
 * Extracts 3-branch conditional from JSX for better readability.
 */
export function getOrgSelectionMessage(adobeAuth: AdobeAuthState): string {
    if (adobeAuth.orgLacksAccess) {
        return 'No organizations are currently accessible. Please choose an organization with App Builder enabled.';
    }
    if (adobeAuth.requiresOrgSelection) {
        return 'Your previous organization is no longer accessible. Please select a new organization.';
    }
    return "You're signed in to Adobe, but haven't selected an organization yet.";
}
