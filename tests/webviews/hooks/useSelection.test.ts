import { renderHook, act } from '@testing-library/react';
import { useSelection } from '@/webview-ui/shared/hooks/useSelection';

describe('useSelection', () => {
  interface TestItem {
    id: string;
    name: string;
  }

  describe('initial state', () => {
    it('returns null selected item by default', () => {
      const { result } = renderHook(() => useSelection<TestItem>());

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.selectedKey).toBeNull();
    });

    it('accepts initial selection', () => {
      const initialItem = { id: '1', name: 'Item 1' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({ initialSelection: initialItem })
      );

      expect(result.current.selectedItem).toEqual(initialItem);
    });

    it('returns initial selected key when getKey is provided', () => {
      const initialItem = { id: '123', name: 'Test' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: initialItem,
          getKey: item => item.id
        })
      );

      expect(result.current.selectedKey).toBe('123');
    });
  });

  describe('select', () => {
    it('selects an item', () => {
      const { result } = renderHook(() => useSelection<TestItem>());

      const item = { id: '1', name: 'Item 1' };

      act(() => {
        result.current.select(item);
      });

      expect(result.current.selectedItem).toEqual(item);
    });

    it('calls onChange callback when selecting', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useSelection<TestItem>({ onChange })
      );

      const item = { id: '1', name: 'Item 1' };

      act(() => {
        result.current.select(item);
      });

      expect(onChange).toHaveBeenCalledWith(item);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('updates selected key when selecting with getKey', () => {
      const { result } = renderHook(() =>
        useSelection<TestItem>({ getKey: item => item.id })
      );

      const item = { id: '123', name: 'Test' };

      act(() => {
        result.current.select(item);
      });

      expect(result.current.selectedKey).toBe('123');
    });

    it('changes selection when selecting different item', () => {
      const { result } = renderHook(() => useSelection<TestItem>());

      const item1 = { id: '1', name: 'Item 1' };
      const item2 = { id: '2', name: 'Item 2' };

      act(() => {
        result.current.select(item1);
      });
      expect(result.current.selectedItem).toEqual(item1);

      act(() => {
        result.current.select(item2);
      });
      expect(result.current.selectedItem).toEqual(item2);
    });
  });

  describe('clearSelection', () => {
    it('clears selected item', () => {
      const item = { id: '1', name: 'Item 1' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({ initialSelection: item })
      );

      expect(result.current.selectedItem).toEqual(item);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.selectedKey).toBeNull();
    });

    it('calls onChange with null when clearing', () => {
      const onChange = jest.fn();
      const item = { id: '1', name: 'Item 1' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: item,
          onChange
        })
      );

      act(() => {
        result.current.clearSelection();
      });

      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('isSelected', () => {
    it('returns true for selected item with getKey', () => {
      const item1 = { id: '1', name: 'Item 1' };
      const item2 = { id: '1', name: 'Item 1 Copy' }; // Same id, different object
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: item1,
          getKey: item => item.id
        })
      );

      expect(result.current.isSelected(item2)).toBe(true);
    });

    it('returns false for non-selected item', () => {
      const item1 = { id: '1', name: 'Item 1' };
      const item2 = { id: '2', name: 'Item 2' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: item1,
          getKey: item => item.id
        })
      );

      expect(result.current.isSelected(item2)).toBe(false);
    });

    it('uses reference equality when getKey is not provided', () => {
      const item1 = { id: '1', name: 'Item 1' };
      const item2 = { id: '1', name: 'Item 1' }; // Same values, different object
      const { result } = renderHook(() =>
        useSelection<TestItem>({ initialSelection: item1 })
      );

      expect(result.current.isSelected(item1)).toBe(true);
      expect(result.current.isSelected(item2)).toBe(false); // Different reference
    });

    it('returns false when nothing is selected', () => {
      const item = { id: '1', name: 'Item 1' };
      const { result } = renderHook(() => useSelection<TestItem>());

      expect(result.current.isSelected(item)).toBe(false);
    });
  });

  describe('toggle', () => {
    it('selects item if not selected', () => {
      const { result } = renderHook(() =>
        useSelection<TestItem>({ getKey: item => item.id })
      );

      const item = { id: '1', name: 'Item 1' };

      act(() => {
        result.current.toggle(item);
      });

      expect(result.current.selectedItem).toEqual(item);
    });

    it('deselects item if selected and allowDeselect is true', () => {
      const item = { id: '1', name: 'Item 1' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: item,
          getKey: i => i.id,
          allowDeselect: true
        })
      );

      expect(result.current.selectedItem).toEqual(item);

      act(() => {
        result.current.toggle(item);
      });

      expect(result.current.selectedItem).toBeNull();
    });

    it('does not deselect if selected and allowDeselect is false', () => {
      const item = { id: '1', name: 'Item 1' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: item,
          getKey: i => i.id,
          allowDeselect: false
        })
      );

      act(() => {
        result.current.toggle(item);
      });

      // Should still be selected
      expect(result.current.selectedItem).toEqual(item);
    });

    it('switches between items', () => {
      const item1 = { id: '1', name: 'Item 1' };
      const item2 = { id: '2', name: 'Item 2' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({ getKey: i => i.id })
      );

      act(() => {
        result.current.toggle(item1);
      });
      expect(result.current.selectedItem).toEqual(item1);

      act(() => {
        result.current.toggle(item2);
      });
      expect(result.current.selectedItem).toEqual(item2);
    });
  });

  describe('getKey with different types', () => {
    it('works with numeric keys', () => {
      interface NumericItem {
        id: number;
        name: string;
      }

      const item = { id: 123, name: 'Test' };
      const { result } = renderHook(() =>
        useSelection<NumericItem>({
          initialSelection: item,
          getKey: i => i.id
        })
      );

      expect(result.current.selectedKey).toBe(123);
    });

    it('works with string keys', () => {
      const item = { id: 'abc-123', name: 'Test' };
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          initialSelection: item,
          getKey: i => i.id
        })
      );

      expect(result.current.selectedKey).toBe('abc-123');
    });
  });

  describe('function stability', () => {
    it('select function is stable when onChange is stable', () => {
      const onChange = jest.fn();
      const { result, rerender } = renderHook(() =>
        useSelection<TestItem>({ onChange })
      );

      const select1 = result.current.select;
      rerender();
      const select2 = result.current.select;

      expect(select1).toBe(select2);
    });

    it('clearSelection function is stable', () => {
      const { result, rerender } = renderHook(() => useSelection<TestItem>());

      const clear1 = result.current.clearSelection;
      rerender();
      const clear2 = result.current.clearSelection;

      expect(clear1).toBe(clear2);
    });

    it('isSelected function is stable', () => {
      const { result, rerender } = renderHook(() => useSelection<TestItem>());

      const isSelected1 = result.current.isSelected;
      rerender();
      const isSelected2 = result.current.isSelected;

      expect(isSelected1).toBe(isSelected2);
    });
  });

  describe('complex scenarios', () => {
    it('handles selection workflow in list context', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useSelection<TestItem>({
          getKey: i => i.id,
          onChange
        })
      );

      const items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' }
      ];

      // Select first item
      act(() => {
        result.current.select(items[0]);
      });
      expect(result.current.selectedKey).toBe('1');
      expect(onChange).toHaveBeenCalledWith(items[0]);

      // Verify only first is selected
      expect(result.current.isSelected(items[0])).toBe(true);
      expect(result.current.isSelected(items[1])).toBe(false);
      expect(result.current.isSelected(items[2])).toBe(false);

      // Select second item
      act(() => {
        result.current.select(items[1]);
      });
      expect(result.current.selectedKey).toBe('2');

      // Verify only second is selected
      expect(result.current.isSelected(items[0])).toBe(false);
      expect(result.current.isSelected(items[1])).toBe(true);
      expect(result.current.isSelected(items[2])).toBe(false);
    });
  });
});
