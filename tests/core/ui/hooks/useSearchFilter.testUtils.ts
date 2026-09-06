/**
 * Shared rows for the search suites.
 *
 * The hook and the predicate it wraps are asked the same questions — does a
 * lowercase query find a capitalised title, does one field matching count, what
 * happens to a row whose field is absent — so they read the same rows rather
 * than each inventing a set that answers only its own questions.
 *
 * `React` appears in two rows on purpose: it is what makes "matches more than
 * one" and "matches across fields" different assertions rather than the same one
 * twice.
 */

export interface TestItem extends Record<string, unknown> {
    id: string;
    title: string;
    description: string;
    tags?: string[];
}

export const testItems: TestItem[] = [
    { id: '1', title: 'React Hooks', description: 'Learn about React Hooks' },
    { id: '2', title: 'TypeScript Guide', description: 'Master TypeScript' },
    { id: '3', title: 'Testing React', description: 'Test your React applications' },
    { id: '4', title: 'Node.js Basics', description: 'Introduction to Node.js' },
];

/** A row whose searched field is absent — the case String(null) turns into text. */
export const rowWithNoTitle: { id: string; title: string | null } = { id: '9', title: null };
