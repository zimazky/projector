# Предложение по реализации страницы добавления и редактирования проектов

**Дата:** 7 апреля 2026 г.  
**Статус:** Черновик для обсуждения  
**Автор:** AI Assistant

---

## 0. Статус реализации

### ✅ Завершённые задачи

- **ColorPicker компонент** — реализован в `7-shared/ui/ColorPicker/` с использованием `react-colorful`
  - Полноценный HexColorPicker из библиотеки react-colorful
  - Выбор цвета из палитры Material Design (21 пресет)
  - Ручной ввод HEX цвета с валидацией
  - Предпросмотр выбранного цвета
  - Поддержка ошибок валидации
  - Закрывающаяся палитра при клике вне компонента
  - CSS Modules с использованием CSS переменных проекта

### 🔄 В процессе

- Страница добавления/редактирования проектов
- Доработка ProjectsStore
- Форма управления проектами

---

## 1. Анализ текущего состояния

### 1.1. Существующая инфраструктура

**Страница Projects (3-pages/Projects/):**
- `ProjectsForm.tsx` — заглушка с одним компонентом `DatePicker`
- `ProjectsStore.ts` — полностью реализованное хранилище с методами CRUD
- `ProjectsStore` экспортируется через `1-app/root.ts` и доступен через `StoreContext`

**Связанные компоненты:**
- Вызов страницы осуществляется через `CalendarIconBar` → `uiStore.changeViewMode({ mode: 'Projects' })`
- Роутинг уже настроен в `App.tsx`: `case 'Projects': return <ProjectsForm />`
- Проекты используются в `EventForm` через `Select` с `projectsStore.list`

**Модель данных проекта:**
```typescript
type ProjectStyle = {
	color: string      // Цвет текста
	background: string // Цвет фона
}

type ProjectData = {
	name: string
} & ProjectStyle

type ProjectStructure = {
	events: number // Счетчик ссылок на события
} & ProjectData
```

### 1.2. Доступные UI компоненты

Из `7-shared/ui/`:
- ✅ `TextField` — текстовое поле с floating label и валидацией
- ❌ `ColorPicker` — **ЗАГЛУШКА** (возвращает `null`)
- ✅ `Button/TextButton` — кнопки действий
- ✅ `Dialog/DialogContent/DialogActions` — модальные диалоги
- ✅ `List/ListItem` — списки
- ✅ CSS Modules — для стилизации

### 1.3. Проблемы и ограничения

1. **ColorPicker не реализован** — требуется разработка с нуля
2. **ProjectsStore имеет ограниченный API** — метод `add()` принимает параметры позиционно, нет метода `update()`
3. **Отсутствует валидация** — сейчас только `alert()` при дубликатах
4. **Нет формы редактирования** — только программный API

---

## 2. Архитектурные подходы

### 2.1.遵循 FSD (Feature-Sliced Design)

Согласно архитектуре проекта, страница должна быть организована так:

```
3-pages/Projects/
├── ProjectsForm.tsx          # Страница (главный компонент)
├── ProjectsForm.module.css   # Стили страницы
├── ProjectsStore.ts          # Уже существует
└── ui/                       # UI компоненты страницы
    ├── ProjectCard.tsx       # Карточка проекта в списке
    ├── ProjectCard.module.css
    ├── ProjectForm.tsx       # Форма добавления/редактирования
    └── ProjectForm.module.css

5-features/ProjectManager/    # Фича управления проектами
├── ProjectList/              # Отображение списка проектов
│   ├── ProjectList.tsx
│   └── ProjectList.module.css
├── ProjectEditor/            # Редактирование проекта
│   ├── ProjectEditor.tsx
│   ├── ProjectEditorStore.ts
│   └── ProjectEditor.module.css
└── ColorPicker/              # Реализация ColorPicker (фича)
    ├── ColorPicker.tsx
    ├── ColorPicker.module.css
    └── constants.ts          # Пресеты цветов
```

**Обоснование разделения:**
- `3-pages/Projects/` — orchestrator, собирает всё вместе
- `5-features/` — переиспользуемая бизнес-логика (можно использовать в других местах)
- `6-entities/Project/` — **не требуется**, т.к. типы уже определены в `ProjectsStore`
- `7-shared/ui/` — базовые UI компоненты (перенести ColorPicker сюда после реализации)

### 2.2. Альтернативный упрощенный вариант

Если проект небольшой и не планируется переиспользование компонентов:

