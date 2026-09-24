/**
 * The remembered demos as grid cards, and why a project's own row survives a
 * removed setting.
 */

import { addedDemoId } from '@/features/components/services/storefrontResolver';
import { addedDemoCards, withAddedDemo } from '@/features/project-creation/ui/wizard/addedDemoCards';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';

const JEN = makeAddedDemo();
const BOB = makeAddedDemo({ name: 'Bob', source: { owner: 'bob', repo: 'shop' }, storefrontKind: 'headless' });

describe('addedDemoCards', () => {
    it('makes one card per remembered demo, under every stack of its kind', () => {
        const cards = addedDemoCards([JEN, BOB], undefined, undefined);
        expect(cards.map((c) => c.id)).toEqual([addedDemoId(JEN), addedDemoId(BOB)]);
        expect(Object.keys(cards[0].storefronts)).toEqual(['eds-paas', 'eds-accs']);
        expect(Object.keys(cards[1].storefronts)).toEqual(['headless-paas', 'headless-accs']);
    });

    it("keeps a project's own demo as a card when the setting no longer lists it", () => {
        const cards = addedDemoCards([BOB], JEN, 'eds-accs');
        expect(cards.map((c) => c.id)).toEqual([addedDemoId(BOB), addedDemoId(JEN)]);
        expect(Object.keys(cards[1].storefronts)).toEqual(['eds-accs']);
    });

    it('does not duplicate the own demo when it is still remembered', () => {
        expect(addedDemoCards([JEN], JEN, 'eds-paas')).toHaveLength(1);
    });
});

describe('withAddedDemo', () => {
    it('appends a new repository and replaces a known one in place', () => {
        expect(withAddedDemo([JEN], BOB)).toEqual([JEN, BOB]);
        const renamed = { ...JEN, name: 'Renamed' };
        expect(withAddedDemo([JEN, BOB], renamed)).toEqual([renamed, BOB]);
    });
});
