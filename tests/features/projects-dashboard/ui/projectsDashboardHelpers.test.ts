/**
 * buildMenuItems — the home-screen "New" dropdown items.
 *
 * "New Project" is always present; Join / Copy / Import are conditional on their
 * callbacks so the menu only offers actions the host actually wired.
 */

import { buildMenuItems } from '@/features/projects-dashboard/ui/projectsDashboardHelpers';

describe('buildMenuItems', () => {
    it('always includes New Project and nothing else by default', () => {
        const items = buildMenuItems({});
        expect(items.map(i => i.key)).toEqual(['new']);
    });

    it('includes a Join entry when onJoinStorefront is provided', () => {
        const items = buildMenuItems({ onJoinStorefront: jest.fn() });
        const join = items.find(i => i.key === 'join');
        expect(join).toEqual({ key: 'join', label: 'Join a Shared Storefront...', icon: 'join' });
    });

    it('omits the Join entry when onJoinStorefront is absent', () => {
        const items = buildMenuItems({ onCopyFromExisting: jest.fn() });
        expect(items.find(i => i.key === 'join')).toBeUndefined();
    });
});
