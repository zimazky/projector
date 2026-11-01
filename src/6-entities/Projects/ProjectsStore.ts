import { makeAutoObservable } from 'mobx'
import { DEFAULT_PROJECT_ID, legacyProjectId, newProjectId } from './ProjectId'

/** Тип данных, определяющий стиль проекта */
export type ProjectStyle = {
	/** Цвет текста */
	color: string
	/** Цвет фона */
	background: string
}

/** Тип данных проекта для сохранения во внешних хранилищах (localStorage или GoogleDrive) */
export type ProjectData = {
	/** Отсутствует только во входных данных старого формата. */
	id?: string
	/** Наименование проекта */
	name: string
} & ProjectStyle

/** Структура для хранения данных проекта в классе хранилища Projects */
export type ProjectStructure = {
	id: string
	/** Число ссылок на события */
	events: number
} & ProjectData

/** Класс хранилища списка проектов */
export class ProjectsStore {
	private byId = new Map<string, ProjectStructure>()
	/** Список проектов, по умолчанию есть defaultProject для событий без определенного проекта */
	list: ProjectStructure[]
	/** Проект по умолчанию */
	static defaultProject: ProjectStructure = {
		id: DEFAULT_PROJECT_ID,
		name: 'Default',
		background: 'lightgray',
		color: 'black',
		events: 0
	}
	/** Callback при изменении списка проектов */
	onChangeList?: () => void

	constructor() {
		this.list = [{ ...ProjectsStore.defaultProject }]
		makeAutoObservable(this)
		this.indexProjects()
	}

	private indexProjects() {
		this.byId = new Map(this.list.map(project => [project.id, project]))
	}

	/**
	 * Добавить новый проект
	 * @param name - наименование проекта
	 * @param color - цвет текста
	 * @param background - цвет фона
	 * @returns true если успешно, false если дубликат или пустое имя
	 */
	add(name: string, color: string, background: string): boolean {
		const trimmedName = name.trim()
		if (trimmedName === '') return false

		const exists = this.list.find(l => l.name === trimmedName)
		if (exists) return false

		this.list.push({ id: newProjectId(), name: trimmedName, events: 0, color, background })
		this.indexProjects()
		this.onChangeList?.()
		return true
	}

	/**
	 * Обновить существующий проект
	 * @param id - стабильный идентификатор проекта
	 * @param updates - обновленные данные (name, color, background)
	 * @returns true если успешно, false если проект не найден или дубликат имени
	 */
	update(id: string, updates: { name?: string; color?: string; background?: string }): boolean {
		const project = this.getById(id)
		if (!project || id === DEFAULT_PROJECT_ID) return false

		// Проверка дубликата при переименовании
		if (updates.name !== undefined && updates.name.trim() !== project.name) {
			const trimmedNewName = updates.name.trim()
			if (!trimmedNewName) return false
			const duplicate = this.list.find(l => l.id !== id && l.name === trimmedNewName)
			if (duplicate) return false
			project.name = trimmedNewName
		}

		if (updates.color) project.color = updates.color
		if (updates.background) project.background = updates.background

		this.onChangeList?.()
		return true
	}

	/**
	 * Проверить существует ли проект с таким именем
	 * @param name - наименование проекта
	 * @returns true если проект существует
	 */
	exists(name: string): boolean {
		return this.list.some(l => l.name === name)
	}

	/**
	 * Удалить проект из списка
	 * Проект удаляется если отсутствуют ссылки на события
	 */
	delete(id: string) {
		const l = this.getById(id)
		if (l === undefined || id === DEFAULT_PROJECT_ID) return
		if (l.events > 0) alert(`Project "${l.name}" has ${l.events} links to events`)
		else {
			this.list = this.list.filter(l => l.id !== id)
			this.byId.delete(id)
			this.onChangeList?.()
		}
	}

	/**
	 * Получить проект из списка по наименованию
	 * @param name - наименование проекта
	 * @returns элемент списка проектов или undefined если проект не найден
	 */
	getByName(name: string) {
		return this.list.find(l => l.name === name)
	}

	/**
	 * Получить проект из списка по идентификатору
	 * @param id - идентификатор проекта
	 * @returns элемент списка проектов или undefined если проект не найден
	 */
	getById(id: string) {
		return this.byId.get(id)
	}

	/**
	 * Получить идентификатор проекта и увеличить счетчик ссылок на события для существующего проекта.
	 * Если проект с указанным наименованием отсутствует, то проект добавляется в список.
	 * Обеспечивает связанность проекта с событиями и для восстановления потерянных проектов из списка событий
	 * @param name - наименование проекта
	 * @returns идентификатор проекта
	 */
	getIdWithIncEventsCount(name = '', projectId?: string): string {
		let project =
			projectId !== undefined
				? this.getById(projectId)
				: !name || name === 'Default'
					? this.getById(DEFAULT_PROJECT_ID)
					: this.getByName(name)
		if (!project && projectId !== undefined) throw new Error('Неизвестный ID проекта: ' + projectId)
		if (!project) {
			project = { id: newProjectId(), name, events: 0, color: 'black', background: 'gray' }
			this.list.push(project)
			this.indexProjects()
			project = this.getById(project.id)!
		}
		project.events++
		return project.id
	}

	changeEventsCount(id: string, delta: number) {
		const project = this.getById(id)
		if (project) project.events = Math.max(0, project.events + delta)
	}

	/**
	 * Инициализация списка проектов из массива, полученного из внешних хранилищ
	 * @param list - список проектов из внешнего хранилища
	 */
	init(list: ProjectData[]) {
		if (list === undefined) this.list = [{ ...ProjectsStore.defaultProject }]
		else
			this.list = [
				{ ...ProjectsStore.defaultProject },
				...list.map(p => {
					return { ...p, id: p.id ?? legacyProjectId(p.name), events: 0 }
				})
			]
		this.indexProjects()
		this.onChangeList?.()
	}

	/** Получить список проектов ProjectData[] для сохранения во внешних хранилищах */
	getList(): ProjectData[] {
		return this.list
			.map(p => {
				return { id: p.id, name: p.name, color: p.color, background: p.background }
			})
			.slice(1)
	}
}
