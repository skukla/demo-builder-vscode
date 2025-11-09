import { renderHook } from '@testing-library/react';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

// Mock the vscode API
jest.mock('@/core/ui/utils/WebviewClient', () => ({
  webviewClient: {
    onMessage: jest.fn(),
    postMessage: jest.fn()
  }
}));

describe('useVSCodeMessage', () => {
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    (webviewClient.onMessage as jest.Mock).mockReturnValue(mockUnsubscribe);
  });

  describe('basic functionality', () => {
    it('subscribes to messages on mount', () => {
      const callback = jest.fn();

      renderHook(() => useVSCodeMessage('test-message', callback));

      expect(webviewClient.onMessage).toHaveBeenCalledWith('test-message', expect.any(Function));
      expect(webviewClient.onMessage).toHaveBeenCalledTimes(1);
    });

    it('calls callback when message is received', () => {
      const callback = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useVSCodeMessage('test-message', callback));

      // Simulate message received
      const testData = { value: 'test' };
      messageHandler?.(testData);

      expect(callback).toHaveBeenCalledWith(testData);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('handles message with null payload', () => {
      const callback = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useVSCodeMessage('test-message', callback));

      messageHandler?.(null);

      expect(callback).toHaveBeenCalledWith(null);
    });

    it('handles message with undefined payload', () => {
      const callback = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useVSCodeMessage('test-message', callback));

      messageHandler?.(undefined);

      expect(callback).toHaveBeenCalledWith(undefined);
    });
  });

  describe('subscription lifecycle', () => {
    it('unsubscribes on unmount', () => {
      const callback = jest.fn();

      const { unmount } = renderHook(() =>
        useVSCodeMessage('test-message', callback)
      );

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('resubscribes when message type changes', () => {
      const callback = jest.fn();

      const { rerender } = renderHook(
        ({ type }) => useVSCodeMessage(type, callback),
        { initialProps: { type: 'message-1' } }
      );

      expect(webviewClient.onMessage).toHaveBeenCalledWith('message-1', expect.any(Function));
      expect(webviewClient.onMessage).toHaveBeenCalledTimes(1);

      // Change message type
      rerender({ type: 'message-2' });

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1); // Unsubscribe from old
      expect(webviewClient.onMessage).toHaveBeenCalledWith('message-2', expect.any(Function));
      expect(webviewClient.onMessage).toHaveBeenCalledTimes(2); // Subscribe to new
    });

    it('does not resubscribe when callback changes without deps', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const { rerender } = renderHook(
        ({ callback }) => useVSCodeMessage('test-message', callback),
        { initialProps: { callback: callback1 } }
      );

      expect(webviewClient.onMessage).toHaveBeenCalledTimes(1);

      // Change callback
      rerender({ callback: callback2 });

      // Should not resubscribe (callback is memoized)
      expect(webviewClient.onMessage).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('dependency array', () => {
    it('updates callback ref when dependencies change', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      const { rerender } = renderHook(
        ({ callback, dep }) => useVSCodeMessage('test-message', callback, [dep]),
        { initialProps: { callback: callback1, dep: 'dep1' } }
      );

      // First callback should be used
      messageHandler?.({ test: 'data1' });
      expect(callback1).toHaveBeenCalledWith({ test: 'data1' });
      expect(callback2).not.toHaveBeenCalled();

      // Change dependency
      rerender({ callback: callback2, dep: 'dep2' });

      // New callback should be used
      messageHandler?.({ test: 'data2' });
      expect(callback2).toHaveBeenCalledWith({ test: 'data2' });
      expect(callback1).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('uses latest callback with empty deps array', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      const { rerender } = renderHook(
        ({ callback }) => useVSCodeMessage('test-message', callback, []),
        { initialProps: { callback: callback1 } }
      );

      // First callback
      messageHandler?.({ test: 'data1' });
      expect(callback1).toHaveBeenCalledWith({ test: 'data1' });

      // Change callback (with empty deps, callback ref won't update)
      rerender({ callback: callback2 });

      // Should still use first callback (empty deps means never update)
      messageHandler?.({ test: 'data2' });
      expect(callback1).toHaveBeenCalledWith({ test: 'data2' });
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('multiple messages', () => {
    it('handles multiple messages in sequence', () => {
      const callback = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useVSCodeMessage('test-message', callback));

      messageHandler?.({ value: 1 });
      messageHandler?.({ value: 2 });
      messageHandler?.({ value: 3 });

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, { value: 1 });
      expect(callback).toHaveBeenNthCalledWith(2, { value: 2 });
      expect(callback).toHaveBeenNthCalledWith(3, { value: 3 });
    });

    it('handles rapid message bursts', () => {
      const callback = jest.fn();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useVSCodeMessage('test-message', callback));

      // Send 10 messages rapidly
      for (let i = 0; i < 10; i++) {
        messageHandler?.({ index: i });
      }

      expect(callback).toHaveBeenCalledTimes(10);
    });
  });

  describe('typed data', () => {
    interface TestData {
      id: string;
      name: string;
    }

    it('handles typed data correctly', () => {
      const callback = jest.fn<void, [TestData]>();
      let messageHandler: ((data: any) => void) | undefined;

      (webviewClient.onMessage as jest.Mock).mockImplementation((type, handler) => {
        messageHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useVSCodeMessage<TestData>('test-message', callback));

      const testData: TestData = { id: '123', name: 'Test' };
      messageHandler?.(testData);

      expect(callback).toHaveBeenCalledWith(testData);
    });
  });
});
