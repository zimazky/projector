import { Account, Accounts, AccountBalance, UnitBalance } from './Accounts'
import { RawAccountOperation, RawAccounts } from './RawAccounts'

/**
 * Функция для замыкания аргументов внутри функции без аргументов
 * @param f функция для вызова
 * @param args аргументы, передаваемые в функцию f
 * @returns функция без аргументов
 */
 function callf(f: (...args: any[])=>void, ...args:any[]) {
  return ()=>{ f(...args) }
}

/******************************************************************************
 * Accounts addAccount
 ******************************************************************************/
describe('Accounts addAccount', ()=>{

  it(`test `, ()=>{

    Accounts.addAccount('RUB', 'RUB')
    Accounts.addAccount('SBER')
    Accounts.addAccount('ALFA', 'RUB')
    Accounts.addAccount('USD', 'USD')

    const expectedObject: Account[] = [
      {account: 'RUB', unit: 'RUB', links: 0},
      {account: 'SBER', unit: 'RUB', links: 0},
      {account: 'ALFA', unit: 'RUB', links: 0},
      {account: 'USD', unit: 'USD', links: 0}
    ]

    console.log('add new accounts')
    console.log(Accounts.list, expectedObject)
    expect(Accounts.list).toEqual(expectedObject)

    Accounts.addAccount('SBER', 'USD')
    Accounts.addAccount('ALFA', 'USD')
    Accounts.addAccount('USD')

    console.log('add repeatedly accounts')
    console.log(Accounts.list, expectedObject)
    expect(Accounts.list).toEqual(expectedObject)

    const op1: RawAccountOperation = {account: 'RUB', credit: 20000}

    const a1 = RawAccounts.rawToAccountOperation(op1)
    console.log(a1)
    const b1 = Accounts.executeOperation(a1)
    const e1: AccountBalance[] = [{account: 'RUB', balance: 20000, unit: 'RUB'}]
    console.log(b1, e1)
    expect(b1).toEqual(e1)

    const op2: RawAccountOperation = {account: 'USD', credit: 1000, debit: 300}
    const a2 = RawAccounts.rawToAccountOperation(op2)
    console.log(a2)
    const b2 = Accounts.executeOperation(a2, Accounts.cloneBalance(b1))
    const e2: AccountBalance[] = [
      {account: 'RUB', balance: 20000, unit: 'RUB'},
      {account: 'USD', balance: 700, unit: 'USD'}
    ]
    console.log(b2, e2)
    expect(b2).toEqual(e2)

    const op3: RawAccountOperation = {account: 'USD', debit: 100}
    const a3 = RawAccounts.rawToAccountOperation(op3)
    console.log(a3)
    const b3 = Accounts.executeOperation(a3, Accounts.cloneBalance(b2))
    const e3: AccountBalance[] = [
      {account: 'RUB', balance: 20000, unit: 'RUB'},
      {account: 'USD', balance: 600, unit: 'USD'}
    ]
    console.log(b3, e3)
    expect(b3).toEqual(e3)

    const op4: RawAccountOperation = {account: 'BENZ', credit: 40, unit: 'L'}
    const a4 = RawAccounts.rawToAccountOperation(op4)
    console.log(a4)
    const b4 = Accounts.executeOperation(a4, Accounts.cloneBalance(b3))
    const e4: AccountBalance[] = [
      {account: 'RUB', balance: 20000, unit: 'RUB'},
      {account: 'USD', balance: 600, unit: 'USD'},
      {account: 'BENZ', balance: 40, unit: 'L'}
    ]
    console.log(b4, e4)
    expect(b4).toEqual(e4)

    const op5: RawAccountOperation = {account: 'BENZ', debit: 10, unit: 'RUB'}
    const a5 = RawAccounts.rawToAccountOperation(op5)
    console.log(a5)
    const b5 = Accounts.executeOperation(a5, Accounts.cloneBalance(b4))
    const e5: AccountBalance[] = [
      {account: 'RUB', balance: 20000, unit: 'RUB'},
      {account: 'USD', balance: 600, unit: 'USD'},
      {account: 'BENZ', balance: 30, unit: 'L'}
    ]
    console.log(b5, e5)
    expect(b5).toEqual(e5)

    const op6: RawAccountOperation[] = [
      {account: 'SBER', credit: 100000},
      {account: 'ALFA', credit: 50000}
    ]
    const a6 = RawAccounts.rawToAccountOperations(op6)
    console.log(a6)
    const b6 = Accounts.executeOperations(a6, Accounts.cloneBalance(b5))
    const e6: AccountBalance[] = [
      {account: 'RUB', balance: 20000, unit: 'RUB'},
      {account: 'USD', balance: 600, unit: 'USD'},
      {account: 'BENZ', balance: 30, unit: 'L'},
      {account: 'SBER', balance: 100000, unit: 'RUB'},
      {account: 'ALFA', balance: 50000, unit: 'RUB'}
    ]
    console.log(b6, e6)
    expect(b6).toEqual(e6)


    const b7 = Accounts.getBalanceByUnit(b6,'RUB')
    const e7: AccountBalance[] = [
      {account: 'RUB', balance: 20000, unit: 'RUB'},
      {account: 'SBER', balance: 100000, unit: 'RUB'},
      {account: 'ALFA', balance: 50000, unit: 'RUB'}
    ]
    console.log(b7, e7)
    expect(b7).toEqual(e7)

    const b8 = Accounts.getSumByUnit(b6,'RUB')
    const e8 = 170000
    console.log(b8, e8)
    expect(b8).toEqual(e8)

    const b9 = Accounts.getGroupedBalance(b6)
    const e9: UnitBalance[] = [
      {unit: 'RUB', balance: 170000},
      {unit: 'USD', balance: 600},
      {unit: 'L', balance: 30}
    ]
    console.log(b9, e9)
    expect(b9).toEqual(e9)


/*
    expectedObject.accounts.forEach(v=>{ if(v.account===p5.account) v.balance += p5.credit - p5.debit })
    console.log(testObject, expectedObject)
    expect(testObject).toEqual(expectedObject)

    const p6 = {account: 'USD', credit: 1000, debit: 300}
    testObject.executeOperation(p6)
    expectedObject.accounts.forEach(v=>{ if(v.account===p6.account) v.balance += p6.credit - p6.debit })
    console.log(testObject, expectedObject)
    expect(testObject).toEqual(expectedObject)

    testObject.addAccount(p4.account, p4.unit)
    console.log(testObject, expectedObject)
    expect(testObject).toEqual(expectedObject)

    const res1 = testObject.getFilteredList('RUB')
    const expres1 = []
    expectedObject.accounts.forEach(v=>{
      console.log(v)
      if(v.unit==='RUB') expres1.push(v)
    })
    console.log(res1, expres1)
    expect(res1).toEqual(expres1)

    const p7 = [
      {account: 'SBER', credit: 1400, debit: 30},
      {account: 'ALFA', credit: 35000, debit: 700},
      {account: 'SBER', credit: 0, debit: 440},
      {account: 'RUB', credit: 0, debit: 6500},
    ]
    testObject.executeOperations(p7)
    p7.forEach(p=>{
      expectedObject.accounts.forEach(v=>{ if(v.account===p.account) v.balance += p.credit - p.debit })
    })
    console.log(testObject, expectedObject)
    expect(testObject).toEqual(expectedObject)

    const res2 = testObject.getAggregatedBalance('RUB')
    const expres2 = expectedObject.accounts.reduce((a,v)=>a += (v.unit==='RUB'? v.balance : 0), 0)
    console.log(res2, expres2)
    expect(res2).toEqual(expres2)

  */

  })
})
