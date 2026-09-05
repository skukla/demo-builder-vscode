/**
 * Unit Tests for BaseWebviewCommand Disposal Integration
 *
 * Tests disposal infrastructure migration from manual webviewDisposables array
 * to inherited DisposableStore from BaseCommand:
 * - Inherited DisposableStore usage (no manual array)
 * - Panel disposal listener tracking
 * - Theme change listener tracking
 * - dispose() delegation to super.dispose()
 * - communicationManager disposal
 * - Complete disposal flow (panel close)
 * - LIFO disposal ordering
 *
 * CRITICAL: All tests fully mocked (no real webviews) - safe for IDE execution
 */

import {
    makeCommand,
    mintedPanels,
    resetMintedPanels,
    createCommFake,
    useCommFake,
} from './baseWebviewCommand.testUtils';

import * as vscode from 'vscode';
import { DisposableStore } from '@/core/utils/disposableStore';
import { WebviewPanelManager } from '@/core/base/webviewPanelManager';

import { internals } from '../../helpers/commandInternals';

const ID = 'test-webview';

describe('BaseWebviewCommand Disposal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetMintedPanels();
        WebviewPanelManager.unregisterPanel(ID);
        WebviewPanelManager.unregisterCommunicationManager(ID);
        useCommFake(createCommFake());
    });

    describe('Inherited DisposableStore', () => {
        it('should use inherited disposables property from BaseCommand', () => {
            const { command } = makeCommand();

            const disposables = command.getDisposablesForTest();

            expect(disposables).toBeDefined();
            expect(disposables).toBeInstanceOf(DisposableStore);
        });

        it('should NOT have separate webviewDisposables array', () => {
            const { command } = makeCommand();

            // Should not have webviewDisposables property
            expect(internals(command).webviewDisposables).toBeUndefined();
        });
    });

    describe('Panel Disposal Listener', () => {
        it('should add panel disposal listener to disposables', async () => {
            const { command } = makeCommand();

            const disposables = command.getDisposablesForTest();
            const addSpy = jest.spyOn(disposables, 'add');

            await command.openPanel();

            // Panel disposal listener should be added
            expect(addSpy).toHaveBeenCalled();
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should dispose listener when command disposed', async () => {
            const { command } = makeCommand();

            await command.openPanel();

            const mockDisposable = { dispose: jest.fn() };
            command.getDisposablesForTest().add(mockDisposable);

            command.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('Theme Listener', () => {
        it('should add theme listener to disposables', async () => {
            const { command } = makeCommand();

            const disposables = command.getDisposablesForTest();
            const countBefore = disposables.count;

            await command.openPanel();
            await command.startCommunication();

            // Should have added theme listener
            expect(disposables.count).toBeGreaterThan(countBefore);
        });
    });

    describe('dispose() Coordination', () => {
        it('should call super.dispose()', () => {
            const { command } = makeCommand();

            const disposables = command.getDisposablesForTest();
            const disposeSpy = jest.spyOn(disposables, 'dispose');

            command.dispose();

            // Should call DisposableStore.dispose() via super.dispose()
            expect(disposeSpy).toHaveBeenCalled();
        });

        it('should dispose communicationManager', async () => {
            const { command } = makeCommand();

            await command.openPanel();
            await command.startCommunication();

            const commManager = command.currentComm();
            expect(commManager).toBeDefined();

            command.dispose();

            expect(commManager!.dispose).toHaveBeenCalled();
            expect(command.currentComm()).toBeUndefined();
        });
    });

    describe('Complete Disposal Flow', () => {
        it('should clear all resources on panel disposal', async () => {
            const { command } = makeCommand();

            await command.openPanel();
            await command.startCommunication();

            // Add mock disposable
            const mockDisposable = { dispose: jest.fn() };
            command.getDisposablesForTest().add(mockDisposable);

            const commManager = command.currentComm();
            expect(commManager).toBeDefined();

            // Trigger panel disposal
            mintedPanels()[0].dispose();

            // Should dispose communicationManager
            expect(commManager!.dispose).toHaveBeenCalled();

            // Should dispose all registered resources
            expect(mockDisposable.dispose).toHaveBeenCalled();

            // Should clear panel reference
            expect(command.currentPanel()).toBeUndefined();
        });
    });

    describe('LIFO Disposal Ordering', () => {
        it('should dispose resources in reverse order', () => {
            const { command } = makeCommand();

            const disposalOrder: number[] = [];

            const disposable1 = { dispose: () => disposalOrder.push(1) };
            const disposable2 = { dispose: () => disposalOrder.push(2) };
            const disposable3 = { dispose: () => disposalOrder.push(3) };

            command.getDisposablesForTest().add(disposable1);
            command.getDisposablesForTest().add(disposable2);
            command.getDisposablesForTest().add(disposable3);

            command.dispose();

            // Should dispose in reverse order (LIFO)
            expect(disposalOrder).toEqual([3, 2, 1]);
        });
    });
});
