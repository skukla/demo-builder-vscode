/**
 * BaseCommand.stateFor — a command run for a named project acts on that project; any
 * other argument (none from the palette, a tree item from a menu) means the current
 * one (AI-15).
 */

import { BaseCommand } from '@/core/base/baseCommand';
import type { StateManager } from '@/types/state';
import { createMockExtensionContext } from '../../helpers/extensionContextFake';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockProject } from '../../helpers/projectFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

class ProbeCommand extends BaseCommand {
    public async execute(projectPath?: unknown): Promise<StateManager> {
        return this.stateFor(projectPath);
    }
}

describe('BaseCommand.stateFor', () => {
    const JUSTRITE = createMockProject({ name: 'justrite', path: '/projects/justrite' });

    function probe() {
        const real = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(createMockProject({ name: 'scratch', path: '/projects/scratch' })),
            loadProjectFromPath: jest.fn().mockResolvedValue(JUSTRITE),
        });
        const command = new ProbeCommand(createMockExtensionContext(), real as unknown as StateManager, createMockLogger());
        return { real, command };
    }

    it('acts on the named project, not the current one', async () => {
        const { real, command } = probe();

        const state = await command.execute('/projects/justrite');

        expect(await state.getCurrentProject()).toBe(JUSTRITE);
        expect(real.loadProjectFromPath).toHaveBeenCalledWith('/projects/justrite', undefined, { persistAfterLoad: false });
    });

    it.each([[undefined], [{ label: 'tree item' }], ['']])('means the current project for %p', async (arg) => {
        const { real, command } = probe();

        expect(await command.execute(arg)).toBe(real);
    });
});
