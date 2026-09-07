/**
 * DashboardStatusHeader — the decisions the masthead band makes.
 *
 * The band is purely presentational, so every decision it owns is about WHICH
 * props reach StatusCard: whether the IMS Org badge exists at all, and whether
 * either badge carries a remediation action. Those are argument decisions, so
 * StatusCard is replaced by a recorder that captures the exact props it was
 * handed — a rendered link cannot tell `action={{}}` from the real object, and
 * both remediations are object literals.
 *
 * Its sibling `DashboardStatusHeader-layout.test.ts` pins the STYLESHEET, since
 * jsdom resolves no layout; this one drives the component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    DashboardStatusHeader,
    type DashboardStatusHeaderProps,
} from '@/features/dashboard/ui/components/DashboardStatusHeader';
import type { StatusCardProps } from '@/core/ui/components/feedback/StatusCard';
import type { AiReadyState, OrgCheckState } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import '@testing-library/jest-dom';

/** Every props object StatusCard was rendered with, in render order. */
const statusCardProps: StatusCardProps[] = [];

jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children, flex: _flex, ...props }: any) => (
        <div data-testid="view" {...props}>
            {children}
        </div>
    ),
    Flex: ({ children, alignItems, gap, ...props }: any) => (
        <div data-testid="flex" data-align={alignItems} data-gap={gap} {...props}>
            {children}
        </div>
    ),
    Button: ({ children, onPress, variant, isDisabled, ...props }: any) => (
        <button onClick={onPress} data-variant={variant} disabled={isDisabled} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, isQuiet, UNSAFE_className, ...props }: any) => (
        <span
            role="link"
            tabIndex={0}
            onClick={onPress}
            data-quiet={String(Boolean(isQuiet))}
            className={UNSAFE_className}
            {...props}
        >
            {children}
        </span>
    ),
}));

jest.mock('@/core/ui/components/feedback/StatusCard', () => ({
    StatusCard: (props: any) => {
        statusCardProps.push(props);
        return (
            <div data-testid={`status-card-${props.label}`}>
                <span>{props.status}</span>
                {props.action && (
                    <button data-testid={props.action.testId} onClick={props.action.onPress}>
                        {props.action.label}
                    </button>
                )}
            </div>
        );
    },
}));

const AI_READY: AiReadyState = { label: 'AI', color: 'green', text: 'Ready' };

function makeProps(
    overrides: Partial<DashboardStatusHeaderProps> = {}
): DashboardStatusHeaderProps {
    return {
        aiReady: AI_READY,
        imsOrgDisplay: { color: 'green', text: 'Adobe Demo System' },
        orgCheckState: 'ok',
        onReAuthenticate: jest.fn(),
        onRegenerateAi: jest.fn(),
        onViewCapabilities: jest.fn(),
        onNavigateBack: jest.fn(),
        ...overrides,
    };
}

/** The props StatusCard received for one badge, or undefined when it never rendered. */
function cardFor(label: string): StatusCardProps | undefined {
    return statusCardProps.find((p) => p.label === label);
}

