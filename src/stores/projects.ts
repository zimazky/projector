import { action, computed, makeObservable, observable } from "mobx";

/** Тип данных, определяющий стиль проекта */
export type ProjectStyle = {
  /** Цвет текста */
  color: string;
  /** Цвет фона */
  background: string;
}

/** Тип сырых данных проекта для сохранения во внешних хранилищах (localStorage или GoogleDrive) */
export type ProjectRaw = {
  /** Наименование проекта */
  name: string;
} & ProjectStyle

/** Тип данных, определяющий проект в классе хранилища Projects */
export type Project = {
  /** Число ссылок на события */
  events: number;
} & ProjectRaw;

/** Класс хранилища списка проектов */
class Projects {
  /** Список локаций */
  list: Project[];

  constructor() {
    makeObservable(this, {
      list: observable,
      add: action,
      delete: action,
      getByName: computed,
      getById: computed,
      eventInc: action,
      load: action,
      getRawList: computed
    });
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
   * */
  delete(name: string) {
    const l = this.list.find(l => l.name===name);
    if(l.events > 0) alert(`Project "${name}" has ${l.events} links to events`);
    else this.list = this.list.filter(l => l.name!==name);
  }

  /** Получить проект из списка по наименованию */
  getByName(name: string) {
    return this.list.find(l => l.name===name);
  }

  /** Получить проект из списка по идентификатору */
  getById(id: number) {
    return id<this.list.length ? this.list[id] : undefined;
  }

  /** 
   * Увеличение счетчика ссылок на события для существующего проекта или добавление проекта
   * Предназначено для определения связанности проекта с событиями и для восстановления потерянных проектов из списка событий
   * */
  eventInc(name: string) {
    const l = this.list.find(l => l.name===name);
    if(l === undefined) this.list.push({name, events: 1, color: 'black', background: 'gray'});
    else l.events++;
  }

  /** Загрузка списка проектов из массива, полученного из внешних хранилищ */
  load(list: ProjectRaw[]) {
    this.list = list.map(p => { return {...p, events: 0} });
  }

  /** Получить список проектов в виде списка ProjectModel[] для сохранения во внешних хранилищах */
  getRawList(): ProjectRaw[] {
    return this.list.map(p => { return {name: p.name, color: p.color, background: p.background} })
  }
}

/** Синглтон-экземпляр хранилища проектов */
export const projectsStore = new Projects;