/**
 * The "already deployed" record after a move. `aio app deploy` skips actions its local
 * record calls deployed, whatever namespace that was — so after Bodea moved projects the
 * new namespace got 2 of 10 install actions (2026-09-19). The record is forgotten when the
 * target changes, and kept when it does not.
 */

// A factory mock — spyOn on a builtin namespace does not reach the module under test.
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        rm: jest.fn(),
        mkdir: jest.fn(),
        writeFile: jest.fn(),
    },
}));

import { promises as fsPromises } from 'fs';
import { forgetDeployRecordOnNewTarget, rememberDeployTarget } from '@/features/app-builder/services/deployRecord';
import { createMockLogger } from '../../../helpers/loggerFake';

const fs = fsPromises as jest.Mocked<typeof fsPromises>;
/** readFile with an encoding answers a string; the overloaded mock type cannot say so. */
const readNote = fs.readFile as unknown as jest.Mock<Promise<string>>;
const APP = '/proj/components/erp-integration';
const RECORD = '/proj/components/erp-integration/dist/last-deployed-actions.json';
const NOTE = '/proj/components/erp-integration/dist/.demo-builder-deploy-target';

beforeEach(() => {
    jest.clearAllMocks();
    fs.rm.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
});

describe('forgetDeployRecordOnNewTarget', () => {
    it("deletes Adobe's record when the app was last deployed to another namespace", async () => {
        readNote.mockResolvedValue('12345-old-stage\n');

        await forgetDeployRecordOnNewTarget(APP, '12345-new-stage', createMockLogger());

        expect(fs.rm).toHaveBeenCalledWith(RECORD, { force: true });
    });

    it('deletes it when there is no note yet — the target cannot be known', async () => {
        readNote.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

        await forgetDeployRecordOnNewTarget(APP, '12345-new-stage', createMockLogger());

        expect(fs.rm).toHaveBeenCalledWith(RECORD, { force: true });
    });

    it('keeps it for a deploy to the same namespace — the fast path stays', async () => {
        readNote.mockResolvedValue('12345-new-stage\n');

        await forgetDeployRecordOnNewTarget(APP, '12345-new-stage', createMockLogger());

        expect(fs.rm).not.toHaveBeenCalled();
    });
});

describe('rememberDeployTarget', () => {
    it('notes the namespace beside the record', async () => {
        await rememberDeployTarget(APP, '12345-new-stage', createMockLogger());

        expect(fs.writeFile).toHaveBeenCalledWith(NOTE, '12345-new-stage\n');
    });

    it('never fails a deploy when the note cannot be written', async () => {
        fs.writeFile.mockRejectedValue(new Error('EACCES'));

        await expect(rememberDeployTarget(APP, 'ns', createMockLogger())).resolves.toBeUndefined();
    });
});
