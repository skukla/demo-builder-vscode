/**
 * Real sockets, because the behaviour is the operating system's. Binding the wildcard address
 * succeeds beside a server holding only one loopback address, which is how a demo limited to the
 * SC's own machine read as a free port (measured against `next dev -H`, 2026-11-02).
 */

import * as net from 'net';
import { isPortAvailable } from '@/core/shell/portChecker';

const open: net.Server[] = [];

function listen(host?: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, host, () => {
            open.push(server);
            resolve((server.address() as net.AddressInfo).port);
        });
    });
}

function closed(server: net.Server): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
    await Promise.all(open.splice(0).map(closed));
});

describe('isPortAvailable', () => {
    it('CONTROL: a port nothing holds is free', async () => {
        const port = await listen();
        await closed(open.splice(0)[0]);

        expect(await isPortAvailable(port)).toBe(true);
    });

    it('a server on every address holds the port', async () => {
        expect(await isPortAvailable(await listen())).toBe(false);
    });

    it('a server only on 127.0.0.1 holds the port', async () => {
        expect(await isPortAvailable(await listen('127.0.0.1'))).toBe(false);
    });

    it('a server only on ::1 holds the port', async () => {
        expect(await isPortAvailable(await listen('::1'))).toBe(false);
    });

    it('the port can be taken as soon as it answers free', async () => {
        const port = await listen();
        await closed(open.splice(0)[0]);
        await isPortAvailable(port);

        expect(await isPortAvailable(port)).toBe(true);
        const again = net.createServer();
        await new Promise<void>((resolve, reject) => {
            again.once('error', reject);
            again.listen(port, () => resolve());
        });
        open.push(again);
    });
});
