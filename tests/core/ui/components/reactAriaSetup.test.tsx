/**
 * React Aria Components Setup Tests
 *
 * Validates that react-aria-components package is properly installed
 * and the barrel export structure is set up correctly for the
 * incremental migration from React Spectrum.
 *
 * Step 1 of React Aria Migration Plan
 */
import { resolve } from 'path';
import { existsSync } from 'fs';

/**
 * Helper to check if an export is a valid React component.
 * React Aria uses forwardRef, which creates objects with render functions,
 * not plain functions.
 */
function isValidReactComponent(component: unknown): boolean {
  if (typeof component === 'function') {
    return true;
  }
  if (
    typeof component === 'object' &&
    component !== null &&
    'render' in component &&
    typeof (component as { render: unknown }).render === 'function'
  ) {
    return true;
  }
  return false;
}

describe('React Aria Components Setup', () => {
  describe('Package Installation', () => {
    it('should have react-aria-components package installed and importable', () => {
      // Given: react-aria-components should be in node_modules
      // When: We attempt to require the package
      // Then: No errors should occur and Button should be a valid React component

      // Use require to test runtime importability
      const reactAriaComponents = require('react-aria-components');

      // Button is one of the core components we'll migrate to
      // Note: React Aria uses forwardRef, so components are objects with render functions
      expect(isValidReactComponent(reactAriaComponents.Button)).toBe(true);
    });

    it('should export core components we plan to use', () => {
      // Given: react-aria-components is installed
      // When: We check for specific components we need for migration
      // Then: All required components should be available as valid React components

      const reactAriaComponents = require('react-aria-components');

      // Core interactive components
      expect(isValidReactComponent(reactAriaComponents.Button)).toBe(true);
      expect(isValidReactComponent(reactAriaComponents.Link)).toBe(true);
      expect(isValidReactComponent(reactAriaComponents.ProgressBar)).toBe(true);

      // Form components
      expect(isValidReactComponent(reactAriaComponents.TextField)).toBe(true);
      expect(isValidReactComponent(reactAriaComponents.SearchField)).toBe(true);

      // Overlay components
      expect(isValidReactComponent(reactAriaComponents.Dialog)).toBe(true);
      expect(isValidReactComponent(reactAriaComponents.Modal)).toBe(true);
      expect(isValidReactComponent(reactAriaComponents.Menu)).toBe(true);

      // Typography/content components
      expect(isValidReactComponent(reactAriaComponents.Heading)).toBe(true);
      expect(isValidReactComponent(reactAriaComponents.Text)).toBe(true);
    });
  });

  describe('Barrel Export Structure', () => {
    const ariaBasePath = resolve(
      __dirname,
      '../../../../src/core/ui/components/aria'
    );

    it('should have main aria barrel file', () => {
      // Given: The aria component directory structure
      // When: We check for the main barrel file
      // Then: index.ts should exist

      const mainBarrelPath = resolve(ariaBasePath, 'index.ts');
      expect(existsSync(mainBarrelPath)).toBe(true);
    });

    it('should have primitives barrel file', () => {
      // Given: The aria primitives directory
      // When: We check for the barrel file
      // Then: primitives/index.ts should exist

      const primitivesBarrelPath = resolve(ariaBasePath, 'primitives/index.ts');
      expect(existsSync(primitivesBarrelPath)).toBe(true);
    });

    it('should have interactive barrel file', () => {
      // Given: The aria interactive directory
      // When: We check for the barrel file
      // Then: interactive/index.ts should exist

      const interactiveBarrelPath = resolve(
        ariaBasePath,
        'interactive/index.ts'
      );
      expect(existsSync(interactiveBarrelPath)).toBe(true);
    });

    it('should have forms barrel file', () => {
      // Given: The aria forms directory
      // When: We check for the barrel file
      // Then: forms/index.ts should exist

      const formsBarrelPath = resolve(ariaBasePath, 'forms/index.ts');
      expect(existsSync(formsBarrelPath)).toBe(true);
    });

    it('should have overlays barrel file', () => {
      // Given: The aria overlays directory
      // When: We check for the barrel file
      // Then: overlays/index.ts should exist

      const overlaysBarrelPath = resolve(ariaBasePath, 'overlays/index.ts');
      expect(existsSync(overlaysBarrelPath)).toBe(true);
    });

    it('should allow importing from main aria barrel', () => {
      // Given: The aria barrel structure is set up
      // When: We attempt to import from the main barrel
      // Then: The module should resolve without errors

      // This will fail if the barrel doesn't exist or has syntax errors
      const ariaModule = require('@/core/ui/components/aria');

      // Even if empty, the module should be an object
      expect(typeof ariaModule).toBe('object');
    });
  });

  describe('CSS Modules Integration', () => {
    it('should have styleMock returning class names for CSS Modules', () => {
      // Given: The styleMock is configured for CSS Modules
      // When: We import a CSS module in tests
      // Then: Class names should be returned (proxied behavior)

      // This tests our mock setup works - actual CSS Module behavior
      // is handled by webpack in the real build
      const styleMock = require('../../../../tests/__mocks__/styleMock.js');

      // The mock should return property names as class names
      expect(styleMock.default.someClass).toBe('someClass');
      expect(styleMock.default.anotherClass).toBe('anotherClass');
    });

    it('should support CSS Modules default export pattern', () => {
      // Given: CSS Module mock is set up with ES Module interop
      // When: We check the mock structure
      // Then: It should have __esModule and default export

      const styleMock = require('../../../../tests/__mocks__/styleMock.js');

      expect(styleMock.__esModule).toBe(true);
      expect(typeof styleMock.default).toBe('object');
    });
  });
});
