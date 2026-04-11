import { DocumentId } from './DocumentTabsStore.types'
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

/** Пара сторов для конкретного документа */
export type DocumentStores = {
	projectsStore: ProjectsStore
	eventsStore: EventsStore
	documentId: DocumentId
	isInitialized: boolean
}
