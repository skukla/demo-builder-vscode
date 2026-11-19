/**
 * Plain words: the one door failure text takes to a person (PL-102; owner, 2026-11-19).
 *
 * A failure a person reads is in plain words, never a library's, a CLI's or a server's own message.
 * Every field a screen draws a failure from is typed {@link PlainText}, and only these make one:
 * {@link plain} for a literal, {@link plainLine} for a sentence built from plain pieces,
 * {@link plainName} for a name the SC sees, {@link plainFailure} to translate whatever arrived, and a
 * translator module's own words through {@link translated}. eslint bans `as PlainText` outside this
 * module, and limits `translated` to the translator modules, so the compiler refuses raw text at
 * every such field. The raw text is not lost: it goes to the log and, for an agent, to a separate
 * `detail` field.
 *
 * Moved to core from the data installer (release walk F221, where it began) when the rule became
 * the whole extension's. The data installer's Commerce translations sit on top of it.
 *
 * {@link notYetPlain} is the named debt: text that is not yet typed at its source (a handler's
 * `error`, until PL-102 slice 4), translated where the cause is known and otherwise passed through as
 * today. Its calls are counted by `tests/sop/plain-text-debt.test.ts` against a ceiling that only
 * falls.
 *
 * Pure, with no Node or VS Code import: the webview bundles draw from it too.
 *
 * @module core/utils/plainText
 */

declare const PLAIN: unique symbol;

/** Words fit for a person's screen. Made only by the functions in this module. */
export type PlainText = string & { readonly [PLAIN]: true };

/** A literal, and only a literal: a string built at run time is `never` here. */
type Literal<T extends string> = Record<never, never> extends Record<T, 1> ? never : T;

/**
 * A translator's own words. ONLY for a module whose job is turning raw text into plain words (the
 * data installer's `plainFailure`); eslint refuses its import anywhere else.
 */
export function translated(text: string): PlainText {
    return text as PlainText;
}

/** A literal already in plain words. Anything built at run time has to come through a translator. */
export function plain<T extends string>(text: Literal<T>): PlainText {
    return translated(text);
}

/** A name the SC sees and knows: a project, a website, a datapack. Never error text. */
export function plainName(name: string): PlainText {
    return translated(name);
}

/** A sentence written here with plain pieces in it: plainLine`Couldn't open ${plainName(title)}.` */
export function plainLine(
    strings: TemplateStringsArray,
    ...parts: readonly PlainText[]
): PlainText {
    return translated(
        strings.reduce((line, piece, i) => `${line}${piece}${i < parts.length ? parts[i] : ''}`, ''),
    );
}

/** Plain lines as one paragraph, a space between. */
export function plainJoin(lines: readonly PlainText[]): PlainText {
    return translated(lines.join(' '));
}

/** When nothing says what went wrong (owner decision 2, 2026-11-19). */
export const COULDNT_TELL = plain("Demo Builder couldn't tell what went wrong.");

/** No answer came: a request that timed out or a connection that dropped. */
export const NO_ANSWER =
    /did not (respond|answer)|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket hang up/iu;

export const NO_ANSWER_IN_TIME = plain('No answer came in time.');

/** Raw words whose meaning is known, in plain words. The first that matches says it. */
const KNOWN: ReadonlyArray<readonly [RegExp, PlainText]> = [
    // git's 3-way apply without the file versions the change was made from (walk F295).
    [
        /lacks the necessary blob/u,
        plain(
            "Couldn't merge the changes: the versions of the files the changes were made from aren't available.",
        ),
    ],
    [NO_ANSWER, NO_ANSWER_IN_TIME],
];

function textOf(raw: unknown): string {
    if (raw instanceof Error) return raw.message;
    return typeof raw === 'string' ? raw : '';
}

/** The plain words for raw text whose meaning is known; undefined when it is not known. */
export function knownPlain(raw: unknown): PlainText | undefined {
    const text = textOf(raw);
    return KNOWN.find(([pattern]) => pattern.test(text))?.[1];
}

/** An Error that carries the sentence a person reads; its `message` stays the raw text for the log. */
export class PlainError extends Error {
    constructor(
        readonly plain: PlainText,
        message: string = plain,
    ) {
        super(message);
        this.name = 'PlainError';
    }
}

/** A thrown failure's plain sentence, when it carries one. */
export function plainOf(error: unknown): PlainText | undefined {
    return error instanceof PlainError ? error.plain : undefined;
}

/**
 * Whatever arrived, in plain words: a {@link PlainError}'s sentence, a known meaning, or
 * {@link COULDNT_TELL}. Unknown text is never passed through; log it where it is caught.
 */
export function plainFailure(raw: unknown): PlainText {
    return plainOf(raw) ?? knownPlain(raw) ?? COULDNT_TELL;
}

/**
 * PL-102 DEBT. Text not yet typed at its source, translated where its meaning is known and
 * otherwise passed through unchanged, as it was before the rule. Each call is counted against a
 * ceiling that only falls (`tests/sop/plain-text-debt.test.ts`); slices 3 to 6 bring it to zero.
 */
export function notYetPlain(text: string): PlainText {
    return knownPlain(text) ?? translated(text);
}
