/**
 * The demo setup checks Demo Builder can run itself (AB-26x), by the name a catalog
 * entry's `setupSteps[].check` gives.
 *
 * Each check reads Commerce over REST and answers whether the step is done, in words the
 * flyout shows. Pure over the read it is handed, so it is tested without Commerce.
 *
 * @module features/app-builder/services/setupChecks
 */

import type { SetupCheck } from '@/types/appBuilderComponents';

/** A signed Commerce REST GET, answering the body as text or an "Error: " line. */
export type CommerceRead = (path: string) => Promise<string>;

/** How a check came out. `done` undefined = the check could not tell. */
export interface SetupCheckResult {
    done?: boolean;
    note: string;
}

interface CompanyRow {
    id?: number;
    company_name?: string;
    customer_group_id?: number;
}

/** The companies Commerce holds, or the error line it answered. */
async function readCompanies(read: CommerceRead): Promise<CompanyRow[] | string> {
    const text = await read('company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]');
    if (text.startsWith('Error:')) return text;
    try {
        const parsed = JSON.parse(text.slice(text.indexOf('{'))) as { items?: CompanyRow[] };
        return parsed.items ?? [];
    } catch {
        return 'Error: Commerce answered something that is not a company list.';
    }
}

/**
 * Every company in a customer group no other company has. At the cart Commerce tells the
 * integration only the buyer's customer group, so companies sharing one get the same
 * prices; a shared catalog of its own is what gives a company its own group.
 */
async function companiesHaveOwnCatalogs(read: CommerceRead): Promise<SetupCheckResult> {
    const companies = await readCompanies(read);
    if (typeof companies === 'string') return { note: `Could not check: ${companies.replace(/^Error: /u, '')}` };
    if (companies.length === 0) return { note: 'Commerce has no companies yet.' };
    const byGroup = new Map<number, string[]>();
    for (const company of companies) {
        const group = company.customer_group_id ?? 0;
        byGroup.set(group, [...(byGroup.get(group) ?? []), company.company_name ?? `company ${company.id}`]);
    }
    const shared = [...byGroup.entries()].filter(([, names]) => names.length > 1);
    if (shared.length === 0) {
        return { done: true, note: `Each of the ${companies.length} companies has a customer group of its own.` };
    }
    const lines = shared.map(([group, names]) => `${names.join(', ')} share customer group ${group}`);
    return { done: false, note: `${lines.join('; ')}.` };
}

const CHECKS: Record<SetupCheck, (read: CommerceRead) => Promise<SetupCheckResult>> = {
    'companies-have-own-catalogs': companiesHaveOwnCatalogs,
};

/**
 * Run one named check.
 *
 * @param check - the check the step names
 * @param read - a signed Commerce REST GET
 * @returns whether the step is done, and why
 */
export function runSetupCheck(check: SetupCheck, read: CommerceRead): Promise<SetupCheckResult> {
    return CHECKS[check](read);
}
