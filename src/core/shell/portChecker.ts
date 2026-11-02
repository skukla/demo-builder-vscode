/**
 * PortChecker
 *
 * Utility for checking port availability.
 */

import * as net from 'net';

/**
 * Where a port can be held. Binding the wildcard address alone succeeds beside a server that holds
 * only one loopback address, so a demo limited to the SC's own machine read as a free port.
 */
const ADDRESSES = [undefined, '127.0.0.1', '::1'];

/** This machine does not have that address, so nothing can be holding the port on it. */
const NO_SUCH_ADDRESS = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

function canBind(port: number, host?: string): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (error: NodeJS.ErrnoException) => {
            resolve(NO_SUCH_ADDRESS.has(error.code ?? ''));
        });

        server.once('listening', () => {
            server.close(() => resolve(true));
        });

        server.listen(port, host);
    });
}

/**
 * Check if a port is available for use
 * @param port - Port number to check
 * @returns Promise that resolves to true if port is available, false otherwise
 */
export async function isPortAvailable(port: number): Promise<boolean> {
    for (const host of ADDRESSES) {
        if (!(await canBind(port, host))) return false;
    }
    return true;
}