```
3-pages/Projects/
├── ProjectsForm.tsx          # Главная страница
├── ProjectsForm.module.css
├── ProjectsStore.ts          # Существующий
├── ProjectsPageStore.ts      # Store для UI состояния страницы
├── components/
│   ├── ProjectList.tsx       # Список проектов
│   ├── ProjectForm.tsx       # Форма добавления/редактирования
│   └── ColorPicker.tsx       # Компонент выбора цвета
└── *.module.css              # Стили для компонентов
```

**Рекомендация:** Использовать **первый вариант** (с `5-features/`), т.к.:
1. Соответствует FSD архитектуре проекта
2. Позволяет переиспользовать `ProjectEditor` в модальных окнах из других страниц
3. Разделяет ответственность: страница = компоновка, фича = бизнес-логика
4. Легче тестировать изолированно

---

## 3. Детальный план реализации

### Этап 1: Реализация ColorPicker

**Расположение:** `5-features/ProjectManager/ColorPicker/` → после тестов → `7-shared/ui/ColorPicker/`

**Требования:**
- Выбор цвета из пресетов (палитра)
- Ввод произвольного HEX/RGB цвета
- Предпросмотр выбранного цвета
- Возврат значения в формате `string` (HEX)

**API компонента:**
```typescript
type ColorPickerProps = {
	value: string              // Текущий цвет (HEX)
	onChange: (color: string) => void  // Callback при изменении
	label?: string             // Label для floating label паттерна
	error?: boolean            // Признак ошибки валидации
	presets?: string[]         // Пресеты цветов (опционально)
}
```

**Варианты реализации:**

**Вариант A — Нативный `<input type="color">`:**
```typescript
const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label }) => {
	return (
		<div className={styles.root}>
			{label && <label className={styles.label}>{label}</label>}
			<input
				type="color"
				value={value}
				onChange={e => onChange(e.target.value)}
				className={styles.picker}
			/>
			<TextField value={value} onChange={onChange} />
		</div>
	)
}
```
**Плюсы:** Простота, кроссплатформенность, не требует зависимостей  
**Минусы:** Ограниченный UX, разный вид в браузерах

**Вариант B — Кастомная палитра + нативный picker:**
```typescript
const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, presets }) => {
	const presetColors = presets || defaultPresets
	return (
		<div className={styles.root}>
			<div className={styles.presets}>
				{presetColors.map(color => (
					<button
						key={color}
						className={styles.swatch}
						style={{ backgroundColor: color }}
						onClick={() => onChange(color)}
					/>
				))}
			</div>
			<input type="color" value={value} onChange={e => onChange(e.target.value)} />
			<TextField value={value} onChange={onChange} />
		</div>
	)
}
```
**Плюсы:** Лучший UX, контроль над дизайном, переиспользуемость  
**Минусы:** Больше кода, нужно тестировать

**Вариант C — Библиотека `react-colorful` (Рекомендуется):**
```bash
npm install react-colorful
```
```typescript
import { HexColorPicker } from 'react-colorful'

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label }) => {
	const [isOpen, setIsOpen] = React.useState(false)
	return (
		<div className={styles.root}>
			{label && <label className={styles.label}>{label}</label>}
			<div className={styles.control} onClick={() => setIsOpen(!isOpen)}>
				<div className={styles.preview} style={{ backgroundColor: value }} />
				<TextField value={value} readOnly />
			</div>
			{isOpen && (
				<div className={styles.popover}>
					<HexColorPicker color={value} onChange={onChange} />
				</div>
			)}
		</div>
	)
}
```
**Плюсы:** Профессионаный UX, компактная библиотека (3.9KB), TypeScript из коробки  
**Минусы:** Дополнительная зависимость

**Рекомендация:** **Вариант C** — `react-colorful` легковесная, хорошо поддерживается, обеспечивает лучший UX.

✅ **РЕАЛИЗОВАНО**: Выбран Вариант C с библиотекой react-colorful.

---

### Этап 2: Доработка ProjectsStore

**Текущие проблемы:**
1. Метод `add()` использует `alert()` — нужно заменить на возврат результата
2. Отсутствует метод `update()` для редактирования
3. Отсутствует валидация наименования (пустые строки, спецсимволы)

**Предлагаемые изменения:**

