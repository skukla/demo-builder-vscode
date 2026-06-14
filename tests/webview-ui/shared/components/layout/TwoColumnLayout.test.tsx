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

      // SOP §11: Static styles now use utility classes instead of inline styles
      // Parent container uses flex utility classes for horizontal layout
      expect(flexContainer).toHaveClass('flex');
      expect(flexContainer).toHaveClass('flex-1');
      expect(flexContainer).toHaveClass('min-h-0');
      expect(flexContainer).toHaveClass('items-stretch');

      // Both columns use flex utility classes for proper scrolling of children
      expect(leftColumn).toHaveClass('flex');
      expect(leftColumn).toHaveClass('flex-column');
      expect(leftColumn).toHaveClass('overflow-hidden');

      // Right column uses flex utility classes to fill remaining space
      expect(rightColumn).toHaveClass('flex-1');
      expect(rightColumn).toHaveClass('flex');
      expect(rightColumn).toHaveClass('flex-column');
      expect(rightColumn).toHaveClass('overflow-hidden');
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

    it('should tag container and columns with responsive class hooks', () => {
      // These class names are the targets for the narrow-viewport media
      // queries in custom-spectrum.css. If they change, the stacking and
      // rail-collapse styles no longer fire.
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
      const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

      expect(flexContainer).toHaveClass('two-column-layout');
      expect(leftColumn).toHaveClass('two-column-layout-left');
      expect(rightColumn).toHaveClass('two-column-layout-right');
    });
  });

  describe('Right Column Min-Width', () => {
    it('defaults right column min-width to 300px', () => {
      // Floors the summary panel so the left column gives up space first
      // (max-width: 800px). Without this, the right column would shrink
      // past readability before the left would.
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.minWidth).toBe('300px');
    });

    it('honors a pixel rightMinWidth override', () => {
      const { container } = render(
        <TwoColumnLayout
          rightMinWidth="400px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.minWidth).toBe('400px');
    });

    it('translates a Spectrum-token rightMinWidth', () => {
      // size-600 -> 48px via spectrumTokens translation. Verifies that
      // rightMinWidth participates in the same token pipeline as gap /
      // padding / leftMaxWidth.
      const rightMinWidth: DimensionValue = 'size-600';
      const { container } = render(
        <TwoColumnLayout
          rightMinWidth={rightMinWidth}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.minWidth).toBe('48px');
    });
  });
});
