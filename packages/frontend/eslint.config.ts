import eslintConfigReact from '@ianchoi/eslint-config-react'
import eslintConfigStandard from '@ianchoi/eslint-config-standard'
import eslintConfigTypescript from '@ianchoi/eslint-config-typescript'
import {defineConfig} from 'eslint/config'
import {createTypeScriptImportResolver} from 'eslint-import-resolver-typescript'

export default defineConfig([
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/*.tsbuildinfo'],
  },
  ...eslintConfigReact,
  ...eslintConfigTypescript,
  ...eslintConfigStandard,
  {
    name: 'frontend/overrides',
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      'import-x/no-duplicates': ['error', {'prefer-inline': false}],
      // Vite @/ 别名在 import-x resolver 下暂不稳定，避免阻塞 save fix
      'import-x/no-unresolved': 'off',
      'no-unused-vars': 'off',
      'react/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          shorthandFirst: true,
          multiline: 'ignore',
          ignoreCase: false,
          noSortAlphabetically: false,
          reservedFirst: true,
        },
      ],
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: './tsconfig.json',
          alwaysTryTypes: true,
        }),
      ],
    },
  },
  {
    name: 'frontend/tooling-config',
    files: ['eslint.config.ts', 'vitest.config.ts'],
    rules: {
      // standard 白名单只有 eslint.config.{js,mjs,cjs}，不含 .ts
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
])