```typescript
export class ProjectsStore {
	// ... существующий код ...

	/**
	 * Добавить новый проект
	 * @returns true если успешно, false если дубликат
	 */
	add(name: string, color: string, background: string): boolean {
		const exists = this.list.find(l => l.name === name)
		if (exists) return false
		
		const trimmedName = name.trim()
		if (trimmedName === '') return false
		
		this.list.push({ name: trimmedName, events: 0, color, background })
		return true
	}

	/**
	 * Обновить существующий проект
	 * @param oldName - текущее наименование проекта
	 * @param updates - обновленные данные
	 * @returns true если успешно, false если проект не найден
	 */
	update(oldName: string, updates: { name?: string; color?: string; background?: string }): boolean {
		const project = this.list.find(l => l.name === oldName)
		if (!project) return false

		// Проверка дубликата при переименовании
		if (updates.name && updates.name !== oldName) {
			const duplicate = this.list.find(l => l.name === updates.name)
			if (duplicate) return false
		}

		if (updates.name) project.name = updates.name.trim()
		if (updates.color) project.color = updates.color
		if (updates.background) project.background = updates.background
		
		return true
	}

	/**
	 * Проверить существует ли проект с таким именем
	 */
	exists(name: string): boolean {
		return this.list.some(l => l.name === name)
	}
}
```

**Обоснование:**
- Убираем `alert()` из store — это ответственность UI слоя
- Возвращаем `boolean` для информирования UI о результате
- Добавляем `update()` для поддержки редактирования
- Валидация на уровне store обеспечивает целостность данных

---

### Этап 3: Создание ProjectEditorStore

**Расположение:** `5-features/ProjectManager/ProjectEditor/ProjectEditorStore.ts`

**Назначение:** Управление состоянием формы (режим, данные, валидация)

```typescript
import { makeAutoObservable, runInAction } from 'mobx'
import { ProjectsStore } from '3-pages/Projects/ProjectsStore'

type EditorMode = 'add' | 'edit'

class ProjectEditorStore {
	/** Режим редактора */
	mode: EditorMode = 'add'
	/** Признак отображения формы */
	isOpen: boolean = false
	/** Данные формы */
	formData: {
		name: string
		color: string
		background: string
	} = {
		name: '',
		color: '#000000',
		background: '#ffffff'
	}
	/** Ошибки валидации */
	errors: {
		name?: string
		color?: string
		background?: string
	} = {}
	/** Исходное имя проекта (для режима edit) */
	private originalName: string = ''

	constructor(private projectsStore: ProjectsStore) {
		makeAutoObservable(this)
	}

	/** Открыть форму для добавления */
	openAdd() {
		this.mode = 'add'
		this.formData = { name: '', color: '#000000', background: '#ffffff' }
		this.errors = {}
		this.isOpen = true
	}

	/** Открыть форму для редактирования */
	openEdit(projectName: string) {
		const project = this.projectsStore.getByName(projectName)
		if (!project) return

		this.mode = 'edit'
		this.originalName = projectName
		this.formData = {
			name: project.name,
			color: project.color,
			background: project.background
		}
		this.errors = {}
		this.isOpen = true
	}

	/** Закрыть форму */
	close() {
		this.isOpen = false
		this.errors = {}
	}

	/** Обновить поле формы */
	updateField(field: keyof typeof this.formData, value: string) {
		this.formData[field] = value
		// Очистка ошибки при изменении
		if (this.errors[field]) {
			this.errors = { ...this.errors, [field]: undefined }
		}
	}

	/** Валидировать форму */
	validate(): boolean {
		const errors: typeof this.errors = {}

		if (this.formData.name.trim() === '') {
			errors.name = 'Project name is required'
		} else if (
			this.mode === 'add' &&
			this.projectsStore.exists(this.formData.name.trim())
		) {
			errors.name = 'Project with this name already exists'
		} else if (
			this.mode === 'edit' &&
			this.formData.name.trim() !== this.originalName &&
			this.projectsStore.exists(this.formData.name.trim())
		) {
			errors.name = 'Project with this name already exists'
		}

		if (!this.formData.color.match(/^#[0-9A-Fa-f]{6}$/)) {
			errors.color = 'Invalid color format. Use #RRGGBB'
		}

		if (!this.formData.background.match(/^#[0-9A-Fa-f]{6}$/)) {
			errors.background = 'Invalid color format. Use #RRGGBB'
		}

		this.errors = errors
		return Object.keys(errors).length === 0
	}

	/** Сохранить проект */
	async save(): Promise<boolean> {
		if (!this.validate()) return false

		if (this.mode === 'add') {
			const success = this.projectsStore.add(
				this.formData.name.trim(),
				this.formData.color,
				this.formData.background
			)
			if (success) {
				this.close()
				return true
			}
			this.errors.name = 'Failed to add project'
			return false
		} else {
			const success = this.projectsStore.update(this.originalName, {
				name: this.formData.name.trim(),
				color: this.formData.color,
				background: this.formData.background
			})
			if (success) {
				this.close()
				return true
			}
			this.errors.name = 'Failed to update project'
			return false
		}
	}
}

export default ProjectEditorStore
```

