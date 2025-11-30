/**
 * Tests for AdobeAuthStep helper functions (SOP §5 compliance)
 */
import { getOrgSelectionMessage } from '@/features/authentication/ui/steps/authHelpers';

describe('getOrgSelectionMessage', () => {
    it('returns lacks access message when orgLacksAccess is true', () => {
        const result = getOrgSelectionMessage({ orgLacksAccess: true } as any);
        expect(result).toContain('No organizations are currently accessible');
    });

    it('returns requires selection message when requiresOrgSelection is true', () => {
        const result = getOrgSelectionMessage({ requiresOrgSelection: true } as any);
        expect(result).toContain('previous organization is no longer accessible');
    });

    it('returns default message otherwise', () => {
        const result = getOrgSelectionMessage({} as any);
        expect(result).toContain("haven't selected an organization yet");
    });

    it('prioritizes orgLacksAccess over requiresOrgSelection', () => {
        const result = getOrgSelectionMessage({
            orgLacksAccess: true,
            requiresOrgSelection: true,
        } as any);
        expect(result).toContain('No organizations are currently accessible');
    });
});
