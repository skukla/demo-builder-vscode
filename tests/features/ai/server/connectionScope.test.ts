/**
 * connectionScope — the '#cwd:' preamble sniff and the project-dir resolution.
 *
 * The sniff's contract is byte-exact: whatever it does not consume must reach
 * the MCP transport untouched, and a bare (no-preamble) connection must come
 * back byte-identical — the probe, the battery's enumerator, and any old
 * client all connect bare.
 */

import { PassThrough } from 'stream';
import { readCwdPreamble, resolveScopedProjectDir } from '@/features/ai/server/connectionScope';

/** Drain everything currently readable from a paused stream. */
function drain(stream: PassThrough): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.resume();
        setImmediate(() => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

describe('readCwdPreamble', () => {
    it('consumes the preamble and hands back exactly the MCP bytes', async () => {
        const s = new PassThrough();
        s.write('#cwd:/Users/x/.demo-builder/projects/bodea\n{"jsonrpc":"2.0"}\n');

        const cwd = await readCwdPreamble(s);

        expect(cwd).toBe('/Users/x/.demo-builder/projects/bodea');
        expect(await drain(s)).toBe('{"jsonrpc":"2.0"}\n');
    });

    it('a bare MCP connection comes back byte-identical with no cwd', async () => {
        const s = new PassThrough();
        const mcp = '{"jsonrpc":"2.0","method":"initialize"}\n';
        s.write(mcp);

        const cwd = await readCwdPreamble(s);

        expect(cwd).toBeUndefined();
        expect(await drain(s)).toBe(mcp);
    });

    it('handles the preamble split across chunks', async () => {
        const s = new PassThrough();
        const promise = readCwdPreamble(s);
        s.write('#cw');
        s.write('d:/a/b\n{"x"');
        s.write(':1}\n');

        expect(await promise).toBe('/a/b');
        expect(await drain(s)).toBe('{"x":1}\n');
    });

    it('a first byte that cannot start the prefix returns everything immediately', async () => {
        const s = new PassThrough();
        s.write('X-not-mcp-not-preamble');

        const cwd = await readCwdPreamble(s);

        expect(cwd).toBeUndefined();
        expect(await drain(s)).toBe('X-not-mcp-not-preamble');
    });

    it('a connection that ends mid-preamble resolves undefined', async () => {
        const s = new PassThrough();
        const promise = readCwdPreamble(s);
        s.write('#cwd:/never-finished');
        s.end();

        expect(await promise).toBeUndefined();
    });

    it('a single byte that cannot start the prefix settles without waiting for more', async () => {
        // Shorter than the prefix, so only the prefix-match check can settle it.
        // Without that check nothing resolves and this test times out.
        const s = new PassThrough();
        const promise = readCwdPreamble(s);
        s.write('X');

        expect(await promise).toBeUndefined();
        expect(await drain(s)).toBe('X');
    });

    it('trims trailing whitespace and CR off the declared path', async () => {
        const s = new PassThrough();
        const promise = readCwdPreamble(s);
        s.write('#cwd:/a/b  \r\n{"x":1}\n');

        expect(await promise).toBe('/a/b');
    });

    it('gives up on a preamble longer than the cap and returns every byte', async () => {
        const s = new PassThrough();
        const promise = readCwdPreamble(s);
        const oversized = `#cwd:/${'a'.repeat(4100)}`;
        s.write(oversized);

        expect(await promise).toBeUndefined();
        expect(await drain(s)).toBe(oversized);
    });

    it('a preamble of exactly the cap is still waiting for its newline', async () => {
        // 5 (prefix) + 1 ('/') + 4090 === MAX_PREAMBLE_BYTES. The cap is a
        // strict `>`, so this byte count must NOT settle the connection.
        const s = new PassThrough();
        const promise = readCwdPreamble(s);
        s.write(`#cwd:/${'a'.repeat(4090)}`);
        await new Promise((r) => setImmediate(r));
        s.write('/end\n{"x":1}\n');

        expect(await promise).toBe(`/${'a'.repeat(4090)}/end`);
    });
});

describe('readCwdPreamble — what reaches the socket', () => {
    it('hands the MCP bytes back in ONE unshift', async () => {
        const s = new PassThrough();
        const unshift = jest.spyOn(s, 'unshift');
        const promise = readCwdPreamble(s);
        s.write('#cwd:/a/b\n{"jsonrpc":"2.0"}\n');

        expect(await promise).toBe('/a/b');
        expect(unshift).toHaveBeenCalledTimes(1);
        expect((unshift.mock.calls[0][0] as Buffer).toString('utf8')).toBe('{"jsonrpc":"2.0"}\n');
    });

    it('unshifts nothing when the preamble was all there was', async () => {
        const s = new PassThrough();
        const unshift = jest.spyOn(s, 'unshift');
        const promise = readCwdPreamble(s);
        s.write('#cwd:/a/b\n');

        expect(await promise).toBe('/a/b');
        expect(unshift).not.toHaveBeenCalled();
    });

    it('unshifts nothing into a connection that died mid-preamble', async () => {
        // An unshift after 'end' emits an error event on the socket, and the
        // partial preamble held no MCP bytes worth returning anyway.
        const s = new PassThrough();
        const unshift = jest.spyOn(s, 'unshift');
        const promise = readCwdPreamble(s);
        s.write('#cwd:/never-finished');
        s.end();

        expect(await promise).toBeUndefined();
        expect(unshift).not.toHaveBeenCalled();
    });
});

describe('readCwdPreamble — the reference contract', () => {
    /**
     * What the sniff means, stated independently of how it is written: the
     * preamble is consumed exactly when the stream OPENS with the prefix and a
     * newline arrives; every other stream is handed back whole. Two rejection
     * branches were deleted from the module as unreachable, and this is what
     * keeps that claim honest — it drives the real sniff over byte strings
     * built from the characters that decide it.
     */
    it('agrees with the reference over 512 byte strings of prefix characters', async () => {
        const alphabet = '#cwd:\nA/';
        for (let i = 0; i < 512; i += 1) {
            let sample = '';
            const len = 1 + (i % 9);
            for (let j = 0; j < len; j += 1) {
                sample += alphabet[(i * 7 + j * 5) % alphabet.length];
            }

            const s = new PassThrough();
            const promise = readCwdPreamble(s);
            s.write(sample);
            s.end();

            const newline = sample.indexOf('\n');
            const expected =
                sample.startsWith('#cwd:') && newline !== -1
                    ? sample.slice('#cwd:'.length, newline).trim() || undefined
                    : undefined;
            expect({ sample, cwd: await promise }).toEqual({ sample, cwd: expected });
        }
    });
});

describe('resolveScopedProjectDir', () => {
    const ROOT = '/Users/x/.demo-builder/projects';

    it('a cwd inside a project scopes to that project', () => {
        expect(resolveScopedProjectDir(`${ROOT}/bodea`, ROOT)).toBe(`${ROOT}/bodea`);
        expect(resolveScopedProjectDir(`${ROOT}/bodea/blocks/hero`, ROOT)).toBe(`${ROOT}/bodea`);
    });

    it('the projects root itself (the home chat) scopes to nothing', () => {
        expect(resolveScopedProjectDir(ROOT, ROOT)).toBeUndefined();
    });

    it('outside the root scopes to nothing', () => {
        expect(resolveScopedProjectDir('/Users/x/elsewhere', ROOT)).toBeUndefined();
        expect(resolveScopedProjectDir('/Users/x/.demo-builder', ROOT)).toBeUndefined();
    });

    it('dot-directories under the root are bundle machinery, not projects', () => {
        expect(resolveScopedProjectDir(`${ROOT}/.claude/skills`, ROOT)).toBeUndefined();
        expect(resolveScopedProjectDir(`${ROOT}/.demo-builder-mcp`, ROOT)).toBeUndefined();
    });

    it('missing or relative cwd scopes to nothing', () => {
        expect(resolveScopedProjectDir(undefined, ROOT)).toBeUndefined();
        expect(resolveScopedProjectDir('bodea', ROOT)).toBeUndefined();
    });
});
