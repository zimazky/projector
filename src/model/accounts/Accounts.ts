/** Счет */
export type Account = {
  /** Наименование счета */
  account: string
  /** Единица измерения */
  unit: string
  /** Число ссылок на счет из операций*/
  links: number
}

/** Операция по счету */
export type AccountOperation = {
  /** Индекс счета в глобальном списке счетов*/
  accountId: number
  /** Наименование счета */
  account: string
  /** Поступление на счет */
  credit: number
  /** Списание со счета */
  debit: number
}

/** Баланс по счету */
export type AccountBalance = {
  /** Наименование счета */
  account: string
  /** Баланс */
  balance: number
  /** Единица измерения */
  unit: string
}

/** Баланс сгруппированный по единице измерения (валюте) */
export type UnitBalance = {
  unit: string
  balance: number
}

/** Статический класс списка счетов */
export class Accounts {

  static list: Account[] = []

  /** Клонирование баланса */
  static cloneBalance(b: AccountBalance[]): AccountBalance[] {
    return b.map(v=>{ return {...v} })
  }

  /** 
   * Добавляет счет в общий список и возвращает индекс нового элемента, если такого счета нет.
   * Если счет уже есть, то возвращает индекс существующего элемента
   */
  static addAccount(account: string, unit: string = 'RUB'): number {
    let i = Accounts.list.findIndex(o=>o.account===account)
    if(i>=0) return i
    i = Accounts.list.length
    Accounts.list.push({account, unit, links: 0})
    return i
  }

  /** Выполнение операции по счету, изменяет переданный баланс и возвращает на него ссылку */
  static executeOperation(o: AccountOperation, b: AccountBalance[] = []): AccountBalance[] {
    const a = b.find(v=>v.account===o.account)
    console.log(a)
    if(a===undefined) b.push({account: o.account, balance: o.credit-o.debit, unit: Accounts.list[o.accountId].unit})
    else a.balance += o.credit - o.debit
    console.log(a)
    return b
  }

  /** Выполнение списка операций */
  static executeOperations(operations: AccountOperation[], b: AccountBalance[] = []): AccountBalance[] {
    return operations.reduce((a,o) => Accounts.executeOperation(o,a), b)
  }

  /** Получить баланс, отфильтрованный по единице измерения */
  static getBalanceByUnit(b: AccountBalance[], unit: string): AccountBalance[] {
    return b.filter(v=>v.unit===unit)
  }

  /** Получить сумму баланса, агрегированную по единице измерения */
  static getSumByUnit(b: AccountBalance[], unit: string): number {
    return b.reduce((a, o) => a + (o.unit===unit ? o.balance: 0), 0)
  }

  /** Получить список сгруппированных по единице измерения балансов */
  static getGroupedBalance(b: AccountBalance[]): UnitBalance[] {
    return b.reduce((a,u)=>{
      const unitBalances = a.find(v=>v.unit===u.unit)
      if(unitBalances === undefined) a.push({unit: u.unit, balance: u.balance})
      else unitBalances.balance += u.balance
      return a
    }, <UnitBalance[]>[])
  }

}