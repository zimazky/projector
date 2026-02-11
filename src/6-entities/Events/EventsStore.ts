import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'

import { IEventModel, SingleEventModel, RepeatableEventModel } from './EventModel'
import { eventDtoToIEventModel, repeatableEventModelToEventDto, singleEventModelToEventDto } from './EventMappers'
import { EventDto } from './EventDto'
import { SingleEventManager } from './SingleEventManager'
import { RepeatableEventManager } from './RepeatableEventManager'

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
  /** Колбэк функция, вызывается при каждом изменении списка */
  onChangeList = () => {}

  private singleEventManager: SingleEventManager;
  private repeatableEventManager: RepeatableEventManager;

  public get completed(): SingleEventModel[] {
    return this.singleEventManager.completed;
  }

  public get planned(): SingleEventModel[] {
    return this.singleEventManager.planned;
  }

  public get plannedRepeatable(): RepeatableEventModel[] {
    return this.repeatableEventManager.plannedRepeatable;
  }

  constructor(projectsStore: ProjectsStore) {
    this.projects = projectsStore
    
    this.singleEventManager = new SingleEventManager(
        this.projects,
        () => this.lastId++,
        () => this.onChangeList()
    );
    
    this.repeatableEventManager = new RepeatableEventManager(
        this.projects,
        () => this.lastId++,
        () => this.onChangeList(),
        (e, isFinal) => this.singleEventManager.addPlanned(e, isFinal),
        (e, isFinal) => this.singleEventManager.addCompleted(e, isFinal)
    );
  }

  /** Загрузка данных со сбросом предшествующих данных */
  init(d: EventsStoreData) {
    this.lastId = 1
    this.singleEventManager.reset();
    this.repeatableEventManager.reset();
    d.completedList?.forEach(e => { this.addCompletedEventDto(e, false) })
    d.plannedList?.forEach(e => { this.addPlannedEventDto(e, false) })
    this.onChangeList()
  }

  /** Подготовка для сохранения в хранилище */
  prepareToSave() {
    const completedList = this.singleEventManager.completed.map(e=>singleEventModelToEventDto(e))
    const plannedList: EventDto[] = this.repeatableEventManager.plannedRepeatable.reduce((a,e) => {
      return a.push(repeatableEventModelToEventDto(e)), a
    }, [] as EventDto[])
    this.singleEventManager.planned.reduce((a,e) => {
      return a.push(singleEventModelToEventDto(e)), a
    }, plannedList)
    return {completedList, plannedList}
  }

  getEventModel(id: number): IEventModel | undefined {
    let event = this.singleEventManager.findCompleted(id)
    if(event !== undefined) return event
    event = this.singleEventManager.findPlanned(id)
    if(event !== undefined) return event
    const revent = this.repeatableEventManager.find(id)
    if(revent !== undefined) return revent
  }

  getEventDto(id: number): EventDto | undefined {
    let event = this.singleEventManager.findCompleted(id)
    if(event !== undefined) return singleEventModelToEventDto(event)
    event = this.singleEventManager.findPlanned(id)
    if(event !== undefined) return singleEventModelToEventDto(event)
    const revent = this.repeatableEventManager.find(id)
    if(revent !== undefined) return repeatableEventModelToEventDto(revent)
  }

  /**
   * Добавление в список выполненного события
   * @param e Событие
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  addCompletedEventModel(e: IEventModel, isFinal: boolean = true) {
    this.singleEventManager.addCompleted(e, isFinal)
  }

  addCompletedEventDto(e: EventDto, isFinal: boolean = true) {
    this.singleEventManager.addCompletedFromDto(e, isFinal)
  }

  /**
   * Добавление в список запланированного события
   * @param e Событие
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  addPlannedEventModel(e: IEventModel, isFinal: boolean = true) {
    if (e.repeat) {
      this.repeatableEventManager.add(e, isFinal);
    } else {
      this.singleEventManager.addPlanned(e, isFinal);
    }
  }

  addPlannedEventDto(raw: EventDto, isFinal: boolean = true) {
    this.addPlannedEventModel(eventDtoToIEventModel(raw), isFinal);
  }

  /**
   * Удаление события
   * @param id Идентификатор события
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  deleteEvent(id: number | null, isFinal: boolean = true) {
    const deletedInSingle = this.singleEventManager.delete(id);
    this.repeatableEventManager.delete(id);
    if(isFinal) this.onChangeList()
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
    if (this.singleEventManager.complete(id, e)) {
      this.onChangeList();
      return;
    }

    if (this.repeatableEventManager.complete(id, currentdate, e)) {
      // onChange is called inside
      return;
    }
  }

  /**
   * Отменить завершение события с одновременной модификацией параметров события.
   * @param id Идентификатор события
   * @param raw Модифицированное событие
   */
  uncompleteEvent(id: number | null, raw: EventDto) {
    if (this.singleEventManager.uncomplete(id, raw)) {
      this.onChangeList();
    }
  }

  /**
   * Изменение параметров события
   * @param id Идентификатор события
   * @param e Модифицированное событие в текстовом представлении rawEvent
   */
  updateEvent(id: number, e: EventDto) {
    if (this.singleEventManager.update(id, e)) {
      this.onChangeList();
      return;
    }
    
    if (this.repeatableEventManager.update(id, e)) {
      this.onChangeList();
      return;
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
      return;
    }
    if (this.repeatableEventManager.shift(id, todate, currentdate)) {
      return;
    }
  }
  
  /**   
   * Копирование события в другую дату. Периодическое событие копируется как одиночное.
   * @param id идентификатор события
   * @param todate дата в которую совершается копирование
   * */  
  copyToDate(id: number, todate: timestamp) {
    if (this.singleEventManager.copy(id, todate)) {
      return;
    }
    if (this.repeatableEventManager.copy(id, todate)) {
      return;
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
    this.repeatableEventManager.saveAsSingle(id, currentdate, e);
  }

  /** 
   * Функция предварительной сортировки событий,
   * упорядочивает для более быстрой сортировки в методе getEvents
   */
  sort() {
    this.singleEventManager.sort();
    this.repeatableEventManager.sort();
  }
}