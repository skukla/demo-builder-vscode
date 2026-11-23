/**
 * A CSV file as rows of fields (RFC 4180).
 *
 * Written here rather than taken from npm (owner, 2026-11-05, wary of the registry after its recent
 * attacks; PL-94). A file an SC hands over may have passed through Excel, so this reads:
 *
 * - a quoted field holding commas, line breaks, and quotes written twice (`""`);
 * - `\r\n`, `\n` and a lone `\r` as the end of a line, and a last line with or without one;
 * - the byte-order mark Excel writes at the start of a UTF-8 file.
 *
 * A quote opened and never closed means the file was cut short or is not CSV, and is refused rather
 * than read as one enormous field.
 *
 * @module features/data-installer/services/exportPack/csvTable
 */

/** A file that cannot be read as CSV, in words an SC can act on. */
export class CsvError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CsvError';
    }
}

const BYTE_ORDER_MARK = 0xfeff;

/** One character's effect on a field being read outside quotes: the field's end, the line's, or neither. */
function endOf(text: string, at: number): 'field' | 'line' | 'crlf' | undefined {
    const c = text[at];
    if (c === ',') return 'field';
    if (c === '\r' && text[at + 1] === '\n') return 'crlf';
    return c === '\n' || c === '\r' ? 'line' : undefined;
}

/**
 * Every row of the file, each a list of its fields as written.
 *
 * @throws CsvError when a quoted field never closes
 */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    let at = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
    while (at < text.length) {
        const c = text[at];
        if (quoted) {
            if (c === '"' && text[at + 1] === '"') {
                field += '"';
                at += 2;
                continue;
            }
            if (c === '"') quoted = false;
            else field += c;
            at += 1;
            continue;
        }
        const end = endOf(text, at);
        if (c === '"' && field === '') quoted = true;
        else if (end === 'field') {
            row.push(field);
            field = '';
        } else if (end) {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            if (end === 'crlf') at += 1;
        } else field += c;
        at += 1;
    }
    if (quoted)
        throw new CsvError(
            'The file ends inside a quoted field, so it was cut short or is not a CSV file.',
        );
    if (field !== '' || row.length > 0) rows.push([...row, field]);
    return rows;
}
