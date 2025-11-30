/**
 * Test utilities for useAutoScroll hook tests
 */

/**
 * Creates a mock container element for scroll testing
 */
export const createMockContainer = (overrides?: Partial<{
  scrollTo: jest.Mock;
  clientHeight: number;
  scrollTop: number;
  scrollHeight: number;
}>) => {
  return {
    scrollTo: jest.fn(),
    clientHeight: 100,
    scrollTop: 0,
    scrollHeight: 500,
    ...overrides
  };
};

/**
 * Creates a mock element for scroll item testing
 */
export const createMockElement = (overrides?: Partial<{
  offsetTop: number;
  offsetHeight: number;
}>) => {
  return {
    offsetTop: 150,
    offsetHeight: 20,
    ...overrides
  };
};

/**
 * Default scroll options for testing
 */
export const DEFAULT_SCROLL_OPTIONS = {
  enabled: true,
  behavior: 'smooth' as ScrollBehavior,
  delay: 100,
  padding: 0
};
