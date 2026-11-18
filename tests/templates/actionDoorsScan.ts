/**
 * The action-door ledger's shape and its scanner.
 *
 * The ledger (`action-doors.ledger.json`) lists, per user action, the files allowed to
 * call into that action's spine: its DOORS. This module types the ledger (the JSON is
 * imported and assigned to `ActionDoorLedger`, so `npm run typecheck:tests` reads its
 * shape) and holds the pure scanning functions, so `action-doors.test.ts` can prove them
 * on planted sources before trusting them on `src/`.
 *
 * @see .rptc/research/entry-point-drift-audit/research.md — the audit the ledger seeds from
 */
import rawLedger from './action-doors.ledger.json';

/** The audit's verdicts, one per door. */
export const DOOR_VERDICTS = ['one-door', 'same-policy', 'drift', 'lead'] as const;

/** A file allowed to call the action's entry. */
export interface Door {
    /** One of {@link DOOR_VERDICTS}. Checked at runtime (JSON widens strings). */
    verdict: string;
    /** What this door is for, and for a drift door the difference the audit found. */
    reason: string;
    /** Required for `drift` and `lead`: where the fix is tracked. */
    fix?: string;
    /** This door passes a mode argument on purpose (or as known drift), and why. */
    decidesMode?: string;
    /** This door does not read the action's `mustRead` fields, and why. */
    doesNotRead?: string;
}

/** A file that does the action's job WITHOUT calling the entry: known drift. */
export interface Bypass {
    reason: string;
    fix: string;
}

/** Arguments that are the spine's to decide; a door passing one re-decides a mode. */
export interface ModeRule {
    /** Regex sources, tested against the argument text of each entry call. */
    patterns: string[];
    why: string;
}

export interface ActionRow {
    /** The row number in the audit's table. */
    auditRow: number;
    /** Regex source for a call into the spine. End it with `\\(` to enable the mode rule. */
    entry: string;
    /** Files (relative to src/, a trailing `/` means a directory) that OWN the entry. */
    spine: string[];
    doors: Record<string, Door>;
    modeRule?: ModeRule;
    /** Spine result fields every door must read (a `should*` field hands the door a job). */
    mustRead?: string[];
    bypasses?: Record<string, Bypass>;
}

export interface ActionDoorLedger {
    _what: string;
    _rules: string[];
    _notCovered: string;
    /** How many drift/lead doors, bypasses and agent-only handlers may exist. Only falls. */
    exemptionCeiling: number;
    actions: Record<string, ActionRow>;
    /** Descriptor handler types no webview sends, each with why. */
    agentOnlyHandlers: Record<string, Bypass>;
}

export const LEDGER: ActionDoorLedger = rawLedger;

/** Find the text between the `(` at `open` and its matching `)`. */
export function argumentsAt(code: string, open: number): string {
    let depth = 0;
    for (let i = open; i < code.length; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')' && --depth === 0) return code.slice(open + 1, i);
    }
    return code.slice(open + 1);
}

/**
 * The argument text of every CALL of `entry` in already comment-stripped code. A
 * definition (`function name(`) is not a call and is skipped. An entry that does not
 * end in `(` yields '' per match.
 */
export function entryCalls(code: string, entry: string): string[] {
    const calls: string[] = [];
    for (const m of code.matchAll(new RegExp(entry, 'g'))) {
        const start = m.index ?? 0;
        if (/function\s*\*?\s*$/.test(code.slice(Math.max(0, start - 12), start))) continue;
        const end = start + m[0].length;
        calls.push(m[0].endsWith('(') ? argumentsAt(code, end - 1) : '');
    }
    return calls;
}

/** Whether a src-relative file is one of the spine's own. */
export function isSpine(file: string, spine: string[]): boolean {
    return spine.some((s) => (s.endsWith('/') ? file.startsWith(s) : file === s));
}

/** Files outside the spine whose code calls the entry, sorted. */
export function callersOf(
    sources: Map<string, string>,
    row: Pick<ActionRow, 'entry' | 'spine'>
): string[] {
    return [...sources]
        .filter(
            ([file, code]) => !isSpine(file, row.spine) && entryCalls(code, row.entry).length > 0
        )
        .map(([file]) => file)
        .sort();
}

/** Both directions: callers the ledger does not list, and listed doors that no longer call. */
export function diffDoors(
    callers: string[],
    listed: string[]
): { newDoors: string[]; staleDoors: string[] } {
    return {
        newDoors: callers.filter((f) => !listed.includes(f)),
        staleDoors: listed.filter((f) => !callers.includes(f)).sort(),
    };
}

/** The entry calls in this code whose arguments carry a mode the spine should decide. */
export function modeArguments(code: string, entry: string, rule: ModeRule): string[] {
    return entryCalls(code, entry).filter((args) =>
        rule.patterns.some((p) => new RegExp(p).test(args))
    );
}
