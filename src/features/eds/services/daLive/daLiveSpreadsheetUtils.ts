/**
 * DA.live Spreadsheet Utilities
 *
 * Pure functions for converting between EDS spreadsheet JSON format
 * and HTML table format used by DA.live.
 *
 * Extracted from DaLiveContentOperations for better testability.
 */

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Wrap table(s) in a minimal HTML document
 */
export function wrapInDocument(content: string): string {
    return `<!DOCTYPE html>\n<html>\n<body>\n${content}\n</body>\n</html>`;
}

/**
 * Create an HTML table from columns and data
 */
export function createHtmlTable(
    columns: string[],
    data: Record<string, unknown>[],
    sheetName?: string,
): string {
    const headerRow = `<tr>${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}</tr>`;
    const dataRows = data
        .map(
            row =>
                `<tr>${columns.map(col => `<td>${escapeHtml(String(row[col] ?? ''))}</td>`).join('')}</tr>`,
        )
        .join('\n');

    const className = sheetName ? ` class="sheet-${sheetName}"` : '';
    return `<table${className}>\n<thead>\n${headerRow}\n</thead>\n<tbody>\n${dataRows}\n</tbody>\n</table>`;
}

/**
 * Convert EDS spreadsheet JSON to HTML table format
 * Handles both single-sheet and multi-sheet formats
 *
 * @param json - EDS spreadsheet JSON (from .json endpoint)
 * @returns HTML string or null if conversion fails
 */
export function convertSpreadsheetJsonToHtml(json: Record<string, unknown>): string | null {
    try {
        // Check for multi-sheet format
        if (json[':type'] === 'multi-sheet' && Array.isArray(json[':names'])) {
            // Multi-sheet: create multiple tables
            const names = json[':names'] as string[];
            const tables = names
                .filter(name => !name.startsWith('dnt')) // Skip "do not translate" sheets
                .map(name => {
                    const sheet = json[name] as {
                        columns?: string[];
                        data?: Record<string, unknown>[];
                    };
                    if (!sheet?.data) return '';
                    return createHtmlTable(sheet.columns || [], sheet.data, name);
                })
                .filter(Boolean)
                .join('\n');
            return wrapInDocument(tables);
        }

        // Single-sheet format
        const data = json.data as Record<string, unknown>[] | undefined;
        const columns = json.columns as string[] | undefined;
        if (!data || !Array.isArray(data)) return null;

        const table = createHtmlTable(columns || Object.keys(data[0] || {}), data);
        return wrapInDocument(table);
    } catch {
        return null;
    }
}
