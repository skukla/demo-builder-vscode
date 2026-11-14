/**
 * Fix with AI, the one sender (step-07 P5, S8): asks the extension to open the SC's AI on a datapack
 * problem it recorded (`importFixHandlers.ts`), sending only where the problem is (`from`). When
 * there is nothing to fix, the extension refuses ("This datapack has no failed install to fix.") and
 * the refusal is kept as `problem`, for the problem line where the button is: the pattern of Clear's
 * Open Commerce Admin (`useClearFixes`). The job window, the flyout's failed install and both Clear
 * windows use it.
 *
 * @module features/data-installer/ui/hooks/useFixWithAi
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { HandlerResponse } from '@/types/handlers';
import type { FixDatapackImportWithAiRequest } from '@/types/webviewRequests';

/** Fix with AI, and why it did not open. */
export interface FixWithAi {
    fixWithAi: () => void;
    /** The extension's refusal, for the problem line; absent when the AI opened or nothing was pressed. */
    problem?: string;
}

/**
 * @param from - where the problem is; absent, the last install's job
 * @returns the press, and its refusal
 */
export function useFixWithAi(from?: FixDatapackImportWithAiRequest['from']): FixWithAi {
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const fixWithAi = useCallback((): void => {
        setProblem(undefined);
        const request: FixDatapackImportWithAiRequest = from ? { from } : {};
        void webviewClient
            .request<HandlerResponse>('fix-datapack-import-with-ai', request)
            .then((res) => setProblem(res?.success === false ? res.error : undefined))
            .catch(() => undefined);
    }, [from]);
    return { fixWithAi, ...(problem ? { problem } : {}) };
}
