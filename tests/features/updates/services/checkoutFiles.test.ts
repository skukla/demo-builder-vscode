/**
 * An update's checkout as file access (`checkoutFiles.ts`): what the storefront repairs read
 * and write instead of GitHub. Real files in a temp folder. That the writes then reach GitHub
 * only with the update's push is pinned with real git in `templateMergeBase.test.ts`.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { checkoutFiles } from '@/features/updates/services/checkoutFiles';

let dir: string;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkout-files-'));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('checkoutFiles', () => {
    it('writes a file, making its folders, and reads it back the way GitHub answers', async () => {
        const files = checkoutFiles(dir);

        await files.createOrUpdateFile('skukla', 'site', 'tools/quick-edit/quick-edit.js', 'qe\n', 'message');

        expect(await fs.readFile(path.join(dir, 'tools/quick-edit/quick-edit.js'), 'utf8')).toBe('qe\n');
        await expect(files.getFileContent('skukla', 'site', 'tools/quick-edit/quick-edit.js')).resolves.toMatchObject({
            content: 'qe\n',
            path: 'tools/quick-edit/quick-edit.js',
            sha: expect.stringMatching(/^[0-9a-f]{40}$/),
        });
    });

    it('answers null for a file that is not there, as GitHub does', async () => {
        await expect(checkoutFiles(dir).getFileContent('skukla', 'site', 'head.html')).resolves.toBeNull();
    });

    it('refuses a path that leaves the checkout', async () => {
        const files = checkoutFiles(dir);

        await expect(files.createOrUpdateFile('o', 'r', '../outside.txt', 'x', 'm')).rejects.toThrow(/outside the checkout/);
        await expect(files.getFileContent('o', 'r', '../../etc/passwd')).rejects.toThrow(/outside the checkout/);
    });
});
