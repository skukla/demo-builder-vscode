/**
 * The catalog views a project's ACO instance has, as a person picks one (PL-60): the id the storefront
 * sends, the name to choose it by, and the locale it reads, which then needs no second question.
 *
 * @module features/data-installer/services/aco/acoCatalogViews
 */

import type { AcoAdminClient } from './acoAdminClient';
import type { AcoCatalogViewChoice } from '@/types/aco';

const VIEWS_QUERY = '{ catalogViews { viewId name sources { locale } } }';

interface ViewsAnswer {
    data?: { catalogViews?: Array<{ viewId: string; name?: string; sources?: Array<{ locale?: string }> }> };
    errors?: Array<{ message?: string }>;
}

/**
 * @throws Error in the API's own words when it answers errors
 * @throws AcoApiError when it refuses the credential
 */
export async function listAcoCatalogViews(admin: Pick<AcoAdminClient, 'graphql'>): Promise<AcoCatalogViewChoice[]> {
    const answer = JSON.parse(await admin.graphql(VIEWS_QUERY)) as ViewsAnswer;
    if (answer.errors?.length) throw new Error(answer.errors[0].message ?? 'ACO answered with errors.');
    return (answer.data?.catalogViews ?? []).map((view) => ({
        id: view.viewId,
        name: view.name ?? view.viewId,
        ...(view.sources?.[0]?.locale ? { locale: view.sources[0].locale } : {}),
    }));
}
