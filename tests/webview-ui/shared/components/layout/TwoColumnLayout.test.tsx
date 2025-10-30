import React from 'react';
import { render } from '@testing-library/react';
import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';

describe('TwoColumnLayout', () => {
  describe('Token Translation', () => {
    it('should translate gap token size-300 to 24px', () => {
      const { container } = render(
        <TwoColumnLayout
          gap={'size-300' as any}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const flexContainer = container.firstChild as HTMLDivElement;
      expect(flexContainer.style.gap).toBe('24px');
    });

    it('should translate leftPadding token size-200 to 16px', () => {
      const { container } = render(
        <TwoColumnLayout
          leftPadding={'size-200' as any}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.padding).toBe('16px');
    });

    it('should translate rightPadding token size-400 to 32px', () => {
      const { container } = render(
        <TwoColumnLayout
          rightPadding={'size-400' as any}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
      expect(rightColumn.style.padding).toBe('32px');
    });

    it('should translate leftMaxWidth token size-6000 to 480px', () => {
      const { container } = render(
        <TwoColumnLayout
          leftMaxWidth={'size-6000' as any}
          leftContent={<div>Left</div>}
          rightContent={<div>Right</div>}
        />
      );
      const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
      expect(leftColumn.style.maxWidth).toBe('480px');
    });

    it('should translate multiple token props simultaneously', () => {
      const { container } = render(
        <TwoColumnLayout
          gap={'size-300' as any}
          leftPadding={'size-200' as any}
          rightPadding={'size-400' as any}
          leftMaxWidth={'size-6000' as any}
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
      const { container } = render(
        <TwoColumnLayout
          gap={'size-300' as any}
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
      const { container } = render(
        <TwoColumnLayout
          leftPadding={24 as any}
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
      const { container } = render(
        <TwoColumnLayout
          gap={'size-999' as any}
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

      expect(flexContainer.style.display).toBe('flex');
      expect(leftColumn.style.display).toBe('flex');
      expect(leftColumn.style.flexDirection).toBe('column');
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
