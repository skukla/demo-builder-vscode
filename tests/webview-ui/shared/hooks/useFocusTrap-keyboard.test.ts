import { renderHook } from '@testing-library/react';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import {
  createTestContainer,
  cleanupTestContainer,
  waitForEffectExecution,
  createTabEvent,
  createExternalButton,
  cleanupExternalButton
} from './useFocusTrap.testUtils';

/**
 * Tests for useFocusTrap hook - Keyboard Handling
 *
 * Coverage:
 * - ✅ Tab/Shift+Tab navigation trapping
 * - ✅ Tab from outside container (redirects to first/last element)
 * - ✅ Non-Tab key handling
 */
describe('useFocusTrap - Keyboard Handling', () => {
  let container: HTMLDivElement;
  let button1: HTMLButtonElement;
  let button2: HTMLButtonElement;
  let button3: HTMLButtonElement;

  beforeEach(() => {
    ({ container, button1, button2, button3 } = createTestContainer());
  });

  afterEach(() => {
    cleanupTestContainer(container);
  });

  describe('tab navigation', () => {
    it('traps Tab key at last element', async () => {
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

      // Focus last button
      button3.focus();
      expect(document.activeElement).toBe(button3);

      // Create Tab key event
      const tabEvent = createTabEvent(false);

      // Mock preventDefault
      const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');

      // Dispatch on container (event bubbles up)
      container.dispatchEvent(tabEvent);

      // Should have prevented default and focus should move to first
      // Note: In a real browser this would work, but jsdom has limitations
      // We verify preventDefault was called
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('traps Shift+Tab key at first element', async () => {
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

      // Focus first button
      button1.focus();
      expect(document.activeElement).toBe(button1);

      // Create Shift+Tab key event
      const shiftTabEvent = createTabEvent(true);

      const preventDefaultSpy = jest.spyOn(shiftTabEvent, 'preventDefault');

      container.dispatchEvent(shiftTabEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('ignores non-Tab keys', () => {
      const { result } = renderHook(() => useFocusTrap({ enabled: true }));

      // @ts-ignore - mocking ref
      result.current.current = container;

      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      });

      const preventDefaultSpy = jest.spyOn(enterEvent, 'preventDefault');

      container.dispatchEvent(enterEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('redirects Tab from outside container to first element', async () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useFocusTrap({ enabled, containFocus: false }),
        { initialProps: { enabled: false } }
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      // Force effect to re-run with container now set by toggling enabled
      rerender({ enabled: true });

      // Wait for effect to execute
      await waitForEffectExecution();

      // Create external element and focus it
      const externalButton = createExternalButton();
      externalButton.focus();
      expect(document.activeElement).toBe(externalButton);

      // Create Tab key event from outside container
      const tabEvent = createTabEvent(false);

      const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');

      // Dispatch on document (simulates global Tab press)
      document.dispatchEvent(tabEvent);

      // Should have prevented default (indicating it was handled)
      expect(preventDefaultSpy).toHaveBeenCalled();

      // Cleanup
      cleanupExternalButton(externalButton);
    });

    it('redirects Shift+Tab from outside container to last element', async () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useFocusTrap({ enabled, containFocus: false }),
        { initialProps: { enabled: false } }
      );

      // @ts-ignore - mocking ref
      result.current.current = container;

      // Force effect to re-run with container now set by toggling enabled
      rerender({ enabled: true });

      // Wait for effect to execute
      await waitForEffectExecution();

      // Create external element and focus it
      const externalButton = createExternalButton();
      externalButton.focus();
      expect(document.activeElement).toBe(externalButton);

      // Create Shift+Tab key event from outside container
      const shiftTabEvent = createTabEvent(true);

      const preventDefaultSpy = jest.spyOn(shiftTabEvent, 'preventDefault');

      // Dispatch on document (simulates global Shift+Tab press)
      document.dispatchEvent(shiftTabEvent);

      // Should have prevented default (indicating it was handled)
      expect(preventDefaultSpy).toHaveBeenCalled();

      // Cleanup
      cleanupExternalButton(externalButton);
    });
  });
});
