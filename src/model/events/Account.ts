type AccountOperation = {
  account: string
  credit: number
  debit: number
}

class Accounts {

  lastId = 1
  accounts: string[] = []
  balance: { [account: string]: number }
  unit: { [account: string]: string }

  createAccount(account: string, unit: string = 'RUB') {
    this.accounts.push(account)
    this.balance[account] = 0
    this.unit[account] = unit
  }
  list() {
    return this.accounts
  }
  makeOperations(os: AccountOperation[]) {
    os.forEach(o => {this.balance[o.account] + o.credit - o.debit})
  }
  makeOperation(o: AccountOperation) {
    this.balance[o.account] + o.credit - o.debit
  }
  //getBalance(unit) {}

}