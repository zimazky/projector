import type { ResourceDocumentData } from 'src/6-entities/Document/model/ResourceDocument.types'
import { createEmptyResourceDocumentData } from 'src/6-entities/Document/model/ResourceDocumentFormat'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { parseDecimal } from 'src/7-shared/libs/Decimal/Decimal'

export function resourceBalanceBenchmarkData(): ResourceDocumentData {
	const data = createEmptyResourceDocumentData({
		id: 'benchmark',
		currency: { code: 'RUB', scale: 2 },
		currencyConfirmed: true,
		asOf: '2026.11.01',
		timezone: 'Europe/Moscow'
	})
	const resourceId = data.baseResourceId
	data.units.push({ id: 'usd-unit', symbol: 'USD', scale: 2 })
	data.resources.push({
		id: 'USD',
		name: 'USD',
		kind: 'currency',
		unitId: 'usd-unit',
		categoryId: data.balanceCategories[1].id,
		archived: false,
		price: { amountPerUnit: parseDecimal('90'), quoteResourceId: resourceId, asOf: '2026.11.01', revision: 0 }
	})
	for (let i = 0; i < 20; i++)
		data.accounts.push({
			id: 'account-' + i,
			name: 'Account ' + i,
			categoryId: data.balanceCategories[0].id,
			allowedResourceIds: [resourceId, 'USD'],
			archived: false
		})
	const start = DateTime.YYYYMMDDToTimestamp('2010.01.01')
	for (let i = 0; i < 10000; i++) {
		const date = DateTime.getYYYYMMDD(start + (i % 6100) * 86400)
		data.completedList.push({
			eventUid: 'actual-' + i,
			name: 'Actual ' + i,
			start: date,
			projectId: 'default',
			actualOperation: {
				kind: 'adjustment',
				effectiveDate: date,
				movements: [
					{
						id: 'actual-move-' + i,
						accountId: 'account-' + (i % 20),
						resourceId: i % 10 ? resourceId : 'USD',
						quantity: parseDecimal(i % 3 ? '100.25' : '-30.1'),
						role: 'principal'
					}
				]
			}
		})
	}
	for (let i = 0; i < 2000; i++)
		data.plannedList.push({
			eventUid: 'plan-' + i,
			name: 'Plan ' + i,
			start: DateTime.getYYYYMMDD(start + (5800 + (i % 600)) * 86400),
			projectId: 'default',
			plannedOperation: {
				kind: 'expense',
				movements: [
					{
						id: 'plan-move-' + i,
						resourceId: i % 10 ? resourceId : 'USD',
						quantity: parseDecimal('-10.25'),
						role: 'principal',
						target: { kind: 'account', accountId: 'account-' + (i % 20) }
					}
				]
			}
		})
	for (let i = 0; i < 100; i++)
		data.plannedList.push({
			eventUid: 'repeat-' + i,
			seriesUid: 'series-' + i,
			name: 'Repeat ' + i,
			start: '2010.01.01',
			repeat: i % 2 ? '/7' : '1 * *',
			end: '2028.01.01',
			projectId: 'default',
			plannedOperation: {
				kind: 'expense',
				movements: [
					{
						id: 'repeat-move-' + i,
						resourceId: i % 10 ? resourceId : 'USD',
						quantity: parseDecimal('-2.5'),
						role: 'principal',
						target: { kind: 'account', accountId: 'account-' + (i % 20) }
					}
				]
			}
		})
	return data
}
