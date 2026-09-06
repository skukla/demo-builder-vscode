/**
 * Per-connection project scoping — the session's directory decides the project.
 *
 * The extension ships TWO supported agent entries: the home chat (session at
 * the projects root, project chosen by the dashboard's current-project
 * pointer) and a session started INSIDE a project directory (each project's
 * generated `.mcp.json`/AGENTS.md exist precisely for this). Until 2026-08-28
 * the second entry silently obeyed the FIRST entry's pointer: an agent
 * standing in project A wrote to project B whenever the dashboard pointed
 * there — measured live by the battery's first tier-2 run, where the export
 * agent `ls`ed one project while the tool acted on another (owner decision:
 * auto-scope to the session directory; the pointer stays the home chat's
 * fallback and is NEVER flipped by a scoped session).
 *
 * ## The wire: a one-line preamble on OUR socket protocol
 *
 * The proxy (`mcp-proxy.ts`) knows the session's cwd — the harness spawns it
 * there — and the server end of the unix socket needs it. MCP framing is
 * newline-delimited JSON-RPC, so every legitimate first byte is `{`; a line
 * beginning `#cwd:` is unambiguous. The proxy writes it once before piping;
 * {@link readCwdPreamble} consumes it and UNSHIFTS everything after the
 * newline back onto the socket, so the MCP transport sees a pristine stream.
 * Bare connections (the probe, the battery's enumerator, an old client) start
 * with `{` and are handed back untouched — the preamble is strictly optional.
 *
 * @module features/ai/server/connectionScope
 */

import * as path from 'path';
import type { Readable } from 'stream';

/** Longest preamble accepted; a path cannot legitimately exceed this. */
const MAX_PREAMBLE_BYTES = 4096;
const PREFIX = '#cwd:';

/**
 * Read the optional `#cwd:<absolute path>\n` preamble off a just-accepted
 * connection. Resolves once the verdict is known; the stream is left holding
 * exactly the bytes the MCP transport should see.
 *
 * @param socket - the accepted connection (paused or flowing; this attaches first)
 * @returns the declared cwd, or undefined when the stream opens with MCP traffic
 */
export function readCwdPreamble(socket: Readable): Promise<string | undefined> {
    return new Promise((resolve) => {
        let buffered = Buffer.alloc(0);
        let settled = false;

        const finish = (cwd: string | undefined, remainder: Buffer): void => {
            if (settled) return;
            settled = true;
            socket.removeListener('data', onData);
            socket.removeListener('error', onEnd);
            socket.removeListener('end', onEnd);
            socket.pause();
            if (remainder.length > 0) {
                socket.unshift(remainder);
            }
            resolve(cwd);
        };

        // A dead connection gets NOTHING back: unshift after 'end' emits an
        // error event (not a throw), and the buffered partial preamble carried
        // no MCP data the transport could use anyway.
        const onEnd = (): void => finish(undefined, Buffer.alloc(0));

        const onData = (chunk: Buffer): void => {
            buffered = Buffer.concat([buffered, chunk]);
            // Not our preamble the moment the prefix stops matching — hand
            // every byte back untouched. `head` is ALREADY cut to PREFIX.length,
            // so this one check settles every rejection there is: a `head` that
            // survives it and fills PREFIX.length IS the prefix, and a newline
            // among those bytes would have failed it (PREFIX contains none). The
            // two further rejections that used to sit here could not run; the
            // reference contract in this module's suite is what keeps that true.
            const head = buffered.subarray(0, PREFIX.length).toString('utf8');
            if (!PREFIX.startsWith(head)) {
                finish(undefined, buffered);
                return;
            }
            const newline = buffered.indexOf(0x0a);
            if (newline !== -1) {
                finish(
                    buffered.subarray(PREFIX.length, newline).toString('utf8').trim() || undefined,
                    buffered.subarray(newline + 1),
                );
                return;
            }
            if (buffered.length > MAX_PREAMBLE_BYTES) {
                finish(undefined, buffered);
            }
        };

        socket.on('data', onData);
        socket.once('error', onEnd);
        socket.once('end', onEnd);
        socket.resume();
    });
}

/**
 * The project directory a session cwd scopes to: the FIRST path segment under
 * the projects root, when cwd sits strictly inside one. The projects root
 * itself (the home chat) and anything outside it scope to nothing — the
 * dashboard pointer governs there, unchanged.
 *
 * @param cwd - the connection's declared session directory
 * @param projectsDir - the projects root
 * @returns the containing project's absolute path, or undefined
 */
export function resolveScopedProjectDir(
    cwd: string | undefined,
    projectsDir: string,
): string | undefined {
    if (!cwd || !path.isAbsolute(cwd)) return undefined;
    const root = path.resolve(projectsDir);
    const rel = path.relative(root, path.resolve(cwd));
    const first = rel.split(path.sep)[0];
    // ONE guard, three rejections — they were two guards, and the first said
    // nothing the second did not: the projects root itself (`rel` is empty, so
    // `first` is too), anything outside it (the first segment is `..`), and
    // dot-directories under the root (.claude, .demo-builder-mcp), which are
    // bundle machinery rather than projects. `path.isAbsolute(rel)` is the
    // win32 cross-drive case, where no relative path can express the answer.
    if (!first || first.startsWith('.') || path.isAbsolute(rel)) return undefined;
    return path.join(root, first);
}
