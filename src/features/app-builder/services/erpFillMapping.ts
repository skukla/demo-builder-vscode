/**
 * After a fill, Demo Builder pre-fills the integration's mapping (AB-26y; the design's "Demo
 * Builder pre-fills the mapping", owner 2026-10-02): the ERP owns its sales organizations,
 * each naming the website it serves (the ERP's `GET settings/setup`, contract v15), and the
 * integration keeps, per ERP and per website, which sales organization that website sells
 * under (`settings.websites[<code>]` on the ERP's list entry, the integration's
 * `lib/erp-settings.js`).
 *
 * The rule: a website whose mapping is still unset for this ERP gets the ERP's sales
 * organization and its name. A value already there, at the website or on the ERP's own
 * entry, was set by someone on the Admin page and is kept, and reported.
 *
 * Pure: every read and the write are handed in (`erpMappingAfterFill.ts` wires them).
 *
 * @module features/app-builder/services/erpFillMapping
 */

/** One of the ERP's sales organizations, as `GET settings/setup` answers it. */
export interface ErpSalesOrganization {
    code: string;
    name: string;
    currency: string | null;
    /** The Commerce website it serves; null when it serves none. */
    websiteCode: string | null;
}

/** One website's mapping for one ERP (by its component id). */
interface ErpMappingRow {
    erp: string;
    website: string;
    salesOrg: string;
}

/** What the mapping step did, website by website. */
export interface ErpMappingReport {
    /** Was unset; now the ERP's sales organization. */
    filled: ErpMappingRow[];
    /** Already set, left as it was; `erpSalesOrg` when the ERP names a different one. */
    kept: Array<ErpMappingRow & { erpSalesOrg?: string }>;
    /** A sales organization naming a website Commerce does not have. */
    skipped?: Array<ErpMappingRow & { reason: string }>;
    /** A write the integration refused; the fill still stands. */
    failed?: Array<ErpMappingRow & { reason: string }>;
}

export interface ErpMappingDeps {
    /** The ERP's own sales organizations. */
    salesOrganizations: () => Promise<ErpSalesOrganization[]>;
    /** The website codes Commerce has. */
    websiteCodes: () => Promise<string[]>;
    /** This ERP's own settings as the integration's list holds them; undefined when it has none. */
    entrySettings: () => Promise<unknown>;
    /** Save one website's values for this ERP. */
    save: (website: string, values: Record<string, string>) => Promise<void>;
}

const SALES_ORG = 'structure_sales_org';
const SALES_ORG_NAME = 'structure_sales_org_name';

function recordOf(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function textOf(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

/** What the entry already says for one website: its value there, else the ERP's own. */
function alreadySet(settings: unknown, website: string): { salesOrg?: string; named: boolean } {
    const own = recordOf(settings);
    const atWebsite = recordOf(recordOf(own.websites)[website]);
    return {
        salesOrg: textOf(atWebsite[SALES_ORG]) ?? textOf(own[SALES_ORG]),
        named: textOf(atWebsite[SALES_ORG_NAME]) !== undefined,
    };
}

/**
 * Fill one ERP's unset website mappings from its own sales organizations.
 *
 * @param erp - the ERP's component id, as the report names it
 * @param deps - the ERP's sales organizations, Commerce's websites, the entry, the save
 * @returns what was filled, kept, skipped and not saved; throws only when a READ fails
 */
export async function fillErpMapping(erp: string, deps: ErpMappingDeps): Promise<ErpMappingReport> {
    const report: ErpMappingReport = { filled: [], kept: [] };
    const serving = (await deps.salesOrganizations()).filter((org) => org.websiteCode);
    if (serving.length === 0) return report;
    const [websites, settings] = await Promise.all([deps.websiteCodes(), deps.entrySettings()]);
    const skipped: NonNullable<ErpMappingReport['skipped']> = [];
    const failed: NonNullable<ErpMappingReport['failed']> = [];
    for (const org of serving) {
        const website = org.websiteCode ?? '';
        const row = { erp, website, salesOrg: org.code };
        if (!websites.includes(website)) {
            skipped.push({ ...row, reason: `Commerce has no website "${website}"` });
            continue;
        }
        const set = alreadySet(settings, website);
        if (set.salesOrg) {
            const differs = set.salesOrg !== org.code;
            report.kept.push({
                erp,
                website,
                salesOrg: set.salesOrg,
                ...(differs ? { erpSalesOrg: org.code } : {}),
            });
            continue;
        }
        try {
            await deps.save(website, {
                [SALES_ORG]: org.code,
                ...(set.named ? {} : { [SALES_ORG_NAME]: org.name }),
            });
            report.filled.push(row);
        } catch (error) {
            failed.push({ ...row, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return {
        ...report,
        ...(skipped.length ? { skipped } : {}),
        ...(failed.length ? { failed } : {}),
    };
}

/** A reason without its closing full stop, so it can sit inside a sentence. */
export function clause(text: string): string {
    return text.replace(/[.!?\s]+$/u, '');
}

/**
 * The step's words: `said` when anything was filled (a progress step, not a warning), and
 * `warning` when a write failed (the run's warning; the fill still stands).
 *
 * @param report - what the step did
 * @returns the sentences, each absent when there is nothing to say
 */
export function mappingNotes(report: ErpMappingReport): { said?: string; warning?: string } {
    const filled = report.filled.map(
        (row) => `website ${row.website} sells under sales organization ${row.salesOrg}`,
    );
    const failed = report.failed ?? [];
    const websites = failed.map((row) => row.website).join(', ');
    return {
        ...(filled.length
            ? { said: `Filled the integration's mapping from the ERP: ${filled.join('; ')}.` }
            : {}),
        ...(failed.length
            ? {
                  warning:
                      `Demo data loaded; the mapping for website ${websites} was not saved: ` +
                      `${clause(failed[0].reason)}. Load demo data again to retry.`,
              }
            : {}),
    };
}

/**
 * Several fills' mapping reports as one, each row already naming its ERP.
 *
 * @param reports - each fill's report; undefined for a fill that skipped the step
 * @returns one report, or undefined when no fill ran the step
 */
export function mergeMappings(
    reports: Array<ErpMappingReport | undefined>,
): ErpMappingReport | undefined {
    const ran = reports.filter((report): report is ErpMappingReport => report !== undefined);
    if (ran.length === 0) return undefined;
    const skipped = ran.flatMap((report) => report.skipped ?? []);
    const failed = ran.flatMap((report) => report.failed ?? []);
    return {
        filled: ran.flatMap((report) => report.filled),
        kept: ran.flatMap((report) => report.kept),
        ...(skipped.length ? { skipped } : {}),
        ...(failed.length ? { failed } : {}),
    };
}
