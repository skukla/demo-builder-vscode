/**
 * PageHeader Component Tests
 *
 * PageHeader is the app's single, canonical page header: one tight single row
 * ([back?] title · subtitle crumb … [action]) with an optional secondary line for a
 * description/status. The reclaimed density is the DEFAULT (there is no "compact"
 * mode) — the left rail / page context owns wayfinding, so the header stays short.
 *
 * Used by: WizardContainer, ProjectsDashboard, ProjectDashboardScreen, AiOverviewScreen,
 * ConfigureScreen.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme, Button } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';

const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('PageHeader', () => {
    describe('title rendering', () => {
        it('should render title as the H1 heading', () => {
            renderWithProvider(<PageHeader title="Test Title" />);

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Title');
        });

        it('should render different title values', () => {
            renderWithProvider(<PageHeader title="Your Projects" />);

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your Projects');
        });
    });

    describe('subtitle rendering', () => {
        it('should render the subtitle as an inline crumb (text, not a heading)', () => {
            renderWithProvider(
                <PageHeader title="Main Title" subtitle="Build Your Project" />
            );

            // Subtitle text is present…
            expect(screen.getByText('Build Your Project')).toBeInTheDocument();
            // …but it is a crumb, NOT an H3 heading (single-row treatment).
            expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
        });

        it('should not render subtitle text when not provided', () => {
            renderWithProvider(<PageHeader title="Title Only" subtitle={undefined} />);

            expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
            expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
        });
    });

    describe('description / status (optional secondary line)', () => {
        it('should render the description when provided', () => {
            renderWithProvider(
                <PageHeader title="Title" description="Configure everything here" />
            );

            expect(screen.getByText('Configure everything here')).toBeInTheDocument();
        });

        it('should not render a description when not provided', () => {
            renderWithProvider(<PageHeader title="Title" />);

            expect(screen.queryByText('Configure everything here')).not.toBeInTheDocument();
        });

        it('should render statusText when provided', () => {
            renderWithProvider(<PageHeader title="Title" statusText="Deploying…" />);

            expect(screen.getByText('Deploying…')).toBeInTheDocument();
        });
    });

    describe('action rendering', () => {
        it('should render an action element when provided', () => {
            renderWithProvider(
                <PageHeader title="Page Title" action={<Button variant="accent">New</Button>} />
            );

            expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        });

        it('should render any React node as action', () => {
            renderWithProvider(
                <PageHeader
                    title="Page Title"
                    action={<span data-testid="custom-action">Custom Action</span>}
                />
            );

            expect(screen.getByTestId('custom-action')).toBeInTheDocument();
        });

        it('should not render any button when neither action nor back button provided', () => {
            const { container } = renderWithProvider(<PageHeader title="Title Only" />);

            expect(container.querySelectorAll('button')).toHaveLength(0);
        });
    });

    describe('back button rendering', () => {
        it('should render the back button when provided', () => {
            renderWithProvider(
                <PageHeader title="Page Title" backButton={{ label: 'Back', onPress: jest.fn() }} />
            );

            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
        });

        it('should call onPress when the back button is clicked', () => {
            const onPress = jest.fn();
            renderWithProvider(
                <PageHeader title="Page Title" backButton={{ label: 'Go Back', onPress }} />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));

            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('should not render a back button when not provided', () => {
            renderWithProvider(<PageHeader title="Title Only" />);

            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });

    describe('width constraint', () => {
        it('should wrap content in page-container when constrainWidth is true', () => {
            const { container } = renderWithProvider(
                <PageHeader title="Page Title" constrainWidth />
            );

            expect(container.querySelector('.page-container')).toBeInTheDocument();
        });

        it('should not wrap content by default', () => {
            const { container } = renderWithProvider(<PageHeader title="Page Title" />);

            expect(container.querySelector('.page-container')).not.toBeInTheDocument();
        });
    });

    describe('styling', () => {
        it('should apply the border-b, bg-gray-75, and page-header classes', () => {
            const { container } = renderWithProvider(<PageHeader title="Page Title" />);

            expect(container.querySelector('.border-b.bg-gray-75.page-header')).toBeInTheDocument();
        });

        it('should apply a custom className when provided', () => {
            const { container } = renderWithProvider(
                <PageHeader title="Page Title" className="custom-class" />
            );

            expect(container.querySelector('.custom-class')).toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('should expose a single H1 and no H3 (single-row header)', () => {
            renderWithProvider(<PageHeader title="Main Title" subtitle="Subtitle" />);

            const headings = screen.getAllByRole('heading');
            expect(headings).toHaveLength(1);
            expect(headings[0].tagName).toBe('H1');
        });

        it('should keep buttons accessible', () => {
            renderWithProvider(
                <PageHeader
                    title="Title"
                    backButton={{ label: 'Back', onPress: jest.fn() }}
                    action={<Button variant="accent">Action</Button>}
                />
            );

            screen.getAllByRole('button').forEach(button => {
                expect(button).not.toHaveAttribute('aria-hidden', 'true');
            });
        });
    });

    describe('combined features', () => {
        it('should render title, subtitle crumb, back button, and action together', () => {
            renderWithProvider(
                <PageHeader
                    title="Your Projects"
                    subtitle="Manage a project"
                    backButton={{ label: 'Back', onPress: jest.fn() }}
                    action={<Button variant="accent">New</Button>}
                />
            );

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your Projects');
            expect(screen.getByText('Manage a project')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        });
    });
});
