import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'

export default [
	js.configs.recommended,
	{
		files: ['**/*.{js,jsx,ts,tsx}'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: {
					jsx: true
				},
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: ['./tsconfig.json']
			},
			globals: {
				...globals.browser,
				...globals.node,
				gapi: 'readonly',
				google: 'readonly'
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
		files: ['e2e/**/*.ts', 'playwright.config.ts'],
		languageOptions: {
			parserOptions: { project: ['./tsconfig.e2e.json'] }
		}
	},
	{
		files: ['**/*.{ts,tsx}'],
		rules: {
			'no-undef': 'off',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
				ignoreRestSiblings: true
			}]
		}
	},
	{
		files: ['**/*.{js,jsx}'],
		rules: {
			'no-undef': 'warn',
			'no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
				ignoreRestSiblings: true
			}]
		}
	},
	{
		files: ['webpack.config.cjs', 'jest.config.cjs'],
		languageOptions: {
			globals: {
				...globals.node
			}
		}
	},
	{
		files: ['**/*.spec.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}'],
		languageOptions: {
			globals: {
				...globals.jest,
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'no-unused-vars': 'off'
		}
	}
]
