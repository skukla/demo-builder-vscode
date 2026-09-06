import * as vscode from 'vscode';
import { showWebviewQuickPick, showWebviewQuickPickMany } from '@/core/utils/quickPickUtils';

describe('quickPickUtils', () => {
    let mockQuickPick: {
        items: vscode.QuickPickItem[];
        placeholder?: string;
        title?: string;
        ignoreFocusOut: boolean;
        canSelectMany: boolean;
        matchOnDescription: boolean;
        matchOnDetail: boolean;
        selectedItems: vscode.QuickPickItem[];
        onDidAccept: jest.Mock;
        onDidHide: jest.Mock;
        show: jest.Mock;
        hide: jest.Mock;
        dispose: jest.Mock;
    };

    let onDidAcceptCallback: () => void;
    let onDidHideCallback: () => void;

    const mockItems: vscode.QuickPickItem[] = [
        { label: 'Item 1', description: 'First item' },
        { label: 'Item 2', description: 'Second item' },
        { label: 'Item 3', description: 'Third item' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock QuickPick instance
        mockQuickPick = {
            items: [],
            placeholder: undefined,
            title: undefined,
            ignoreFocusOut: false,
            canSelectMany: false,
            matchOnDescription: false,
            matchOnDetail: false,
            selectedItems: [],
            onDidAccept: jest.fn((callback) => {
                onDidAcceptCallback = callback;
            }),
            onDidHide: jest.fn((callback) => {
                onDidHideCallback = callback;
            }),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        };

        (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);
    });

    describe('showWebviewQuickPick', () => {
        describe('Happy Path', () => {
            it('should create and show a QuickPick', async () => {
                const promise = showWebviewQuickPick(mockItems);

                // Simulate immediate hide (no selection)
                onDidHideCallback();

                await promise;

                expect(vscode.window.createQuickPick).toHaveBeenCalled();
                expect(mockQuickPick.show).toHaveBeenCalled();
            });

            it('should set items on QuickPick', async () => {
                const promise = showWebviewQuickPick(mockItems);
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.items).toBe(mockItems);
            });

            it('should set options on QuickPick', async () => {
                const promise = showWebviewQuickPick(mockItems, {
                    title: 'Test Title',
                    placeholder: 'Test Placeholder',
                    matchOnDescription: true,
                    matchOnDetail: true,
                });
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.title).toBe('Test Title');
                expect(mockQuickPick.placeholder).toBe('Test Placeholder');
                expect(mockQuickPick.matchOnDescription).toBe(true);
                expect(mockQuickPick.matchOnDetail).toBe(true);
            });

            it('should default ignoreFocusOut to true', async () => {
                const promise = showWebviewQuickPick(mockItems);
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.ignoreFocusOut).toBe(true);
            });

            // Each of these is a real false, not an absent value: VS Code reads
            // `undefined` as "leave it alone", so a QuickPick that never sets them
            // inherits whatever the previous one used.
            it('should default multi-select and both match flags to false', async () => {
                const promise = showWebviewQuickPick(mockItems);
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.canSelectMany).toBe(false);
                expect(mockQuickPick.matchOnDescription).toBe(false);
                expect(mockQuickPick.matchOnDetail).toBe(false);
            });

            it('should return selected item on accept', async () => {
                mockQuickPick.selectedItems = [mockItems[1]];

                const promise = showWebviewQuickPick(mockItems);
                onDidAcceptCallback();
                const result = await promise;

                expect(result).toBe(mockItems[1]);
                expect(mockQuickPick.hide).toHaveBeenCalled();
            });

            it('should return undefined on hide without selection', async () => {
                const promise = showWebviewQuickPick(mockItems);
                onDidHideCallback();
                const result = await promise;

                expect(result).toBeUndefined();
                expect(mockQuickPick.dispose).toHaveBeenCalled();
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty items array', async () => {
                const promise = showWebviewQuickPick([]);
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.items).toEqual([]);
            });

            it('should handle custom ignoreFocusOut value', async () => {
                const promise = showWebviewQuickPick(mockItems, {
                    ignoreFocusOut: false,
                });
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.ignoreFocusOut).toBe(false);
            });
        });
    });

    describe('showWebviewQuickPickMany', () => {
        describe('Happy Path', () => {
            it('should enable multi-select', async () => {
                const promise = showWebviewQuickPickMany(mockItems);
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.canSelectMany).toBe(true);
            });

            // The multi-select variant carries its OWN copy of the option defaults;
            // nothing shares them with the single-select one, so they are asserted
            // here too rather than assumed to follow.
            it('should keep the QuickPick open by default and both match flags off', async () => {
                const promise = showWebviewQuickPickMany(mockItems);
                onDidHideCallback();
                await promise;

                expect(mockQuickPick.ignoreFocusOut).toBe(true);
                expect(mockQuickPick.matchOnDescription).toBe(false);
                expect(mockQuickPick.matchOnDetail).toBe(false);
            });

            it('should return array of selected items on accept', async () => {
                mockQuickPick.selectedItems = [mockItems[0], mockItems[2]];

                const promise = showWebviewQuickPickMany(mockItems);
                onDidAcceptCallback();
                const result = await promise;

                expect(result).toEqual([mockItems[0], mockItems[2]]);
                expect(mockQuickPick.hide).toHaveBeenCalled();
            });

            it('should return undefined when no items selected', async () => {
                mockQuickPick.selectedItems = [];

                const promise = showWebviewQuickPickMany(mockItems);
                onDidAcceptCallback();
                const result = await promise;

                expect(result).toBeUndefined();
            });

            it('should return undefined on hide without selection', async () => {
                const promise = showWebviewQuickPickMany(mockItems);
                onDidHideCallback();
                const result = await promise;

                expect(result).toBeUndefined();
                expect(mockQuickPick.dispose).toHaveBeenCalled();
            });
        });
    });
});
