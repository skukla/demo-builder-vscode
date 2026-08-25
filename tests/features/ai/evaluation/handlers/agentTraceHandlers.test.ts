/**
 * Reading back what the agent did — the handlers behind the trace view.
 *
 * WHY THIS EXISTS. With the dry run on, chatting normally gave a producer the
 * safety and none of the visibility. The recorder was capturing every call in
 * every chat and nothing read it. These handlers are the read, and two of their
 * properties are load-bearing: cost is never invented, and cancelling a save
 * dialog is not a failure.
 */

import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';
import { dispatchHandler } from '@/core/handlers';
import { agentTraceHandlers } from '@/features/ai/evaluation/handlers/agentTraceHandlers';
import { setEvaluationRecorder } from '@/features/ai/evaluation/handlers/traceRecorderAccess';
import { ToolTraceRecorder } from '@/features/ai/server/toolTraceRecorder';
import type { HandlerContext } from '@/types/handlers';

jest.mock('fs/promises', () => ({ writeFile: jest.fn() }));

const mockWriteFile = fsPromises.writeFile as jest.Mock;
const mockSaveDialog = vscode.window.showSaveDialog as jest.Mock;

function context(): HandlerContext {
    return {
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    } as unknown as HandlerContext;
}

/** A recorder holding one ordinary read and one repeat of it. */
function recorderWithCalls(): ToolTraceRecorder {
    const trace = new ToolTraceRecorder();
    for (let i = 0; i < 2; i++) {
        trace.record({
            tool: 'get_current_project',
            readOnly: true,
            argumentKeys: [],
            argumentFingerprint: 'none',
            resultBytes: 20,
            durationMs: 2,
            outcome: 'ok',
        });
    }
    return trace;
}

describe('get-agent-trace', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setEvaluationRecorder(recorderWithCalls());
    });

    it('reports calls made through the ORDINARY chat path', async () => {
        // The gap this closes. The recorder is the window's, shared with the
        // main server, so anything a chat did is already in it.
        const res = await dispatchHandler(agentTraceHandlers, context(), 'get-agent-trace', undefined);

        const data = res.data as { totalCalls: number; wastedCalls: number };
        expect(data.totalCalls).toBe(2);
        expect(data.wastedCalls).toBe(1);
    });

    it('never reports a cost, not even zero', async () => {
        // Cost comes from a run's own output and the extension does not own the
        // chat's process. A zero would read as "this was free".
        const res = await dispatchHandler(agentTraceHandlers, context(), 'get-agent-trace', undefined);

        expect(Object.keys(res.data as object)).not.toContain('costUSD');
        expect(JSON.stringify(res.data)).not.toMatch(/cost/i);
    });
});

describe('save-agent-trace', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWriteFile.mockReset();
        mockWriteFile.mockResolvedValue(undefined);
        mockSaveDialog.mockReset();
        setEvaluationRecorder(recorderWithCalls());
    });

    it('writes plain text to the file the producer picked', async () => {
        mockSaveDialog.mockResolvedValue({ fsPath: '/tmp/agent-trace.txt' });

        const res = await dispatchHandler(agentTraceHandlers, context(), 'save-agent-trace', undefined);

        expect(res.success).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledWith(
            '/tmp/agent-trace.txt',
            expect.stringContaining('get_current_project'),
        );
    });

    it('treats a CANCELLED dialog as success, not as a failure', async () => {
        // Reporting it as an error would put an error notice on screen for a
        // decision the producer just made.
        mockSaveDialog.mockResolvedValue(undefined);

        const res = await dispatchHandler(agentTraceHandlers, context(), 'save-agent-trace', undefined);

        expect(res).toEqual({ success: true, data: { saved: false } });
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('RETURNS a failure when the write throws, rather than propagating it', async () => {
        mockSaveDialog.mockResolvedValue({ fsPath: '/nope/agent-trace.txt' });
        mockWriteFile.mockRejectedValue(new Error('read-only volume'));

        const res = await dispatchHandler(agentTraceHandlers, context(), 'save-agent-trace', undefined);

        expect(res.success).toBe(false);
    });
});

describe('a window with no server', () => {
    it('refuses all three rather than answering with nothing', async () => {
        setEvaluationRecorder(undefined as never);

        for (const type of ['get-agent-trace', 'get-agent-trace-text', 'save-agent-trace']) {
            const res = await dispatchHandler(agentTraceHandlers, context(), type, undefined);
            expect(res.success).toBe(false);
        }
    });
});
