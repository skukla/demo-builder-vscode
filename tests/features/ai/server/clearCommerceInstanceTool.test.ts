/**
 * The agent's Clear Commerce Instance (datapack-simplification step 06, C6): `check_demo_data` takes
 * `websites` (omitted: the project; `[]`: the instance's websites with the projects using each; codes:
 * the instance check), and `clear_commerce_instance` clears what an instance check showed.
 *
 * What is pinned, and why:
 *
 * - **The call reaches the handler with the exact payload.** The tool takes the answers by project
 *   path as `changes` (`keep` or `drop`) and `saveAs` (a name), read by `datapackAnswerArgs` so `drop`
 *   means what it means for reset, delete and Clear Demo Data. The handler takes one answer per path.
 *   A mock cannot see a malformed call, so the argument itself is asserted.
 * - **`understood` is required and must be true**: the window's "I understand" box. The handler checks
 *   it too; the schema makes a call without it a validation error the agent corrects.
 * - **Gated twice**: the row's `confirm`, then the handler's own.
 */

import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { ClearInstanceRequest } from '@/types/demoDataWipe';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { fakeServer } from './toolDescriptors.testUtils';

const row = (tool: string) => {
    const found = DATA_INSTALLER_DESCRIPTORS.find((d) => d.tool === tool);
    if (!found) throw new Error(`no row ${tool}`);
    return found;
};
const schemaOf = (tool: string) => row(tool).inputSchema ?? {};

describe('check_demo_data, three scopes', () => {
    const websites = () => schemaOf('check_demo_data').websites;

    it('takes no websites (the project), an empty list (the choices) or website codes (the instance check)', () => {
        expect(websites().parse(undefined)).toBeUndefined();
        expect(websites().parse([])).toStrictEqual([]);
        expect(websites().parse(['bodea', 'justrite'])).toEqual(['bodea', 'justrite']);
    });

    it('refuses a code that is empty, and a single code not in a list', () => {
        expect(() => websites().parse([''])).toThrow();
        expect(() => websites().parse('bodea')).toThrow();
    });

    it('says what each scope answers, and that clear_commerce_instance needs an instance check', () => {
        const { description } = row('check_demo_data');

        expect(description).toContain('websites omitted');
        expect(description).toContain('websites []');
        expect(description).toContain('clear_commerce_instance needs');
        expect(row('check_demo_data').readOnly).toBe(true);
    });
});

describe('clear_commerce_instance, what it accepts', () => {
    it('takes the token, understood, and the answers by project path', () => {
        expect(Object.keys(schemaOf('clear_commerce_instance')).sort()).toEqual([
            'changes',
            'saveAs',
            'token',
            'understood',
        ]);
    });

    it('needs understood, and only true', () => {
        const { understood } = schemaOf('clear_commerce_instance');

        expect(understood.parse(true)).toBe(true);
        expect(() => understood.parse(false)).toThrow();
        expect(() => understood.parse(undefined)).toThrow();
    });

    it('takes keep or drop per project path, and a name per project path', () => {
        const { changes, saveAs } = schemaOf('clear_commerce_instance');

        expect(changes.parse({ '/p/a': 'drop', '/p/b': 'keep' })).toEqual({
            '/p/a': 'drop',
            '/p/b': 'keep',
        });
        expect(changes.parse(undefined)).toBeUndefined();
        expect(() => changes.parse({ '/p/a': 'maybe' })).toThrow();
        expect(() => changes.parse('drop')).toThrow();
        expect(saveAs.parse({ '/p/b': 'My Neighbour' })).toEqual({ '/p/b': 'My Neighbour' });
        expect(() => saveAs.parse({ '/p/b': '' })).toThrow();
    });

    it('is a gated write that needs the Adobe sign-in', () => {
        expect(row('clear_commerce_instance')).toMatchObject({
            readOnly: false,
            confirm: true,
            needsAuth: ['adobe'],
        });
    });

    it('tells the agent the refusal that asks, and what cannot be undone', () => {
        const { description } = row('clear_commerce_instance');

        expect(description).toContain('CHANGES_NEED_ANSWER');
        expect(description).toContain('Cannot be undone, except the datapacks');
        expect(description).toContain('check_demo_data');
    });
});

describe('clear_commerce_instance, the call', () => {
    const handlers = importHandlers as unknown as Record<
        string,
        (c: HandlerContext, p?: unknown) => Promise<HandlerResponse>
    >;
    let reached: jest.SpyInstance;

    beforeEach(() => {
        reached = jest
            .spyOn(handlers, 'clear-commerce-instance')
            .mockResolvedValue({ success: true });
    });
    afterEach(() => reached.mockRestore());

    function registered() {
        const server = fakeServer();
        registerDescriptorTools(server, [row('clear_commerce_instance')], () =>
            createMockHandlerContext()
        );
        const tool = server.tools.get('clear_commerce_instance');
        if (!tool) throw new Error('not registered');
        return tool;
    }

    it('hands the handler one answer per project: drop as drop, keep with a name as that name, keep with none as no answer', async () => {
        await registered().handler({
            token: 'instance-abc',
            confirm: true,
            understood: true,
            changes: { '/p/a': 'drop', '/p/b': 'keep', '/p/c': 'keep' },
            saveAs: { '/p/b': ' My Neighbour ', '/p/d': 'Never asked' },
        });

        const expected: ClearInstanceRequest = {
            token: 'instance-abc',
            confirm: true,
            understood: true,
            changes: { '/p/a': 'drop', '/p/b': { saveAs: 'My Neighbour' } },
        };
        expect(reached).toHaveBeenCalledTimes(1);
        expect(reached.mock.calls[0][1]).toStrictEqual(expected);
    });

    it('hands no answers when the call gives none', async () => {
        await registered().handler({ token: 'instance-abc', confirm: true, understood: true });

        expect(reached.mock.calls[0][1]).toStrictEqual({
            token: 'instance-abc',
            confirm: true,
            understood: true,
            changes: {},
        });
    });

    it('never reaches the handler without confirm', async () => {
        const result = await registered().handler({ token: 'instance-abc', understood: true });

        expect(result.content[0].text).toBe(
            'clear_commerce_instance requires confirm:true to proceed.'
        );
        expect(reached).not.toHaveBeenCalled();
    });
});
