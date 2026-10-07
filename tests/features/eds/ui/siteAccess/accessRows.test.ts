/**
 * accessRows: the two host lists merged into one list of people.
 */

import { accessRowsOf, grantChoicesOf } from '@/features/eds/ui/siteAccess/accessRows';
import type { SiteAccessView } from '@/types/webviewPayloads';

const VIEW: SiteAccessView = {
    admins: {
        site: 'acme/shop',
        canManage: true,
        people: [
            { email: 'a@x.example', role: 'Configuration admin', removable: true },
            { email: 'org@x.example', role: 'Org admin', removable: false },
        ],
    },
    readers: {
        site: 'acme/shop',
        canManage: false,
        people: [{ email: 'A@x.example', role: 'Reads content', removable: true }],
    },
};

describe('accessRowsOf', () => {
    it('lists each person once, matching emails without regard to case', () => {
        const rows = accessRowsOf(VIEW);

        expect(rows.map((row) => [row.email, row.roles])).toStrictEqual([
            ['a@x.example', ['Configuration admin', 'Reads content']],
            ['org@x.example', ['Org admin']],
        ]);
    });

    it('offers a removal only where the person is removable AND the list can be changed', () => {
        const [a, org] = accessRowsOf(VIEW);

        expect(a.removals.map((removal) => removal.type)).toStrictEqual(['removeSiteAdmin']);
        expect(org.removals).toStrictEqual([]);
    });

    it('is empty with no view', () => {
        expect(accessRowsOf(null)).toStrictEqual([]);
    });
});

describe('grantChoicesOf', () => {
    it('offers only what this identity can change', () => {
        expect(grantChoicesOf(VIEW)).toStrictEqual({ admin: true, read: false });
        expect(grantChoicesOf(null)).toStrictEqual({ admin: false, read: false });
    });
});
