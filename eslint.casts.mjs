// Ad-hoc, TYPE-AWARE lint config for cast work. Not part of `npm run lint`.
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
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
        parserOptions: {
            project: './tsconfig.test.json',
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        // The one that matters: an assertion whose target type the expression
        // ALREADY has. Auto-fixable, and decided by the type checker rather than
        // by my reading of the site.
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',

        // Everything else off — this config exists to answer one question, and a
        // wall of unrelated findings is how a useful signal gets ignored.
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
});
