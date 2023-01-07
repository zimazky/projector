import {Account, Accounts, AccountOperation} from "./Accounts"

/** Запись Счет, полученный из внешнего хранилища или из интерфейса */
export type RawAccount = {
  account: string
  unit?: string
}

/** Операция по счету, полученная из внешнего хранилища или из интерфейса */
export type RawAccountOperation = {
  account: string
  credit?: number
  debit?: number
  unit?: string
}

export class RawAccounts {

  static load(rawAccounts: RawAccount[]) {
    Accounts.list = []
    rawAccounts.forEach(v=>Accounts.addAccount(v.account, v.unit))
  }

  static prepareToSave(): RawAccount[] {
    return Accounts.list.map(v=>RawAccounts.accountToRaw(v))
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
    if(Array.isArray(r)) return r.map(v=>RawAccounts.rawToAccountOperation(v))
    return [RawAccounts.rawToAccountOperation({account: 'RUB', ...r})]
  }

  /** Преобразование данных операции по счету к форме для сохранения во внешнем хранилище */
  static accountOperationToRaw(a: AccountOperation): RawAccountOperation {
    const r: RawAccountOperation = {account: a.account}
    if(a.credit != 0) r.credit = a.credit
    if(a.debit != 0) r.debit = a.debit
    return r
  }

}