import { ProjectsStore } from 'src/6-entities/stores/Projects/ProjectsStore';
import { SingleEventModel, IEventModel } from './EventModel';
import { eventDtoToIEventModel } from './EventMappers';
import { EventDto } from './EventDto';
import { timestamp } from 'src/7-shared/libs/DateTime/DateTime';

/**
 * Управляет одиночными событиями (завершенными и запланированными).
 */
export class SingleEventManager {
  /** Список завершенных событий */
  completed: SingleEventModel[] = [];
  /** Список запланированных, одиночных событий */
  planned: SingleEventModel[] = [];

  /**
   * @param projects - Хранилище проектов
   * @param incLastId - Функция для инкремента и получения нового ID
   * @param onChange - Колбэк, вызываемый при изменениях
   */
  constructor(
    private projects: ProjectsStore,
    private incLastId: () => number,
    private onChange: () => void
  ) {}

  /**
   * Добавляет событие в список завершенных.
   * @param e - Модель события
   * @param isFinal - Если true, вызывает onChange после добавления
   */
  addCompleted(e: IEventModel, isFinal: boolean = true) {
    let projectId = this.projects.getIdWithIncEventsCount(e.project);
    if (projectId < 0) projectId = 0;

    this.completed.push({
      id: this.incLastId(),
      name: e.name,
      comment: e.comment,
      project: e.project,
      projectId: projectId,
      start: e.start,
      time: e.time,
      duration: e.duration,
      end: e.end,
      days: Math.ceil((e.end - e.start) / 86400),
      credit: e.credit,
      debit: e.debit,
    });
    if (isFinal) this.onChange();
  }
  
  /**
   * Добавляет событие в список завершенных из "сырых" данных.
   * @param e - "Сырые" данные события
   * @param isFinal - Если true, вызывает onChange после добавления
   */
  addCompletedFromDto(e: EventDto, isFinal: boolean = true) {
      this.addCompleted(eventDtoToIEventModel(e), isFinal);
  }

  /**
   * Добавляет событие в список запланированных.
   * @param e - Модель события
   * @param isFinal - Если true, вызывает onChange после добавления
   */
  addPlanned(e: IEventModel, isFinal: boolean = true) {
    let projectId = this.projects.getIdWithIncEventsCount(e.project);
    if (projectId < 0) projectId = 0;

    this.planned.push({
      id: this.incLastId(),
      name: e.name,
      comment: e.comment,
      project: e.project,
      projectId: projectId,
      start: e.start,
      time: e.time,
      duration: e.duration,
      end: e.end,
      days: Math.ceil((e.end - e.start) / 86400),
      credit: e.credit,
      debit: e.debit,
    });
    if (isFinal) this.onChange();
  }

  /**
   * Добавляет событие в список запланированных из "сырых" данных.
   * @param raw - "Сырые" данные события
   * @param isFinal - Если true, вызывает onChange после добавления
   */
  addPlannedFromDto(raw: EventDto, isFinal: boolean = true) {
    this.addPlanned(eventDtoToIEventModel(raw), isFinal);
  }
  
  /**
   * Удаляет событие из списков.
   * @param id - ID события
   * @returns true, если событие было удалено
   */
  delete(id: number | null): boolean {
    const initialCompletedLength = this.completed.length;
    const initialPlannedLength = this.planned.length;
    
    this.completed = this.completed.filter(e => e.id !== id);
    this.planned = this.planned.filter(e => e.id !== id);
    
    return this.completed.length !== initialCompletedLength || this.planned.length !== initialPlannedLength;
  }

  /**
   * Переводит запланированное событие в завершенное.
   * @param id - ID события
   * @param e - Обновленные данные события
   * @returns true, если событие было успешно завершено
   */
  complete(id: number | null, e: EventDto): boolean {
    const event = this.planned.find(e => e.id === id);
    if (event !== undefined) {
      this.addCompleted({ ...event, ...eventDtoToIEventModel(e) }, false);
      this.delete(event.id);
      return true;
    }
    return false;
  }

  /**
   * Отменяет завершение события, возвращая его в запланированные.
   * @param id - ID события
   * @param raw - Обновленные "сырые" данные события
   * @returns true, если завершение было успешно отменено
   */
  uncomplete(id: number | null, raw: EventDto): boolean {
    const event = this.completed.find(e => e.id === id);
    if (event !== undefined) {
      this.addPlanned({ ...event, ...eventDtoToIEventModel(raw) }, false);
      this.delete(event.id);
      return true;
    }
    return false;
  }

  /**
   * Обновляет событие. Фактически, заменяет его новым с новым ID.
   * @param id - ID события для обновления
   * @param e - Новые "сырые" данные события
   * @returns true, если событие было найдено и обновлено
   */
  update(id: number, e: EventDto): boolean {
    let event = this.completed.find(e => e.id === id);
    if (event !== undefined) {
      this.addCompletedFromDto(e, false);
      this.delete(id);
      return true;
    }
    
    event = this.planned.find(e => e.id === id);
    if (event !== undefined) {
      this.addPlannedFromDto(e, false);
      this.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Сдвигает событие на другую дату.
   * @param id - ID события
   * @param todate - Новая дата начала
   * @returns true, если событие было найдено и сдвинуто
   */
  shift(id: number, todate: timestamp): boolean {
    let event = this.completed.find(e => e.id === id);
    if (event !== undefined) {
      const delta = todate - event.start;
      event.start = todate;
      event.end = event.end ? event.end + delta : event.end;
      this.onChange();
      return true;
    }

    event = this.planned.find(e => e.id === id);
    if (event !== undefined) {
      const delta = todate - event.start;
      event.start = todate;
      event.end = event.end ? event.end + delta : event.end;
      this.onChange();
      return true;
    }
    return false;
  }
  
  /**
   * Копирует событие на другую дату.
   * @param id - ID события
   * @param todate - Дата, на которую копируется событие
   * @returns true, если событие было найдено и скопировано
   */
  copy(id: number, todate: timestamp): boolean {
    let event = this.completed.find(e => e.id === id);
    if (event !== undefined) {
      const delta = todate - event.start;
      const newevent = { ...event, start: todate, end: event.end ? event.end + delta : event.end };
      this.addCompleted(newevent);
      return true;
    }

    event = this.planned.find(e => e.id === id);
    if (event !== undefined) {
      const delta = todate - event.start;
      const newevent = { ...event, start: todate, end: event.end ? event.end + delta : event.end };
      this.addPlanned(newevent);
      return true;
    }
    return false;
  }
  
  /**
   * Сортирует списки завершенных и запланированных событий.
   */
  sort() {
    this.completed.sort((a, b) => {
      const d = a.start-b.start;
      return d === 0 ? b.days-a.days : d;
    });
    this.planned.sort((a, b) => {
      const d = a.start-b.start;
      return d === 0 ? b.days-a.days : d;
    });
  }
  
  /**
   * Находит завершенное событие по ID.
   * @param id - ID события
   */
  findCompleted(id: number): SingleEventModel | undefined {
    return this.completed.find(e=>e.id===id);
  }
  
  /**
   * Находит запланированное событие по ID.
   * @param id - ID события
   */
  findPlanned(id: number): SingleEventModel | undefined {
    return this.planned.find(e=>e.id===id);
  }

  /**
   * Сбрасывает списки событий.
   */
  reset() {
      this.completed = [];
      this.planned = [];
  }
}
