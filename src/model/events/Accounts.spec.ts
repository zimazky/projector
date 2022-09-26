import { Accounts } from "./Account"

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
    const testObject = new Accounts
    const p1 = {account: 'RUB', unit: 'RUB'}
    const p2 = {account: 'SBER', unit: 'RUB'}
    const p3 = {account: 'ALFA', unit: 'RUB'}
    const p4 = {account: 'USD', unit: 'USD'}

    testObject.addAccount(p1.account, p1.unit)
    testObject.addAccount(p2.account, p2.unit)
    testObject.addAccount(p3.account, p3.unit)
    testObject.addAccount(p4.account, p4.unit)

    const expectedObject = new Accounts
    expectedObject.accounts[expectedObject.lastId] = {...p1, balance: 0}
    expectedObject.ids[p1.account] = expectedObject.lastId
    expectedObject.lastId++
    expectedObject.accounts[expectedObject.lastId] = {...p2, balance: 0}
    expectedObject.ids[p2.account] = expectedObject.lastId
    expectedObject.lastId++
    expectedObject.accounts[expectedObject.lastId] = {...p3, balance: 0}
    expectedObject.ids[p3.account] = expectedObject.lastId
    expectedObject.lastId++
    expectedObject.accounts[expectedObject.lastId] = {...p4, balance: 0}
    expectedObject.ids[p4.account] = expectedObject.lastId
    expectedObject.lastId++

    console.log(testObject, expectedObject)
    expect(testObject).toEqual(expectedObject)

    const p5 = {account: 'RUB', credit: 20000, debit: 0}
    testObject.executeOperation(p5)
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


  })
})
