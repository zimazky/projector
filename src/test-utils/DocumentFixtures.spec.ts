import { storedDocument } from 'src/test-utils/storedDocument'
import { confirmedDocument } from 'src/test-utils/confirmedDocument'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { DocumentData } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import { normalizeMainStoreData } from 'src/6-entities/Document/model/DocumentTabsStore.utils'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { deferred } from './deferred'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

describe('Обезличенные документы исходного формата', () => {
	beforeEach(() => {
		localStorage.clear()
		DateTime.initLocale(0)
	})

	test.each(['legacy-document.json', 'repeating-document.json'])('сохраняет события при round-trip: %s', name => {
		const original = fixture(name)
		const data = normalizeMainStoreData(original)
		const projects = new ProjectsStore()
		projects.init(data.projectsList)
		const events = new EventsStore(projects)
		events.init(data)
		expect(events.prepareToSave()).toEqual({ completedList: data.completedList, plannedList: data.plannedList })
		expect(fixture(name)).toBe(original)
	})

	it('восстанавливает порядок, активную вкладку и содержимое двух документов без API', async () => {
		const tabs = fixture('legacy-tabs.json')
		localStorage.setItem('documentTabs', tabs)
		for (const [id, name] of [
			['fixture-a', 'legacy-document.json'],
			['fixture-b', 'repeating-document.json']
		]) {
			localStorage.setItem(
				`document_${id}`,
				JSON.stringify({ data: JSON.parse(fixture(name)), savedAt: 1793404800000 })
			)
		}
		const store = new DocumentTabsStore({} as any)
		expect(await store.restoreFromLocalStorage()).toBe(true)
		expect(store.documents.map(document => document.id)).toEqual(['fixture-a', 'fixture-b'])
		expect(store.activeDocument?.id).toBe('fixture-b')
		expect(store.documents[0].data).toEqual(normalizeMainStoreData(fixture('legacy-document.json')))
		expect(store.documents[1].data).toEqual(normalizeMainStoreData(fixture('repeating-document.json')))
		// Исходный snapshot остаётся доступным для последующей проверки миграций.
		expect(localStorage.getItem('documentTabs')).toBe(tabs)
	})

	it('отказ отложенной записи сохраняет вкладку и локальные данные', async () => {
		const response = deferred<never>()
		const updateFileContent = jest.fn().mockReturnValue(response.promise)
		const store = new DocumentTabsStore({
			updateFileContent,
			getFileMetadata: jest
				.fn()
				.mockResolvedValue({ id: 'fake-drive-id', name: 'Demo', mimeType: 'application/json', version: '1' })
		} as any)
		store.openNewDocument('Demo')
		const document = store.activeDocument!
		confirmedDocument(document, 'fake-drive-id')
		const data: DocumentData = normalizeMainStoreData(fixture('legacy-document.json'))
		const domainStores = store.getDocumentStores(document.id)!
		domainStores.projectsStore.init(data.projectsList)
		domainStores.eventsStore.init(data)
		store.updateActiveDocumentData(data)
		const saving = store.saveActiveDocument()
		await Promise.resolve()
		expect(updateFileContent).toHaveBeenCalledTimes(1)
		expect(document.operation).toBe('saving')
		response.reject(new Error('Synthetic network failure'))
		expect(await saving).toBe(false)
		expect(store.activeDocument?.id).toBe(document.id)
		expect(document.data).toEqual(data)
		expect(storedDocument(document.id)!.data).toEqual(data)
	})
})