---

### Этап 4: Создание ProjectForm компонента

**Расположение:** `5-features/ProjectManager/ProjectEditor/ProjectForm.tsx`

```typescript
import React, { useContext, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useForm } from 'react-hook-form'

import TextField from 'src/7-shared/ui/TextField/TextField'
import TextButton from 'src/7-shared/ui/Button/TextButton'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import ProjectEditorStore from './ProjectEditorStore'
import ColorPicker from 'src/7-shared/ui/ColorPicker/ColorPicker'

import styles from './ProjectForm.module.css'

interface FormFields {
	name: string
	color: string
	background: string
}

const ProjectForm: React.FC = observer(() => {
	const { projectsStore } = useContext(StoreContext)
	const [editorStore] = React.useState(() => new ProjectEditorStore(projectsStore))

	const {
		register,
		watch,
		setValue,
		handleSubmit,
		formState: { errors }
	} = useForm<FormFields>({
		mode: 'onChange',
		defaultValues: editorStore.formData
	})

	// Синхронизация формы с editorStore
	useEffect(() => {
		if (editorStore.isOpen) {
			setValue('name', editorStore.formData.name)
			setValue('color', editorStore.formData.color)
			setValue('background', editorStore.formData.background)
		}
	}, [editorStore.isOpen, editorStore.formData, setValue])

	const handleSave = handleSubmit(async data => {
		editorStore.updateField('name', data.name)
		editorStore.updateField('color', data.color)
		editorStore.updateField('background', data.background)
		
		const success = await editorStore.save()
		if (success) {
			// Можно добавить уведомление об успехе
		}
	})

	const handleClose = () => {
		editorStore.close()
	}

	return (
		<Dialog open={editorStore.isOpen} onClose={handleClose}>
			<DialogContent>
				<h2 className={styles.title}>
					{editorStore.mode === 'add' ? 'Add Project' : 'Edit Project'}
				</h2>
				
				<form className={styles.form} onSubmit={handleSave}>
					<TextField
						label="Project Name"
						error={!!errors.name || !!editorStore.errors.name}
						helperText={errors.name?.message || editorStore.errors.name}
						{...register('name', { required: 'Project name is required' })}
					/>

					<div className={styles.colorGrid}>
						<ColorPicker
							value={watch('color')}
							onChange={(color) => {
								setValue('color', color)
								editorStore.updateField('color', color)
							}}
							label="Text Color"
							error={!!errors.color || !!editorStore.errors.color}
						/>

						<ColorPicker
							value={watch('background')}
							onChange={(background) => {
								setValue('background', background)
								editorStore.updateField('background', background)
							}}
							label="Background Color"
							error={!!errors.background || !!editorStore.errors.background}
						/>
					</div>

					{/* Предпросмотр */}
					<div className={styles.preview}>
						<div
							className={styles.previewCard}
							style={{
								color: watch('color'),
								backgroundColor: watch('background')
							}}
						>
							{watch('name') || 'Project Preview'}
						</div>
					</div>
				</form>
			</DialogContent>

			<DialogActions>
				<TextButton onClick={handleSave}>
					{editorStore.mode === 'add' ? 'Add' : 'Save'}
				</TextButton>
				<TextButton onClick={handleClose}>Cancel</TextButton>
			</DialogActions>
		</Dialog>
	)
})

export default ProjectForm
```

---

### Этап 5: Создание ProjectList компонента

**Расположение:** `5-features/ProjectManager/ProjectList/ProjectList.tsx`

