import { makeAutoObservable } from 'mobx';

/** Тип данных, определяющий стиль проекта */
export type ProjectStyle = {
  /** Цвет текста */
  color: string;
  /** Цвет фона */
  background: string;
}

/** Тип данных проекта для сохранения во внешних хранилищах (localStorage или GoogleDrive) */
export type ProjectData = {
  /** Наименование проекта */
  name: string;
} & ProjectStyle

/** Структура для хранения данных проекта в классе хранилища Projects */
export type ProjectStructure = {
  /** Число ссылок на события */
  events: number;
} & ProjectData;

/** Класс хранилища списка проектов */
export class ProjectsStore {
  /** Список проектов, по умолчанию есть defaultProject для событий без определенного проекта */
  list: ProjectStructure[]
  /** Проект по умолчанию */
  static defaultProject: ProjectStructure = {name:'Default', background: 'lightgray', color: 'black', events: 0}

  constructor() {
    this.list = [ProjectsStore.defaultProject]
    makeAutoObservable(this)
  }

  /** Добавить проект в список */
  add(name: string, color: string, background: string) {
    const l = this.list.find(l => l.name===name);
    if(l === undefined) this.list.push({name, events: 0, color, background});
    else alert(`Project "${name}" already exists`);
  }

  /** 
   * Удалить проект из списка 
   * Проект удаляется если отсутствуют ссылки на события
   */
  delete(name: string) {
    const l = this.list.find(l => l.name===name);
    if(l===undefined) return
    if(l.events > 0) alert(`Project "${name}" has ${l.events} links to events`);
    else this.list = this.list.filter(l => l.name!==name);
  }

  /**
   * Получить проект из списка по наименованию
   * @param name - наименование проекта
   * @returns элемент списка проектов или undefined если проект не найден
   */
  getByName(name: string) {
    return this.list.find(l => l.name===name) ?? this.list[0];
  }

  /** 
   * Получить проект из списка по идентификатору
   * @param id - идентификатор проекта
   * @returns элемент списка проектов или undefined если проект не найден
   */
  getById(id: number) {
    return id<this.list.length ? this.list[id] : undefined;
  }

  /**
   * Получить идентификатор проекта и увеличить счетчик ссылок на события для существующего проекта.
   * Если проект с указанным наименованием отсутствует, то проект добавляется в список.
   * Обеспечивает связанность проекта с событиями и для восстановления потерянных проектов из списка событий
   * @param name - наименование проекта
   * @returns идентификатор проекта
   */
  getIdWithIncEventsCount(name: string): number {
    if(name === '') name = 'Default';
    let id = this.list.findIndex(p => p.name===name);
    if(id < 0) {
      this.list.push({name, events: 1, color: 'black', background: 'gray'});
      id = this.list.length - 1;
    }
    else this.list[id].events++;
    return id;
  }

  /**
   * Инициализация списка проектов из массива, полученного из внешних хранилищ
   * @param list - список проектов из внешнего хранилища
   */
  init(list: ProjectData[]) {
    if(list===undefined) this.list = [ProjectsStore.defaultProject];
    else this.list = [ProjectsStore.defaultProject, ...list.map(p => { return {...p, events: 0} })];
  }

  /** Получить список проектов ProjectData[] для сохранения во внешних хранилищах */
  getList(): ProjectData[] {
    return this.list.map(p => { return {name: p.name, color: p.color, background: p.background} }).slice(1);
  }
}