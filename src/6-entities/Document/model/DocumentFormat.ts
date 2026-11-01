import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import type { DocumentData, LegacyDocumentData } from './DocumentTabsStore.types'
import type { EventDto } from 'src/6-entities/Events/EventDto'
import { DEFAULT_PROJECT_ID, legacyProjectId } from 'src/6-entities/Projects/ProjectId'

export const DOCUMENT_SCHEMA_VERSION = 2

export function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(message: string): never {
	throw new Error('Неверный формат документа: ' + message)
}

export function checkSchema(value: Record<string, unknown>): boolean {
	if (value.schemaVersion === undefined) return true
	if (value.schemaVersion !== 1 && value.schemaVersion !== DOCUMENT_SCHEMA_VERSION)
		invalid('неподдерживаемая schemaVersion.')
	return false
}

export function documentDate(value: unknown): string {
	if (typeof value !== 'string' || !/^(\d{4}\.\d{2}\.\d{2}|\d{4}-\d{2}-\d{2})$/.test(value))
		invalid('требуется действительная дата YYYY.MM.DD.')
	const [year, month, day] = value.split(/[.-]/).map(Number)
	const parsed = new Date(0)
	parsed.setUTCFullYear(year, month - 1, day)
	if (year < 1 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day)
		invalid('несуществующая дата.')
	return value.replace(/-/g, '.')
}

export function parseEventFields(value: unknown, completed: boolean): EventDto {
	if (!record(value) || typeof value.name !== 'string') invalid('событию требуется имя.')
	const result: EventDto = { name: value.name, start: documentDate(value.start) }
	for (const key of ['comment', 'project', 'projectId', 'time', 'duration', 'end', 'repeat'] as const) {
		if (value[key] === undefined) continue
		if (typeof value[key] !== 'string') invalid('неверный тип поля ' + key)
		result[key] = value[key]
	}
	for (const key of ['credit', 'debit'] as const) {
		if (value[key] === undefined) continue
		if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) invalid('неверная сумма ' + key)
		result[key] = value[key]
	}
	if (result.end) {
		result.end = documentDate(result.end)
		if (result.end <= result.start) invalid('конец события должен быть позже начала.')
	}
	if (result.time && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(result.time)) invalid('неверное время события.')
	let duration = 0
	if (result.duration) {
		const match = /^(?:(\d+)d\s+)?(\d+):([0-5]\d)$/.exec(result.duration)
		if (!match) invalid('неверная длительность события.')
		duration = Number(match[1] || 0) * 86400 + Number(match[2]) * 3600 + Number(match[3]) * 60
		if (!Number.isSafeInteger(duration) || duration > 8e12) invalid('слишком большая длительность.')
	}
	if (result.repeat) {
		if (!ZCron.validate(result.repeat)) invalid('неверное расписание события.')
		if (completed) invalid('выполненное событие не может иметь расписание.')
		const [hours, minutes] = (result.time || '0:00').split(':').map(Number)
		if (hours * 3600 + minutes * 60 + duration > 86400) invalid('повторяемое событие выходит за пределы дня.')
	}
	return result
}

/** Миграция выполняется на новой структуре; исходный объект не изменяется. */
export function parseDocumentData(content: unknown): LegacyDocumentData {
	let raw: unknown
	try {
		raw = typeof content === 'string' ? JSON.parse(content) : content
	} catch {
		return invalid('не удалось прочитать JSON.')
	}
	if (!record(raw)) invalid('корень должен быть объектом.')
	const legacy = checkSchema(raw)
	// Нельзя нормализовать ресурсные данные в старые сторы с потерей новых блоков.
	if (
		[
			'baseResourceId',
			'timezone',
			'units',
			'resources',
			'accounts',
			'balanceCategories',
			'priceHistory',
			'cashbackCategories',
			'cashbackMonthSettings',
			'migration'
		].some(key => key in raw)
	)
		invalid('ресурсному документу требуется новый codec.')
	if (!Array.isArray(raw.projectsList) || !Array.isArray(raw.completedList) || !Array.isArray(raw.plannedList))
		invalid('projectsList, completedList и plannedList должны быть массивами.')
	const names = new Set<string>()
	const ids = new Set<string>([DEFAULT_PROJECT_ID])
	const projectsList = raw.projectsList.map(project => {
		if (
			!record(project) ||
			typeof project.name !== 'string' ||
			!project.name.trim() ||
			typeof project.color !== 'string' ||
			typeof project.background !== 'string'
		)
			invalid('неверный проект.')
		if (names.has(project.name)) invalid('повторяется имя проекта: ' + project.name)
		names.add(project.name)
		const id = project.id ?? (raw.schemaVersion === DOCUMENT_SCHEMA_VERSION ? undefined : legacyProjectId(project.name))
		if (typeof id !== 'string' || !id.trim() || ids.has(id)) invalid('неверный или повторяющийся ID проекта.')
		ids.add(id)
		return { id, name: project.name, color: project.color, background: project.background }
	})
	const completedList = raw.completedList.map(value => parseEventFields(value, true))
	const plannedList = raw.plannedList.map(value => parseEventFields(value, false))
	for (const item of [...raw.completedList, ...raw.plannedList])
		if (
			record(item) &&
			['eventUid', 'seriesUid', 'occurrence', 'originalPlan', 'plannedOperation', 'actualOperation'].some(
				key => key in item
			)
		)
			invalid('метаданным ресурсного события требуется новый codec.')
	for (const item of [...completedList, ...plannedList]) {
		if (item.projectId !== undefined) {
			if (!ids.has(item.projectId)) invalid('неизвестный ID проекта события: ' + item.projectId)
			const name =
				item.projectId === DEFAULT_PROJECT_ID ? 'Default' : projectsList.find(p => p.id === item.projectId)!.name
			if (item.project && item.project !== name) invalid('противоречивые ссылки проекта события.')
		} else {
			if (raw.schemaVersion === DOCUMENT_SCHEMA_VERSION) invalid('событию требуется ID проекта.')
			if (!item.project || item.project === 'Default') item.projectId = DEFAULT_PROJECT_ID
			else {
				let project = projectsList.find(p => p.name === item.project)
				if (!project) {
					if (!legacy) invalid('неизвестный проект события: ' + item.project)
					project = { id: legacyProjectId(item.project), name: item.project, color: 'black', background: 'gray' }
					if (ids.has(project.id)) invalid('повторяется ID восстановленного проекта.')
					ids.add(project.id)
					projectsList.push(project)
				}
				item.projectId = project.id
			}
		}
		delete item.project
	}
	return { projectsList, completedList, plannedList }
}

/** Версия относится к внешнему формату, а не участвует в dirty-сравнении. */
export function serializeDocumentData(data: DocumentData): string {
	return JSON.stringify({ schemaVersion: DOCUMENT_SCHEMA_VERSION, ...parseDocumentData(data) }, null, 2)
}