```typescript
import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import TextButton from 'src/7-shared/ui/Button/TextButton'
import IconButton from 'src/7-shared/ui/IconButton/IconButton'
import YesCancelConfirmation from 'src/7-shared/ui/YesCancelConfirmation/YesCancelConfirmation'

import styles from './ProjectList.module.css'

const ProjectList: React.FC = observer(() => {
	const { projectsStore } = useContext(StoreContext)
	const [editingProject, setEditingProject] = React.useState<string | null>(null)
	const [deletingProject, setDeletingProject] = React.useState<string | null>(null)

	const handleEdit = (projectName: string) => {
		setEditingProject(projectName)
	}

	const handleDelete = (projectName: string) => {
		const project = projectsStore.getByName(projectName)
		if (project?.events === 0) {
			projectsStore.delete(projectName)
		}
		setDeletingProject(null)
	}

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<h2>Projects</h2>
				<TextButton onClick={() => {/* Открыть форму добавления */}}>
					Add Project
				</TextButton>
			</div>

			<div className={styles.list}>
				{projectsStore.list.map(project => (
					<div
						key={project.name}
						className={styles.projectCard}
						style={{
							color: project.color,
							backgroundColor: project.background
						}}
					>
						<span className={styles.projectName}>{project.name}</span>
						<span className={styles.eventCount}>
							{project.events} event{project.events !== 1 ? 's' : ''}
						</span>
						<div className={styles.actions}>
							<IconButton
								icon="edit"
								onClick={() => handleEdit(project.name)}
								disabled={project.name === 'Default'}
							/>
							<IconButton
								icon="delete"
								onClick={() => setDeletingProject(project.name)}
								disabled={project.events > 0 || project.name === 'Default'}
							/>
						</div>
					</div>
				))}
			</div>

			<YesCancelConfirmation
				open={deletingProject !== null}
				onConfirm={() => deletingProject && handleDelete(deletingProject)}
				onClose={() => setDeletingProject(null)}
			>
				Are you sure you want to delete project "{deletingProject}"?
			</YesCancelConfirmation>
		</div>
	)
})

export default ProjectList
```

---

### Этап 6: Сборка ProjectsForm страницы

**Расположение:** `3-pages/Projects/ProjectsForm.tsx` (обновить)

```typescript
import React from 'react'
import { observer } from 'mobx-react-lite'

import ProjectList from 'src/5-features/ProjectManager/ProjectList/ProjectList'
import ProjectForm from 'src/5-features/ProjectManager/ProjectEditor/ProjectForm'

import styles from './ProjectsForm.module.css'

const ProjectsForm: React.FC = observer(() => {
	return (
		<div className={styles.root}>
			<ProjectList />
			<ProjectForm />
		</div>
	)
})

export default ProjectsForm
```

**Стили:** `3-pages/Projects/ProjectsForm.module.css`

```css
.root {
	padding: 20px;
	max-width: 1200px;
	margin: 0 auto;
}
```

---

### Этап 7: Интеграция Store в приложение

**Расположение:** `1-app/root.ts` (обновить)

```typescript
// Добавить ProjectEditorStore
import ProjectEditorStore from 'src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore'

// Инициализация (projectsStore уже существует)
export const projectEditorStore = new ProjectEditorStore(projectsStore)
```

**Расположение:** `1-app/Providers/StoreContext.ts` (обновить интерфейс)

```typescript
export interface IRootStore {
	// ... существующие stores
	projectsStore: ProjectsStore
	projectEditorStore: ProjectEditorStore
}
```

**Расположение:** `1-app/index.tsx` (обновить провайдер)

```typescript
<StoreProvider
	// ... существующие props
	projectsStore={projectsStore}
	projectEditorStore={projectEditorStore}
>
```

---

## 4. CSS стилизация

### 4.1. Цветовые пресеты

**Расположение:** Встроено в `7-shared/ui/ColorPicker/ColorPicker.tsx`

```typescript
const COLOR_PRESETS = [
	'#000000', '#FFFFFF', '#F44336', '#E91E63', '#9C27B0',
	'#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
	'#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B',
	'#FFC107', '#FF9800', '#FF5722', '#795548', '#9E9E9E',
	'#607D8B'
]
```

✅ **РЕАЛИЗОВАНО**: ColorPicker уже включает пресеты и использует react-colorful.

### 4.2. Рекомендации по styling

- Использовать CSS Modules (как во всем проекте)
- Предпросмотр проекта должен соответствовать реальному отображению в календаре
- Адаптивная верстка (mobile-first подход)
- Использовать CSS Grid для расположения цветовых picker'ов
- Анимации для Dialog (уже реализовано в `7-shared/ui/Dialog`)

---

## 5. Тестирование

### 5.1. Unit тесты

