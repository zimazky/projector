import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      '@typescript-eslint': ts,
      prettier: prettierPlugin
    },
    rules: {
      ...prettier.rules,
      'prettier/prettier': 'error'
    }
  },
  {
    files: ['webpack.config.cjs', 'webpack.config.test.cjs'],
    languageOptions: {
      globals: {
        require: 'readonly',
        __dirname: 'readonly',
        module: 'writable',
        process: 'readonly'
      }
    }
  }
]
