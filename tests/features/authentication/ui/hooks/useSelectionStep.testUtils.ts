/**
 * Shared setup for the useSelectionStep suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   useSelectionStep-basic.test.tsx
 *   useSelectionStep-errorCodes.test.tsx
 *   useSelectionStep-searchAndErrors.test.tsx
 *   useSelectionStep-stateManagement.test.tsx
 */

// Mock dependencies - must be in test file for proper hoisting
jest.mock('@/core/ui/hooks/useDebouncedLoading', () => ({
    useDebouncedLoading: jest.fn((value) => value), // Pass through for testing
}));
// Mock WebviewClient - must be in test file for proper hoisting
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => {
            const { mockPostMessage } = require('./useSelectionStep.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: any[]) => {
            const { mockOnMessage } = require('./useSelectionStep.testUtils');
            return mockOnMessage(...args);
        },
    },
}));

export { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';

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
