/**
 * The project's ACO ingestion credential lives in SecretStorage, one entry per project, never in a
 * project file (PL-60 P2); a rename moves it only once the new entry reads back the same.
 */

import {
    acoCredentialKey,
    forgetAcoCredential,
    moveAcoCredential,
    readAcoCredential,
    saveAcoCredential,
} from '@/features/components/services/acoCredentialStore';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const CREDENTIAL = { clientId: 'client-1', clientSecret: 'fake-test-pw-not-a-secret' };

describe('acoCredentialStore', () => {
    it('keeps and reads the pair under the project\'s own key', async () => {
        const { secrets, store } = createMockSecretStorage();
        await saveAcoCredential(secrets, '/projects/a', CREDENTIAL);
        expect([...store.keys()]).toEqual([acoCredentialKey('/projects/a')]);
        await expect(readAcoCredential(secrets, '/projects/a')).resolves.toEqual(CREDENTIAL);
        await expect(readAcoCredential(secrets, '/projects/b')).resolves.toBeUndefined();
    });

    it('reads an unreadable or half entry as none', async () => {
        const { secrets } = createMockSecretStorage({ [acoCredentialKey('/p')]: '{"clientId":"x"}', [acoCredentialKey('/q')]: 'not json' });
        await expect(readAcoCredential(secrets, '/p')).resolves.toBeUndefined();
        await expect(readAcoCredential(secrets, '/q')).resolves.toBeUndefined();
        await expect(readAcoCredential(undefined, '/p')).resolves.toBeUndefined();
    });

    it('forgets it', async () => {
        const { secrets, store } = createMockSecretStorage({ [acoCredentialKey('/p')]: JSON.stringify(CREDENTIAL) });
        await forgetAcoCredential(secrets, '/p');
        expect(store.size).toBe(0);
    });

    it('moves it on a rename, and keeps the old entry when the new one does not read back', async () => {
        const { secrets, store } = createMockSecretStorage({ [acoCredentialKey('/old')]: JSON.stringify(CREDENTIAL) });
        await expect(moveAcoCredential(secrets, '/old', '/new')).resolves.toBe('moved');
        expect([...store.keys()]).toEqual([acoCredentialKey('/new')]);
        await expect(moveAcoCredential(secrets, '/missing', '/x')).resolves.toBe('none');

        const failing = createMockSecretStorage({ [acoCredentialKey('/old')]: JSON.stringify(CREDENTIAL) });
        failing.secrets.store.mockImplementation(async () => undefined);
        await expect(moveAcoCredential(failing.secrets, '/old', '/new')).resolves.toBe('not-verified');
        expect([...failing.store.keys()]).toEqual([acoCredentialKey('/old')]);
    });
});
