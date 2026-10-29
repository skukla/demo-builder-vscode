/**
 * The selection SelectionStepContent hands SearchableList, read as an ARGUMENT.
 *
 * The `-list` sibling checks which row ends up marked selected. That cannot see
 * a key that matches no row: a stray key in the list selects nothing on screen,
 * exactly like an empty one, while the scroll-to-selection logic downstream
 * treats it as a real selection to go looking for. So the list itself is
 * recorded here, on the way in, and still rendered for real.
 *
 * SearchableList is imported by the component, not handed to it as a prop, so
 * recording its props means wrapping the module. The mock sits in THIS file, so
 * it hoists above the testUtils import that pulls the component in.
 */

import { SearchableList } from '@/core/ui/components/navigation/SearchableList';
import { renderContent } from './SelectionStepContent.testUtils';

jest.mock('@/core/ui/components/navigation/SearchableList', () => {
    const actual = jest.requireActual('@/core/ui/components/navigation/SearchableList');
    return { ...actual, SearchableList: jest.fn(actual.SearchableList) };
});

const recorded = SearchableList as unknown as jest.Mock;

/** The props of the most recent SearchableList render. */
function handedOver(): { selectedKeys?: string[] } {
    const calls = recorded.mock.calls;
    return calls[calls.length - 1][0];
}

describe('SelectionStepContent — the selection it hands SearchableList', () => {
    beforeEach(() => {
        recorded.mockClear();
    });

    it('is an empty list when nothing is selected', () => {
        renderContent({ selectedId: undefined });

        expect(handedOver().selectedKeys).toStrictEqual([]);
    });

    it('is exactly the selected id when one is', () => {
        renderContent({ selectedId: 'o2' });

        expect(handedOver().selectedKeys).toStrictEqual(['o2']);
    });
});
