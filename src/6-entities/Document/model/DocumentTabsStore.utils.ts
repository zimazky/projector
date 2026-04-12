import type { ProjectData } from 'src/6-entities/Projects/ProjectsStore'
import type { EventsStoreData } from 'src/6-entities/Events/EventsStore'

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

	return {
		projectsList,
		completedList: rawCompleted as EventsStoreData['completedList'],
		plannedList: rawPlanned as EventsStoreData['plannedList']
	}
}
