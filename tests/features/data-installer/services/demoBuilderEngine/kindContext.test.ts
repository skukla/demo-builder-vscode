/**
 * The two Commerce answers every kind reads the same way: "no such thing" on a read, and
 * "already gone" on a delete (DI-5).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import {
    deleteIfPresent,
    isAlreadyGone,
    readOrNull,
} from '@/features/data-installer/services/demoBuilderEngine/kindContext';

describe('readOrNull', () => {
    it('answers what Commerce answered', async () => {
        const get = jest.fn().mockResolvedValue({ attribute_code: 'color' });

        await expect(readOrNull(get, 'products/attributes/color')).resolves.toEqual({ attribute_code: 'color' });
        expect(get).toHaveBeenCalledWith('products/attributes/color');
    });

    it('answers null for a 404', async () => {
        const get = jest.fn().mockRejectedValue(new CommerceReadError('not found', 404));

        await expect(readOrNull(get, 'products/attributes/color')).resolves.toBeNull();
    });

    it('passes any other refusal on', async () => {
        const get = jest.fn().mockRejectedValue(new CommerceReadError('denied', 401));

        await expect(readOrNull(get, 'products/attributes/color')).rejects.toThrow('denied');
    });
});

describe('isAlreadyGone', () => {
    it.each([
        ['a 404', new CommerceReadError('x', 404), true],
        ['a 410', new CommerceReadError('x', 410), true],
        ['a 400 saying no such entity', new CommerceReadError('No such entity with id = 5', 400), true],
        ['a 400 saying it does not exist', new CommerceReadError('The attribute doesn\'t exist', 400), true],
        ['another 400', new CommerceReadError('Invalid value', 400), false],
        ['a 500', new CommerceReadError('boom', 500), false],
        ['an error with no status', new Error('network'), false],
    ])('%s → %s', (_label, error, expected) => {
        expect(isAlreadyGone(error)).toBe(expected);
    });
});

describe('deleteIfPresent', () => {
    it('sends the DELETE', async () => {
        const send = jest.fn().mockResolvedValue(true);

        await deleteIfPresent(send, 'categories/41');

        expect(send).toHaveBeenCalledWith('DELETE', 'categories/41', undefined);
    });

    it('counts already gone as done', async () => {
        const send = jest.fn().mockRejectedValue(new CommerceReadError('gone', 404));

        await expect(deleteIfPresent(send, 'categories/41')).resolves.toBeUndefined();
    });

    it('passes a real refusal on', async () => {
        const send = jest.fn().mockRejectedValue(new CommerceReadError('boom', 500));

        await expect(deleteIfPresent(send, 'categories/41')).rejects.toThrow('boom');
    });
});
