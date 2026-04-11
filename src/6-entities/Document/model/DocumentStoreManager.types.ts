import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import type { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import type { EventsStore } from 'src/6-entities/Events/EventsStore'

/** Пара сторов для конкретного документа */
export interface DocumentStores {
	projectsStore: ProjectsStore
	eventsStore: EventsStore
	documentId: DocumentId
	isInitialized: boolean
}

/** Интерфейс провайдера данных документа (для DI и тестирования) */
export interface IDocumentDataProvider {
	getDocumentData(documentId: DocumentId): DocumentData | null
	readonly activeDocumentId: DocumentId | null
}

/** Интерфейс провайдера сторов для EventsCache (для развязки) */
export interface IEventsStoreProvider {
	readonly activeEventsStore: EventsStore | null
	readonly activeProjectsStore: ProjectsStore | null
	getAllDocumentStores(): DocumentStores[]
}