function setupUser(): ReturnType<typeof userEvent.setup> {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

beforeEach(() => {
    statusCardProps.length = 0;
    jest.clearAllMocks();
});

describe('DashboardStatusHeader — the IMS Org badge', () => {
    it('hands StatusCard the org display, small and badge-classed', () => {
        render(<DashboardStatusHeader {...makeProps()} />);

        expect(cardFor('IMS Org')).toEqual(
            expect.objectContaining({
                label: 'IMS Org',
                status: 'Adobe Demo System',
                color: 'green',
                size: 'S',
                className: 'dashboard-status-badge',
            })
        );
    });

    it('passes the display COLOR through rather than a fixed one', () => {
        render(
            <DashboardStatusHeader
                {...makeProps({ imsOrgDisplay: { color: 'red', text: 'Wrong org' } })}
            />
        );

        expect(cardFor('IMS Org')).toEqual(
            expect.objectContaining({ color: 'red', status: 'Wrong org' })
        );
    });

    it('renders NO org badge when the project has no org display', () => {
        render(<DashboardStatusHeader {...makeProps({ imsOrgDisplay: null })} />);

        expect(cardFor('IMS Org')).toBeUndefined();
        expect(screen.queryByTestId('status-card-IMS Org')).not.toBeInTheDocument();
        // The AI badge is unconditional, so the band is not simply empty.
        expect(cardFor('AI')).toBeDefined();
    });
});

describe('DashboardStatusHeader — the org "Sign in to check" remediation', () => {
    it('offers it when the check could not run, wired to onReAuthenticate', async () => {
        const user = setupUser();
        const props = makeProps({ orgCheckState: 'unknown' });
        render(<DashboardStatusHeader {...props} />);

        expect(cardFor('IMS Org')?.action).toEqual({
            label: 'Sign in to check',
            onPress: props.onReAuthenticate,
        });

        await user.click(screen.getByText('Sign in to check'));
        expect(props.onReAuthenticate).toHaveBeenCalledTimes(1);
        expect(props.onRegenerateAi).not.toHaveBeenCalled();
    });

    it.each<OrgCheckState>(['ok', 'checking', 'mismatch', 'none'])(
        'offers NO action while the check state is %s',
        (orgCheckState) => {
            render(<DashboardStatusHeader {...makeProps({ orgCheckState })} />);

            expect(cardFor('IMS Org')?.action).toBeUndefined();
            expect(screen.queryByText('Sign in to check')).not.toBeInTheDocument();
        }
    );
});

describe('DashboardStatusHeader — the AI badge', () => {
    it('hands StatusCard the AI state verbatim', () => {
        render(
            <DashboardStatusHeader
                {...makeProps({ aiReady: { label: 'AI', color: 'blue', text: 'Verifying' } })}
            />
        );

        expect(cardFor('AI')).toEqual(
            expect.objectContaining({
                label: 'AI',
                status: 'Verifying',
                color: 'blue',
                size: 'S',
                className: 'dashboard-status-badge',
            })
        );
    });

    it('sits in the row the capabilities link is aligned under', () => {
        const { container } = render(<DashboardStatusHeader {...makeProps()} />);

        const row = container.querySelector('[data-testid="ai-status-row"]');
        expect(row).not.toBeNull();
        expect(row).toContainElement(screen.getByTestId('status-card-AI'));
    });
});

describe('DashboardStatusHeader — the AI "Regenerate AI files" remediation', () => {
    it.each<AiReadyState['color']>(['red', 'yellow'])(
        'offers it when the AI badge is %s, wired to onRegenerateAi',
        async (color) => {
            const user = setupUser();
            const props = makeProps({ aiReady: { label: 'AI', color, text: 'Broken' } });
            render(<DashboardStatusHeader {...props} />);

            expect(cardFor('AI')?.action).toEqual({
                label: 'Regenerate AI files',
                onPress: props.onRegenerateAi,
                testId: 'ai-regenerate-trigger',
            });

            await user.click(screen.getByTestId('ai-regenerate-trigger'));
            expect(props.onRegenerateAi).toHaveBeenCalledTimes(1);
            expect(props.onReAuthenticate).not.toHaveBeenCalled();
        }
    );

    it.each<AiReadyState['color']>(['green', 'blue', 'gray'])(
        'offers NOTHING when the AI badge is %s',
        (color) => {
            render(
                <DashboardStatusHeader
                    {...makeProps({ aiReady: { label: 'AI', color, text: 'Ready' } })}
                />
            );

            expect(cardFor('AI')?.action).toBeUndefined();
            expect(screen.queryByTestId('ai-regenerate-trigger')).not.toBeInTheDocument();
            expect(screen.queryByText('Regenerate AI files')).not.toBeInTheDocument();
        }
    );

    it('is decided per badge — a red AI badge does not give the org one an action', () => {
        render(
            <DashboardStatusHeader
                {...makeProps({
                    aiReady: { label: 'AI', color: 'red', text: 'Broken' },
                    orgCheckState: 'ok',
                })}
            />
        );

        expect(cardFor('AI')?.action).toBeDefined();
        expect(cardFor('IMS Org')?.action).toBeUndefined();
    });
});

describe('DashboardStatusHeader — the navigation affordances', () => {
    it('opens the capability catalogue from its own quiet link', async () => {
        const user = setupUser();
        const props = makeProps();
        render(<DashboardStatusHeader {...props} />);

        const link = screen.getByTestId('ai-view-capabilities-trigger');
        expect(link).toHaveTextContent('View AI Capabilities');
        expect(link).toHaveAttribute('data-quiet', 'true');
        expect(link).toHaveClass('dashboard-status-capabilities-link', 'cursor-pointer');

        await user.click(link);
        expect(props.onViewCapabilities).toHaveBeenCalledTimes(1);
        expect(props.onNavigateBack).not.toHaveBeenCalled();
    });

    it('navigates back to the projects list from the secondary button', async () => {
        const user = setupUser();
        const props = makeProps();
        render(<DashboardStatusHeader {...props} />);

        const button = screen.getByRole('button', { name: 'All Projects' });
        expect(button).toHaveAttribute('data-variant', 'secondary');

        await user.click(button);
        expect(props.onNavigateBack).toHaveBeenCalledTimes(1);
        expect(props.onViewCapabilities).not.toHaveBeenCalled();
    });
});

describe('DashboardStatusHeader — the band structure the stylesheet targets', () => {
    it('nests the classed wrappers the CSS pins, badges innermost', () => {
        const { container } = render(<DashboardStatusHeader {...makeProps()} />);

        const badges = container.querySelector(
            '.dashboard-status-header' +
                ' > .page-container-padded.page-header-section' +
                ' > .dashboard-status-content' +
                ' [data-testid="flex"] .dashboard-status-grid > .dashboard-status-badges'
        );
        expect(badges).not.toBeNull();
        expect(badges).toContainElement(screen.getByTestId('status-card-IMS Org'));
        expect(badges).toContainElement(screen.getByTestId('ai-view-capabilities-trigger'));
    });

    it('centres the band and spaces the status column from the button', () => {
        const flex = render(<DashboardStatusHeader {...makeProps()} />).getByTestId('flex');

        expect(flex).toHaveAttribute('data-align', 'center');
        expect(flex).toHaveAttribute('data-gap', 'size-300');
    });
});
