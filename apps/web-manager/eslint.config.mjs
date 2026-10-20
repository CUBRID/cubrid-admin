import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import i18next from 'eslint-plugin-i18next'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['**/*.spec.{js,jsx}', '**/*.test.{js,jsx}'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/constants/cmLabels*.js', 'src/constants/useCM.js'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'warn',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            exclude: [
              'className', 'styleName', 'style', 'type', 'key', 'id',
              'width', 'height', 'size', 'variant', 'icon', 'iconPosition',
              'iconVariant', 'accessor', 'field', 'name', 'weight', 'align',
              'href', 'to', 'rel', 'target', 'as', 'role', 'autoComplete',
              'value', 'defaultValue', 'accept', 'pattern', 'data-testid',
              'testId', 'colorScheme', 'position', 'side',
              'maxWidth', 'minWidth', 'maxHeight', 'minHeight', 'labelWidth',
              'bodyClassName', 'inputClassName', 'zIndexClass',
              'gap', 'py', 'px', 'accent', 'color', 'split', 'language', 'path',
            ],
          },
          words: {
            exclude: [
              '[0-9!-/:-@[-`{-~]+',
              '[A-Z_-]+',
              // lowercase technical tokens with no whitespace (tailwind classes, icon names, route paths, enum values)
              '^[a-z][a-z0-9:/.\\[\\]#%_-]*$',
              // CMS permission constants (G.Select, G.Insert, ...)
              '^G\\.[A-Za-z]+$',
              '—', '·',
              'CUBRID', 'CUBRID Admin', 'CMS', 'CM',
            ],
          },
          callees: {
            exclude: [
              'i18n(ext)?', 't', 'require', 'addEventListener', 'removeEventListener',
              'postMessage', 'getElementById', 'dispatch', 'commit', 'includes',
              'indexOf', 'endsWith', 'startsWith', 'replace',
              'handle\\w*Change', 'toLocaleTimeString', 'toLocaleDateString',
            ],
          },
        },
      ],
    },
  },
])
