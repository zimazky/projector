import { makeAutoObservable } from 'mobx'
import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import type { DocumentTabsStore } from 'src/6-entities/Document/model'

/** Допустимые CSS именованные цвета */
const CSS_COLOR_ALIASES = new Set([
	// Основные цвета
	'black',
	'white',
	'red',
	'green',
	'blue',
	'yellow',
	'orange',
	'purple',
	'pink',
	'brown',
	'gray',
	'grey',
	// Оттенки серого
	'silver',
	'maroon',
	'olive',
	'lime',
	'aqua',
	'teal',
	'navy',
	'fuchsia',
	// CSS расширенные цвета
	'aliceblue',
	'antiquewhite',
	'aquamarine',
	'azure',
	'beige',
	'bisque',
	'blanchedalmond',
	'blueviolet',
	'burlywood',
	'cadetblue',
	'chartreuse',
	'chocolate',
	'coral',
	'cornflowerblue',
	'cornsilk',
	'crimson',
	'cyan',
	'darkblue',
	'darkcyan',
	'darkgoldenrod',
	'darkgray',
	'darkgreen',
	'darkgrey',
	'darkkhaki',
	'darkmagenta',
	'darkolivegreen',
	'darkorange',
	'darkorchid',
	'darkred',
	'darksalmon',
	'darkseagreen',
	'darkslateblue',
	'darkslategray',
	'darkslategrey',
	'darkturquoise',
	'darkviolet',
	'deeppink',
	'deepskyblue',
	'dimgray',
	'dimgrey',
	'dodgerblue',
	'firebrick',
	'floralwhite',
	'forestgreen',
	'gainsboro',
	'ghostwhite',
	'gold',
	'goldenrod',
	'greenyellow',
	'honeydew',
	'hotpink',
	'indianred',
	'indigo',
	'ivory',
	'khaki',
	'lavender',
	'lavenderblush',
	'lawngreen',
	'lemonchiffon',
	'lightblue',
	'lightcoral',
	'lightcyan',
	'lightgoldenrodyellow',
	'lightgray',
	'lightgreen',
	'lightgrey',
	'lightpink',
	'lightsalmon',
	'lightseagreen',
	'lightskyblue',
	'lightslategray',
	'lightslategrey',
	'lightsteelblue',
	'lightyellow',
	'limegreen',
	'linen',
	'magenta',
	'mediumaquamarine',
	'mediumblue',
	'mediumorchid',
	'mediumpurple',
	'mediumseagreen',
	'mediumslateblue',
	'mediumspringgreen',
	'mediumturquoise',
	'mediumvioletred',
	'midnightblue',
	'mintcream',
	'mistyrose',
	'moccasin',
	'navajowhite',
	'oldlace',
	'olivedrab',
	'orangered',
	'orchid',
	'palegoldenrod',
	'palegreen',
	'paleturquoise',
	'palevioletred',
	'papayawhip',
	'peachpuff',
	'peru',
	'plum',
	'powderblue',
	'rosybrown',
	'royalblue',
	'saddlebrown',
	'salmon',
	'sandybrown',
	'seagreen',
	'seashell',
	'sienna',
	'skyblue',
	'slateblue',
	'slategray',
	'slategrey',
	'snow',
	'springgreen',
	'steelblue',
	'tan',
	'thistle',
	'tomato',
	'turquoise',
	'violet',
	'wheat',
	'whitesmoke',
	'yellowgreen',
	// CSS3 цвета
	'rebeccapurple'
])

/** Проверка является ли строка допустимым цветом */
function isValidColor(value: string): boolean {
	if (!value) return false
	const trimmed = value.trim().toLowerCase()
	// Проверка HEX формата
	if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return true
	// Проверка 3-символьного HEX
	if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) return true
	// Проверка CSS алиаса
	if (CSS_COLOR_ALIASES.has(trimmed)) return true
	return false
}

/** Конвертация CSS алиаса цвета в HEX формат */
function colorToHex(color: string): string {
	if (!color) return '#000000'
	const trimmed = color.trim().toLowerCase()

	// Если уже HEX - возвращаем как есть
	if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase()
	if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
		// Конвертация 3-символьного HEX в 6-символьный
		const r = trimmed[1]
		const g = trimmed[2]
		const b = trimmed[3]
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
	}

	// Маппинг популярных алиасов в HEX
	const aliasToHex: Record<string, string> = {
		black: '#000000',
		white: '#FFFFFF',
		red: '#FF0000',
		green: '#008000',
		blue: '#0000FF',
		yellow: '#FFFF00',
		orange: '#FFA500',
		purple: '#800080',
		pink: '#FFC0CB',
		brown: '#A52A2A',
		gray: '#808080',
		grey: '#808080',
		silver: '#C0C0C0',
		maroon: '#800000',
		olive: '#808000',
		lime: '#00FF00',
		aqua: '#00FFFF',
		teal: '#008080',
		navy: '#000080',
		fuchsia: '#FF00FF',
		lightgray: '#D3D3D3',
		lightgrey: '#D3D3D3',
		darkgray: '#A9A9A9',
		darkgrey: '#A9A9A9',
		dimgray: '#696969',
		dimgrey: '#696969',
		slategray: '#708090',
		slategrey: '#708090'
	}

	return aliasToHex[trimmed] || '#000000'
}

