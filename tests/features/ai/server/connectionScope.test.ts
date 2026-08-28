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
