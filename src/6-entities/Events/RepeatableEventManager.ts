import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore';
import { RepeatableEventModel, IEventModel } from './EventModel';
import { eventDtoToIEventModel } from './EventMappers';
import { EventDto } from './EventDto';
import { timestamp } from 'src/7-shared/libs/DateTime/DateTime';
import ZCron from 'src/7-shared/libs/ZCron/ZCron';

/**
 * Управляет повторяющимися запланированными событиями.
 */
export class RepeatableEventManager {
  /** Список запланированных, повторяемых событий */
  plannedRepeatable: RepeatableEventModel[] = [];

  /**
   * @param projects - Хранилище проектов
   * @param incLastId - Функция для инкремента и получения нового ID
   * @param onChange - Колбэк, вызываемый при изменениях
   * @param addSinglePlanned - Функция для добавления одиночного запланированного события
   * @param addSingleCompleted - Функция для добавления одиночного завершенного события
   */
  constructor(
    private projects: ProjectsStore,
    private incLastId: () => number,
    private onChange: () => void,
    private addSinglePlanned: (e: IEventModel, isFinal: boolean) => void,
    private addSingleCompleted: (e: IEventModel, isFinal: boolean) => void
  ) {}

  /**
   * Добавляет повторяемое событие.
   * @param e - Структура события
   * @param isFinal - Если true, вызывает onChange после добавления
   */
  add(e: IEventModel, isFinal: boolean = true) {
    let projectId = this.projects.getIdWithIncEventsCount(e.project);
    if (projectId < 0) projectId = 0;

    this.plannedRepeatable.push({
      id: this.incLastId(),
      name: e.name,
      comment: e.comment,
      project: e.project,
      projectId: projectId,
      repeat: e.repeat!,
      start: e.start,
      time: e.time,
      duration: e.duration,
      end: e.end,
      credit: e.credit,
      debit: e.debit,
    });
    if (isFinal) this.onChange();
  }

  /**
   * Добавляет повторяемое событие из "сырых" данных.
   * @param raw - "Сырые" данные события
   * @param isFinal - Если true, вызывает onChange после добавления
   */
  addFromDto(raw: EventDto, isFinal: boolean = true) {
      this.add(eventDtoToIEventModel(raw), isFinal);
  }

  /**
   * Удаляет событие из списка.
   * @param id - ID события
   * @returns true, если событие было удалено
   */
  delete(id: number | null): boolean {
    const initialLength = this.plannedRepeatable.length;
    this.plannedRepeatable = this.plannedRepeatable.filter(e => e.id !== id);
    return this.plannedRepeatable.length !== initialLength;
  }
  
  /**
   * Удаляет текущее вхождение повторяемого события.
   * @param id - ID события
   * @param currentdate - Текущая дата вхождения
   */
  deleteCurrent(id: number | null, currentdate: timestamp) {
    let revent = this.plannedRepeatable.find(e => e.id === id);
    if (revent === undefined) return;

    if (ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, currentdate)) {
      const first = { ...revent, end: currentdate, id: this.incLastId() };
      this.plannedRepeatable.push(first);
    }
    if (revent.repeat[0] === '/') {
      const d = +revent.repeat.substring(1);
      revent.start = currentdate + d * 86400;
    }
    else revent.start = ZCron.first(revent.repeat, currentdate + 86400);