/** Режим редактора проекта */
type EditorMode = 'add' | 'edit'

/** Данные формы редактора проекта */
type ProjectFormData = {
	name: string
	color: string
	background: string
}

/** Ошибки валидации формы редактора проекта */
type ProjectFormErrors = {
	name?: string
	color?: string
	background?: string
}

/**
 * Хранилище формы редактора проекта
 * Управляет состоянием формы добавления/редактирования проекта
 */
class ProjectEditorStore {
	/** Режим редактора */
	mode: EditorMode = 'add'
	/** Признак отображения формы */
	isOpen: boolean = false
	/** Данные формы (хранят исходные значения - алиасы или HEX) */
	formData: ProjectFormData = {
		name: '',
		color: '#000000',
		background: '#ffffff'
	}
	/** Ошибки валидации */
	errors: ProjectFormErrors = {}
	/** Исходное имя проекта (для режима edit) */
	private originalName: string = ''

	/**
	 * Получить цвет для ColorPicker (конвертирует алиасы в HEX)
	 */
	get colorForPicker(): string {
		return colorToHex(this.formData.color)
	}

	/**
	 * Получить цвет фона для ColorPicker (конвертирует алиасы в HEX)
	 */
	get backgroundForPicker(): string {
		return colorToHex(this.formData.background)
	}

	constructor(private documentTabsStore: DocumentTabsStore) {
		makeAutoObservable(this)
	}

	private get projectsStore(): ProjectsStore | null {
		return this.documentTabsStore.activeProjectsStore
	}

	/** Открыть форму для добавления нового проекта */
	openAdd() {
		this.mode = 'add'
		this.formData = { name: '', color: '#000000', background: '#ffffff' }
		this.errors = {}
		this.originalName = ''
		this.isOpen = true
	}

	/**
	 * Открыть форму для редактирования существующего проекта
	 * @param projectName - наименование проекта для редактирования
	 */
	openEdit(projectName: string) {
		if (!this.projectsStore) return
		const project = this.projectsStore.getByName(projectName)
		if (!project) return

		this.mode = 'edit'
		this.originalName = projectName
		// Сохраняем исходные значения (алиасы или HEX)
		this.formData = {
			name: project.name,
			color: project.color,
			background: project.background
		}
		this.errors = {}
		this.isOpen = true
	}

	/** Закрыть форму редактора */
	close() {
		this.isOpen = false
		this.errors = {}
	}

	/**
	 * Обновить поле формы
	 * @param field - поле формы для обновления
	 * @param value - новое значение
	 */
	updateField(field: keyof ProjectFormData, value: string) {
		this.formData[field] = value
		// Очистка ошибки при изменении поля
		if (this.errors[field]) {
			this.errors = { ...this.errors, [field]: undefined }
		}
	}

	/**
	 * Валидировать форму
	 * @returns true если валидация прошла успешно
	 */
	validate(): boolean {
		const errors: ProjectFormErrors = {}

		// Валидация имени
		if (this.formData.name.trim() === '') {
			errors.name = 'Project name is required'
		} else if (this.mode === 'add' && this.projectsStore?.exists(this.formData.name.trim())) {
			errors.name = 'Project with this name already exists'
		} else if (
			this.mode === 'edit' &&
			this.formData.name.trim() !== this.originalName &&
			this.projectsStore?.exists(this.formData.name.trim())
		) {
			errors.name = 'Project with this name already exists'
		}

		// Валидация цвета текста
		if (!isValidColor(this.formData.color)) {
			errors.color = 'Invalid color format. Use #RRGGBB or color name (e.g., red, lightgray)'
		}

		// Валидация цвета фона
		if (!isValidColor(this.formData.background)) {
			errors.background = 'Invalid color format. Use #RRGGBB or color name (e.g., red, lightgray)'
		}

		this.errors = errors
		return Object.keys(errors).length === 0
	}

	/**
	 * Сохранить проект (добавить или обновить)
	 * @returns true если успешно сохранено
	 */
	save(): boolean {
		if (!this.validate()) return false
		if (!this.projectsStore) return false

		const name = this.formData.name.trim()
		const color = this.formData.color
		const background = this.formData.background

		if (this.mode === 'add') {
			const success = this.projectsStore.add(name, color, background)
			if (success) {
				this.close()
				return true
			}
			this.errors.name = 'Failed to add project'
			return false
		} else {
			const success = this.projectsStore.update(this.originalName, {
				name,
				color,
				background
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
