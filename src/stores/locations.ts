import { action, computed, makeObservable, observable } from "mobx";

/** Тип данных, определяющий локацию погоды */
export type WeatherLocation = {
  /** Наименование */
  name: string;
  /** Широта */
  lat: number;
  /** Долгота */
  lon: number;
}

/** Класс хранилища списка локаций погоды */
class Locations {
  /** Список локаций */
  list: WeatherLocation[];

  constructor() {
    makeObservable(this, {
      list: observable,
      add: action,
      delete: action,
      getByName: computed,
      getById: computed
    });
  }

  /** Добавить локацию в список */
  add(name: string, lat: number, lon: number) {
    const l = this.list.find(l => l.name===name);
    if(l === undefined) this.list.push({name, lat, lon});
    else alert(`Location "${name}" already exists`);
  }

  /** Удалить локацию из списка */
  delete(name: string) {
    this.list = this.list.filter(l => l.name!==name);
  }

  /** Получить локацию из списка по наименованию */
  getByName(name: string) {
    return this.list.find(l => l.name===name);
  }

  /** Получить локацию из списка по идентификатору */
  getById(id: number) {
    return id<this.list.length ? this.list[id] : undefined;
  }

  /** Загрузка списка локаций из массива, полученного из внешних хранилищ */
  load(list: WeatherLocation[]) {
    this.list = list;
  }
}

/** Синглтон-экземпляр хранилища локаций для отслеживания погоды */
export const locationsStore = new Locations;