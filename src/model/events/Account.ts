/** Запись Счет, полученный из внешнего хранилища или из интерфейса */
export type RawAccount = {
  account: string
  unit?: string
}

/** Счет */
export type Account = {
  account: string
  unit: string
  links: number
}

/** Операция по счету, полученная из внешнего хранилища или из интерфейса */
export type RawAccountOperation = {
  account: string
  credit?: number
  debit?: number
  unit?: string
}

/** Операция по счету */
export type AccountOperation = {
  accountId: number
  account: string
  credit: number
  debit: number
}

/** Баланс по счету */
export type AccountBalance = {
  account: string
  balance: number
  unit: string
}

/** Список балансов по единицам измерения (валютам) */
export type GroupedBalance = {
  unit: string
  balance: number
}

/** Список балансов по счетам*/
export type Balance = AccountBalance[]

export class Accounts {

  static list: Account[] = []

  static load(rawAccounts: RawAccount[]) {
    Accounts.list = []
    rawAccounts.forEach(v=>Accounts.addRawAccount(v))
  }

  static prepareToSave(): RawAccount[] {
    return Accounts.list.map(v=>Accounts.accountToRaw(v))
  }

  /** Преобразование сырых данных аккаунта из внешнего хранилища */
  static rawToAccount(r: RawAccount): Account {
    return {
      account: r.account,
      unit: r.unit ?? 'RUB',
      links: 0
    }
  }

  /** Преобразование счета в форму для сохранения во внешнем хранилище */
  static accountToRaw(a: Account): RawAccount {
    return {
      account: a.account,
      unit: a.unit
    }
  }

  /** Преобразование сырых данных операции по счету из внешнего хранилища */
  static rawToAccountOperation(r: RawAccountOperation): AccountOperation {
    const accountId = Accounts.addAccount(r.account, r.unit)
    Accounts.list[accountId].links++
    return {
      accountId,
      account: r.account,
      credit: r.credit ?? 0,
      debit: r.debit ?? 0
    }
  }

  /** 
   * Преобразование сырых данных списка операций по счету из внешнего хранилища
   * Предусмотрена загрузка старого формата - {credit: number, debit: number} для счета по умолчанию 'RUB'
   */
  static rawToAccountOperations(r: RawAccountOperation[] | {credit?: number, debit?: number}): AccountOperation[] {
    if(Array.isArray(r)) return r.map(v=>Accounts.rawToAccountOperation(v))
    return [Accounts.rawToAccountOperation({account: 'RUB', ...r})]
  }

  /** Преобразование данных операции по счету к форме для сохранения во внешнем хранилище */
  static accountOperationToRaw(a: AccountOperation): RawAccountOperation {
    const r: RawAccountOperation = {account: a.account}
    if(a.credit != 0) r.credit = a.credit
    if(a.debit != 0) r.debit = a.debit
    return r
  }

  /** Клонирование баланса */
  static cloneBalance(b: Balance): Balance {
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

  static addRawAccount(r: RawAccount): number {
    return Accounts.addAccount(r.account, r.unit)
  }

  /** Выполнение операции по счету, изменяет переданный баланс и возвращает на него ссылку */
  static executeOperation(o: AccountOperation, b: Balance = []): Balance {
    const a = b.find(v=>v.account===o.account)
    console.log(a)
    if(a===undefined) b.push({account: o.account, balance: o.credit-o.debit, unit: Accounts.list[o.accountId].unit})
    else a.balance += o.credit - o.debit
    console.log(a)
    return b
  }

  /** Выполнение списка операций */
  static executeOperations(operations: AccountOperation[], b: Balance = []): Balance {
    return operations.reduce((a,o) => Accounts.executeOperation(o,a), b)
  }

  /** Получить баланс, отфильтрованный по единице измерения */
  static getFilteredBalance(b: Balance, unit: string): Balance {
    return b.filter(v=>v.unit===unit)
  }

  /** Получить сумму баланса, агрегированную по единице измерения */
  static getAggregatedBalance(b: Balance, unit: string): number {
    return b.reduce((a, o) => a + (o.unit===unit ? o.balance: 0), 0)
  }

  /** Получить список сгруппированных по единице измерения балансов */
  static getGroupedBalance(b: Balance): GroupedBalance[] {
    return b.reduce((a,o)=>{
      const unitBalance = a.find(v=>v.unit===o.unit)
      if(unitBalance===undefined) a.push({unit: o.unit, balance: o.balance})
      else unitBalance.balance += o.balance
      return a
    }, <GroupedBalance[]>[])
  }

}