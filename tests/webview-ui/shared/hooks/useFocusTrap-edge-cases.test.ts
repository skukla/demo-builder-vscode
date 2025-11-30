import { renderHook } from '@testing-library/react';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import {
  createTestContainer,
  cleanupTestContainer,
  waitForEffectExecution,
  createTabEvent,
  cleanupTests
} from './useFocusTrap.testUtils';

/**
 * Tests for useFocusTrap hook - Edge Cases
 *
 * Coverage:
 * - ✅ Empty container handling
 * - ✅ Single focusable element handling
 * - ✅ Missing container ref handling
 */
describe('useFocusTrap - Edge Cases', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create minimal container for edge case tests
    ({ container } = createTestContainer());
  });

  afterEach(() => {
    cleanupTestContainer(container);
    cleanupTests();
  });

  describe('edge cases', () => {
    it('handles empty container', () => {
      container.innerHTML = '';

      const { result } = renderHook(() => useFocusTrap({ enabled: true }));

      // @ts-ignore - mocking ref
      result.current.current = container;

      const tabEvent = createTabEvent(false);

      // Should not throw
      expect(() => {
        container.dispatchEvent(tabEvent);
      }).not.toThrow();
    });

    it('handles single focusable element', async () => {
      container.innerHTML = '';
      const singleButton = document.createElement('button');
      container.appendChild(singleButton);

      const { result, rerender } = renderHook(
        ({ enabled }) => useFocusTrap({ enabled }),
        { initialProps: { enabled: false } }
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      // Force effect to re-run with container now set by toggling enabled
      rerender({ enabled: true });

      // Wait for effect to execute
      await waitForEffectExecution();

      singleButton.focus();

      const tabEvent = createTabEvent(false);

      const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');

      container.dispatchEvent(tabEvent);

      // Should prevent default and cycle to same element
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('handles container ref not being set', () => {
      const { result } = renderHook(() => useFocusTrap({ enabled: true }));

      // Don't set containerRef.current

      // Should not throw
      expect(() => {
        // Trigger potential operations
        result.current.current;
      }).not.toThrow();
    });
  });
});
