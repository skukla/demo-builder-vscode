import { renderHook } from '@testing-library/react';
import { useSelectableDefault, useSelectableDefaultWhen } from '@/core/ui/hooks/useSelectableDefault';

describe('useSelectableDefault', () => {
  describe('useSelectableDefault', () => {
    it('returns onFocus handler', () => {
      const { result } = renderHook(() => useSelectableDefault());

      expect(result.current).toHaveProperty('onFocus');
      expect(typeof result.current.onFocus).toBe('function');
    });

    it('selects all text on focus', () => {
      const { result } = renderHook(() => useSelectableDefault());

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      result.current.onFocus(mockEvent);

      expect(mockInput.select).toHaveBeenCalledTimes(1);
    });

    it('works with input elements', () => {
      const { result } = renderHook(() => useSelectableDefault());

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      result.current.onFocus(mockEvent);

      expect(mockInput.select).toHaveBeenCalled();
    });

    it('works with textarea elements', () => {
      const { result } = renderHook(() => useSelectableDefault());

      const mockTextarea = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockTextarea
      } as unknown as React.FocusEvent<HTMLTextAreaElement>;

      result.current.onFocus(mockEvent);

      expect(mockTextarea.select).toHaveBeenCalled();
    });

    it('onFocus handler is stable across renders', () => {
      const { result, rerender } = renderHook(() => useSelectableDefault());

      const onFocus1 = result.current.onFocus;
      rerender();
      const onFocus2 = result.current.onFocus;

      expect(onFocus1).toBe(onFocus2);
    });
  });

  describe('useSelectableDefaultWhen', () => {
    it('returns onFocus handler', () => {
      const { result } = renderHook(() =>
        useSelectableDefaultWhen('default value', 'default value')
      );

      expect(result.current).toHaveProperty('onFocus');
      expect(typeof result.current.onFocus).toBe('function');
    });

    it('selects text when current value matches default', () => {
      const { result } = renderHook(() =>
        useSelectableDefaultWhen('https://example.com', 'https://example.com')
      );

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      result.current.onFocus(mockEvent);

      expect(mockInput.select).toHaveBeenCalledTimes(1);
    });

    it('does not select text when value has been modified', () => {
      const { result } = renderHook(() =>
        useSelectableDefaultWhen('https://custom.com', 'https://example.com')
      );

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      result.current.onFocus(mockEvent);

      expect(mockInput.select).not.toHaveBeenCalled();
    });

    it('updates behavior when current value changes to match default', () => {
      const { result, rerender } = renderHook(
        ({ currentValue, defaultValue }) =>
          useSelectableDefaultWhen(currentValue, defaultValue),
        {
          initialProps: {
            currentValue: 'custom value',
            defaultValue: 'default value'
          }
        }
      );

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      // First call - should not select (values don't match)
      result.current.onFocus(mockEvent);
      expect(mockInput.select).not.toHaveBeenCalled();

      // Update value to match default
      rerender({
        currentValue: 'default value',
        defaultValue: 'default value'
      });

      // Second call - should select (values match)
      result.current.onFocus(mockEvent);
      expect(mockInput.select).toHaveBeenCalledTimes(1);
    });

    it('updates behavior when current value changes to not match default', () => {
      const { result, rerender } = renderHook(
        ({ currentValue, defaultValue }) =>
          useSelectableDefaultWhen(currentValue, defaultValue),
        {
          initialProps: {
            currentValue: 'default value',
            defaultValue: 'default value'
          }
        }
      );

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      // First call - should select (values match)
      result.current.onFocus(mockEvent);
      expect(mockInput.select).toHaveBeenCalledTimes(1);

      // Update value to not match
      rerender({
        currentValue: 'custom value',
        defaultValue: 'default value'
      });

      // Second call - should not select (values don't match)
      result.current.onFocus(mockEvent);
      expect(mockInput.select).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('handles empty strings', () => {
      const { result } = renderHook(() => useSelectableDefaultWhen('', ''));

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      result.current.onFocus(mockEvent);

      expect(mockInput.select).toHaveBeenCalled();
    });

    it('is case-sensitive', () => {
      const { result } = renderHook(() =>
        useSelectableDefaultWhen('Default', 'default')
      );

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      result.current.onFocus(mockEvent);

      expect(mockInput.select).not.toHaveBeenCalled();
    });
  });

  describe('usage patterns', () => {
    it('can be spread onto input component', () => {
      const { result } = renderHook(() => useSelectableDefault());

      const props = result.current;

      expect(props).toHaveProperty('onFocus');
      expect(typeof props.onFocus).toBe('function');
    });

    it('works with conditional selection', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useSelectableDefaultWhen(value, 'default'),
        { initialProps: { value: 'default' } }
      );

      const mockInput = {
        select: jest.fn()
      };

      const mockEvent = {
        target: mockInput
      } as unknown as React.FocusEvent<HTMLInputElement>;

      // Should select when value is default
      result.current.onFocus(mockEvent);
      expect(mockInput.select).toHaveBeenCalledTimes(1);

      // User types something
      rerender({ value: 'default modified' });

      // Should not select anymore
      result.current.onFocus(mockEvent);
      expect(mockInput.select).toHaveBeenCalledTimes(1); // Still only once

      // User clears back to default
      rerender({ value: 'default' });

      // Should select again
      result.current.onFocus(mockEvent);
      expect(mockInput.select).toHaveBeenCalledTimes(2);
    });
  });
});
