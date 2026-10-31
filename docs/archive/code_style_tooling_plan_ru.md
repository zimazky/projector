## План внедрения линтера, форматтера и pre-commit-хуков для Projector

### 1. Цели и общие принципы

- **Цели:**
  - Зафиксировать единый стиль кода для всего проекта (JS/TS, React, CSS/Modules).
  - Автоматизировать проверку и автоисправление типовых ошибок до попадания кода в репозиторий.
  - Минимизировать ручные действия разработчиков (форматирование, упорядочивание импортов и т.п.).
- **Принципы:**
  - Все правила должны быть **прозрачными и воспроизводимыми**: конфигурация хранится в репозитории.
  - Проверки должны быть **быстрыми** и **локальными** для pre-commit (только изменённые файлы).
  - Любое «косметическое» правки (форматирование) по возможности делаются **автоматически**.

---

### 2. Набор инструментов

- **Линтер: ESLint — «проверяет, а не форматирует»**
  - **Для чего нужен:** находит потенциальные ошибки в коде (лишний/неиспользуемый код, опасные конструкции, нарушения best practices), а также проверяет соблюдение договорённостей по стилю (импорты, именование, использование хуков и т.д.).
  - **Как работает:** 
    - парсит исходный код в **AST (абстрактное синтаксическое дерево)**,
    - последовательно прогоняет по дереву набор **правил** (из core ESLint и подключённых плагинов),
    - каждое правило может помечать участки кода как ошибку/предупреждение и, если возможно, предлагать **автофикс**.
  - **Почему важен:** позволяет ловить класс ошибок «раньше компиляции/раньше рантайма» и выравнивает практики по всему проекту.
  - **Дополнительные плагины:**
    - `@typescript-eslint/eslint-plugin` и парсер `@typescript-eslint/parser` — добавляют понимание TypeScript-синтаксиса и типовой специфики в правила.
    - `eslint-plugin-react`, `eslint-plugin-react-hooks` — содержат правила для React-компонентов и хуков (правильное использование `useEffect`, `useState`, `useMemo` и т.п.).
    - `eslint-plugin-import` — контролирует порядок и корректность импортов, помогает избегать скрытых циклических зависимостей и «магических» путей.
    - **Опционально:** `eslint-plugin-mobx` или собственные правила/override под используемые паттерны MobX.

- **Форматтер: Prettier — «форматирует, а не проверяет бизнес-логику»**
  - **Для чего нужен:** отвечает только за **вид** кода — отступы, кавычки, длину строк, переносы, запятые и т.д. Не проверяет смысл и не знает доменные правила.
  - **Как работает:**
    - парсит код в AST,
    - применяет собственные детерминированные правила форматирования,
    - на выходе даёт **один-единственный «канонический» стиль** для любого корректного входного кода.
  - **Почему важен:** полностью убирает споры «где ставить перенос», «какие кавычки использовать» и т.д.; диффы становятся более «чистыми», проще ревьюить.
  - **Интеграция с ESLint:**
    - `eslint-config-prettier` отключает те ESLint‑правила, которые дублируют обязанности Prettier (чтобы инструменты не конфликтовали).
    - `eslint-plugin-prettier` может запускать Prettier внутри ESLint и репортить форматные проблемы как ESLint‑ошибки — так все комментарии по стилю проходят через один канал.

- **Хуки Git: Husky + lint-staged — «сторож у входа в репозиторий»**
  - **Задача связки:** гарантировать, что в репозиторий попадает только код, прошедший минимальный набор автоматических проверок (линт/формат) и что эти проверки выполняются **только для изменённых файлов**, чтобы не тормозить разработку.
  - **Husky:**
    - подключается к git-хукам (`pre-commit`, `pre-push` и т.д.),
    - при наступлении события (например, перед коммитом) запускает указанный скрипт (`npx lint-staged`, `npm test` и т.п.),
    - при неуспешном завершении команды **блокирует коммит** — разработчик сначала должен исправить проблемы.
  - **lint-staged:**
    - определяет, какие файлы попадают в текущий коммит (staged-файлы),
    - по паттернам (`"src/**/*.{ts,tsx}"` и т.д.) запускает указанные команды **только для этих файлов** (ESLint/Prettier),
    - при успешном автофиксе обновляет staged‑состояние, чтобы в коммит попала уже отформатированная версия.
  - **Результат:** разработчик просто делает `git commit`, а линтеры/форматтеры автоматически «подчищают» и проверяют изменения, не нагружая весь проект.

---

### 3. Установка зависимостей

#### 3.1. ESLint и плагины

Выполнить в корне проекта:

```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-import
```

#### 3.2. Prettier и интеграция с ESLint

```bash
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier
```

#### 3.3. Husky и lint-staged

```bash
npm install --save-dev husky lint-staged
```

Далее инициализировать Husky:

```bash
npx husky install
```

И добавить скрипт в `package.json` для автосоздания хуков после `npm install`:

```json
"scripts": {
  "prepare": "husky install",
  ...
}
```

---

### 4. Настройка ESLint

#### 4.1. Базовый конфиг `.eslintrc.js`

Создать файл `.eslintrc.js` в корне проекта (или адаптировать, если уже есть):

