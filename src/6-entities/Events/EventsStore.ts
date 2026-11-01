import { action, makeObservable, observable } from 'mobx'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'

import { IEventModel, SingleEventModel, RepeatableEventModel } from './EventModel'
import { eventDtoToIEventModel, repeatableEventModelToEventDto, singleEventModelToEventDto } from './EventMappers'
import { EventDto } from './EventDto'
import { SingleEventManager } from './SingleEventManager'
import { RepeatableEventManager } from './RepeatableEventManager'
import { createEventMetadata, editedEventMetadata, occurrenceEventUid, validateEventIdentities } from './EventIdentity'

export type EventsStoreData = {
	completedList: EventDto[]
	plannedList: EventDto[]
}

/**
 * Класс списка событий, полученных из хранилища и приведенных к оптимизированной для обработки форме.
 * Также подготавливает и оптимизирует данные для сохранения в хранилище (уменьшает размер)
 * Создает новые события, удаляет и изменяет существующие, переводит планируемые в выполненные
 */
export class EventsStore {
	/** Указатель на хранилище проектов */
	projects: ProjectsStore
	/** Нумератор идентификаторов */
	private lastId = 1
	/** Версия для производных индексов; не записывается в документ. */
	version = 0
	/** Колбэк функция, вызывается при каждом изменении списка */
	onChangeList = () => {}

	private notifyChanged(shouldSort = true) {
		if (shouldSort) this.sort()
		this.version++
		this.onChangeList()
	}

	private singleEventManager: SingleEventManager
	private repeatableEventManager: RepeatableEventManager

	public get completed(): SingleEventModel[] {
		return this.singleEventManager.completed
	}

	public get planned(): SingleEventModel[] {
		return this.singleEventManager.planned
	}

	public get plannedRepeatable(): RepeatableEventModel[] {
		return this.repeatableEventManager.plannedRepeatable
	}

	/** Новый путь пока включается только целиком в интеграционных проверках. */
	constructor(
		projectsStore: ProjectsStore,
		private readonly resourceAccounting = false
	) {
		this.projects = projectsStore

		this.singleEventManager = new SingleEventManager(
			this.projects,
			() => this.lastId++,
			() => this.notifyChanged(),
			this.resourceAccounting
		)

		this.repeatableEventManager = new RepeatableEventManager(
			this.projects,
			() => this.lastId++,
			() => {
				if (this.resourceAccounting) this.excludeDetachedOccurrences()
				this.notifyChanged()
			},
			(e, isFinal) => this.singleEventManager.addPlanned(e, isFinal),
			(e, isFinal) => this.singleEventManager.addCompleted(e, isFinal),
			this.resourceAccounting
		)
		// Модели и менеджеры изменяются пакетными командами. Публикуем одну
		// наблюдаемую версию после завершения команды, не превращая чтение в action.
		makeObservable<this, 'notifyChanged'>(this, {
			version: observable,
			notifyChanged: action,
			init: action,
			addCompletedEventModel: action,
			addCompletedEventDto: action,
			addPlannedEventModel: action,
			addPlannedEventDto: action,
			deleteEvent: action,
			deleteCurrentRepeatableEvent: action,
			completeEvent: action,
			uncompleteEvent: action,
			updateEvent: action,
			shiftToDate: action,
			copyToDate: action,
			saveAsSingleEvent: action,
			sort: action
		})
	}

	/** Загрузка данных со сбросом предшествующих данных */
	init(d: EventsStoreData) {
		if (this.resourceAccounting) validateEventIdentities([...d.completedList, ...d.plannedList])
		this.lastId = 1
		this.singleEventManager.reset()
		this.repeatableEventManager.reset()
		d.completedList?.forEach(e => {
			this.singleEventManager.addCompletedFromDto(e, false)
		})
		d.plannedList?.forEach(e => {
			if (e.repeat) this.repeatableEventManager.addFromDto(e, false)
			else this.singleEventManager.addPlannedFromDto(e, false)
		})
		// Восстановление сохраняет порядок исходного снимка; само чтение не создаёт dirty.
		this.notifyChanged(false)
	}

	/** Подготовка для сохранения в хранилище */
	prepareToSave() {
		const completedList = this.singleEventManager.completed.map(e =>
			singleEventModelToEventDto(e, this.resourceAccounting)
		)
		const plannedList: EventDto[] = this.repeatableEventManager.plannedRepeatable.reduce((a, e) => {
			return (a.push(repeatableEventModelToEventDto(e, this.resourceAccounting)), a)
		}, [] as EventDto[])
		this.singleEventManager.planned.reduce((a, e) => {
			return (a.push(singleEventModelToEventDto(e, this.resourceAccounting)), a)
		}, plannedList)
		return { completedList, plannedList }
	}

