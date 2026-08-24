/**
 * ESLint, flat config.
 *
 * The job here is NOT to impose a style. This codebase already has one — 2-space
 * indent, single quotes, trailing commas, 100 columns, semicolons — and it is
 * consistent because the same person wrote all of it. Prettier's config is that
 * style written down, so the consistency survives the second contributor; ESLint
 * only checks the things a formatter cannot see.
 *
 * What that leaves is a deliberately short list:
 *
 *  - THE HOOKS RULES. `useRestTimer`, `useSetTimer` and `useCountdownBeeps` all
 *    hold a native side effect open across a render, and a missing dependency
 *    there is a timer that keeps counting the previous set. This is the one rule
 *    set that has caught a real bug in this app.
 *  - UNUSED CODE. Finding 17 exists because a field can sit in the model for two
 *    releases with nothing reading it. The linter cannot see an unread interface
 *    field, but it can see an unread import or local, and those are the same
 *    smell one scope down.
 *
 * Everything stylistic that typescript-eslint's recommended set would add is off
 * by way of not being enabled: `recommended`, not `strict`, and no type-aware
 * pass. A type-aware lint would need a second full TypeScript program on every
 * run, and `npm run typecheck` — which CI runs beside this — already is one.
 */

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  {
    // Generated, vendored or not ours. `android/` and `ios/` are written by
    // `expo prebuild` and are not a source of truth — see .gitignore.
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'web-build/**',
      '.expo/**',
      'plugins/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /*
       * `_`-prefixed arguments are the codebase's existing way of saying "this
       * position is part of the signature and I am not using it" — a render
       * callback that takes an index it doesn't need, for instance. Rest siblings
       * are ignored because `const { notes, ...rest } = row` is how a field gets
       * dropped from a persisted shape, which is exactly what Phase 1 does.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      /*
       * The rehydration guards take `unknown` and narrow it by hand, which is the
       * whole point of them — but they also cast a validated field back to its
       * declared type once the check has passed (`raw.countUnit!`). That is a
       * non-null assertion the compiler cannot prove and the guard immediately
       * above it can, so it is a warning rather than an error: worth seeing in a
       * new file, not worth failing CI over in a validator that already reads as
       * a proof.
       */
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    // Config files are CommonJS and run in Node — Metro, Babel, Tailwind and
    // this file all load before any ESM transform exists to load them with.
    files: ['*.js', '*.config.js'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    /*
     * The one `require()` in `src/` that is not a style choice. A Metro asset
     * reference has to be a `require()` specifier — an `import` of a 9 KB RIFF
     * file is not a module — and `vitest.config.ts` says the same thing from the
     * other side: an alias reaches an `import` and cannot reach this. The file's
     * own header is the long version.
     */
    files: ['src/lib/beepSources.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Last, so it can switch off anything the sets above turned on that Prettier
  // owns instead.
  prettier,
);
