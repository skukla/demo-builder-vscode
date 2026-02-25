/**
 * One-Time Tip Utility Tests
 *
 * Tests for the showOneTimeTip utility that shows VS Code
 * information notifications exactly once, tracked via globalState.
 */

import { showOneTimeTip } from '@/core/utils/oneTimeTip';
import * as vscode from 'vscode';

// Create a mock globalState (Memento)
function createMockGlobalState(initial: Record<string, unknown> = {}): vscode.Memento {
    const store = { ...initial };
    return {
        get: jest.fn(<T>(key: string, defaultValue?: T): T => {
            return (store[key] as T) ?? (defaultValue as T);
        }),
        update: jest.fn(async (key: string, value: unknown) => {
            store[key] = value;
        }),
        keys: jest.fn(() => Object.keys(store)),
        setKeysForSync: jest.fn(),
    };
}

describe('showOneTimeTip', () => {
    let mockShowInformationMessage: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock showInformationMessage to resolve immediately
        mockShowInformationMessage = vscode.window.showInformationMessage as jest.Mock;
        mockShowInformationMessage.mockResolvedValue(undefined);
    });

    it('should show notification on first call', () => {
        const globalState = createMockGlobalState();

        const result = showOneTimeTip(globalState, {
            stateKey: 'test.tipShown',
            message: 'Test tip message',
            actions: ['Save', 'Open Settings'],
        });

        expect(result).toBe(true);
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
            'Test tip message',
            'Save',
            'Open Settings',
        );
    });

    it('should not show notification on second call', () => {
        const globalState = createMockGlobalState({ 'test.tipShown': true });

        const result = showOneTimeTip(globalState, {
            stateKey: 'test.tipShown',
            message: 'Test tip message',
            actions: ['Save'],
        });

        expect(result).toBe(false);
        expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('should mark tip as shown immediately', () => {
        const globalState = createMockGlobalState();

        showOneTimeTip(globalState, {
            stateKey: 'my.tipKey',
            message: 'Tip',
            actions: ['OK'],
        });

        expect(globalState.update).toHaveBeenCalledWith('my.tipKey', true);
    });

    it('should call onAction when user selects an action', async () => {
        mockShowInformationMessage.mockResolvedValue('Save');
        const onAction = jest.fn();
        const globalState = createMockGlobalState();

        showOneTimeTip(globalState, {
            stateKey: 'test.tipShown',
            message: 'Tip',
            actions: ['Save', 'Cancel'],
            onAction,
        });

        // Wait for the fire-and-forget .then() to execute
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(onAction).toHaveBeenCalledWith('Save');
    });

    it('should not call onAction when user dismisses notification', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);
        const onAction = jest.fn();
        const globalState = createMockGlobalState();

        showOneTimeTip(globalState, {
            stateKey: 'test.tipShown',
            message: 'Tip',
            actions: ['Save'],
            onAction,
        });

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(onAction).not.toHaveBeenCalled();
    });

    it('should work without onAction callback', () => {
        const globalState = createMockGlobalState();

        // Should not throw when onAction is omitted
        expect(() => {
            showOneTimeTip(globalState, {
                stateKey: 'test.tipShown',
                message: 'Tip',
                actions: ['OK'],
            });
        }).not.toThrow();
    });

    it('should prevent concurrent calls from double-firing', () => {
        const globalState = createMockGlobalState();

        const result1 = showOneTimeTip(globalState, {
            stateKey: 'test.tipShown',
            message: 'Tip',
            actions: ['OK'],
        });
        const result2 = showOneTimeTip(globalState, {
            stateKey: 'test.tipShown',
            message: 'Tip',
            actions: ['OK'],
        });

        expect(result1).toBe(true);
        expect(result2).toBe(false);
        expect(mockShowInformationMessage).toHaveBeenCalledTimes(1);
    });

    it('should track different tips independently', () => {
        const globalState = createMockGlobalState();

        const result1 = showOneTimeTip(globalState, {
            stateKey: 'tip.one',
            message: 'First tip',
            actions: ['OK'],
        });
        const result2 = showOneTimeTip(globalState, {
            stateKey: 'tip.two',
            message: 'Second tip',
            actions: ['OK'],
        });

        expect(result1).toBe(true);
        expect(result2).toBe(true);
        expect(mockShowInformationMessage).toHaveBeenCalledTimes(2);
    });
});
