import { cleanup } from '@testing-library/react';

/**
 * Shared test utilities for useFocusTrap hook tests
 */

/**
 * Helper to wait for effect execution (useLayoutEffect runs synchronously, but this provides safety margin)
 * Uses microtask queue flushing rather than real timers for reliability
 */
export const waitForEffectExecution = () => Promise.resolve().then(() => Promise.resolve());

/**
 * Factory to create a test container with focusable elements
 * Returns a new container and buttons each time it's called (proper closure semantics)
 */
export function createTestContainer() {
  const container = document.createElement('div');
  const button1 = document.createElement('button');
  const button2 = document.createElement('button');
  const button3 = document.createElement('button');

  button1.textContent = 'First';
  button2.textContent = 'Second';
  button3.textContent = 'Last';

  container.appendChild(button1);
  container.appendChild(button2);
  container.appendChild(button3);

  document.body.appendChild(container);

  return { container, button1, button2, button3 };
}

/**
 * Cleanup helper to remove container from DOM
 */
export function cleanupTestContainer(container: HTMLElement) {
  if (container.parentElement) {
    document.body.removeChild(container);
  }
}

/**
 * Creates a Tab key event
 */
export function createTabEvent(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true
  });
}

/**
 * Creates an external button element for testing focus from outside container
 */
export function createExternalButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'External';
  document.body.appendChild(button);
  return button;
}

/**
 * Cleanup helper for external button
 */
export function cleanupExternalButton(button: HTMLButtonElement) {
  if (button.parentElement) {
    document.body.removeChild(button);
  }
}

/**
 * Full cleanup function for afterEach
 */
export function cleanupTests() {
  cleanup(); // React Testing Library cleanup
  jest.clearAllMocks();
}
