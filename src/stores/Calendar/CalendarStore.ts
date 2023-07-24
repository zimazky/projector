import { makeAutoObservable } from "mobx"
import DateTime from "src/utils/datetime"

/** Минимальный размер буфера в неделях */
const minBufferSize = 4
/** Размер отображаемой области в неделях */
export const renderingSize = 20

/*
 * Пояснение: 
 *   Область отображения больше видимой области. 
 *   За пределами видимой области поддерживатся буфер размером большим минимального значения minBufferSize.
 *   Буфер обеспечивает плавность скроллинга
 *     ---------------------------------- Начало отображаемой области
 *     topBufferSize >= minBufferSize
 *     ---------------------------------- Начало видимой области
 *     Видимая область
 *     ---------------------------------- Конец видимой области
 *     bottomBufferSize >= minBufferSize
 *     ---------------------------------- Конец отображаемой области
 */

/** Класс хранилища модуля отображения календаря */
export class CalendarStore {

  /** Год видимой области (для вывода в заголовке) */
  year: number
  /** Месяц видимой области (для вывода в заголовке) */
  month: number
  /** 
   * Сдвиг отображаемой области в неделях относительно текущей недели
   * Положительные числа определяют сдвиг в сторону более ранних недель
   */
  shift: number = minBufferSize

  constructor() {
    makeAutoObservable(this)
  }

  setMonthYear(month: number, year: number) {
    this.month = month
    this.year = year
  }

  /** Строка заголовка, представляющая год и месяц отображаемой области */
  get caption(): string {
    return this.year + ' ' + DateTime.MONTHS_FULL[this.month]
  }

  /**
   * Корректировка значения сдвига отображаемой области
   * для поддержания необходимого размера буферов
   * @param topBufferSize 
   * @param bottomBufferSize 
   */
  correctShift(topBufferSize: number, bottomBufferSize: number) {
    if(topBufferSize < minBufferSize) this.shift += minBufferSize
    else if(bottomBufferSize < minBufferSize) this.shift -= minBufferSize
  }
}