// TYPE-AWARE lint config for the test tree. Not part of `npm run lint`; the periodic
// sweep runs it as `npm run lint:types`, which holds four rules at zero (PL-113).
//
// The repo's main config is deliberately `tseslint.configs.recommended` — "Basic
// TS rules, not type-checked" — because type-aware linting needs a full program
// per run and is slow. That is the right default for a per-push gate and the
// wrong one for a refactor, because the rules that can actually reason about a
// cast are exactly the ones it leaves off.
//
// Why this beats a regex, which is the entire point: these rules run on the
// SYNTAX TREE with type information attached. They cannot edit a string literal
// or a comment, because those are not assertion nodes. A text-based strip did
// exactly that on 2026-09-01 — it deleted ` as never` from inside a detector's
// own control fixtures, silently disabling the proof that the detector works.
//
//   npx eslint --config eslint.casts.mjs tests/ --fix
import tseslint from 'typescript-eslint';

export default tseslint.config({
    // Never lint (or `--fix`) these: the fixtures are verbatim upstream copies the main
    // config ignores too, and the plain `.js` files carry disable comments for rules this
    // config does not load, which `--fix` would delete as unused (it did, 2026-11-23).
    ignores: ['tests/fixtures/**', 'tests/**/*.js'],
}, {
    // `.eslint-probe/` is where tests/sop/eslint-type-aware.test.ts plants the file
    // that proves this config still works. It sits outside `tests/` so the suites
    // that walk that tree cannot meet it mid-run (PL-44) — and it has to be named
    // HERE, in the same object, or the probe is linted with no rules at all.
    files: ['tests/**/*.ts', 'tests/**/*.tsx', '.eslint-probe/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
        parserOptions: {
            // `project`, pointed at an EXPLICIT tsconfig — deliberately NOT the
            // `projectService: true` that typescript-eslint v8 recommends.
            //
            // Measured here 2026-09-01, and the docs' advice loses badly: with
            // `project: './tsconfig.test.json'` one feature directory lints in
            // well under a minute; with `projectService: true` the same directory
            // had not finished after TEN MINUTES and was killed. projectService
            // resolves a project per file through the TS language service, which
            // is the right trade for an editor and the wrong one for a repo with
            // 1,200 test files and a single tsconfig that already lists them all.
            //
            // Never set both — "Enabling `project` does nothing when
            // `projectService` is enabled" is a hard parser error, not a warning.
            project: './tsconfig.test.json',
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        // The one that matters: an assertion whose target type the expression
        // ALREADY has. Auto-fixable, and decided by the type checker rather than
        // by my reading of the site.
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        // The other three `npm run lint:types` (scripts/check-type-aware-lint.mjs) holds
        // the test tree clean of, named so the check does not depend on a preset (PL-113).
        '@typescript-eslint/no-base-to-string': 'error',
        '@typescript-eslint/only-throw-error': 'error',
        '@typescript-eslint/await-thenable': 'error',

        // Everything else off: this config answers four questions, and a wall of
        // unrelated findings is how a useful signal gets ignored.
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        // These two are auto-fixable and NOT what this config is for. Left on,
        // `--fix` would rewrite requires and delete bindings in the same pass as
        // the casts, and the diff would stop being reviewable.
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
    },
}, {
    // These suites throw a non-Error ON PURPOSE: each tests how the code handles a
    // thrown string, object or null (the "[object Object]" and "null" cause messages,
    // "a non-Error .env failure"). Throwing an Error would stop testing that case.
    files: [
        'tests/core/shell/processCleanup-decisions.test.ts',
        'tests/core/ui/hooks/useAsyncOperation.test.tsx',
        'tests/features/ai/server/deleteProjectTool.test.ts',
        'tests/features/projects-dashboard/services/projectRenameService.test.ts',
        'tests/core/state/projectConfigWriter-saveGuard.test.ts',
    ],
    rules: { '@typescript-eslint/only-throw-error': 'off' },
});
