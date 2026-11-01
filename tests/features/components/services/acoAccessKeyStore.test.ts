/** Where a project's private access keys live, and that they go or move with the project. */

import {
    acoAccessKeysKey,
    forgetAcoAccessKey,
    forgetAcoAccessKeys,
    moveAcoAccessKeys,
    readAcoAccessKey,
    saveAcoAccessKey,
} from '@/features/components/services/acoAccessKeyStore';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const OLD = '/projects/a';
const NEW = '/projects/b';

describe('the ACO access key store', () => {
    it('keeps several keys for a project, each by its id', async () => {
        const { secrets } = createMockSecretStorage();
        await saveAcoAccessKey(secrets, OLD, 'k1', 'one');
        await saveAcoAccessKey(secrets, OLD, 'k2', 'two');
        await expect(readAcoAccessKey(secrets, OLD, 'k1')).resolves.toBe('one');
        await expect(readAcoAccessKey(secrets, OLD, 'k2')).resolves.toBe('two');
        await expect(readAcoAccessKey(secrets, NEW, 'k1')).resolves.toBeUndefined();
    });

    it('forgets one key and leaves the others, and the entry goes with the last', async () => {
        const { secrets, store } = createMockSecretStorage();
        await saveAcoAccessKey(secrets, OLD, 'k1', 'one');
        await saveAcoAccessKey(secrets, OLD, 'k2', 'two');
        await forgetAcoAccessKey(secrets, OLD, 'k1');
        await expect(readAcoAccessKey(secrets, OLD, 'k2')).resolves.toBe('two');
        await forgetAcoAccessKey(secrets, OLD, 'k2');
        expect(store.has(acoAccessKeysKey(OLD))).toBe(false);
    });

    it('reads an unreadable entry as none', async () => {
        const { secrets, store } = createMockSecretStorage();
        store.set(acoAccessKeysKey(OLD), 'not json');
        await expect(readAcoAccessKey(secrets, OLD, 'k1')).resolves.toBeUndefined();
    });

    it('moves them on a rename, deleting the old entry only after the new one reads back', async () => {
        const { secrets, store } = createMockSecretStorage();
        await saveAcoAccessKey(secrets, OLD, 'k1', 'one');
        await expect(moveAcoAccessKeys(secrets, OLD, NEW)).resolves.toBe(true);
        await expect(readAcoAccessKey(secrets, NEW, 'k1')).resolves.toBe('one');
        expect(store.has(acoAccessKeysKey(OLD))).toBe(false);
    });

    it('forgets them all when the project goes', async () => {
        const { secrets, store } = createMockSecretStorage();
        await saveAcoAccessKey(secrets, OLD, 'k1', 'one');
        await forgetAcoAccessKeys(secrets, OLD);
        expect(store.size).toBe(0);
    });
});
