/**
 * The agent surface says what App Management's "association" is (AB-11) and that a removal
 * leaves the app listed there (AB-12).
 *
 * Demo Builder installs an app into Commerce without App Management's own record, so the
 * app works but is not listed there unless the SC associates it by hand. An agent asked
 * "why is it not in App Management?" or about to remove an integration has only the tool
 * descriptions and the consent dialog to go on.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { AGENT_ALERT_COPY } from '@/features/ai/server/agentAlertCopy';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';

const describing = (tool: string): string => {
    const found = [...ACTION_DESCRIPTORS, ...READ_DESCRIPTORS].find((descriptor) => descriptor.tool === tool);
    if (!found) throw new Error(`no descriptor for ${tool}`);
    return found.description;
};

describe('App Management association, on the agent surface', () => {
    it('install status says installed is not listed, that listing is optional, and what unassociating costs', () => {
        const description = describing('get_integration_install_status');

        expect(description).toContain('Installed does not mean listed in Commerce Admin under Apps > App Management');
        expect(description).toContain('optional');
        expect(description).toContain('Unassociating there deletes its settings for that store and cannot be undone');
    });

    it('remove_integration says to unassociate in App Management before removing', () => {
        expect(describing('remove_integration')).toContain(
            'stays listed as Associated there, and this tool cannot clear it: have the user unassociate it in ' +
                'Commerce Admin (Apps > App Management) BEFORE removing',
        );
    });

    it('the remove consent dialog carries the same warning to the person', () => {
        expect(AGENT_ALERT_COPY.remove_integration.consequence).toContain(
            'If it was associated in Commerce Admin under Apps > App Management, it stays listed there: unassociate it there first.',
        );
    });
});
