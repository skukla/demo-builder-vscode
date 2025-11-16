import React from 'react';
import { render } from '@testing-library/react';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import type { DimensionValue } from '@/core/ui/utils/spectrumTokens';

describe('TwoColumnLayout', () => {
  describe('Token Translation', () => {
    it('should translate gap token size-300 to 24px', () => {
      const gap: DimensionValue = 'size-300';
      const { container } = render(
        <TwoColumnLayout
          gap={gap}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.gap).toBe('24px');
    });

    it('should translate leftPadding token size-200 to 16px', () => {
      const leftPadding: DimensionValue = 'size-200';
      const { container } = render(
        <TwoColumnLayout
          leftPadding={leftPadding}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.padding).toBe('16px');
    });

    it('should translate rightPadding token size-400 to 32px', () => {
      const rightPadding: DimensionValue = 'size-400';
      const { container } = render(
        <TwoColumnLayout
          rightPadding={rightPadding}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.padding).toBe('32px');
    });

    it('should translate leftMaxWidth token size-6000 to 480px', () => {
      const leftMaxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <TwoColumnLayout
          leftMaxWidth={leftMaxWidth}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.maxWidth).toBe('480px');
    });

    it('should translate multiple token props simultaneously', () => {
      const gap: DimensionValue = 'size-300';
      const leftPadding: DimensionValue = 'size-200';
      const rightPadding: DimensionValue = 'size-400';
      const leftMaxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <TwoColumnLayout
          gap={gap}
          leftPadding={leftPadding}
          rightPadding={rightPadding}
          leftMaxWidth={leftMaxWidth}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
      const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

      expect(flexContainer.style.gap).toBe('24px');
      expect(leftColumn.style.padding).toBe('16px');
      expect(rightColumn.style.padding).toBe('32px');
      expect(leftColumn.style.maxWidth).toBe('480px');
    });

    it('should handle mixed token and pixel values', () => {
      const gap: DimensionValue = 'size-300';
      const { container } = render(
        <TwoColumnLayout
          gap={gap}
          leftPadding="32px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;

      expect(flexContainer.style.gap).toBe('24px');
      expect(leftColumn.style.padding).toBe('32px');
    });
  });

  describe('Backward Compatibility', () => {
    it('should pass through numeric padding values as pixels', () => {
      const leftPadding: DimensionValue = 24;
      const { container } = render(
        <TwoColumnLayout
          leftPadding={leftPadding}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.padding).toBe('24px');
    });

    it('should pass through pixel string values unchanged', () => {
      const { container } = render(
        <TwoColumnLayout
          gap="16px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.gap).toBe('16px');
    });

    it('should use default values when props undefined', () => {
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
      const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

      expect(flexContainer.style.gap).toBe('0');
      expect(leftColumn.style.padding).toBe('24px');
      expect(rightColumn.style.padding).toBe('24px');
      expect(leftColumn.style.maxWidth).toBe('800px');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid token gracefully', () => {
      // Testing invalid token (intentionally bypassing type check for negative test)
      const gap = 'size-999' as unknown as DimensionValue;
      const { container } = render(
        <TwoColumnLayout
          gap={gap}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      // Invalid token should pass through unchanged (graceful degradation)
      expect(flexContainer.style.gap).toBe('size-999');
    });
  });

  describe('Layout Structure', () => {
    it('should render two-column flex layout with correct structure', () => {
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div data-testid="left">Left</div>}
          rightContent={<div data-testid="right">Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
      const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

      // Parent container is flex for horizontal layout
      expect(flexContainer.style.display).toBe('flex');

      // Left column is plain block container (not flex) to match SingleColumnLayout
      // This ensures consistent content spacing across all wizard steps
      expect(leftColumn.style.display).toBe('');
      expect(leftColumn.style.flexDirection).toBe('');

      // Right column is flexible to fill remaining space
      // Flex value may be '1' or '1 1 0%' depending on browser normalization
      expect(rightColumn.style.flex).toMatch(/^1/);
    });

    it('should constrain left column with maxWidth', () => {
      const { container } = render(
        <TwoColumnLayout
          leftMaxWidth="800px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.maxWidth).toBe('800px');
    });
  });
});
