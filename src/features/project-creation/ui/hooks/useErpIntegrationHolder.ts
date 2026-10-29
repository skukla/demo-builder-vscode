/**
 * Does another local project already run an ERP integration on this Commerce
 * instance? (AB-78)
 *
 * One Commerce instance runs one ERP integration. Both hosts of the Add Integration
 * modal ask (`check-erp-integration-holder`) and hand the answer to
 * it, so the ERP integration's tile is greyed out with the reason — the treatment
 * the API Mesh tile gets once a project has its mesh. The wizard asks with its
 * choices while the SC is on Integrations; the dashboard asks about the open project
 * while the modal is open. The wizard also shows the message and holds Continue when
 * the ERP integration is already selected (picked before the instance was known).
 *
 * The answer lives in the component, not a module cache: other projects can gain or
 * lose an integration while a webview stays open, so each mount asks again. A request
 * in flight is shared, so two components asking the same question send it once.
 * While asking, or when the request fails, there is no answer: creation and the add
 * handlers check again before they make anything.
 *
 * @module features/project-creation/ui/hooks/useErpIntegrationHolder
 */

import { useEffect, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { bringsSystem } from '@/features/components/services/appBuilderComponentLinks';
import type { UnavailableEntries } from '@/features/project-creation/ui/components/integration-flow/stages/CatalogStage';
import type { WizardState } from '@/types/webview';
import type {
    CheckErpIntegrationHolderRequest,
    CheckErpIntegrationHolderResponse,
} from '@/types/webviewRequests';

/**
 * Which project runs the instance's ERP integration, as the Add Integration modal
 * takes it: the banner saying what to do instead, and the tiles to grey out.
 */
export type ErpIntegrationHolder = UnavailableEntries;

/** The dashboard's question: about the open project. */
export const ASK_ABOUT_OPEN_PROJECT: CheckErpIntegrationHolderRequest = {};

/** Requests in flight, by question, so concurrent askers share one. */
const asking = new Map<string, Promise<ErpIntegrationHolder | undefined>>();

/**
 * Whether any of these selected ids is the ERP integration.
 *
 * @param selected - selected App Builder component ids
 * @returns whether one brings a system
 */
export function selectsErpIntegration(selected: readonly string[] | undefined): boolean {
    const catalog = getAppBuilderComponentCatalog();
    return (selected ?? []).some((id) => {
        const entry = catalog.find((candidate) => candidate.id === id);
        return entry !== undefined && bringsSystem(entry, catalog);
    });
}

/**
 * The wizard's question: asked on Integrations, once a backend is chosen.
 *
 * @param state - the wizard state
 * @returns the request, or undefined when there is nothing to ask yet
 */
export function wizardHolderRequest(state: WizardState): CheckErpIntegrationHolderRequest | undefined {
    const backend = state.components?.backend;
    if (state.activeBuildArea !== 'integrations' || !backend) return undefined;
    return {
        backend,
        componentConfigs: state.componentConfigs ?? {},
        ...(state.editProjectPath ? { editProjectPath: state.editProjectPath } : {}),
    };
}

/** The answer as the modal and the wizard use it: the message, and every ERP integration entry. */
function toHolder(data: CheckErpIntegrationHolderResponse['data'] | undefined): ErpIntegrationHolder | undefined {
    if (!data?.message) return undefined;
    const catalog = getAppBuilderComponentCatalog();
    return { message: data.message, ids: catalog.filter((entry) => bringsSystem(entry, catalog)).map((entry) => entry.id) };
}

/** Ask the host; a failed request is no answer. */
async function fetchHolder(key: string): Promise<ErpIntegrationHolder | undefined> {
    try {
        const response = await webviewClient.request<CheckErpIntegrationHolderResponse>(
            'check-erp-integration-holder',
            JSON.parse(key) as CheckErpIntegrationHolderRequest,
        );
        return toHolder(response?.data);
    } catch {
        return undefined;
    } finally {
        asking.delete(key);
    }
}

/** Ask once per question in flight. */
function ask(key: string): Promise<ErpIntegrationHolder | undefined> {
    const inFlight = asking.get(key) ?? fetchHolder(key);
    asking.set(key, inFlight);
    return inFlight;
}

/**
 * Which project already runs an ERP integration on the instance asked about.
 *
 * @param request - the question ({@link wizardHolderRequest} or {@link ASK_ABOUT_OPEN_PROJECT}),
 *   or undefined to ask nothing
 * @returns the holder's message and the tiles to grey out, or undefined when none
 *   (or no answer yet)
 */
export function useErpIntegrationHolder(
    request: CheckErpIntegrationHolderRequest | undefined,
): ErpIntegrationHolder | undefined {
    const key = request ? JSON.stringify(request) : undefined;
    const [answer, setAnswer] = useState<{ key: string; holder: ErpIntegrationHolder }>();
    // Whether a holder is on screen. "No holder" is where the hook starts, so the
    // common answer touches no state unless it has to clear an earlier one.
    const showing = useRef(false);

    useEffect(() => {
        if (!key) return;
        let mounted = true;
        void ask(key).then((holder) => {
            if (!mounted || (!holder && !showing.current)) return;
            showing.current = holder !== undefined;
            setAnswer(holder ? { key, holder } : undefined);
        });
        return () => {
            mounted = false;
        };
    }, [key]);

    return answer && answer.key === key ? answer.holder : undefined;
}
