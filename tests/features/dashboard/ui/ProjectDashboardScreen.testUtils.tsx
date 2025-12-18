/**
 * Shared test utilities for ProjectDashboardScreen tests
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ProjectDashboardScreen } from '@/features/dashboard/ui/ProjectDashboardScreen';
import '@testing-library/jest-dom';

// Mock the webview-ui utilities and hooks
jest.mock('@/core/ui/hooks', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

// Mock the WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()), // Return unsubscribe function
    },
}));

// Mock layout components
jest.mock('@/core/ui/components/layout', () => ({
    GridLayout: ({ children }: any) => <div data-testid="grid-layout">{children}</div>,
    PageLayout: ({ header, children }: any) => (
        <div data-testid="page-layout">
            <div data-testid="page-layout-header">{header}</div>
            <div data-testid="page-layout-content">{children}</div>
        </div>
    ),
    PageHeader: ({ title, subtitle }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
}));

// Mock feedback components
jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>{label}: {status}</div>
    ),
}));

// Mock dashboard predicates
jest.mock('@/features/dashboard/ui/dashboardPredicates', () => ({
    isStartActionDisabled: () => false,
}));

// Mock Adobe React Spectrum components
jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Flex: ({ children, ...props }: any) => <div style={{ display: 'flex' }} {...props}>{children}</div>,
    Heading: ({ children, level, ...props }: any) => {
        const Tag = `h${level || 1}` as keyof JSX.IntrinsicElements;
        return <Tag {...props}>{children}</Tag>;
    },
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    Button: ({ children, onPress, variant, isDisabled, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} data-testid="back-button" {...props}>{children}</button>
    ),
    ActionButton: ({ children, onPress, isQuiet, isDisabled, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>{children}</button>
    ),
    Divider: () => <hr />,
    ProgressCircle: () => <div data-testid="progress-circle" />,
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