	getEventModel(id: number): IEventModel | undefined {
		let event = this.singleEventManager.findCompleted(id)
		if (event !== undefined) return event
		event = this.singleEventManager.findPlanned(id)
		if (event !== undefined) return event
		const revent = this.repeatableEventManager.find(id)
		if (revent !== undefined) return revent
	}

	getEventDto(id: number): EventDto | undefined {
		let event = this.singleEventManager.findCompleted(id)
		if (event !== undefined) return singleEventModelToEventDto(event, this.resourceAccounting)
		event = this.singleEventManager.findPlanned(id)
		if (event !== undefined) return singleEventModelToEventDto(event, this.resourceAccounting)
		const revent = this.repeatableEventManager.find(id)
		if (revent !== undefined) return repeatableEventModelToEventDto(revent, this.resourceAccounting)
	}

	/**
	 * Добавление в список выполненного события
	 * @param e Событие
	 * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
	 */
	addCompletedEventModel(e: IEventModel, isFinal: boolean = true) {
		this.singleEventManager.addCompleted(this.createdModel(e), isFinal)
	}

	addCompletedEventDto(e: EventDto, isFinal: boolean = true) {
		this.addCompletedEventModel(eventDtoToIEventModel(e), isFinal)
	}

	/**
	 * Добавление в список запланированного события
	 * @param e Событие
	 * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
	 */
	addPlannedEventModel(e: IEventModel, isFinal: boolean = true) {
		e = this.createdModel(e)
		if (e.repeat) {
			this.repeatableEventManager.add(e, isFinal)
		} else {
			this.singleEventManager.addPlanned(e, isFinal)
		}
	}

	addPlannedEventDto(raw: EventDto, isFinal: boolean = true) {
		this.addPlannedEventModel(eventDtoToIEventModel(raw), isFinal)
	}

	/**
	 * Удаление события
	 * @param id Идентификатор события
	 * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
	 */
	deleteEvent(id: number | null, isFinal: boolean = true) {
		const deletedInSingle = this.singleEventManager.delete(id)
		this.repeatableEventManager.delete(id)
		if (isFinal) this.notifyChanged()
	}

	/**
	 * Удаление текущего повторяемого события
	 * @param id Идентификатор события
	 * @param currentdate Текущая дата повторяемого события
	 */
	deleteCurrentRepeatableEvent(id: number | null, currentdate: timestamp) {
		this.repeatableEventManager.deleteCurrent(id, currentdate)
	}

	/**
	 * Завершение события с одновременной модификацией параметров события.
	 * Повторяемые события при завершении трансформируются в одиночные, модификация затрагивает только
	 * текущее событие.
	 * @param id Идентификатор события
	 * @param currentdate Текущая дата для уточнения события среди повторяемых
	 * @param e Модифицированное событие
	 */
	completeEvent(id: number | null, currentdate: timestamp, e: EventDto) {
		if (this.resourceAccounting) {
			const series = this.plannedRepeatable.find(event => event.id === id)
			if (series && this.hasDetachedOccurrence(series.seriesUid!, currentdate)) return
			const single = this.planned.find(event => event.id === id)
			if (single || (series && this.repeatableEventManager.containsOccurrence(series, currentdate))) {
				const source = single ?? series!
				const occurrence = series && { seriesUid: series.seriesUid!, occurrenceDate: DateTime.getYYYYMMDD(currentdate) }
				const completed = {
					...source,
					...editedEventMetadata(source, e),
					eventUid: occurrence ? occurrenceEventUid(occurrence) : source.eventUid,
					repeat: undefined,
					plannedOperation: undefined,
					occurrence: occurrence ?? source.occurrence
				}
				this.validateReplacement(single?.id ?? null, completed)
			}
		}
		if (this.singleEventManager.complete(id, e)) {
			this.notifyChanged()
			return
		}

		if (this.repeatableEventManager.complete(id, currentdate, e)) {
			// onChange is called inside
			return
		}
	}

