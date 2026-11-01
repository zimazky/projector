import { ProjectsStore } from './ProjectsStore'
import { DEFAULT_PROJECT_ID } from './ProjectId'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { parseDocumentData, serializeDocumentData } from 'src/6-entities/Document/model/DocumentFormat'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { getIsDirty } from 'src/6-entities/Document/model/DocumentSyncSelectors'
import { computeFingerprint } from 'src/6-entities/Document/model/DocumentSyncFingerprint'
import ProjectEditorStore from 'src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore'

const day = DateTime.YYYYMMDDToTimestamp('2026.11.01')
const legacy = () => ({
	projectsList: [
		{ name: 'A', color: 'red', background: 'blue' },
		{ name: 'B', color: 'green', background: 'white' }
	],
	completedList: [{ name: 'Completed', project: 'B', start: '2026.11.01' }],
	plannedList: [
		{ name: 'Single', project: 'B', start: '2026.11.01' },
		{ name: 'Series', project: 'B', start: '2026.11.01', repeat: '* * *', end: '2026.11.02' }
	]
})

function setup() {
	const data = parseDocumentData(legacy())
	const projects = new ProjectsStore()
	projects.init(data.projectsList)
	const events = new EventsStore(projects)
	events.init(data)
	return { projects, events, data }
}

function assertCounts(projects: ProjectsStore, events: EventsStore) {
	const all = [...events.planned, ...events.completed, ...events.plannedRepeatable]
	for (const project of projects.list) expect(project.events).toBe(all.filter(e => e.projectId === project.id).length)
}

