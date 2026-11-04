/**
 * The reset's Save As question (owner, 2026-11-04): the name is required, and losing the changes is
 * its own answer, as in Create Datapack and the Datapacks screen's removal. Asked in the reset's
 * progress window when one is open, else in VS Code's dialogs.
 */

jest.mock('@/core/vscode/operationPrompt', () => ({
    askForDetailsDuringOperation: jest.fn(),
    modalIsAsking: jest.fn(),
}));

import { askForDetailsDuringOperation, modalIsAsking } from '@/core/vscode/operationPrompt';
import { askSaveAsNameWith } from '@/features/eds/services/reset/edsResetSampleData';

const mockedAsk = askForDetailsDuringOperation as jest.MockedFunction<typeof askForDetailsDuringOperation>;
const mockedInWindow = modalIsAsking as jest.MockedFunction<typeof modalIsAsking>;

const showWarningMessage = jest.fn();
const showInputBox = jest.fn();
const vscode = { window: { showWarningMessage, showInputBox } } as unknown as typeof import('vscode');
const asked = { sentence: 'You changed 2 things since it was installed.' };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('in the progress window', () => {
    beforeEach(() => mockedInWindow.mockReturnValue(true));

    it('asks the name, starting empty as Create Datapack\'s does, with both answers in the removal words', async () => {
        mockedAsk.mockResolvedValueOnce({ action: 'Save As New and Remove', values: { name: '  My Bodea ' } });

        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toStrictEqual({ saveAs: 'My Bodea' });
        expect(mockedAsk).toHaveBeenCalledWith({
            message: asked.sentence,
            fields: [{ id: 'name', label: 'Save Changes As', value: '' }],
            actions: ['Save As New and Remove', 'Remove Without Saving'],
        });
    });

    it('asks again when the name is empty, saying it is required', async () => {
        mockedAsk
            .mockResolvedValueOnce({ action: 'Save As New and Remove', values: { name: ' ' } })
            .mockResolvedValueOnce({ action: 'Save As New and Remove', values: { name: 'My Bodea' } });

        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toStrictEqual({ saveAs: 'My Bodea' });
        expect(mockedAsk.mock.calls[1][0].fields).toStrictEqual([{ id: 'name', label: 'Save Changes As', value: ' ', description: 'Datapack name is required' }]);
    });

    it('answers drop for Remove Without Saving, and nothing when closed', async () => {
        mockedAsk.mockResolvedValueOnce({ action: 'Remove Without Saving', values: {} }).mockResolvedValueOnce({ action: undefined, values: {} });

        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toBe('drop');
        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toBeUndefined();
    });
});

describe("in VS Code's dialogs, with no window", () => {
    beforeEach(() => mockedInWindow.mockReturnValue(false));

    it('asks which answer, then the name, which the box will not take empty', async () => {
        showWarningMessage.mockResolvedValueOnce('Save As New and Remove');
        showInputBox.mockResolvedValueOnce('My Bodea');

        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toStrictEqual({ saveAs: 'My Bodea' });
        expect(showWarningMessage).toHaveBeenCalledWith(asked.sentence, { modal: true }, 'Save As New and Remove', 'Remove Without Saving');
        const { validateInput } = showInputBox.mock.calls[0][0];
        expect(validateInput('  ')).toBe('Datapack name is required');
        expect(validateInput('My Bodea')).toBeUndefined();
        expect(mockedAsk).not.toHaveBeenCalled();
    });

    it('answers drop for Remove Without Saving without asking a name, and nothing when either is closed', async () => {
        showWarningMessage.mockResolvedValueOnce('Remove Without Saving').mockResolvedValueOnce(undefined).mockResolvedValueOnce('Save As New and Remove');
        showInputBox.mockResolvedValueOnce(undefined);

        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toBe('drop');
        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toBeUndefined();
        await expect(askSaveAsNameWith(vscode)(asked)).resolves.toBeUndefined();
        expect(showInputBox).toHaveBeenCalledTimes(1);
    });
});