**ProjectsStore:**
```typescript
describe('ProjectsStore', () => {
	it('should add project successfully', () => {
		const store = new ProjectsStore()
		expect(store.add('Test', '#000', '#FFF')).toBe(true)
		expect(store.exists('Test')).toBe(true)
	})

	it('should not add duplicate project', () => {
		const store = new ProjectsStore()
		store.add('Test', '#000', '#FFF')
		expect(store.add('Test', '#FFF', '#000')).toBe(false)
	})

	it('should update project successfully', () => {
		const store = new ProjectsStore()
		store.add('Test', '#000', '#FFF')
		expect(store.update('Test', { name: 'Updated' })).toBe(true)
		expect(store.exists('Updated')).toBe(true)
	})

	it('should not delete project with events', () => {
		const store = new ProjectsStore()
		store.getIdWithIncEventsCount('Default')
		const initialLength = store.list.length
		store.delete('Default')
		expect(store.list.length).toBe(initialLength)
	})
})
```

**ProjectEditorStore:**
```typescript
describe('ProjectEditorStore', () => {
	it('should validate project name', () => {
		const projectsStore = new ProjectsStore()
		const editorStore = new ProjectEditorStore(projectsStore)
		editorStore.openAdd()
		editorStore.updateField('name', '')
		expect(editorStore.validate()).toBe(false)
		expect(editorStore.errors.name).toBeDefined()
	})

	it('should validate color format', () => {
		const projectsStore = new ProjectsStore()
		const editorStore = new ProjectEditorStore(projectsStore)
		editorStore.openAdd()
		editorStore.updateField('color', 'invalid')
		expect(editorStore.validate()).toBe(false)
		expect(editorStore.errors.color).toBeDefined()
	})
})
```

### 5.2. Интеграционные тесты

- Тестирование полного цикла: добавление → редактирование → удаление
- Тестирование валидации форм
- Тестирование взаимодействия с EventsStore

### 5.3. E2E тесты (опционально)

- Использование Playwright или Cypress
- Тестирование пользовательских сценариев

---

## 6. Миграция и обратная совместимость

### 6.1. Изменения в ProjectsStore

Изменения в `ProjectsStore` обратно совместимы:
- Метод `add()` теперь возвращает `boolean` вместо `void`
- Добавлен метод `update()`
- Добавлен метод `exists()`

**Старый код продолжит работать**, т.к. возвращаемое значение можно игнорировать.

### 6.2. Миграция данных

Данные хранятся в `localStorage` и Google Drive в формате `ProjectData[]`.  
**Миграция не требуется**, т.к. формат данных не изменяется.

---

## 7. Roadmap реализации

### Приоритет 1 (MVP)
1. ✅ Реализовать `ColorPicker` с использованием `react-colorful`
2. ⏳ Доработать `ProjectsStore` (методы `update()`, `exists()`, убрать `alert()`)
3. ⏳ Создать `ProjectEditorStore`
4. ⏳ Создать `ProjectForm` (модальная форма)
5. ⏳ Обновить `ProjectsForm` страницу со списком проектов

### Приоритет 2 (Улучшение UX)
6. ✅ Добавить превью проекта в форме
7. ✅ Добавить валидацию с понятными сообщениями
8. ✅ Добавить подтверждение удаления
9. ✅ Написать unit тесты

### Приоритет 3 (Опционально)
11. Добавить drag-and-drop для сортировки проектов
12. Добавить поиск/фильтрацию проектов
13. Добавить экспорт/импорт списка проектов

---

## 8. Возможные риски и проблемы

| Риск | Влияние | Митигация |
|------|---------|-----------|
| Изменение ProjectsStore сломает существующий код | Низкая | Изменения обратно совместимы |
| Конфликты при редактировании проекта из нескольких мест | Низкая | centralized store management |
| Отсутствие дизайна для ColorPicker | Низкая | ✅ Реализовано с react-colorful |

---

## 9. Ссылки

- **FSD документация:** https://feature-sliced.design/
- **react-colorful:** https://github.com/omgovich/react-colorful
- **MobX best practices:** https://mobx.js.org/README.html
- **react-hook-form:** https://react-hook-form.com/

---

## 10. Заключение

Предложенный подход обеспечивает:
- ✅ Следование FSD архитектуре
- ✅ Разделение ответственности (page → feature → shared)
- ✅ Переиспользуемость компонентов
- ✅ Покрытие тестами
- ✅ Обратную совместимость
- ✅ Постепенную миграцию

**Рекомендуемый стек:**
- ✅ `react-colorful` для ColorPicker — РЕАЛИЗОВАНО
- MobX для state management
- `react-hook-form` для валидации форм
- CSS Modules для стилизации
- Dialog компонент из `7-shared/ui/`

Готов обсудить детали и приступить к реализации после согласования подхода.
