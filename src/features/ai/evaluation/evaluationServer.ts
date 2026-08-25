/**
 * The dry-run server an evaluation talks to, and nothing else does.
 *
 * ## Why a second server rather than a flag on the first
 *
 * Step 03 forced the dry run with a module flag, which meant the WHOLE window
 * paused for the 30s–2min a run took. If the producer was working in another
 * chat, their changes were silently simulated and nothing said why.
 *
 * Worse, the flag could be missed entirely. The spawned agent finds a server
 * through the proxy: the pinned socket if live, otherwise the newest in the
 * socket directory. Reload the window that started the run and leave another
 * open, and the evaluation lands on a server whose flag is false — **its writes
 * execute for real while the workbench reports "nothing was changed."**
 *
 * A dedicated listener fixes both, because "this is an evaluation" stops being a
 * fact about a window and becomes a fact about which socket you are connected
 * to. Nothing else pauses, and the run cannot escape to a server that does not
 * know.
 *
 * ## The lifetime is the run
 *
 * Started when an evaluation begins, disposed when it ends — in a `finally`, so
 * a run that throws does not leave a listener bound. A stale evaluation socket
 * is worse than none: the proxy's discovery sweep prefers live sockets by mtime,
 * so a leftover one is exactly the kind of thing a later run would find.
 *
 * @module features/ai/evaluation/evaluationServer
 */

import * as os from 'os';
import * as path from 'path';
import type { InExtensionMcpServer } from '../server/inExtensionMcpServer';

/** Builds a server bound to `socketPath` with the dry run hard-wired ON. */
export type EvaluationServerFactory = (socketPath: string) => InExtensionMcpServer;

let factory: EvaluationServerFactory | undefined;

/**
 * Register how to build the evaluation server.
 *
 * Injected from `extension.ts` so this module needs neither vscode nor the
 * thirty-odd tool registrars — and, more importantly, so the evaluation server
 * is built from the SAME options object the main one uses. A second options
 * literal would drift, and an evaluation against a different tool surface
 * measures a path no producer takes.
 */
export function setEvaluationServerFactory(next: EvaluationServerFactory): void {
    factory = next;
}

/** A socket path unique to this run. */
function evaluationSocketPath(runId: string): string {
    // The system temp dir, not the shared MCP socket directory: a file there
    // joins the proxy's newest-first discovery sweep, and an evaluation socket
    // is the last thing an ordinary session should ever fall back to.
    return path.join(os.tmpdir(), `demo-builder-eval-${runId}.sock`);
}

/**
 * Run `fn` with a dry-run server listening, and give it that server's socket.
 *
 * @param runId - unique per run; keeps concurrent windows off each other's socket
 * @param fn - receives the socket path to point the spawned agent at
 * @returns whatever `fn` returns
 * @throws if no factory was registered — callers must not silently fall back to
 *   the main server, which is the failure this whole module exists to prevent
 */
export async function withEvaluationServer<T>(
    runId: string,
    fn: (socketPath: string) => Promise<T>,
): Promise<T> {
    if (!factory) {
        throw new Error(
            'Evaluation server is not available in this window. Refusing to evaluate: ' +
                'without it the run would reach the ordinary server and could change things.',
        );
    }
    const socketPath = evaluationSocketPath(runId);
    const server = factory(socketPath);
    await server.start();
    try {
        return await fn(socketPath);
    } finally {
        // `finally`, always: a leftover listener is discoverable by the next
        // ordinary session, which would silently put it in dry run.
        server.dispose();
    }
}