describe('F11: стабильные проекты и ссылки', () => {
	beforeEach(() => localStorage.clear())

	it('переименование сохраняет ID, стиль и принадлежность всех типов событий после round-trip', () => {
		const { projects, events } = setup()
		const id = projects.getByName('B')!.id
		expect(projects.update(id, { name: 'Renamed' })).toBe(true)
		const json = serializeDocumentData({ projectsList: projects.getList(), ...events.prepareToSave() })
		expect(JSON.parse(json).schemaVersion).toBe(2)
		expect(json).not.toContain('"project":')
		const data = parseDocumentData(json)
		projects.init(data.projectsList)
		events.init(data)
		expect(projects.getByName('Renamed')!.id).toBe(id)
		expect(projects.getByName('B')).toBeUndefined()
		expect([...events.planned, ...events.completed, ...events.plannedRepeatable].every(e => e.projectId === id)).toBe(
			true
		)
		expect(projects.getById(id)).toMatchObject({ color: 'green', background: 'white', events: 3 })
		assertCounts(projects, events)
	})

	it('удаление более раннего проекта не меняет стиль чужих событий', () => {
		const { projects, events } = setup()
		const id = projects.getByName('B')!.id
		projects.delete(projects.getByName('A')!.id)
		const cache = new EventsCache({ activeEventsStore: events, activeProjectsStore: projects } as any)
		expect(cache.getEvents(day)).toHaveLength(3)
		expect(cache.getEvents(day).every(e => e.color === 'green' && e.background === 'white')).toBe(true)
		expect(events.planned[0].projectId).toBe(id)
	})

	it('обновляет счётчики при смене проекта, завершении, отмене, копировании и удалении', () => {
		const { projects, events } = setup()
		const id = projects.getByName('A')!.id
		events.updateEvent(events.planned[0].id, { name: 'Moved', start: '2026.11.01', projectId: id })
		assertCounts(projects, events)
		events.completeEvent(events.planned[0].id, day, events.getEventDto(events.planned[0].id)!)
		assertCounts(projects, events)
		const moved = events.completed.find(e => e.name === 'Moved')!
		events.uncompleteEvent(moved.id, events.getEventDto(moved.id)!)
		assertCounts(projects, events)
		events.copyToDate(events.planned[0].id, day + 86400)
		assertCounts(projects, events)
		for (const event of [...events.planned, ...events.completed, ...events.plannedRepeatable])
			events.deleteEvent(event.id)
		assertCounts(projects, events)
		expect(projects.list.every(p => p.events === 0)).toBe(true)
		projects.delete(id)
		expect(projects.getById(id)).toBeUndefined()
	})

	it.each(['delete', 'complete', 'single'] as const)(
		'индекс использований согласован после разбиения серии: %s',
		operation => {
			const { projects, events } = setup()
			events.init({
				completedList: [],
				plannedList: [
					{
						name: 'Series',
						projectId: projects.getByName('B')!.id,
						start: '2026.10.29',
						repeat: '* * *',
						end: '2026.11.02'
					}
				]
			})
			const id = events.plannedRepeatable[0].id
			const dto = events.getEventDto(id)!
			if (operation === 'delete') events.deleteCurrentRepeatableEvent(id, day)
			if (operation === 'complete') events.completeEvent(id, day, dto)
			if (operation === 'single') events.saveAsSingleEvent(id, day, dto)
			assertCounts(projects, events)
			expect(projects.getByName('B')!.events).toBe(operation === 'delete' ? 1 : 2)
			for (const event of [...events.planned, ...events.completed, ...events.plannedRepeatable])
				events.deleteEvent(event.id)
			expect(projects.getByName('B')!.events).toBe(0)
		}
	)

	it('повторная инициализация не накапливает использования; default независим между документами', () => {
		const { projects, events, data } = setup()
		events.init(data)
		assertCounts(projects, events)
		const other = new ProjectsStore()
		events.addPlannedEventDto({ name: 'Default event', start: '2026.11.01' })
		expect(projects.getById(DEFAULT_PROJECT_ID)!.events).toBe(1)
		expect(other.getById(DEFAULT_PROJECT_ID)!.events).toBe(0)
		expect(ProjectsStore.defaultProject.events).toBe(0)
	})

	it('не использует имя как ID и не переносит старые ссылки на вновь созданный проект', () => {
		const { projects, events } = setup()
		const oldId = projects.getByName('A')!.id
		projects.delete(oldId)
		projects.add('A', 'red', 'blue')
		expect(projects.getByName('A')!.id).not.toBe(oldId)
		expect(() =>
			events.addPlannedEventDto({ name: 'Invalid', start: '2026.11.01', projectId: oldId, project: 'A' })
		).toThrow()
		assertCounts(projects, events)
	})

	it('ID нельзя подменить совпадающим именем другого проекта', () => {
		const { projects } = setup()
		const id = projects.getByName('A')!.id
		projects.add(id, 'black', 'white')
		const other = projects.getByName(id)!.id
		expect(projects.update(id, { name: 'Changed' })).toBe(true)
		expect(projects.getById(id)!.name).toBe('Changed')
		expect(projects.getById(other)!.name).toBe(id)
	})

	it('редактор не переносит решение в другой документ с таким же ID проекта', () => {
		const tabs = new DocumentTabsStore({} as any)
		tabs.openNewDocument('A')
		tabs.applyContentToActiveDocument(legacy())
		const first = tabs.activeProjectsStore!
		const id = first.getByName('B')!.id
		const editor = new ProjectEditorStore(tabs)
		editor.openEdit(id)
		editor.updateField('name', 'Wrong document')
		tabs.openNewDocument('B')
		tabs.applyContentToActiveDocument(legacy())
		expect(editor.save()).toBe(false)
		expect(first.getById(id)!.name).toBe('B')
		expect(tabs.activeProjectsStore!.getById(id)!.name).toBe('B')
	})

	it('миграция старого документа детерминирована, обратима по исходнику и повторяема', () => {
		const original = legacy()
		const json = JSON.stringify(original)
		const data = parseDocumentData(original)
		expect(parseDocumentData(json)).toEqual(data)
		expect(parseDocumentData(serializeDocumentData(data))).toEqual(data)
		expect(JSON.stringify(original)).toBe(json)
	})

	it.each(['duplicate', 'reserved', 'missing-project-id', 'dangling', 'empty', 'conflicting-name'])(
		'отклоняет невалидный v2 целиком: %s',
		mode => {
			const document = JSON.parse(serializeDocumentData(parseDocumentData(legacy())))
			if (mode === 'duplicate') document.projectsList[1].id = document.projectsList[0].id
			if (mode === 'reserved') document.projectsList[0].id = DEFAULT_PROJECT_ID
			if (mode === 'missing-project-id') delete document.projectsList[0].id
			if (mode === 'dangling') document.plannedList[0].projectId = 'missing'
			if (mode === 'empty') document.plannedList[0].projectId = ''
			if (mode === 'conflicting-name') document.plannedList[0].project = 'A'
			expect(() => parseDocumentData(document)).toThrow()
		}
	)

	it.each([false, true])('перенос сессии v2 сохраняет исходник и dirty=%s', async dirty => {
		const tabs = new DocumentTabsStore({} as any)
		tabs.openNewDocument('Source')
		const old = JSON.parse(tabs.exportLocalSession())
		old.schemaVersion = 2
		const item = old.documents[0]
		item.data = legacy()
		item.sync.localVersion = dirty ? 2 : 1
		item.sync.baseLocalVersion = 1
		item.sync.localFingerprint = computeFingerprint(item.data)
		item.sync.baseFingerprint = computeFingerprint(dirty ? { ...legacy(), plannedList: [] } : item.data)
		const original = JSON.stringify(old)
		localStorage.setItem('documentTabs', original)
		const restored = new DocumentTabsStore({} as any)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(getIsDirty(restored.activeDocument!)).toBe(dirty)
		restored.activateDocument(restored.activeDocumentId!)
		expect(JSON.parse(localStorage.getItem('documentTabs.backup.0')!).documentTabs).toBe(original)
		expect(JSON.parse(localStorage.getItem('documentTabs')!).schemaVersion).toBe(3)
		const id = restored.activeProjectsStore!.getByName('B')!.id
		restored.activeProjectsStore!.update(id, { name: 'Renamed' })
		const again = new DocumentTabsStore({} as any)
		expect(await again.restoreFromLocalStorage()).toBe(true)
		expect(again.activeProjectsStore!.getByName('Renamed')!.id).toBe(id)
		expect(again.activeEventsStore!.planned[0].projectId).toBe(id)
	})
})
