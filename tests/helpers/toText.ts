import { inspect } from 'util';

/**
 * Render a loosely typed mock argument (fetch URL or body, fs path or data) as text.
 *
 * Strings pass through, URLs give their href, byte buffers decode as UTF-8,
 * Errors give "Name: message", everything else (objects, numbers, null) is inspected,
 * so no value ever becomes "[object Object]".
 *
 * @param value - Anything a mocked call may have received.
 * @returns The value as readable text.
 */
export function toText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof URL) return value.href;
    if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    return inspect(value);
}