	/**
	 * Отменить завершение события с одновременной модификацией параметров события.
	 * @param id Идентификатор события
	 * @param raw Модифицированное событие
	 */
	uncompleteEvent(id: number | null, raw: EventDto) {
		if (this.resourceAccounting) {
			const event = this.completed.find(item => item.id === id)
			if (event?.occurrence) {
				// Не возвращаем старую серию целиком: восстанавливается только связанный план.
				this.excludeDetachedOccurrences(event.occurrence.seriesUid)
			}
		}
		if (this.singleEventManager.uncomplete(id, raw)) {
			this.notifyChanged()
		}
	}

	/**
	 * Изменение параметров события
	 * @param id Идентификатор события
	 * @param e Модифицированное событие в текстовом представлении rawEvent
	 */
	updateEvent(id: number, e: EventDto) {
		if (this.resourceAccounting) {
			const source = this.getEventModel(id)
			if (source) this.validateReplacement(id, { ...source, ...editedEventMetadata(source, e) })
		}
		if (this.singleEventManager.update(id, e)) {
			this.notifyChanged()
			return
		}

		if (this.repeatableEventManager.update(id, e)) {
			if (this.resourceAccounting) this.excludeDetachedOccurrences()
			this.notifyChanged()
			return
		}
	}

	/**
	 * Сдвиг события в другую дату.
	 * Для периодических событий реализован сдвиг только для начального события,
	 * относительно которого построено расписание с шаблоном "/d"
	 * @param id идентификатор события
	 * @param todate дата в которую совершается перемещение
	 * @param currentdate для повторяемых событий дата конкретного
	 * */
	shiftToDate(id: number, todate: timestamp, currentdate: timestamp) {
		if (this.singleEventManager.shift(id, todate)) {
			return
		}
		if (this.repeatableEventManager.shift(id, todate, currentdate)) {
			return
		}
	}

	/**
	 * Копирование события в другую дату. Периодическое событие копируется как одиночное.
	 * @param id идентификатор события
	 * @param todate дата в которую совершается копирование
	 * */
	copyToDate(id: number, todate: timestamp) {
		if (this.singleEventManager.copy(id, todate)) {
			return
		}
		if (this.repeatableEventManager.copy(id, todate)) {
			return
		}
	}

	/**
	 * Превращение повторяемого события в одиночное с одновременной модификацией параметров события.
	 * Модификация затрагивает только текущее событие.
	 * @param id Идентификатор события
	 * @param currentdate Текущая дата для уточнения события среди повторяемых
	 * @param e Модифицированное событие
	 */
	saveAsSingleEvent(id: number, currentdate: timestamp, e: EventDto) {
		if (this.resourceAccounting) {
			const series = this.plannedRepeatable.find(event => event.id === id)
			if (series && this.hasDetachedOccurrence(series.seriesUid!, currentdate)) return
		}
		this.repeatableEventManager.saveAsSingle(id, currentdate, e)
	}

	private createdModel(event: IEventModel): IEventModel {
		if (!this.resourceAccounting) return event
		const created = { ...event, ...createEventMetadata(event, !!event.repeat) }
		validateEventIdentities([...this.completed, ...this.planned, ...this.plannedRepeatable, created])
		return created
	}

	private validateReplacement(id: number | null, replacement: IEventModel): void {
		validateEventIdentities([
			...[...this.completed, ...this.planned, ...this.plannedRepeatable].filter(event => event.id !== id),
			replacement
		])
	}

	private hasDetachedOccurrence(seriesUid: string, date: timestamp): boolean {
		const uid = occurrenceEventUid({ seriesUid, occurrenceDate: DateTime.getYYYYMMDD(date) })
		return [...this.completed, ...this.planned].some(
			event =>
				event.eventUid === uid ||
				(event.occurrence?.seriesUid === seriesUid && event.occurrence.occurrenceDate === DateTime.getYYYYMMDD(date))
		)
	}

	/** Правка серии не возвращает уже выделенные/выполненные соседние вхождения. */
	private excludeDetachedOccurrences(seriesUid?: string): void {
		for (const single of [...this.completed, ...this.planned]) {
			const occurrence = single.occurrence
			if (!occurrence || (seriesUid && occurrence.seriesUid !== seriesUid)) continue
			const date = DateTime.YYYYMMDDToTimestamp(occurrence.occurrenceDate)
			for (const series of [...this.plannedRepeatable])
				if (series.seriesUid === occurrence.seriesUid) this.repeatableEventManager.excludeOccurrence(series.id, date)
		}
	}

	/**
	 * Функция предварительной сортировки событий,
	 * упорядочивает для более быстрой сортировки в методе getEvents
	 */
	sort() {
		this.singleEventManager.sort()
		this.repeatableEventManager.sort()
	}
}