    if (revent.end && !ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, revent.end)) {
      this.delete(revent.id);
    }
    this.onChange();
  }
  
  /**
   * Завершает текущее вхождение повторяемого события, превращая его в одиночное завершенное событие.
   * @param id - ID события
   * @param currentdate - Текущая дата вхождения
   * @param e - Обновленные данные события
   * @returns true, если событие было найдено и завершено
   */
  complete(id: number | null, currentdate: timestamp, e: EventDto) {
    let revent = this.plannedRepeatable.find(e => e.id === id);
    if (revent !== undefined) {
      this.addSingleCompleted({ ...eventDtoToIEventModel(e), start: currentdate, end: currentdate + 86400 }, false);
      
      if (ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, currentdate)) {
        const first = { ...revent, end: currentdate, id: this.incLastId() };
        this.plannedRepeatable.push(first);
      }
      if (revent.repeat[0] === '/') {
        const d = +revent.repeat.substring(1);
        revent.start = currentdate + d * 86400;
      }
      else revent.start = ZCron.first(revent.repeat, currentdate + 86400);

      if (revent.end && !ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, revent.end)) {
        this.delete(revent.id);
      }
      this.onChange();
      return true;
    }
    return false;
  }

  /**
   * Обновляет повторяемое событие. Фактически, заменяет его новым с новым ID.
   * @param id - ID события для обновления
   * @param e - Новые "сырые" данные события
   * @returns true, если событие было найдено и обновлено
   */
  update(id: number, e: EventDto): boolean {
    const revent = this.plannedRepeatable.find(e => e.id === id);
    if (revent !== undefined) {
      this.addFromDto(e, false);
      this.delete(id);
      return true;
    }
    return false;
  }
  
  /**
   * Сдвигает повторяемое событие на другую дату.
   * @param id - ID события
   * @param todate - Новая дата начала
   * @param currentdate - Текущая дата события (для проверки возможности сдвига)
   * @returns true, если событие было найдено и сдвинуто
   */
  shift(id: number, todate: timestamp, currentdate: timestamp): boolean {
    const revent = this.plannedRepeatable.find(e => e.id === id);
    if (revent !== undefined) {
      if (revent.repeat[0] !== '/' || revent.start !== currentdate) return false;
      const delta = todate - currentdate;
      revent.start = revent.start + delta;
      revent.end = revent.end ? revent.end + delta : revent.end;
      this.onChange();
      return true;
    }
    return false;
  }
  
  /**
   * Копирует вхождение повторяемого события как новое одиночное событие.
   * @param id - ID события
   * @param todate - Дата, на которую копируется событие
   * @returns true, если событие было найдено и скопировано
   */
  copy(id: number, todate: timestamp): boolean {
    const revent = this.plannedRepeatable.find(e => e.id === id);
    if (revent !== undefined) {
      const newevent = { ...revent, repeat: '', start: todate, end: todate + 86400 };
      this.addSinglePlanned(newevent, true);
      return true;
    }
    return false;
  }

  /**
   * Сохраняет вхождение повторяемого события как новое одиночное запланированное событие.
   * @param id - ID события
   * @param currentdate - Текущая дата вхождения
   * @param e - Обновленные данные для нового одиночного события
   * @returns true, если событие было найдено и сохранено как одиночное
   */
  saveAsSingle(id: number, currentdate: timestamp, e: EventDto) {
    let revent = this.plannedRepeatable.find(e => e.id === id);
    if (revent !== undefined) {
      this.addSinglePlanned({ ...eventDtoToIEventModel(e), repeat: undefined, start: currentdate, end: currentdate + 86400 }, false);
      
      if (ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, currentdate)) {
        const first = { ...revent, end: currentdate, id: this.incLastId() };
        this.plannedRepeatable.push(first);
      }
      if (revent.repeat[0] === '/') {
        const d = +revent.repeat.substring(1);
        revent.start = currentdate + d * 86400;
      }
      else revent.start = currentdate + 86400;

      if (revent.end && !ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, revent.end)) {
        this.delete(revent.id);
      }
      this.onChange();
      return true;
    }
    return false;
  }
  
  /**
   * Сортирует список повторяемых событий.
   */
  sort() {
    this.plannedRepeatable.sort((a, b) => (a.time === null ? 0 : a.time) - (b.time === null ? 0 : b.time));
  }

  /**
   * Находит повторяемое событие по ID.
   * @param id - ID события
   */
  find(id: number): RepeatableEventModel | undefined {
    return this.plannedRepeatable.find(e=>e.id===id);
  }
  
  /**
   * Сбрасывает список повторяемых событий.
   */
  reset() {
      this.plannedRepeatable = [];
  }
}
