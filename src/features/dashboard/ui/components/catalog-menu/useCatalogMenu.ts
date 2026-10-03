/**
 * useCatalogMenu — the catalog menu dialog's state (EDS-24). Two commitment points,
 * Build and Remove, each one request to the handler the agent's tools also use. Both ask
 * first: each changes a live site (CLAUDE.md property 5). Nothing talks to the host
 * before the SC confirms.
 *
 * @module features/dashboard/ui/components/catalog-menu/useCatalogMenu
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { BuildCatalogMenuResult, RemoveCatalogMenuResult } from '@/types/webviewRequests';

export type CatalogMenuAction = 'build' | 'remove';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

export type CatalogMenuStage =
    | { kind: 'choose' }
    | { kind: 'confirm-build' }
    | { kind: 'confirm-remove' }
    | { kind: 'busy'; action: CatalogMenuAction }
    | { kind: 'done'; action: CatalogMenuAction; summary: string }
    | { kind: 'failed'; action: CatalogMenuAction; error: string };

export interface UseCatalogMenu {
    stage: CatalogMenuStage;
    askBuild: () => void;
    build: () => void;
    askRemove: () => void;
    remove: () => void;
    back: () => void;
}

const MESSAGE: Record<CatalogMenuAction, string> = {
    build: 'buildCatalogMenu',
    remove: 'removeCatalogMenu',
};

/**
 * The dialog's state and its two commits.
 *
 * @returns the stage and the callbacks the dialog binds
 */
export function useCatalogMenu(): UseCatalogMenu {
    const [stage, setStage] = useState<CatalogMenuStage>({ kind: 'choose' });

    const run = useCallback((action: CatalogMenuAction) => {
        setStage({ kind: 'busy', action });
        webviewClient
            .request<Answer<BuildCatalogMenuResult | RemoveCatalogMenuResult>>(MESSAGE[action])
            .then((answer) => {
                if (!answer.success || !answer.data) {
                    setStage({ kind: 'failed', action, error: answer.error ?? 'The catalog menu could not be changed.' });
                    return;
                }
                setStage({ kind: 'done', action, summary: answer.data.summary });
            })
            .catch((error: Error) => setStage({ kind: 'failed', action, error: error.message }));
    }, []);

    return {
        stage,
        askBuild: useCallback(() => setStage({ kind: 'confirm-build' }), []),
        build: useCallback(() => run('build'), [run]),
        askRemove: useCallback(() => setStage({ kind: 'confirm-remove' }), []),
        remove: useCallback(() => run('remove'), [run]),
        back: useCallback(() => setStage({ kind: 'choose' }), []),
    };
}
