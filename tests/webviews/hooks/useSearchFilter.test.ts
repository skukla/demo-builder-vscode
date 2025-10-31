import { renderHook, act } from '@testing-library/react';
import { useSearchFilter } from '@/webview-ui/shared/hooks/useSearchFilter';

describe('useSearchFilter', () => {
  interface TestItem extends Record<string, unknown> {
    id: string;
    title: string;
    description: string;
    tags?: string[];
  }

  const testItems: TestItem[] = [
    { id: '1', title: 'React Hooks', description: 'Learn about React Hooks' },
    { id: '2', title: 'TypeScript Guide', description: 'Master TypeScript' },
    { id: '3', title: 'Testing React', description: 'Test your React applications' },
    { id: '4', title: 'Node.js Basics', description: 'Introduction to Node.js' }
  ];

  describe('initial state', () => {
    it('returns all items when query is empty', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          searchFields: ['title', 'description']
        })
      );

      expect(result.current.query).toBe('');
      expect(result.current.filteredItems).toEqual(testItems);
      expect(result.current.isFiltering).toBe(false);
    });

    it('accepts initial query', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          initialQuery: 'React',
          searchFields: ['title']
        })
      );

      expect(result.current.query).toBe('React');
      expect(result.current.isFiltering).toBe(true);
    });
  });

  describe('search by single field', () => {
    it('filters by title field', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('TypeScript');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('2');
    });

    it('filters by description field', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['description'] })
      );

      act(() => {
        result.current.setQuery('Test');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('3');
    });
  });

  describe('search by multiple fields', () => {
    it('searches across all specified fields', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          searchFields: ['title', 'description']
        })
      );

      act(() => {
        result.current.setQuery('React');
      });

      // Should match items with 'React' in title OR description
      expect(result.current.filteredItems).toHaveLength(2);
      expect(result.current.filteredItems.map(i => i.id)).toEqual(['1', '3']);
    });

    it('returns item if any field matches', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          searchFields: ['title', 'description']
        })
      );

      act(() => {
        result.current.setQuery('Node');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('4');
    });
  });

  describe('case sensitivity', () => {
    it('is case-insensitive by default', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('REACT');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].title).toBe('React Hooks');
    });

    it('respects case-sensitive option', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          searchFields: ['title'],
          caseSensitive: true
        })
      );

      act(() => {
        result.current.setQuery('REACT');
      });

      expect(result.current.filteredItems).toHaveLength(0);

      act(() => {
        result.current.setQuery('React');
      });

      expect(result.current.filteredItems).toHaveLength(1);
    });
  });

  describe('partial matching', () => {
    it('matches partial strings', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('Type');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].title).toBe('TypeScript Guide');
    });

    it('matches substring anywhere in field', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('Basics');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].title).toBe('Node.js Basics');
    });
  });

  describe('edge cases', () => {
    it('handles empty items array', () => {
      const { result } = renderHook(() =>
        useSearchFilter([], { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('test');
      });

      expect(result.current.filteredItems).toEqual([]);
    });

    it('handles null field values', () => {
      const itemsWithNulls = [
        { id: '1', title: 'Test', description: null as any },
        { id: '2', title: null as any, description: 'Description' }
      ];

      const { result } = renderHook(() =>
        useSearchFilter(itemsWithNulls, {
          searchFields: ['title', 'description']
        })
      );

      act(() => {
        result.current.setQuery('Test');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('1');
    });

    it('handles undefined field values', () => {
      const itemsWithUndefined = [
        { id: '1', title: 'Test', description: undefined as any },
        { id: '2', title: undefined as any, description: 'Description' }
      ];

      const { result } = renderHook(() =>
        useSearchFilter(itemsWithUndefined, {
          searchFields: ['title', 'description']
        })
      );

      act(() => {
        result.current.setQuery('Description');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('2');
    });

    it('handles whitespace-only query', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('   ');
      });

      // Should return all items (whitespace-only is treated as empty)
      expect(result.current.filteredItems).toEqual(testItems);
      expect(result.current.isFiltering).toBe(false);
    });
  });

  describe('custom filter function', () => {
    it('uses custom filter when provided', () => {
      const customFilter = jest.fn((item: TestItem, query: string) => {
        return item.id === query;
      });

      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          searchFields: ['title'], // Ignored when customFilter provided
          customFilter
        })
      );

      act(() => {
        result.current.setQuery('2');
      });

      expect(customFilter).toHaveBeenCalled();
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('2');
    });

    it('custom filter receives correct arguments', () => {
      const customFilter = jest.fn(() => true);

      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          searchFields: ['title'],
          customFilter
        })
      );

      act(() => {
        result.current.setQuery('test query');
      });

      expect(customFilter).toHaveBeenCalledWith(testItems[0], 'test query');
    });
  });

  describe('clearQuery', () => {
    it('clears query and shows all items', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('React');
      });
      expect(result.current.filteredItems).toHaveLength(1);

      act(() => {
        result.current.clearQuery();
      });

      expect(result.current.query).toBe('');
      expect(result.current.filteredItems).toEqual(testItems);
      expect(result.current.isFiltering).toBe(false);
    });
  });

  describe('isFiltering flag', () => {
    it('is false when query is empty', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      expect(result.current.isFiltering).toBe(false);
    });

    it('is true when query has value', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('React');
      });

      expect(result.current.isFiltering).toBe(true);
    });

    it('is false after clearing query', () => {
      const { result } = renderHook(() =>
        useSearchFilter(testItems, {
          initialQuery: 'React',
          searchFields: ['title']
        })
      );

      expect(result.current.isFiltering).toBe(true);

      act(() => {
        result.current.clearQuery();
      });

      expect(result.current.isFiltering).toBe(false);
    });
  });

  describe('items update', () => {
    it('updates filtered results when items change', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useSearchFilter(items, { searchFields: ['title'] }),
        { initialProps: { items: testItems } }
      );

      act(() => {
        result.current.setQuery('React');
      });
      expect(result.current.filteredItems).toHaveLength(1);

      // Update items
      const newItems = [
        ...testItems,
        { id: '5', title: 'React Native', description: 'Mobile with React' }
      ];
      rerender({ items: newItems });

      // Should now match 2 items
      expect(result.current.filteredItems).toHaveLength(2);
    });
  });

  describe('memoization', () => {
    it('memoizes filtered results', () => {
      const { result, rerender } = renderHook(() =>
        useSearchFilter(testItems, { searchFields: ['title'] })
      );

      act(() => {
        result.current.setQuery('React');
      });

      const firstResult = result.current.filteredItems;
      rerender();
      const secondResult = result.current.filteredItems;

      // Should be the same reference (memoized)
      expect(firstResult).toBe(secondResult);
    });
  });
});
