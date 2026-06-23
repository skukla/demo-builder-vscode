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

  describe('Container max-width + centering', () => {
    it('caps the flex container at the default max-width (1200px)', () => {
      // The container caps the left+right pair so the summary gets enough room
      // but never dominates, and the pair does not stretch edge-to-edge on a
      // fullscreen monitor.
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.maxWidth).toBe('1200px');
    });

    it('centers the flex container with margin auto', () => {
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.margin).toBe('0px auto');
    });

    it('honors a pixel maxWidth override on the container', () => {
      const { container } = render(
        <TwoColumnLayout
          maxWidth="1000px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.maxWidth).toBe('1000px');
    });

    it('translates a Spectrum-token maxWidth (size-6000 -> 480px)', () => {
      const maxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <TwoColumnLayout
          maxWidth={maxWidth}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.maxWidth).toBe('480px');
    });

    it('allows opting out of the cap with maxWidth="none"', () => {
      const { container } = render(
        <TwoColumnLayout
          maxWidth="none"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.maxWidth).toBe('none');
    });

    it('keeps the capped-primary left column (maxWidth, no fixed width)', () => {
      const { container } = render(
        <TwoColumnLayout
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.maxWidth).toBe('800px');
      expect(leftColumn.style.width).toBe('');
      expect(leftColumn.style.flex).toBe('');
    });
  });

  describe('Fixed-width right column (rightWidth)', () => {
    it('pins the right column to a fixed flex/width when rightWidth is set', () => {
      // rightWidth makes the summary a fixed-width sidebar (no flex-grow) so the
      // left content column takes the majority of the width.
      const { container } = render(
        <TwoColumnLayout
          rightWidth="320px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.flex).toBe('0 0 320px');
      expect(rightColumn.style.width).toBe('320px');
    });

    it('drops the flex-1 grow class from the right column when rightWidth is set', () => {
      const { container } = render(
        <TwoColumnLayout
          rightWidth="320px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn).not.toHaveClass('flex-1');
      // Keeps its structural class hook for the responsive query.
      expect(rightColumn).toHaveClass('two-column-layout-right');
    });

    it('makes the left column the flexible majority when rightWidth is set', () => {
      const { container } = render(
        <TwoColumnLayout
          rightWidth="320px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      // jsdom normalizes the unitless flex-basis to '0px' but keeps min-width '0'.
      expect(leftColumn.style.flex).toBe('1 1 0px');
      expect(leftColumn.style.minWidth).toBe('0');
    });

    it('drops the left maxWidth cap when rightWidth is set', () => {
      // When the right column is fixed, the left column must grow to fill the
      // remaining space; the readability cap would defeat that.
      const { container } = render(
        <TwoColumnLayout
          rightWidth="320px"
          leftMaxWidth="800px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.maxWidth).toBe('');
    });

    it('translates a Spectrum-token rightWidth (size-4000 -> 320px)', () => {
      const rightWidth: DimensionValue = 'size-4000';
      const { container } = render(
        <TwoColumnLayout
          rightWidth={rightWidth}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.flex).toBe('0 0 320px');
      expect(rightColumn.style.width).toBe('320px');
    });

    it('keeps the existing flexible behavior when rightWidth is omitted', () => {
      // No regression: right column stays flex-1 grow + min-width floor, left
      // column stays capped by leftMaxWidth with no fixed flex/width.
      const { container } = render(
        <TwoColumnLayout
          leftMaxWidth="800px"
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;

      expect(rightColumn).toHaveClass('flex-1');
      expect(rightColumn.style.flex).toBe('');
      expect(rightColumn.style.width).toBe('');
      expect(leftColumn.style.maxWidth).toBe('800px');
      expect(leftColumn.style.flex).toBe('');
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
