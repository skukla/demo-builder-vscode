/**
 * Shared setup for the forkSyncService family (ADR-016 / PL-14).
 *
 * Both suites drive the REAL GitHub client through a fetch fake, so the shared part
 * is the fetch handle, the keyed secret store production reads, and the service
 * wired to a fresh logger.
 */

import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

global.fetch = jest.fn();

export { ForkSyncService };

export const fetchMock = global.fetch as jest.Mock;

/** The headers the real client builds from the token the harness stores. */
export const EXPECTED_HEADERS = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Demo-Builder-VSCode',
    Authorization: 'token test-github-token',
};

export function createForkSyncHarness(): {
    service: ForkSyncService;
    logger: ReturnType<typeof createMockLogger>;
} {
    const logger = createMockLogger();
    const secrets = createMockSecretStorage({ githubToken: 'test-github-token' }).secrets;
    return { service: new ForkSyncService(secrets, logger), logger };
}

/** The next fetch answers with `body` at `status`. */
export function respondOnce(body: unknown, status = 200): void {
    fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}
