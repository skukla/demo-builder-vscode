/**
 * Shared test utilities for ProjectDashboardScreen tests
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ProjectDashboardScreen } from '@/features/dashboard/ui/ProjectDashboardScreen';
import '@testing-library/jest-dom';

// Mock the webview-ui utilities and hooks
jest.mock('@/core/ui/hooks/useFocusTrap', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useTimerCleanup', () => ({
    useSingleTimer: jest.fn(() => ({
        ref: { current: null },
        set: jest.fn(),
        clear: jest.fn(),
    })),
}));

// Mock the WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()), // Return unsubscribe function
        request: jest.fn(() => new Promise(() => {})), // Never resolve by default
    },
}));

// Mock layout components
jest.mock('@/core/ui/components/layout/ControlPanelLayout', () => ({
    ControlPanelLayout: ({ masthead, primary, secondary }: any) => (
        <div data-testid="control-panel">
            <div data-testid="control-panel-masthead">{masthead}</div>
            <div data-testid="control-panel-primary">{primary}</div>
            {secondary && <div data-testid="control-panel-secondary">{secondary}</div>}
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/GridLayout', () => ({
    GridLayout: ({ children }: any) => <div data-testid="grid-layout">{children}</div>,
}));

jest.mock('@/core/ui/components/layout/PageHeader', () => ({
    PageHeader: ({ title, subtitle }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/PageLayout', () => ({
    PageLayout: ({ header, children }: any) => (
        <div data-testid="page-layout">
            <div data-testid="page-layout-header">{header}</div>
            <div data-testid="page-layout-content">{children}</div>
        </div>
    ),
}));

// Mock feedback components
jest.mock('@/core/ui/components/feedback/InlineNotice', () => ({
    // OrgContextNotice now renders through the shared InlineNotice (extracted
    // 2026-08-20). Stubbed to its structure — title, body, optional hint and
    // action — so the suite keeps asserting on CONTENT rather than on the
    // banner's markup.
    InlineNotice: ({ title, children, hint, action, testId }: any) => (
        <div data-testid={testId}>
            <span>{title}</span>
            <span>{children}</span>
            {hint && <span>{hint}</span>}
            {action}
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback/StatusCard', () => ({
    StatusCard: ({ label, status, color, action }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>
            {label}: {status}
            {action && (
                <a data-testid={action.testId} onClick={action.onPress}>
                    {action.label}
                </a>
            )}
        </div>
    ),
}));

// Mock dashboard predicates
jest.mock('@/features/dashboard/ui/dashboardPredicates', () => ({
    isStartActionDisabled: () => false,
}));

// Mock Adobe React Spectrum components
jest.mock('@adobe/react-spectrum', () => {
    // The SHARED filter (tests/__mocks__/@adobe/react-spectrum.tsx). Required
    // inside the factory because jest.mock is hoisted above imports.
    const { filterSpectrumProps } = jest.requireActual('../../../__mocks__/@adobe/react-spectrum');
    return {
        View: ({ children, ...props }: any) => (
            <div {...filterSpectrumProps(props)}>{children}</div>
        ),
        Flex: ({ children, ...props }: any) => (
            <div style={{ display: 'flex' }} {...filterSpectrumProps(props)}>
                {children}
            </div>
        ),
        Heading: ({ children, level, ...props }: any) => {
            const Tag = `h${level || 1}` as keyof React.JSX.IntrinsicElements;
            return <Tag {...filterSpectrumProps(props)}>{children}</Tag>;
        },
        Text: ({ children, ...props }: any) => (
            <span {...filterSpectrumProps(props)}>{children}</span>
        ),
        Button: ({ children, onPress, variant, isDisabled, ...props }: any) => (
            <button
                onClick={onPress}
                disabled={isDisabled}
                data-variant={variant}
                data-testid="back-button"
                {...filterSpectrumProps(props)}
            >
                {children}
            </button>
        ),
        ActionButton: ({ children, onPress, _isQuiet, isDisabled, ...props }: any) => (
            <button onClick={onPress} disabled={isDisabled} {...filterSpectrumProps(props)}>
                {children}
            </button>
        ),
        MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
        Menu: ({ children, onAction }: any) => (
            <div role="menu">
                {React.Children.map(children, (child: any) => {
                    if (!child) return null;
                    const key = child.key ?? child.props?.['data-key'];
                    return (
                        <button key={key} role="menuitem" onClick={() => onAction?.(key)}>
                            {child.props?.children}
                        </button>
                    );
                })}
            </div>
        ),
        Item: ({ children }: any) => <>{children}</>,
        // The ActionGrid's lifecycle and remedy tiles wrap their buttons in a
        // TooltipTrigger; both render inline so the tooltip text is queryable
        // without a hover. Added when the runtime status moved off the surface and
        // into these tooltips.
        TooltipTrigger: ({ children }: any) => <>{children}</>,
        Tooltip: ({ children }: any) => <span role="tooltip">{children}</span>,
        Divider: () => <hr />,
        Link: ({ children, onPress, _isQuiet, ...props }: any) => (
            <a onClick={onPress} data-testid="sign-in-link" {...filterSpectrumProps(props)}>
                {children}
            </a>
        ),
        DialogContainer: ({ children }: any) => (
            <div data-testid="dialog-container">{children}</div>
        ),
        TextField: ({ label, value, onChange, ...props }: any) => (
            <input
                aria-label={label}
                value={value ?? ''}
                onChange={(e) => onChange?.(e.target.value)}
                {...filterSpectrumProps(props)}
            />
        ),
        ProgressCircle: ({ ...props }: any) => (
            <div data-testid="progress-circle" {...filterSpectrumProps(props)} />
        ),
    };
});

// Stub the capabilities modal — its real implementation renders the shared
// Modal (Spectrum internals not covered by this file's minimal mock). The real
// AiCapabilitiesModal is exercised in its own test; here we only assert the
// dashboard opens it and wires its props.
jest.mock('@/features/dashboard/ui/components/AiCapabilitiesModal', () => ({
    AiCapabilitiesModal: ({
        skills,
        mcps,
        hasSkillsError,
        hasMcpsError,
        onClose,
        onRegenerate,
        isBusy,
    }: any) => (
        <div
            data-testid="ai-capabilities-modal"
            data-skills-error={String(Boolean(hasSkillsError))}
            data-mcps-error={String(Boolean(hasMcpsError))}
            data-busy={String(Boolean(isBusy))}
        >
            <span data-testid="ai-capabilities-modal-skills-count">{skills.length}</span>
            <span data-testid="ai-capabilities-modal-mcps-count">{mcps.length}</span>
            {skills.map((s: any) => (
                <div key={s.path} data-testid="ai-capabilities-modal-skill">
                    {s.name}
                </div>
            ))}
            {mcps.map((m: any) => (
                <div key={m.id} data-testid="ai-capabilities-modal-mcp">
                    {m.id}
                </div>
            ))}
            <button data-testid="ai-capabilities-modal-regenerate" onClick={() => onRegenerate()}>
                Regenerate AI files
            </button>
            <button data-testid="ai-capabilities-modal-close" onClick={onClose}>
                Close
            </button>
        </div>
    ),
}));

// Mock Spectrum icons
jest.mock('@spectrum-icons/workflow/PlayCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="play-icon" />,
}));
jest.mock('@spectrum-icons/workflow/StopCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="stop-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Settings', () => ({
    __esModule: true,
    default: () => <span data-testid="settings-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Refresh', () => ({
    __esModule: true,
    default: () => <span data-testid="refresh-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Globe', () => ({
    __esModule: true,
    default: () => <span data-testid="globe-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Delete', () => ({
    __esModule: true,
    default: () => <span data-testid="delete-icon" />,
}));
jest.mock('@spectrum-icons/workflow/ViewList', () => ({
    __esModule: true,
    default: () => <span data-testid="viewlist-icon" />,
}));
jest.mock('@spectrum-icons/workflow/FolderOpen', () => ({
    __esModule: true,
    default: () => <span data-testid="folderopen-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Data', () => ({
    __esModule: true,
    default: () => <span data-testid="data-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Login', () => ({
    __esModule: true,
    default: () => <span data-testid="login-icon" />,
}));
jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="more-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Edit', () => ({
    __esModule: true,
    default: () => <span data-testid="edit-icon" />,
}));
// Republish tile (Storefront zone remedy).
jest.mock('@spectrum-icons/workflow/Replay', () => ({
    __esModule: true,
    default: () => <span data-testid="replay-icon" />,
}));
jest.mock('@spectrum-icons/workflow/PublishCheck', () => ({
    __esModule: true,
    default: () => <span data-testid="publish-icon" />,
}));
jest.mock('@spectrum-icons/workflow/AlertCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="alert-circle-icon" />,
}));

export interface TestContext {
    mockPostMessage: jest.Mock;
    mockOnMessage: jest.Mock;
    messageHandlers: Map<string, (data: any) => void>;
    triggerMessage: (type: string, data: any) => void;
}

export function setupTestContext(): TestContext {
    const messageHandlers = new Map<string, (data: any) => void>();

    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    const mockPostMessage = webviewClient.postMessage as jest.Mock;
    const mockOnMessage = webviewClient.onMessage as jest.Mock;

    // Setup onMessage to store handlers
    mockOnMessage.mockImplementation((type: string, handler: (data: any) => void) => {
        messageHandlers.set(type, handler);
        return jest.fn(); // Return unsubscribe function
    });

    const triggerMessage = (type: string, data: any) => {
        const handler = messageHandlers.get(type);
        if (handler) {
            act(() => {
                handler(data);
            });
        }
    };

    return {
        mockPostMessage,
        mockOnMessage,
        messageHandlers,
        triggerMessage,
    };
}

export function renderDashboard(props: Parameters<typeof ProjectDashboardScreen>[0] = {}) {
    return render(<ProjectDashboardScreen {...props} />);
}
