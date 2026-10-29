/**
 * The storefront repairs: Demo Builder's own fixes the build step (creation, reset, a
 * tested-boilerplate update) puts into a storefront whose code may still lack them.
 *
 * The registry is run against files given as a map, so each test says what the storefront
 * holds and reads what changed.
 */

import { alignNotFoundImportMap } from '@/features/eds/services/storefront/notFoundPage';
import {
    runStorefrontRepairs,
    STOREFRONT_REPAIRS,
    type StorefrontRepair,
    type StorefrontRepairFiles,
} from '@/features/eds/services/storefront/storefrontRepairs';
import {
    COMMERCE_JS_CANONICAL,
    COMMERCE_JS_RETIRED_APPLIED,
    RETIRED_PATCHES,
} from '../../../../helpers/retiredPatchFixtures';

const HEAD = `<script nonce="aem" type="importmap">
    {
        "imports": {
            "@dropins/storefront-cart/": "/scripts/__dropins__/storefront-cart/",
            "@dropins/storefront-company-switcher/": "/scripts/__dropins__/storefront-company-switcher/",
            "@dropins/tools/": "/scripts/__dropins__/tools/"
        }
    }
</script>
`;
const NOT_FOUND = `<html><head>
  <script nonce="aem" type="importmap">
    {
        "imports": {
            "@dropins/tools/": "/scripts/__dropins__/tools/"
        }
    }
  </script>
</head><body></body></html>
`;
const COMMERCE = 'scripts/commerce.js';

/** A storefront as files, and the retired and live lists. */
function storefront(
    own: Record<string, string>,
    retired: StorefrontRepairFiles['retired'] = RETIRED_PATCHES,
    known: StorefrontRepairFiles['known'] = [],
): StorefrontRepairFiles {
    return { read: async (path) => own[path], retired, known };
}

/** Everything an old JustRite storefront got wrong at once. */
const OLD_JUSTRITE = {
    'head.html': HEAD,
    '404.html': NOT_FOUND,
    [COMMERCE]: COMMERCE_JS_RETIRED_APPLIED,
};

describe('runStorefrontRepairs: what a storefront needs', () => {
    it('finds both problems on a storefront made before every fix', async () => {
        const { done: needed } = await runStorefrontRepairs(storefront(OLD_JUSTRITE));

        expect(needed.map((r) => r.id)).toStrictEqual(['not-found-import-map', 'retired-patches']);
    });

    it('finds nothing on a storefront that is already current', async () => {
        const current = {
            'head.html': HEAD,
            '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!,
            [COMMERCE]: COMMERCE_JS_CANONICAL,
        };

        expect((await runStorefrontRepairs(storefront(current))).done).toStrictEqual([]);
    });

    it('finds nothing for a storefront missing the files a repair reads', async () => {
        expect((await runStorefrontRepairs(storefront({}))).done).toStrictEqual([]);
    });
});

describe('runStorefrontRepairs: the changed files', () => {
    it('fixes each problem it finds: the 404 map, the original product-link code', async () => {
        const { changed } = await runStorefrontRepairs(storefront(OLD_JUSTRITE));

        expect([...changed.keys()].sort()).toStrictEqual(['404.html', COMMERCE].sort());
        expect(changed.get('404.html')).toBe(alignNotFoundImportMap(HEAD, NOT_FOUND));
        expect(changed.get(COMMERCE)).toBe(COMMERCE_JS_CANONICAL);
    });

    it('changes nothing on a current storefront', async () => {
        const result = await runStorefrontRepairs(storefront({ [COMMERCE]: COMMERCE_JS_CANONICAL }));

        expect(result.changed.size).toBe(0);
        expect(result.done).toStrictEqual([]);
    });

    it('lets a later repair read what an earlier one changed in the same file', async () => {
        const first: StorefrontRepair = {
            ...STOREFRONT_REPAIRS[0],
            id: 'first',
            check: async () => true,
            apply: async (files) => new Map([['a.js', `${await files.read('a.js')}+1`]]),
        };
        const second: StorefrontRepair = { ...first, id: 'second' };

        const { changed } = await runStorefrontRepairs(storefront({ 'a.js': '0' }), [first, second]);

        expect(changed.get('a.js')).toBe('0+1+1');
    });
});