```js
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: ['./tsconfig.json'],
  },
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      // при необходимости можно добавить alias-резолвер под структуру src/1-app и т.п.
    },
  },
  plugins: [
    'react',
    'react-hooks',
    '@typescript-eslint',
    'import',
    'prettier',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended', // включает eslint-config-prettier + eslint-plugin-prettier
  ],
  rules: {
    // Общие правила
    'prettier/prettier': 'error',
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    'no-debugger': 'error',

    // TypeScript-специфика
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // React
    'react/prop-types': 'off', // используем TS вместо PropTypes
    'react/react-in-jsx-scope': 'off', // для React 17+

    // Hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Импорты
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-unresolved': 'off', // при необходимости настроить под alias’ы
  },
  overrides: [
    {
      files: ['*.test.ts', '*.spec.ts', '**/__tests__/**'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
```

#### 4.2. Исключения `.eslintignore`

Создать `.eslintignore` в корне:

```txt
node_modules
dist
coverage
```

При необходимости добавить и другие сгенерированные/временные директории.

---

### 5. Настройка Prettier

#### 5.1. Конфигурация `.prettierrc`

Создать файл `.prettierrc` в корне:

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

#### 5.2. Исключения `.prettierignore`

Создать `.prettierignore`:

```txt
node_modules
dist
package-lock.json
*.min.js
```

При необходимости расширить список (например, большие сгенерированные JSON’ы).

---

### 6. Скрипты в `package.json`

Добавить/обновить скрипты:

```json
"scripts": {
  "lint": "eslint \"src/**/*.{js,jsx,ts,tsx}\"",
  "lint:fix": "eslint \"src/**/*.{js,jsx,ts,tsx}\" --fix",
  "format": "prettier \"{src,docs}/**/*.{js,jsx,ts,tsx,css,md,json}\" --write",
  "prepare": "husky install",
  "test": "...",
  "build": "...",
  "start": "webpack serve --mode development"
}
```

Комментарии:
- `lint` — проверка без изменений файлов.
- `lint:fix` — автоисправление простых проблем ESLint.
- `format` — массовое форматирование кода и документации (можно запустить один раз после интеграции).

---

### 7. Настройка Husky и lint-staged

#### 7.1. Конфигурация lint-staged

Добавить в `package.json`:

```json
"lint-staged": {
  "src/**/*.{js,jsx,ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "src/**/*.{css,md,json}": [
    "prettier --write"
  ],
  "docs/**/*.{md}": [
    "prettier --write"
  ]
}
```

#### 7.2. Хук pre-commit через Husky

Создать файл `.husky/pre-commit` (после `npx husky install`):

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

Сделать файл исполняемым (в Unix-среде это `chmod +x .husky/pre-commit`; в Windows это обычно не требуется, но стоит убедиться, что файл в репозитории с корректными правами).

---

### 8. Пошаговое внедрение в проект

- **Шаг 1. Установка зависимостей**
  - Выполнить команды установки ESLint, Prettier, Husky и lint-staged.
  - Закоммитить изменения в `package.json` и `package-lock.json`.

- **Шаг 2. Добавление конфигураций**
  - Создать `.eslintrc.js`, `.eslintignore`, `.prettierrc`, `.prettierignore`.
  - Настроить базовые правила так, чтобы они соответствовали текущему стилю, и при необходимости ослабить самые жёсткие правила на первом этапе.

- **Шаг 3. Массовое форматирование (однократное)**
  - Запустить `npm run format` и затем `npm run lint:fix`.
  - Просмотреть диффы, убедиться, что изменений много, но они «механические» (отступы, кавычки, переносы строк).
  - Закоммитить этот большой форматирующий коммит отдельно, чтобы он не смешивался с функциональными изменениями.

- **Шаг 4. Включение pre-commit-хуков**
  - Добавить конфигурацию `lint-staged` в `package.json`.
  - Создать `.husky/pre-commit` и убедиться, что `npx lint-staged` успешно отрабатывает на изменённых файлах.
  - Проверить кейсы: изменение только TS-файлов, только Markdown, смешанные изменения.

- **Шаг 5. Интеграция с IDE**
  - В VS Code (или другой IDE) включить:
    - «Format on save» с использованием Prettier как форматтера по умолчанию.
    - ESLint-плагин, чтобы ошибки/варнинги подсвечивались в редакторе.
  - Зафиксировать минимальные настройки в `.vscode/settings.json` (опционально, если принято хранить IDE-настройки в репозитории).

- **Шаг 6. Итеративное ужесточение правил**
  - После стабилизации базовой конфигурации постепенно ужесточать правила (например, запрет `any`, более строгие правила по импортам, анализ хук-зависимостей).
  - Все изменения в правилах сопровождаются коротким описанием в `docs` (можно дописывать этот документ или создать отдельный `code_style_changelog.md`).

---

### 9. Рекомендации по командной работе

- Перед слиянием крупных веток запускать `npm run lint` и `npm run test` вручную (дополнительно к pre-commit).
- Согласовать в команде:
  - Набор допустимых исключений (где `console.log`/`any` допустимы).
  - Подход к оформлению большого форматирующего коммита (лучше один раз «обнулить» дифф).
- Обновлять этот документ при изменении правил и конфигурации инструментов, чтобы новые участники команды могли быстро настроить окружение и понимать, «почему линтер ругается».


