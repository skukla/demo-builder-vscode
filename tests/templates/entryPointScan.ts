/**
 * Every entry point a person or an agent can use, read OUT OF SOURCE.
 *
 * The action-door ledger used to list only the actions somebody had audited, so an
 * action nobody audited could grow a second door and nothing would fail. This module
 * makes the list complete by construction: it enumerates every entry point
 * mechanically, and `action-doors-coverage.test.ts` fails on any the ledger has not
 * assigned to an action or to a no-spine bucket.
 *
 * THREE KINDS, each read from where it is declared:
 *  - `handler:<type>`: a key of a `defineHandlers({...})` map, a literal
 *    `comm.on('type'` / `comm.onStreaming('type'` registration, and the sidebar's two
 *    type lists (`HANDLED_MESSAGE_TYPES`, `COMMAND_BUTTONS`). A type registered in
 *    several maps is one entry point.
 *  - `command:<id>`: every `registerCommand(` whose id is a literal or a constant,
 *    plus every `contributes.commands` row in package.json.
 *  - `tool:<name>`: every MCP tool, through `toolDeclarations()` (both the
 *    `registerTool('name'` form and the `{ tool: 'name' }` descriptor row).
 *
 * The functions here are pure over a `Map<file, code>` so the suite can prove them on
 * planted sources before trusting them on `src/`.
 */

/** A kind of entry point. */
export const ENTRY_KINDS = ['handler', 'command', 'tool'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Find the text between the bracket at `open` and its matching closer. */
function balancedAt(code: string, open: number): string {
    const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
    const closer = pairs[code[open]];
    let depth = 0;
    for (let i = open; i < code.length; i++) {
        if (code[i] === code[open]) depth++;
        else if (code[i] === closer && --depth === 0) return code.slice(open + 1, i);
    }
    return code.slice(open + 1);
}

/** Split text on commas that sit at bracket depth 0 and outside string literals. */
function topLevelSegments(text: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = '';
        } else if (c === "'" || c === '"' || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ',' && depth === 0) {
            out.push(text.slice(start, i));
            start = i + 1;
        }
    }
    out.push(text.slice(start));
    return out.map((s) => s.trim()).filter(Boolean);
}

/** One key of an object literal and the text of its value (the key itself for shorthand). */
export interface MapEntry {
    key: string;
    value: string;
}

/**
 * The top-level keys of an object literal's body (the text inside its braces). A
 * spread (`...other`) is not a key: the map it spreads is enumerated where it is
 * defined. Computed keys (`[x]:`) are returned as `[x]` so a test can refuse them.
 */
export function objectKeys(body: string): MapEntry[] {
    const entries: MapEntry[] = [];
    for (const seg of topLevelSegments(body)) {
        if (seg.startsWith('...')) continue;
        const m = /^(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*)|(\[[^\]]+\]))\s*(:|\(|$)/.exec(seg);
        if (!m) continue;
        const key = m[2] ?? m[3] ?? m[4];
        entries.push({ key, value: m[5] === ':' ? seg.slice(m[0].length).trim() : key });
    }
    return entries;
}

/** A handler map found in source: where it is, its keys, and the maps it spreads in. */
export interface HandlerMapSite {
    file: string;
    entries: MapEntry[];
    spreads: string[];
}

/** The identifiers spread into an object literal's body (`...name`). */
function spreadsOf(body: string): string[] {
    return topLevelSegments(body)
        .map((seg) => /^\.\.\.\s*([A-Za-z_$][\w$]*)$/.exec(seg)?.[1])
        .filter((n): n is string => Boolean(n));
}

/**
 * Every object literal assigned to a `const`/`let` in comment-stripped code, by name,
 * looking through wrapper calls (`announcingChanges(defineHandlers({...}))`). Only the
 * ones reachable from a registration are handler maps; `handlerMaps` decides that.
 */
