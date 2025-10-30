import React from 'react';
import { render } from '@testing-library/react';
import { GridLayout } from '@/webview-ui/shared/components/layout/GridLayout';

describe('GridLayout', () => {
  describe('Token Translation', () => {
    it('should translate gap token size-300 to 24px', () => {
      // Type assertion needed until DimensionValue type is applied
      const { container } = render(
        <GridLayout gap={'size-300' as any}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('24px');
    });

    it('should translate maxWidth token size-6000 to 480px', () => {
      // Type assertion needed until DimensionValue type is applied
      const { container } = render(
        <GridLayout maxWidth={'size-6000' as any}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.maxWidth).toBe('480px');
    });

    it('should translate padding token size-200 to 16px', () => {
      // Type assertion needed until DimensionValue type is applied
      const { container } = render(
        <GridLayout padding={'size-200' as any}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.padding).toBe('16px');
    });

    it('should translate multiple token props simultaneously', () => {
      // Type assertions needed until DimensionValue type is applied
      const { container } = render(
        <GridLayout
          gap={'size-300' as any}
          maxWidth={'size-6000' as any}
          padding={'size-400' as any}
        >
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('24px');
      expect(gridDiv.style.maxWidth).toBe('480px');
      expect(gridDiv.style.padding).toBe('32px');
    });

    it('should handle mixed token and pixel values', () => {
      // Type assertion needed until DimensionValue type is applied
      const { container } = render(
        <GridLayout gap={'size-300' as any} padding="16px">
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('24px');
      expect(gridDiv.style.padding).toBe('16px');
    });
  });

  describe('Backward Compatibility', () => {
    it('should pass through numeric gap values as pixels', () => {
      // Type assertion needed until DimensionValue type is applied
      const { container } = render(
        <GridLayout gap={16 as any}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('16px');
    });

    it('should pass through pixel string values unchanged', () => {
      const { container } = render(
        <GridLayout gap="32px">
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('32px');
    });

    it('should use default gap when undefined', () => {
      const { container } = render(
        <GridLayout>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('24px');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid token gracefully', () => {
      // Type assertion needed to test runtime behavior (TypeScript correctly rejects at compile-time)
      const { container } = render(
        <GridLayout gap={'size-999' as any}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      // Invalid token should pass through unchanged (graceful degradation)
      expect(gridDiv.style.gap).toBe('size-999');
    });
  });

  describe('Grid Layout Structure', () => {
    it('should render grid container with correct structure', () => {
      const { container } = render(
        <GridLayout columns={3}>
          <div>Item 1</div>
          <div>Item 2</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.display).toBe('grid');
      expect(gridDiv.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    });
  });
});
