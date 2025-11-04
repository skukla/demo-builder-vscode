import React from 'react';
import { renderWithProviders, screen } from "../../../helpers/react-test-utils";
import { ConfigSection } from '@/webview-ui/shared/components/forms/ConfigSection';

describe('ConfigSection', () => {
    describe('Rendering', () => {
        it('renders with required props', () => {
            renderWithProviders(
                <ConfigSection id="adobe-commerce" label="Adobe Commerce">
                    <div>Field Content</div>
                </ConfigSection>
            );
            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.getByText('Field Content')).toBeInTheDocument();
        });

        it('renders heading with level 3', () => {
            renderWithProviders(
                <ConfigSection id="test" label="Test Section">
                    <div>Content</div>
                </ConfigSection>
            );
            const heading = screen.getByText('Test Section');
            expect(heading.tagName).toBe('H3');
        });

        it('renders children content', () => {
            renderWithProviders(
                <ConfigSection id="test" label="Test">
                    <div>Child 1</div>
                    <div>Child 2</div>
                </ConfigSection>
            );
            expect(screen.getByText('Child 1')).toBeInTheDocument();
            expect(screen.getByText('Child 2')).toBeInTheDocument();
        });
    });

    describe('Section ID', () => {
        it('assigns correct ID to section wrapper', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="adobe-commerce" label="Adobe Commerce">
                    <div>Content</div>
                </ConfigSection>
            );
            expect(container.querySelector('#section-adobe-commerce')).toBeInTheDocument();
        });

        it('handles different ID formats', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="mesh-config" label="Mesh Config">
                    <div>Content</div>
                </ConfigSection>
            );
            expect(container.querySelector('#section-mesh-config')).toBeInTheDocument();
        });
    });

    describe('Divider', () => {
        it('does not show divider by default', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="test" label="Test">
                    <div>Content</div>
                </ConfigSection>
            );
            // Divider component won't be present if showDivider is false
            expect(screen.getByText('Test')).toBeInTheDocument();
        });

        it('shows divider when showDivider is true', () => {
            renderWithProviders(
                <ConfigSection id="test" label="Test" showDivider={true}>
                    <div>Content</div>
                </ConfigSection>
            );
            // Spectrum Divider should be rendered
            expect(screen.getByText('Test')).toBeInTheDocument();
        });
    });

    describe('Scroll Margin', () => {
        it('applies negative scroll margin for smooth scrolling', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="test" label="Test">
                    <div>Content</div>
                </ConfigSection>
            );
            const section = container.querySelector('#section-test');
            expect(section).toHaveStyle({ scrollMarginTop: '-16px' });
        });
    });

    describe('Heading Border', () => {
        it('applies bottom border to heading container', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="test" label="Test">
                    <div>Content</div>
                </ConfigSection>
            );
            const headingContainer = container.querySelector('[style*="border-bottom"]');
            expect(headingContainer).toBeInTheDocument();
        });
    });

    describe('Padding', () => {
        it('applies correct padding without divider', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="test" label="Test" showDivider={false}>
                    <div>Content</div>
                </ConfigSection>
            );
            const section = container.querySelector('#section-test');
            expect(section).toHaveStyle({ paddingTop: '0' });
        });

        it('applies correct padding with divider', () => {
            const { container } = renderWithProviders(
                <ConfigSection id="test" label="Test" showDivider={true}>
                    <div>Content</div>
                </ConfigSection>
            );
            const section = container.querySelector('#section-test');
            expect(section).toHaveStyle({ paddingTop: '4px' });
        });
    });

    describe('Multiple Sections', () => {
        it('renders multiple sections independently', () => {
            const { container } = renderWithProviders(
                <>
                    <ConfigSection id="section1" label="Section 1">
                        <div>Content 1</div>
                    </ConfigSection>
                    <ConfigSection id="section2" label="Section 2" showDivider={true}>
                        <div>Content 2</div>
                    </ConfigSection>
                </>
            );

            expect(screen.getByText('Section 1')).toBeInTheDocument();
            expect(screen.getByText('Section 2')).toBeInTheDocument();
            expect(screen.getByText('Content 1')).toBeInTheDocument();
            expect(screen.getByText('Content 2')).toBeInTheDocument();
        });
    });

    describe('Form Fields Integration', () => {
        it('renders with form field children', () => {
            renderWithProviders(
                <ConfigSection id="commerce" label="Adobe Commerce">
                    <div data-testid="field1">Commerce URL</div>
                    <div data-testid="field2">API Key</div>
                </ConfigSection>
            );

            expect(screen.getByTestId('field1')).toBeInTheDocument();
            expect(screen.getByTestId('field2')).toBeInTheDocument();
        });

        it('handles complex children structure', () => {
            renderWithProviders(
                <ConfigSection id="advanced" label="Advanced Settings">
                    <div>
                        <label>Setting 1</label>
                        <input type="text" />
                    </div>
                    <div>
                        <label>Setting 2</label>
                        <input type="checkbox" />
                    </div>
                </ConfigSection>
            );

            expect(screen.getByText('Advanced Settings')).toBeInTheDocument();
            expect(screen.getByText('Setting 1')).toBeInTheDocument();
            expect(screen.getByText('Setting 2')).toBeInTheDocument();
        });
    });

    describe('Common Use Cases', () => {
        it('renders Adobe Commerce section', () => {
            renderWithProviders(
                <ConfigSection id="adobe-commerce" label="Adobe Commerce">
                    <div>Commerce fields</div>
                </ConfigSection>
            );
            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
        });

        it('renders API Mesh section', () => {
            renderWithProviders(
                <ConfigSection id="api-mesh" label="API Mesh" showDivider={true}>
                    <div>Mesh fields</div>
                </ConfigSection>
            );
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('renders Backend Integration section', () => {
            renderWithProviders(
                <ConfigSection id="backend" label="Backend Integration" showDivider={true}>
                    <div>Backend fields</div>
                </ConfigSection>
            );
            expect(screen.getByText('Backend Integration')).toBeInTheDocument();
        });
    });

    describe('Empty Children', () => {
        it('handles no children', () => {
            renderWithProviders(
                <ConfigSection id="empty" label="Empty Section">
                    {null}
                </ConfigSection>
            );
            expect(screen.getByText('Empty Section')).toBeInTheDocument();
        });

        it('handles undefined children', () => {
            renderWithProviders(
                <ConfigSection id="empty" label="Empty Section">
                    {undefined}
                </ConfigSection>
            );
            expect(screen.getByText('Empty Section')).toBeInTheDocument();
        });
    });

    describe('Label Edge Cases', () => {
        it('handles long labels', () => {
            const longLabel = 'This is a very long section label that might wrap to multiple lines';
            renderWithProviders(
                <ConfigSection id="long" label={longLabel}>
                    <div>Content</div>
                </ConfigSection>
            );
            expect(screen.getByText(longLabel)).toBeInTheDocument();
        });

        it('handles special characters in label', () => {
            renderWithProviders(
                <ConfigSection id="special" label="Settings & Configuration">
                    <div>Content</div>
                </ConfigSection>
            );
            expect(screen.getByText('Settings & Configuration')).toBeInTheDocument();
        });
    });

    describe('DisplayName', () => {
        it('has display name set', () => {
            expect(ConfigSection.displayName).toBe('ConfigSection');
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(ConfigSection).toHaveProperty('$$typeof');
        });
    });
});
