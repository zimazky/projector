import type { ProjectData } from 'src/6-entities/Projects/ProjectsStore'
import type { EventsStoreData } from 'src/6-entities/Events/EventsStore'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

/** Сериализуемая структура данных приложения */
export type MainStoreData = {
	projectsList: ProjectData[]
} & EventsStoreData

/** Узкий type-guard для проверки 'объектоподобного' значения */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/** Проверка структуры одного проекта в JSON-документе */
function isProjectData(value: unknown): value is ProjectData {
	if (!isRecord(value)) return false
	return typeof value.name === 'string' && typeof value.color === 'string' && typeof value.background === 'string'
}

/** Минимальная проверка DTO до создания/изменения доменных сторов. */
function validDate(value: unknown): boolean {
	if (typeof value !== 'string' || !/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(value)) return false
	const [year, month, day] = value.split(/[.-]/).map(Number)
	const date = new Date(0)
	date.setUTCFullYear(year, month - 1, day)
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function validateEvents(list: unknown[]): void {
	for (const item of list) {
		if (!isRecord(item) || typeof item.name !== 'string' || !validDate(item.start))
			throw new Error('Неверное событие: требуются имя и действительная дата начала.')
		for (const key of ['comment', 'project', 'time', 'duration', 'end', 'repeat']) {
			if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Неверный тип поля события: ' + key)
		}
		for (const key of ['credit', 'debit']) {
			if (item[key] !== undefined && (typeof item[key] !== 'number' || !Number.isFinite(item[key])))
				throw new Error('Неверная сумма события: ' + key)
		}
		if (item.end && !validDate(item.end)) throw new Error('Неверная дата окончания события.')
		if (item.time && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(item.time as string))
			throw new Error('Неверное время события.')
		if (item.duration && !/^(?:\d+d\s*)?\d+:[0-5]\d$/.test(item.duration as string))
			throw new Error('Неверная длительность события.')
		if (item.repeat && !ZCron.validate(item.repeat as string)) throw new Error('Неверное расписание события.')
	}
}

/**
 * Нормализация и валидация входного контента документа.
 * При ошибке структуры бросает исключение с понятным текстом.
 */
export function normalizeMainStoreData(rawContent: unknown): MainStoreData {
	const parsedContent = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent

	if (!isRecord(parsedContent)) {
		throw new Error('Invalid document format: root value must be an object')
	}

	const rawProjects = parsedContent.projectsList
	const rawCompleted = parsedContent.completedList
	const rawPlanned = parsedContent.plannedList

	if (!Array.isArray(rawProjects)) {
		throw new Error('Invalid document format: projectsList must be an array')
	}
	if (!Array.isArray(rawCompleted)) {
		throw new Error('Invalid document format: completedList must be an array')
	}
	if (!Array.isArray(rawPlanned)) {
		throw new Error('Invalid document format: plannedList must be an array')
	}

	const projectsList = rawProjects.filter(isProjectData)
	if (projectsList.length !== rawProjects.length) {
		throw new Error('Invalid document format: projectsList contains invalid entries')
	}
	validateEvents(rawCompleted)
	validateEvents(rawPlanned)

	return {
		projectsList,
		completedList: rawCompleted as EventsStoreData['completedList'],
		plannedList: rawPlanned as EventsStoreData['plannedList']
	}
}
