/**
 * Configure's Save and a datapack in the current Commerce instance (step-07 D6): no answer asks,
 * Change Anyway applies, Uninstall First uninstalls and applies only once the datapack is all out.
 * The uninstall is handed in, and what it is handed is asserted: it must run on the project as it
 * is, before the change, so it reaches the instance the datapack is in. The live uninstall's
 * removal is walled at `removeProjectSampleDataOutcome` for its one case at the end.
 */

const mockRemove = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetDatapack', () => ({
    askSaveAsNameWith: jest.fn(() => jest.fn()),
    removeProjectSampleDataOutcome: (...args: unknown[]) => mockRemove(...args),
}));

import * as vscode from 'vscode';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import {
    answerConnectionChange,
    connectionAnswerDeps,
    type ConnectionAnswerDeps,
} from '@/features/dashboard/commands/configureConnectionAnswer';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';

const ACCS = 'adobe-commerce-accs';
const endpoint = (tenant: string) => `https://na1-sandbox.api.commerce.adobe.com/${tenant}/graphql`;
const MOVE = { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantB0123456789ABCD') } };

const project = (): Project =>
    createMockProject({
        datapack: { name: 'luma', version: 'main', store: 'library' },
        componentSelections: { backend: ACCS },
        componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') } },
    });

function deps(removal: DatapackRemoval = {}) {
    const uninstall = jest.fn(async (_project: Project, _name: string) => removal);
    const given: ConnectionAnswerDeps = { recordedInstance: async () => undefined, displayName: async () => 'Luma', uninstall };
    return { given, uninstall };
}

describe('answerConnectionChange', () => {
    it('asks, naming the datapack, and uninstalls nothing, when not answered', async () => {
        const { given, uninstall } = deps();

        await expect(
            answerConnectionChange(project(), MOVE, undefined, given)
        ).resolves.toStrictEqual({
            success: false,
            data: { installedDatapack: 'Luma' },
        });
        expect(uninstall).not.toHaveBeenCalled();
    });

    it('Change Anyway: goes on, uninstalling nothing', async () => {
        const { given, uninstall } = deps();

        await expect(
            answerConnectionChange(project(), MOVE, 'keep', given)
        ).resolves.toBeUndefined();
        expect(uninstall).not.toHaveBeenCalled();
    });

    it('Uninstall First: uninstalls from the project as it is now, then goes on', async () => {
        const { given, uninstall } = deps({});
        const before = project();

        await expect(
            answerConnectionChange(before, MOVE, 'uninstall', given)
        ).resolves.toBeUndefined();
        expect(uninstall).toHaveBeenCalledWith(before, 'Luma');
        expect(uninstall.mock.calls[0][0].componentConfigs?.[ACCS]?.ACCS_GRAPHQL_ENDPOINT).toBe(
            endpoint('TenantA0123456789ABCD')
        );
    });

    it('Uninstall First: changes nothing, saying why, when the datapack was not uninstalled', async () => {
        const { given } = deps({ kept: 'Commerce could not be reached.' });

        await expect(answerConnectionChange(project(), MOVE, 'uninstall', given)).rejects.toThrow(
            'Luma was not uninstalled, so the Commerce connection was not changed: Commerce could not be reached.'
        );
    });

    it('Uninstall First: changes nothing when part of it was left in Commerce on purpose', async () => {
        const { given } = deps({
            leftInStore: true,
            note: 'Kept 2 categories with products of their own.',
        });

        await expect(answerConnectionChange(project(), MOVE, 'uninstall', given)).rejects.toThrow(
            'Part of Luma was left in Commerce, so the Commerce connection was not changed: Kept 2 categories with products of their own.'
        );
    });

    // D6 review S2: after Change Anyway the record says the datapack is on the instance pointed back at.
    it('asks nothing when the change points back at the instance the record names', async () => {
        const { given } = deps();
        const onB = createMockProject({ ...project(), componentConfigs: MOVE });
        given.recordedInstance = async () => 'TenantA0123456789ABCD';

        await expect(
            answerConnectionChange(onB, { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') } }, undefined, given)
        ).resolves.toBeUndefined();
    });

    it('CONTROL: asks nothing for a change that keeps the instance', async () => {
        const { given } = deps();

        await expect(
            answerConnectionChange(
                project(),
                { [ACCS]: { ACCS_WEBSITE_CODE: 'other' } },
                undefined,
                given
            )
        ).resolves.toBeUndefined();
    });
});

// D6 review O3: the live uninstall runs behind a progress notification that only narrates; a failure
// is said once, by the save's own error (`answerConnectionChange` throws it).
describe('connectionAnswerDeps', () => {
    it('says nothing itself when the uninstall stops: the save reports it once', async () => {
        jest.clearAllMocks();
        mockRemove.mockResolvedValue({ kept: 'Commerce could not be reached.' });

        const removal = await connectionAnswerDeps(createMockHandlerContext()).uninstall(createMockProject(), 'Luma');

        expect(removal).toEqual({ kept: 'Commerce could not be reached.' });
        expect(vscode.window.withProgress).toHaveBeenCalledWith(expect.objectContaining({ title: 'Uninstalling Luma' }), expect.any(Function));
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
});
