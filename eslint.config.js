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
				},
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: ['./tsconfig.json'] // Specify the TypeScript project configuration
			},
			globals: {
				document: 'readonly',
				navigator: 'readonly',
				window: 'readonly',
				console: 'readonly',
				alert: 'readonly',
				setTimeout: 'readonly',
				setInterval: 'readonly',
				clearTimeout: 'readonly',
				clearInterval: 'readonly',
				JSX: 'readonly',
				React: 'readonly',
			}
		},
		plugins: {
			'@typescript-eslint': ts,
			prettier: prettierPlugin
		},
		rules: {
			...prettier.rules,
			'prettier/prettier': 'error',
			"no-undef": "warn",
			"no-unused-vars": "warn"
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
	},
	{
		files: ['jest.config.cjs'],
		languageOptions: {
			globals: {
				require: 'readonly',
				__dirname: 'readonly',
				module: 'writable',
				process: 'readonly'
			}
		}
	},
	{
		files: ['**/*.spec.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}'],
		languageOptions: {
			globals: {
				describe: 'readonly',
				it: 'readonly',
				test: 'readonly',
				expect: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly'
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'no-unused-vars': 'off'
		}
	}
]