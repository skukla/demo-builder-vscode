/**
 * Shared test utilities for useSelectionStep hook tests
 */

import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('@/core/ui/hooks/useDebouncedLoading', () => ({
    useDebouncedLoading: jest.fn((value) => value), // Pass through for testing
}));

// Mock WebviewClient
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn());

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
    },
}));

export interface TestItem {
    id: string;
    name: string;
    description?: string;
}

export const baseState: Partial<WizardState> = {
    projectsCache: undefined,
    projectSearchFilter: '',
};

export const testItems: TestItem[] = [
    { id: '1', name: 'Item 1', description: 'First item' },
    { id: '2', name: 'Item 2', description: 'Second item' },
    { id: '3', name: 'Item 3', description: 'Third item' },
];

export function resetMocks(): void {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn()); // Return unsubscribe function
}
