/**
 * Shared test utilities for ProjectDashboardScreen tests
 */

import React from 'react';
import { render } from '@testing-library/react';
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
            handler(data);
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
