import { makeAutoObservable, observable } from 'mobx'

import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { EventDto } from 'src/6-entities/Events/EventDto'
import type { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { DocumentStores } from 'src/6-entities/Document/model/DocumentStoreManager.types'
import type { DocumentSession } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import type { EventCacheStructure } from 'src/6-entities/EventsCache/EventCacheStructure'
import type { ResourceEventReference } from 'src/6-entities/Operations/ResourceOperationCommands'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { newEventUid } from 'src/6-entities/Events/EventIdentity'

export type EventFormStructure = {
	sourceDocumentId?: string
	occurrenceDate?: string
	/** Идентификатор события (если не указан, то новое событие) */
	id: number | null
	/** Признак завершенности события */
	completed?: boolean
	/** Метка времени дня */
	timestamp: timestamp
} & EventDto

export class EventFormStore {
	private context: { session: DocumentSession; stores: DocumentStores; version: number } | null = null
	private drag: {
		context: NonNullable<EventFormStore['context']>
		reference: ResourceEventReference
		token: string
	} | null = null
	formKey = ''
	/** Признак отображения модальной формы на экране */
	isShow: boolean = false
	/** Данные отображаемого события */
	eventData: EventFormStructure = {
		id: null,
		timestamp: 0,
		name: '',
		start: ''
	}

	constructor(private readonly tabs?: DocumentTabsStore) {
		makeAutoObservable<this, 'context' | 'tabs' | 'drag'>(this, { context: observable.ref, tabs: false, drag: false })
	}

	get sourceStores(): DocumentStores | null {
		return this.context?.stores ?? null
	}
	get sourceDocumentId(): string | undefined {
		return this.context?.session.id
	}
	get resourceAccounting(): boolean {
		return !!this.sourceStores?.resourceStores
	}

	private capture(documentId?: string): NonNullable<EventFormStore['context']> | null {
		const session = this.tabs?.documents.find(row => row.id === (documentId ?? this.tabs?.activeDocumentId))
		const stores = session && this.tabs?.getDocumentStores(session.id)
		return session && stores ? { session, stores, version: session.sync.localVersion } : null
	}

	private check(context = this.context): void {
		if (!this.tabs) return
		if (
			!context ||
			this.tabs.documents.find(row => row.id === context.session.id) !== context.session ||
			this.tabs.getDocumentStores(context.session.id) !== context.stores ||
			!context.stores.isInitialized ||
			context.session.sync.localVersion !== context.version
		)
			throw new Error('Исходный документ закрыт или изменён. Откройте карточку заново.')
	}

	assertSource = (): void => {
		this.check()
	}

	reference(all = false): ResourceEventReference {
		const event = this.eventData
		if (!all && event.repeat && event.seriesUid)
			return {
				seriesUid: event.seriesUid,
				occurrenceDate: event.occurrenceDate ?? DateTime.getYYYYMMDD(event.timestamp)
			}
		if (!event.eventUid) throw new Error('Событие не имеет постоянного идентификатора.')
		return { eventUid: event.eventUid }
	}

	openEvent = (event: EventCacheStructure): void => {
		const stores = this.tabs?.getDocumentStores(event.sourceDocumentId ?? this.tabs.activeDocumentId ?? '')
		const dto = stores?.eventsStore.getEventDto(event.id)
		if (!dto) return
		this.setEventDto({
			...dto,
			sourceDocumentId: stores!.documentId,
			id: event.id,
			completed: event.completed,
			timestamp: event.start,
			occurrenceDate: event.occurrence?.occurrenceDate
		})
		this.showForm()
	}

	beginDrag = (event: EventCacheStructure): string => {
		const context = this.capture(event.sourceDocumentId)
		if (!context) throw new Error('Документ не найден.')
		const reference: ResourceEventReference =
			event.repeatable && event.occurrence ? { ...event.occurrence } : { eventUid: event.eventUid! }
		const token = newEventUid()
		this.drag = { context, reference, token }
		return token
	}

	dropResource = (token: string, date: timestamp, copy: boolean): void => {
		const drag = this.drag
		if (!drag || drag.token !== token) throw new Error('Перенос устарел. Перетащите событие заново.')
		this.check(drag.context)
		const commands = this.tabs!.resourceCommands,
			id = drag.context.session.id
		if (copy) commands.copy(id, drag.reference, DateTime.getYYYYMMDD(date))
		else commands.move(id, drag.reference, DateTime.getYYYYMMDD(date))
		this.drag = null
	}

	showForm = () => {
		this.isShow = true
	}

	hideForm = () => {
		this.isShow = false
	}

	setEventDto = (e: EventFormStructure) => {
		this.context = this.capture(e.sourceDocumentId)
		this.formKey = newEventUid()
		this.eventData = JSON.parse(JSON.stringify(e))
	}
}
