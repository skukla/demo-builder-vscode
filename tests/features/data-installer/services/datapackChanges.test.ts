/**
 * "The packs changed" (F66, owner 2026-11-07): every open Datapacks screen follows one signal, so a
 * change in the library shows in a project's Datapacks, and the other way round, and an agent's too.
 */

import { announceDatapacksChanged, announcingChanges, onDatapacksChanged } from '@/features/data-installer/services/datapackChanges';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import type { HandlerMap } from '@/types/handlers';

describe('onDatapacksChanged', () => {
    it('tells every follower, until each stops following', () => {
        const a = jest.fn();
        const b = jest.fn();
        const followA = onDatapacksChanged(a);
        const followB = onDatapacksChanged(b);

        announceDatapacksChanged();
        followA.dispose();
        announceDatapacksChanged();
        followB.dispose();
        announceDatapacksChanged();

        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(2);
    });

    it('still tells the rest when one follower fails', () => {
        const failing = onDatapacksChanged(() => {
            throw new Error('closed');
        });
        const after = jest.fn();
        const following = onDatapacksChanged(after);

        expect(() => announceDatapacksChanged()).not.toThrow();
        expect(after).toHaveBeenCalledTimes(1);
        failing.dispose();
        following.dispose();
    });
});

describe('announcingChanges', () => {
    const map: HandlerMap = {
        rename: jest.fn(async () => ({ success: true })),
        refuse: jest.fn(async () => ({ success: false, error: 'no' })),
        read: jest.fn(async () => ({ success: true, data: 1 })),
    };

    it('announces after a listed action succeeds, and passes its answer and payload through', async () => {
        const heard = jest.fn();
        const following = onDatapacksChanged(heard);
        const wrapped = announcingChanges(map, ['rename', 'refuse']);
        const context = createMockHandlerContext();

        await expect(wrapped.rename(context, { name: 'x' })).resolves.toStrictEqual({ success: true });

        expect(map.rename).toHaveBeenCalledWith(context, { name: 'x' });
        expect(heard).toHaveBeenCalledTimes(1);
        following.dispose();
    });

    it('announces nothing for a refusal, or for an action not listed', async () => {
        const heard = jest.fn();
        const following = onDatapacksChanged(heard);
        const wrapped = announcingChanges(map, ['rename', 'refuse']);

        await wrapped.refuse(createMockHandlerContext(), {});
        await wrapped.read(createMockHandlerContext(), {});

        expect(heard).not.toHaveBeenCalled();
        following.dispose();
    });

    it('refuses a key the map lacks: a typo would announce nothing', () => {
        expect(() => announcingChanges(map, ['renmae' as 'rename'])).toThrow('announcingChanges: the map has no renmae');
    });
});
