/**
 * Tests for AdobeAuthStep helper functions (SOP §5 compliance)
 */
import { getOrgSelectionMessage } from '@/features/authentication/ui/steps/authHelpers';
import type { AdobeAuthState } from '@/types/webview';

/** A signed-in, idle auth state; the two org flags default off. */
function authState(overrides: Partial<AdobeAuthState> = {}): AdobeAuthState {
    return { isAuthenticated: true, isChecking: false, ...overrides };
}

describe('getOrgSelectionMessage', () => {
    it('returns lacks access message when orgLacksAccess is true', () => {
        const result = getOrgSelectionMessage(authState({ orgLacksAccess: true }));
        expect(result).toContain('No organizations are currently accessible');
    });

    it('returns requires selection message when requiresOrgSelection is true', () => {
        const result = getOrgSelectionMessage(authState({ requiresOrgSelection: true }));
        expect(result).toContain('previous organization is no longer accessible');
    });

    it('returns default message otherwise', () => {
        const result = getOrgSelectionMessage(authState());
        expect(result).toContain("haven't selected an organization yet");
    });

    it('prioritizes orgLacksAccess over requiresOrgSelection', () => {
        const result = getOrgSelectionMessage(
            authState({ orgLacksAccess: true, requiresOrgSelection: true })
        );
        expect(result).toContain('No organizations are currently accessible');
    });
});
