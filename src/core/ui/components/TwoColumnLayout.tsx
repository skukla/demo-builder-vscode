import React from 'react';

export interface TwoColumnLayoutProps {
    /** Content for the left column (main content area) */
    leftContent: React.ReactNode;
    /** Content for the right column (sidebar/summary) */
    rightContent: React.ReactNode;
    /** Maximum width of left column (default: '800px') */
    leftMaxWidth?: string;
    /** Left column padding (default: '24px') */
    leftPadding?: string;
    /** Right column padding (default: '24px') */
    rightPadding?: string;
    /** Right column background color (default: spectrum gray-75) */
    rightBackgroundColor?: string;
    /** Whether to show border between columns (default: true) */
    showBorder?: boolean;
    /** Gap between columns (default: '0') */
    gap?: string;
    /** Additional className for container */
    className?: string;
}

/**
 * Template Component: TwoColumnLayout
 *
 * Provides a consistent two-column layout pattern used across wizard steps
 * and configuration screens. Left column is constrained to 800px for
 * readability, right column is flexible.
 *
 * Used in:
 * - AdobeProjectStep (selection + summary)
 * - AdobeWorkspaceStep (selection + summary)
 * - ConfigureScreen (form + summary)
 *
 * @example
 * ```tsx
 * <TwoColumnLayout
 *   leftContent={<ProjectList />}
 *   rightContent={<ConfigurationSummary />}
 * />
 * ```
 */
export const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({
    leftContent,
    rightContent,
    leftMaxWidth = '800px',
    leftPadding = '24px',
    rightPadding = '24px',
    rightBackgroundColor = 'var(--spectrum-global-color-gray-75)',
    showBorder = true,
    gap = '0',
    className
}) => {
    return (
        <div
            style={{
                display: 'flex',
                height: '100%',
                width: '100%',
                gap
            }}
            className={className}
        >
            {/* Left Column: Main Content (constrained width) */}
            <div
                style={{
                    maxWidth: leftMaxWidth,
                    width: '100%',
                    padding: leftPadding,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0 // Prevent flex shrinking issues
                }}
            >
                {leftContent}
            </div>

            {/* Right Column: Sidebar/Summary (flexible width) */}
            <div
                style={{
                    flex: '1',
                    padding: rightPadding,
                    backgroundColor: rightBackgroundColor,
                    borderLeft: showBorder
                        ? '1px solid var(--spectrum-global-color-gray-200)'
                        : undefined
                }}
            >
                {rightContent}
            </div>
        </div>
    );
};
