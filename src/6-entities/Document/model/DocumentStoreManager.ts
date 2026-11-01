import { makeAutoObservable } from 'mobx'
import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import type { DocumentStores, IDocumentDataProvider } from './DocumentStoreManager.types'
import { parseResourceDocumentData } from './ResourceDocumentFormat'
import { parseDocumentData } from './DocumentFormat'
import { ResourceCatalogStores } from './ResourceCatalogStores'
import { cloneDocumentData, computeFingerprint } from './DocumentSyncFingerprint'

export interface DocumentStoreCallbacks {
	onEventsChanged?: (stores: DocumentStores) => void
	onProjectsChanged?: (stores: DocumentStores) => void
	/** One publication of the complete document, independently of the changed stores. */
	onDocumentChanged?: (stores: DocumentStores) => void
	onActiveDocumentChanged?: (documentId: DocumentId) => void
}

export class DocumentStoreManager {
	private stores = new Map<DocumentId, DocumentStores>()
	private callbacks: DocumentStoreCallbacks

	constructor(
		private readonly dataProvider: IDocumentDataProvider,
		callbacks: DocumentStoreCallbacks = {},
		private readonly resourceAccounting = false
	) {
		this.callbacks = callbacks
		makeAutoObservable(this, {}, { autoBind: true })
	}

	setCallbacks(callbacks: DocumentStoreCallbacks): void {
		this.callbacks = callbacks
	}

	private checkedData(data: DocumentData): DocumentData {
		if (this.resourceAccounting) return parseResourceDocumentData(data)
		if ('schemaVersion' in data || 'baseResourceId' in data)
			throw new Error('Ресурсному документу требуются справочники нового режима')
		return data
	}

	createStores(documentId: DocumentId): DocumentStores {
		if (this.stores.has(documentId)) throw new Error(`Stores already exist for document: ${documentId}`)
		const source = this.dataProvider.getDocumentData(documentId)
		if (!source) throw new Error(`Document data not found: ${documentId}`)
		const data = this.checkedData(source)
		const projectsStore = new ProjectsStore()
		const eventsStore = new EventsStore(projectsStore, this.resourceAccounting)
		const stores: DocumentStores = { projectsStore, eventsStore, documentId, isInitialized: true }
		projectsStore.init(data.projectsList)
		eventsStore.init(data)
		if ('schemaVersion' in data) {
			const resourceStores = new ResourceCatalogStores(data, edit => {
				if (this.getStores(documentId)?.resourceStores !== resourceStores)
					throw new Error('Document stores are disposed')
				this.editDocument(documentId, draft => {
					if ('schemaVersion' in draft) edit(draft)
				})
			})
			stores.resourceStores = resourceStores
		}
		this.stores.set(documentId, stores)
		// Retain the actual managed instance; MobX may wrap the plain stores object.
		const managed = this.stores.get(documentId)!
		eventsStore.onChangeList = () => this.publish(managed, true, false)
		projectsStore.onChangeList = () => this.publish(managed, false, true)
		return managed
	}

	private publish(stores: DocumentStores, events: boolean, projects: boolean): void {
		if (this.stores.get(stores.documentId) !== stores) return
		this.callbacks.onDocumentChanged?.(stores)
		if (events) this.callbacks.onEventsChanged?.(stores)
		if (projects) this.callbacks.onProjectsChanged?.(stores)
	}

	/** Prepare and validate a detached draft before touching any live store. Synchronous only. */
	editDocument(documentId: DocumentId, edit: (draft: DocumentData) => void): void {
		const before = this.getDocumentDataForSave(documentId)
		if (!before) throw new Error(`Stores not found for document: ${documentId}`)
		const draft = cloneDocumentData(before)
		const result: unknown = edit(draft)
		if (result && typeof (result as PromiseLike<unknown>).then === 'function')
			throw new Error('Document edits must be synchronous')
		const next = this.resourceAccounting ? this.checkedData(draft) : parseDocumentData(this.checkedData(draft))
		if (computeFingerprint(before) === computeFingerprint(next)) return
		const eventsChanged =
			computeFingerprint({ projectsList: [], completedList: before.completedList, plannedList: before.plannedList }) !==
			computeFingerprint({ projectsList: [], completedList: next.completedList, plannedList: next.plannedList })
		const projectsChanged =
			computeFingerprint({ projectsList: before.projectsList, completedList: [], plannedList: [] }) !==
			computeFingerprint({ projectsList: next.projectsList, completedList: [], plannedList: [] })
		this.install(documentId, next, eventsChanged, projectsChanged)
		this.publish(this.stores.get(documentId)!, eventsChanged, projectsChanged)
	}

	getOrCreateStores(documentId: DocumentId): DocumentStores {
		return this.getStores(documentId) ?? this.createStores(documentId)
	}
	getStores(documentId: DocumentId): DocumentStores | null {
		return this.stores.get(documentId) ?? null
	}
	hasStores(documentId: DocumentId): boolean {
		return this.stores.has(documentId)
	}
	get activeStores(): DocumentStores | null {
		return this.dataProvider.activeDocumentId ? this.getStores(this.dataProvider.activeDocumentId) : null
	}
	get activeEventsStore(): EventsStore | null {
		return this.activeStores?.eventsStore ?? null
	}
	get activeProjectsStore(): ProjectsStore | null {
		return this.activeStores?.projectsStore ?? null
	}

	/** Validate the entire remote graph before installing it without user callbacks. */
	updateStoresData(documentId: DocumentId, source: DocumentData): void {
		if (!this.stores.has(documentId)) throw new Error(`Stores not found for document: ${documentId}`)
		this.install(documentId, this.checkedData(source), true, true)
	}

	private install(documentId: DocumentId, data: DocumentData, events: boolean, projects: boolean): void {
		const stores = this.stores.get(documentId)!
		const onEvents = stores.eventsStore.onChangeList
		const onProjects = stores.projectsStore.onChangeList
		stores.eventsStore.onChangeList = () => {}
		stores.projectsStore.onChangeList = () => {}
		try {
			// Events rebuild project reference counts, so reset projects together with events.
			if (projects || events) {
				stores.projectsStore.init(data.projectsList)
				stores.eventsStore.init(data)
			}
			if ('schemaVersion' in data) stores.resourceStores!.install(data)
		} finally {
			stores.eventsStore.onChangeList = onEvents
			stores.projectsStore.onChangeList = onProjects
		}
	}

	removeStores(documentId: DocumentId): void {
		const stores = this.stores.get(documentId)
		if (stores) {
			stores.eventsStore.onChangeList = () => {}
			stores.projectsStore.onChangeList = () => {}
			stores.isInitialized = false
		}
		this.stores.delete(documentId)
	}

	getDocumentDataForSave(documentId: DocumentId): DocumentData | null {
		const stores = this.stores.get(documentId)
		if (!stores) return null
		return cloneDocumentData({
			...stores.resourceStores?.prepareToSave(),
			projectsList: stores.projectsStore.getList(),
			...stores.eventsStore.prepareToSave()
		})
	}

	getAllDocumentStores(): DocumentStores[] {
		return Array.from(this.stores.values())
	}
	get storesCount(): number {
		return this.stores.size
	}
	clear(): void {
		for (const id of this.stores.keys()) this.removeStores(id)
	}
	dispose(): void {
		this.clear()
		this.callbacks = {}
	}
}