export function namedObjects(code: string): Map<string, string> {
    const out = new Map<string, string>();
    const re = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[\w<>[\], ]+)?\s*=\s*(?:[\w$.]+(?:<[^>]*>)?\(\s*)*\{/g;
    for (const m of code.matchAll(re)) {
        out.set(m[1], balancedAt(code, (m.index ?? 0) + m[0].length - 1));
    }
    return out;
}

/** The bodies of every `defineHandlers({...})` call, named or not. */
function defineHandlersBodies(code: string): string[] {
    const bodies: string[] = [];
    for (const m of code.matchAll(/\bdefineHandlers(?:<[^>]*>)?\(\s*\{/g)) {
        const start = m.index ?? 0;
        if (/function\s*$/.test(code.slice(Math.max(0, start - 10), start))) continue;
        bodies.push(balancedAt(code, start + m[0].length - 1));
    }
    return bodies;
}

/**
 * The names a webview or an agent registers handler maps by: `getRegisteredTypes(x)`,
 * a panel's `handlerMaps() { return [a, b] }`, and, in a `*Descriptors.ts` file, a
 * descriptor row's `map: x`.
 */
export function registeredMapNames(file: string, code: string): string[] {
    const names = [...code.matchAll(/\bgetRegisteredTypes\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map(
        (m) => m[1]
    );
    for (const m of code.matchAll(/\bhandlerMaps\(\)[^{]*\{\s*return\s*\[([^\]]*)\]/g)) {
        names.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
    }
    if (file.endsWith('Descriptors.ts')) {
        names.push(...[...code.matchAll(/\bmap:\s*([A-Za-z_$][\w$]*)\s*,/g)].map((m) => m[1]));
    }
    return names;
}

/** The generic parameter names a registration loop uses; they are not map names. */
export const GENERIC_MAP_PARAMETERS = ['map', 'handlers'];

/**
 * Every handler map: each `defineHandlers({...})` call, plus every map a registration
 * names, plus every map spread into either, followed to its definition. A registered
 * or spread name with no definition anywhere is returned in `unresolved`, so a map
 * this scan cannot read fails instead of vanishing.
 */
export function handlerMaps(
    sources: Map<string, string>
): { maps: HandlerMapSite[]; unresolved: string[] } {
    const objects = new Map<string, { file: string; body: string }[]>();
    const factoryBuilt = new Set<string>();
    for (const [file, code] of sources) {
        for (const [name, body] of namedObjects(code)) {
            objects.set(name, [...(objects.get(name) ?? []), { file, body }]);
        }
        // `const x = createXHandlers(deps)`: a factory whose own file builds the map with
        // `defineHandlers`, so the map is already read there as an unnamed call.
        if (defineHandlersBodies(code).length > 0) {
            for (const m of code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*create\w*\(/g)) {
                factoryBuilt.add(m[1]);
            }
        }
    }
    const maps: HandlerMapSite[] = [];
    const seen = new Set<string>();
    const unresolved = new Set<string>();
    const pending: string[] = [];
    const take = (file: string, body: string): void => {
        const spreads = spreadsOf(body);
        maps.push({ file, entries: objectKeys(body), spreads });
        pending.push(...spreads);
    };
    for (const [file, code] of sources) {
        for (const body of defineHandlersBodies(code)) take(file, body);
        for (const name of registeredMapNames(file, code)) {
            if (!GENERIC_MAP_PARAMETERS.includes(name)) pending.push(name);
        }
    }
    while (pending.length > 0) {
        const name = pending.pop()!;
        if (seen.has(name)) continue;
        seen.add(name);
        const found = objects.get(name) ?? [];
        if (found.length === 0 && !factoryBuilt.has(name)) unresolved.add(name);
        for (const { file, body } of found) {
            // A named `defineHandlers` map was already read as a call above.
            if (!defineHandlersBodies(sources.get(file) ?? '').includes(body)) take(file, body);
        }
    }
    return { maps, unresolved: [...unresolved].sort() };
}

/** Literal message types registered straight on a communication manager. */
export function directRegistrations(code: string): string[] {
    const re = /\b(?:comm|communicationManager)\.(?:on|onStreaming)\(\s*(['"])([A-Za-z][\w-]*)\1/g;
    return [...code.matchAll(re)].map((m) => m[2]);
}

/** The sidebar's message types: its handled-type array and its command-button keys. */
export function sidebarTypes(code: string): string[] {
    const handled = /HANDLED_MESSAGE_TYPES\s*=\s*\[/.exec(code);
    const buttons = /COMMAND_BUTTONS\s*=\s*new Map<[^>]*>\(\s*Object\.entries\(\s*\{/.exec(code);
    const types: string[] = [];
    if (handled) {
        const body = balancedAt(code, handled.index + handled[0].length - 1);
        types.push(...[...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]));
    }
    if (buttons) {
        const body = balancedAt(code, buttons.index + buttons[0].length - 1);
        types.push(...objectKeys(body).map((e) => e.key));
    }
    return types;
}

/** The file that builds the sidebar's message list. */
export const SIDEBAR_PROVIDER = 'features/sidebar/providers/sidebarProvider.ts';

/**
 * Every message type, with the handler expression each registering file gives it.
 * Keyed type -> file -> value; a direct registration's value is `(direct)`, a
 * sidebar type's `(sidebar)`.
 */
export function handlerSites(sources: Map<string, string>): Map<string, Map<string, string>> {
    const sites = new Map<string, Map<string, string>>();
    const add = (type: string, file: string, value: string): void => {
        const byFile = sites.get(type) ?? new Map<string, string>();
        byFile.set(file, value);
        sites.set(type, byFile);
    };
    for (const map of handlerMaps(sources).maps) {
        for (const e of map.entries) add(e.key, map.file, e.value);
    }
    for (const [file, code] of sources) {
        for (const t of directRegistrations(code)) add(t, file, '(direct)');
        if (file === SIDEBAR_PROVIDER) for (const t of sidebarTypes(code)) add(t, file, '(sidebar)');
    }
    return sites;
}

/**
 * Every VS Code command id: literal or constant `registerCommand(` ids, plus the ids
 * package.json contributes. A constant is resolved from its `NAME = '...'` declaration
 * anywhere in the sources; an unresolvable non-literal id is returned in `unresolved`.
 */
export function commandIds(
    sources: Map<string, string>,
    contributed: string[]
): { ids: string[]; unresolved: string[] } {
    const constants = new Map<string, string>();
    for (const code of sources.values()) {
        for (const m of code.matchAll(/\b([A-Z][A-Z0-9_]+)\s*=\s*(['"])(demoBuilder\.[^'"]+)\2/g)) {
            constants.set(m[1], m[3]);
        }
    }
    const ids = new Set(contributed);
    const unresolved: string[] = [];
    for (const code of sources.values()) {
        for (const m of code.matchAll(/\bregisterCommand\(\s*([^,)\s]+)/g)) {
            const arg = m[1];
            const literal = /^(['"])([^'"]+)\1$/.exec(arg);
            if (literal) ids.add(literal[2]);
            else if (constants.has(arg)) ids.add(constants.get(arg)!);
            else if (/^[A-Z][A-Z0-9_]+$/.test(arg)) unresolved.push(arg);
            // A lower-case identifier is the generic wrapper's own parameter
            // (`registerCommand(command, ...)`); its callers pass literals, read above.
        }
    }
    return { ids: [...ids].sort(), unresolved };
}

/** `kind:name` for display and for ledger keys. */
export const entryId = (kind: EntryKind, name: string): string => `${kind}:${name}`;

/** A module specifier as a src-relative path without extension (`@/a/b`, `./c` from a file). */
function resolveModule(fromFile: string, spec: string): string {
    if (spec.startsWith('@/')) return spec.slice(2);
    if (!spec.startsWith('.')) return spec;
    const parts = fromFile.split('/').slice(0, -1);
    for (const seg of spec.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
    }
    return parts.join('/');
}

/**
 * Where the handler a map entry names is IMPLEMENTED: `module#name` for an imported or
 * local function, `file#inline:<type>` for a function written in the map, and
 * `ref:<map>` for `otherMap['type']` (the entry borrows another map's handler, so it is
 * the same implementation by construction).
 */
export function handlerOrigin(file: string, code: string, type: string, value: string): string {
    const ref = /^([A-Za-z_$][\w$]*)\[\s*['"][^'"]+['"]\s*\]$/.exec(value);
    if (ref) return `ref:${ref[1]}`;
    const dotted = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(value);
    if (dotted) {
        const ns = new RegExp(`import\\s+\\*\\s+as\\s+${dotted[1]}\\s+from\\s+['"]([^'"]+)['"]`).exec(code);
        return `${ns ? resolveModule(file, ns[1]) : file}#${dotted[2]}`;
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(value)) return `${file}#inline:${type}`;
    for (const m of code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        for (const spec of m[1].split(',').map((s) => s.trim())) {
            const [orig, alias] = spec.split(/\s+as\s+/);
            if ((alias ?? orig) === value) return `${resolveModule(file, m[2])}#${orig}`;
        }
    }
    return `${file.replace(/\.tsx?$/, '')}#${value}`;
}
