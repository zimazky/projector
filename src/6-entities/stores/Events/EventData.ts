/** Тип события, сохраняемого во внешнем хранилище */
export type EventData = {
  /** Наименование события (обязательное поле) */
  name: string
  /** Комментарий */
  comment?: string
  /** Наименование проекта */
  project?: string
  /** Строка шаблона zcrone для повторяемых событий*/
  repeat?: string
  /** Дата события для одиночных / дата начала расписания для повторяемых событий ('YYYY.MM.DD') */
  start: string
  /** Время начала события ('H:MM') */
  time?: string
  /** 
   * Длительность события для одиночных событий ('Dd H:MM').
   * Дата завершения события считается как end = начало_след_дня(start+time+duration).
   * Для повторяемых - событие не должно выходить за пределы дня, иначе игнорируется.
   * */
  duration?: string
  /** 
   * Дата завершения события для одиночных событий ('YYYY.MM.DD').
   * Событие длится до указанной даты, исключая саму дату. 
   * Указанная дата игнорируется, если задана длительность события duration.
   * Для повторяемых событий - конец расписания.
   * */
  end?: string
  /** Поступление на счет */
  credit?: number
  /** Списание со счета */
  debit?: number
}