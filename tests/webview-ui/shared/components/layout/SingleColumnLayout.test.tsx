import React from 'react';
import { render } from '@testing-library/react';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import type { DimensionValue } from '@/core/ui/utils/spectrumTokens';

describe('SingleColumnLayout', () => {
  describe('Token Translation', () => {
    it('should translate padding token size-300 to 24px', () => {
      const padding: DimensionValue = 'size-300';
      const { container } = render(
        <SingleColumnLayout padding={padding}>
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      expect(contentColumn.style.padding).toBe('24px');
    });

    it('should translate maxWidth token size-6000 to 480px', () => {
      const maxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <SingleColumnLayout maxWidth={maxWidth}>
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      expect(contentColumn.style.maxWidth).toBe('480px');
    });

    it('should translate multiple token props simultaneously', () => {
      const padding: DimensionValue = 'size-200';
      const maxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <SingleColumnLayout padding={padding} maxWidth={maxWidth}>
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;

      expect(contentColumn.style.padding).toBe('16px');
      expect(contentColumn.style.maxWidth).toBe('480px');
    });

    it('should handle mixed token and pixel values', () => {
      const maxWidth: DimensionValue = 'size-6000';
      const { container } = render(
        <SingleColumnLayout maxWidth={maxWidth} padding="32px">
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;

      expect(contentColumn.style.maxWidth).toBe('480px');
      expect(contentColumn.style.padding).toBe('32px');
    });
  });

  describe('Backward Compatibility', () => {
    it('should pass through numeric padding values as pixels', () => {
      const padding: DimensionValue = 24;
      const { container } = render(
        <SingleColumnLayout padding={padding}>
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      expect(contentColumn.style.padding).toBe('24px');
    });

    it('should pass through pixel string values unchanged', () => {
      const { container } = render(
        <SingleColumnLayout padding="16px">
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      expect(contentColumn.style.padding).toBe('16px');
    });

    it('should use default values when props undefined', () => {
      const { container } = render(
        <SingleColumnLayout>
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;

      expect(contentColumn.style.padding).toBe('24px');
      expect(contentColumn.style.maxWidth).toBe('800px');
      expect(contentColumn.style.margin).toBe('0px');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid token gracefully', () => {
      // Testing invalid token (intentionally bypassing type check for negative test)
      const maxWidth = 'size-999' as unknown as DimensionValue;
      const { container } = render(
        <SingleColumnLayout maxWidth={maxWidth}>
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      // Invalid token should pass through to CSS unchanged (browser handles validation)
      // maxWidth accepts any string value, so invalid tokens pass through
      expect(contentColumn.style.maxWidth).toBe('size-999');
    });
  });

  describe('Layout Structure', () => {
    it('should render single-column layout with correct structure', () => {
      const { container } = render(
        <SingleColumnLayout>
          <div data-testid="content">Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;

      expect(contentColumn.style.maxWidth).toBe('800px');
      expect(contentColumn.style.width).toBe('100%');
      expect(contentColumn.style.margin).toBe('0px');
      expect(contentColumn.style.padding).toBe('24px');
    });

    it('should constrain column with maxWidth', () => {
      const { container } = render(
        <SingleColumnLayout maxWidth="600px">
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      expect(contentColumn.style.maxWidth).toBe('600px');
    });

    it('should render children correctly', () => {
      const { getByTestId } = render(
        <SingleColumnLayout>
          <div data-testid="child1">Child 1</div>
          <div data-testid="child2">Child 2</div>
        </SingleColumnLayout>
      );

      expect(getByTestId('child1')).toBeInTheDocument();
      expect(getByTestId('child2')).toBeInTheDocument();
    });

    it('should apply custom className when provided', () => {
      const { container } = render(
        <SingleColumnLayout className="custom-class">
          <div>Content</div>
        </SingleColumnLayout>
      );
      const contentColumn = container.firstChild as HTMLDivElement;
      expect(contentColumn.className).toBe('custom-class');
    });
  });
});
