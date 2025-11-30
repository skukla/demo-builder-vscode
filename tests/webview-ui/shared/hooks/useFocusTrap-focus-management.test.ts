import { renderHook } from '@testing-library/react';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import {
  createTestContainer,
  cleanupTestContainer,
  waitForEffectExecution,
  cleanupTests
} from './useFocusTrap.testUtils';

/**
 * Tests for useFocusTrap hook - Focus Management
 *
 * Coverage:
 * - ✅ Basic initialization and ref management
 * - ✅ Auto-focus functionality
 * - ✅ Enable/disable toggling
 * - ✅ Cleanup on unmount
 */
describe('useFocusTrap - Focus Management', () => {
  let container: HTMLDivElement;
  let button1: HTMLButtonElement;
  let button2: HTMLButtonElement;
  let button3: HTMLButtonElement;

  beforeEach(() => {
    ({ container, button1, button2, button3 } = createTestContainer());
  });

  afterEach(() => {
    cleanupTestContainer(container);
    cleanupTests();
  });

  describe('initialization', () => {
    it('returns a ref object', () => {
      const { result } = renderHook(() => useFocusTrap());

      expect(result.current).toHaveProperty('current');
      expect(result.current.current).toBeNull();
    });

    it('accepts options', () => {
      const { result } = renderHook(() =>
        useFocusTrap({
          enabled: false,
          autoFocus: true,
          focusableSelector: 'button'
        })
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('auto focus', () => {
    it('focuses first element when autoFocus is true', async () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useFocusTrap({ autoFocus: true, enabled }),
        { initialProps: { enabled: false } }
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      // Force effect to re-run with container now set by toggling enabled
      rerender({ enabled: true });

      // Wait for effect to execute
      await waitForEffectExecution();

      // The effect should have auto-focused the first button
      expect(document.activeElement).toBe(button1);
    });

    it('does not focus when autoFocus is false', () => {
      const { result } = renderHook(() =>
        useFocusTrap({ autoFocus: false, enabled: true })
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      expect(document.activeElement).not.toBe(button1);
    });

    it('does not focus when disabled', () => {
      const { result } = renderHook(() =>
        useFocusTrap({ autoFocus: true, enabled: false })
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      expect(document.activeElement).not.toBe(button1);
    });
  });

  describe('enabled option', () => {
    it('does not trap focus when disabled', () => {
      const { result } = renderHook(() => useFocusTrap({ enabled: false }));

      // @ts-ignore - mocking ref
      result.current.current = container;

      button3.focus();

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      });

      const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');

      container.dispatchEvent(tabEvent);

      // Should not prevent default when disabled
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('can be toggled', async () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useFocusTrap({ enabled }),
        { initialProps: { enabled: false } }
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      // Start disabled - should not trap
      button3.focus();
      let tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      });
      container.dispatchEvent(tabEvent);

      // Enable
      rerender({ enabled: true });

      // Wait for effect to execute now that it's enabled
      await waitForEffectExecution();

      // Now should trap
      button3.focus();
      tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      });
      const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');
      container.dispatchEvent(tabEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes event listener on unmount', () => {
      const { result, unmount } = renderHook(() => useFocusTrap({ enabled: true }));

      // @ts-ignore - mocking ref
      result.current.current = container;

      // Unmount
      unmount();

      // Event listener should be removed
      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      });

      const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');

      container.dispatchEvent(tabEvent);

      // Should not prevent default after unmount
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });
});
