export type AccountOperation = {
  account: string
  credit: number
  debit: number
}

export type AccountBalance = {
  account: string
  balance: number
  unit: string
}

export class Accounts {

  lastId = 0
  ids: number[] = []
  accounts: AccountBalance[] = []

  /** Добавляет счет в список с нулевым балансом, если такого счета нет */
  addAccount(account: string, unit: string = 'RUB') {
    if(account in this.ids) return
    this.accounts[this.lastId] = {account, balance: 0, unit}
    this.ids[account] = this.lastId
    this.lastId++
  }

  /** Получить список, отфильтрованный по единице измерения */
  getFilteredList(unit: string) {
    return this.accounts.filter(o=>o.unit===unit)
  }

  executeOperations(operations: AccountOperation[]) {
    operations.forEach(o => {this.accounts[this.ids[o.account]].balance += o.credit - o.debit})
  }

  executeOperation(o: AccountOperation) {
    this.accounts[this.ids[o.account]].balance += o.credit - o.debit
  }

  getAggregatedBalance(unit: string) {
    return this.accounts.reduce((a, o) => a + (o.unit===unit ? o.balance: 0), 0)
  }

}