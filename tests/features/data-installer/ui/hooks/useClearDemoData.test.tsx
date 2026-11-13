/**
 * The message that starts Clear Demo Data, and the button its run window ends with (step 06, C3): the
 * save question's answer travels with the clearing, as Uninstall's does, and a run that left orders
 * or list settings to the Admin offers Open Commerce Admin, through `open-commerce-admin`.
 */

import '../../../../helpers/webviewClientMock';
import React, { useEffect } from 'react';
import { render } from '@testing-library/react';
import { settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    clearOfferStep,
    useClearDemoData,
} from '@/features/data-installer/ui/hooks/useClearDemoData';
import type { RemovalAnswer } from '@/features/data-installer/ui/hooks/useSwitchChanges';
import { ErrorCode } from '@/types/errorCodes';

const NOTHING = (): void => undefined;

function Starts({ answer }: { answer?: RemovalAnswer }): React.ReactElement {
    const { clear, progressWindow } = useClearDemoData(NOTHING);
    useEffect(() => {
        clear('tok-1', ['bodea'], answer);
    }, [clear, answer]);
    return progressWindow;
}

// Sent as a request (C3 review): its answer can send the SC back to the save question.
const started = (): unknown[] =>
    (webviewClient.request as jest.Mock).mock.calls
        .filter((c) => c[0] === 'clear-demo-data')
        .map((c) => c[1]);

beforeEach(() => {
    jest.clearAllMocks();
    (webviewClient.request as jest.Mock).mockReturnValue(new Promise(() => undefined));
});

const KEEP_AS: RemovalAnswer = { changes: 'keep', saveAs: { displayName: 'My Bodea' } };

it("sends the save question's answer with the clearing, confirmed, to the screen's progress window", async () => {
    render(<Starts answer={KEEP_AS} />);
    await settle();

    expect(started()).toEqual([
        {
            id: 'demo-data-clear',
            token: 'tok-1',
            confirm: true,
            changes: 'keep',
            saveAs: { displayName: 'My Bodea' },
            progress: 'modal',
        },
    ]);
});

it('sends no answer when none was asked', async () => {
    render(<Starts />);
    await settle();

    expect(started()).toEqual([{ id: 'demo-data-clear', token: 'tok-1', confirm: true, progress: 'modal' }]);
});

it("turns the run's Open Commerce Admin offer into the button, which opens the Admin", () => {
    (webviewClient.request as jest.Mock).mockResolvedValue({ success: true });
    const step = clearOfferStep({ action: 'open-commerce-admin' });

    expect(step?.action).toBe('Open Commerce Admin');
    step?.onPress();
    expect(webviewClient.request).toHaveBeenCalledWith('open-commerce-admin');
});

it('offers nothing for an offer that is not its own', () => {
    expect(
        clearOfferStep({
            action: 'assign-erp-products',
            id: 'i',
            erp: 'e',
            name: 'n',
            message: 'm',
        })
    ).toBeUndefined();
});

it('resolves true, opening no progress window, when the host refuses for an answer about changes', async () => {
    (webviewClient.request as jest.Mock).mockResolvedValue({ success: false, error: 'You changed 2 things.', code: ErrorCode.CHANGES_NEED_ANSWER });
    let asked: Promise<boolean> | undefined;
    function Asks(): React.ReactElement {
        const { clear, progressWindow, running } = useClearDemoData(NOTHING);
        useEffect(() => {
            asked = clear('tok-1', ['bodea']);
        }, [clear]);
        return <>{running ? 'open' : 'shut'}{progressWindow}</>;
    }
    const view = render(<Asks />);
    await settle();

    await expect(asked).resolves.toBe(true);
    expect(view.container.textContent).toContain('shut');
});

describe('Clear Commerce Instance (step 06 C4)', () => {
    function StartsInstance(): React.ReactElement {
        const { clearInstance, progressWindow } = useClearDemoData(NOTHING);
        useEffect(() => {
            void clearInstance('instance-tok-1', ['base', 'bodea'], { '/p/a': { saveAs: 'My A' }, '/p/b': 'drop' });
        }, [clearInstance]);
        return progressWindow;
    }

    it('sends the clearing confirmed and understood, each project\'s answer by path, to the progress window', async () => {
        render(<StartsInstance />);
        await settle();

        const sentInstance = (webviewClient.request as jest.Mock).mock.calls.filter((c) => c[0] === 'clear-commerce-instance').map((c) => c[1]);
        expect(sentInstance).toEqual([
            {
                id: 'demo-data-clear',
                token: 'instance-tok-1',
                confirm: true,
                understood: true,
                changes: { '/p/a': { saveAs: 'My A' }, '/p/b': 'drop' },
                progress: 'modal',
            },
        ]);
    });
});
