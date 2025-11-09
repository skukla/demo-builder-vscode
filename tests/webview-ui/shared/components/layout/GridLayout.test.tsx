import React from 'react';
import { render } from '@testing-library/react';
import { GridLayout } from '@/core/ui/components/layout/GridLayout';
import type { DimensionValue } from '@/core/ui/utils/spectrumTokens';

describe('GridLayout', () => {
  describe('Token Translation', () => {
    it('should translate gap token size-300 to 24px', () => {
      const gap: DimensionValue = 'size-300';
      const { container } = render(
        <GridLayout gap={gap}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.gap).toBe('24px');
    });

    it('should translate maxWidth token size-6000 to 480px', () => {
      const maxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <GridLayout maxWidth={maxWidth}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.maxWidth).toBe('480px');
    });

    it('should translate padding token size-200 to 16px', () => {
      const padding: DimensionValue = 'size-200';
      const { container } = render(
        <GridLayout padding={padding}>
          <div>Item 1</div>
        </GridLayout>
      );
      const gridDiv = container.firstChild as HTMLDivElement;
      expect(gridDiv.style.padding).toBe('16px');
    });

    it('should translate multiple token props simultaneously', () => {
      const gap: DimensionValue = 'size-300';
      const maxWidth: DimensionValue = 'size-6000';
      const padding: DimensionValue = 'size-400';
      const { container } = render(
        <GridLayout
          gap={gap}
          maxWidth={maxWidth}
          padding={padding}
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
      const gap: DimensionValue = 'size-300';
      const { container } = render(
        <GridLayout gap={gap} padding="16px">
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
      const gap: DimensionValue = 16;
      const { container } = render(
        <GridLayout gap={gap}>
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
      // Testing invalid token (intentionally bypassing type check for negative test)
      const gap = 'size-999' as unknown as DimensionValue;
      const { container } = render(
        <GridLayout gap={gap}>
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
