import { parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import type { ResourceDocumentData } from 'src/6-entities/Document/model/ResourceDocument.types'
import type { PlannedOperation } from 'src/6-entities/Operations/OperationContracts'
import type { CashbackMonthSettings } from 'src/6-entities/Cashback/CashbackContracts'

/** Полный небольшой граф: обмен, комиссия, валютная оценка, бонусы и связанная выплата. */
export function resourceDocument(): ResourceDocumentData {
	const settings: CashbackMonthSettings = {
		accountId: 'card',
		month: '2026-11',
		calculationResourceId: 'RUB',
		rewardResourceId: 'bonus',
		rewardAccountId: 'bonus-account',
		rewardUnitsPerCalculationUnit: d('1'),
		rounding: { scale: 0, mode: 'down' },
		rules: [
			{
				id: 'gas-rule',
				categoryId: 'gas',
				ratePercent: d('5'),
				limitAmount: d('1000'),
				minimumPurchaseAmount: d('100')
			},
			{ id: 'base-rule', ratePercent: d('1') }
		],
		totalLimitAmount: d('2000'),
		revision: 1,
		conditionsComplete: true
	}
	const originalPlan: PlannedOperation = {
		kind: 'exchange',
		movements: [
			{
				id: 'plan-pay',
				resourceId: 'RUB',
				quantity: d('-2800'),
				role: 'principal',
				target: { kind: 'account-category', categoryId: 'everyday' }
			},
			{
				id: 'plan-fuel',
				resourceId: 'fuel',
				quantity: d('40'),
				role: 'principal',
				target: { kind: 'account', accountId: 'tank' }
			}
		],
		pricing: [
			{ pricedMovementId: 'plan-fuel', quoteResourceId: 'RUB', pricePerUnit: d('70'), updateResourcePrice: true }
		],
		cashback: { categoryId: 'gas', paymentMovementIds: ['plan-pay'] }
	}
	const source = { eventUid: 'purchase', movementId: 'pay' }
	return {
		schemaVersion: 3,
		baseResourceId: 'RUB',
		timezone: 'Europe/Moscow',
		projectsList: [],
		units: [
			{ id: 'rub-unit', symbol: 'RUB', scale: 2 },
			{ id: 'usd-unit', symbol: 'USD', scale: 2 },
			{ id: 'litre', symbol: 'л', scale: 3 },
			{ id: 'piece', symbol: 'шт.', scale: 0 },
			{ id: 'point', symbol: 'балл', scale: 0 }
		],
		balanceCategories: [
			{ id: 'everyday', name: 'Повседневные', dimension: 'account', includeInGrandTotal: true, showInSummary: true },
			{ id: 'money', name: 'Деньги', dimension: 'resource', includeInGrandTotal: true, showInSummary: true },
			{
				id: 'materials',
				name: 'Материалы и бонусы',
				dimension: 'resource',
				includeInGrandTotal: false,
				showInSummary: true
			}
		],
		resources: [
			{
				id: 'RUB',
				name: 'Рубли',
				unitId: 'rub-unit',
				kind: 'currency',
				categoryId: 'money',
				archived: false,
				price: { amountPerUnit: d('1'), quoteResourceId: 'RUB', asOf: '2026.11.01', revision: 0 }
			},
			{
				id: 'USD',
				name: 'Доллары',
				unitId: 'usd-unit',
				kind: 'currency',
				categoryId: 'money',
				archived: false,
				price: { amountPerUnit: d('90'), quoteResourceId: 'RUB', asOf: '2026.11.01', revision: 0 }
			},
			{
				id: 'fuel',
				name: 'АИ-95',
				unitId: 'litre',
				kind: 'material',
				categoryId: 'materials',
				archived: false,
				price: {
					amountPerUnit: d('75'),
					quoteResourceId: 'RUB',
					asOf: '2026.11.01',
					revision: 1,
					sourceEventUid: 'purchase',
					commandId: 'buy-fuel'
				}
			},
			{
				id: 'bond',
				name: 'Выпуск облигаций',
				unitId: 'piece',
				kind: 'bond',
				categoryId: 'money',
				archived: false,
				price: { amountPerUnit: d('100'), quoteResourceId: 'USD', asOf: '2026.11.01', revision: 0 }
			},
			{
				id: 'bonus',
				name: 'Бонусы программы',
				unitId: 'point',
				kind: 'bonus',
				categoryId: 'materials',
				archived: false,
				price: { amountPerUnit: d('0.5'), quoteResourceId: 'RUB', asOf: '2026.11.01', revision: 0 }
			}
		],
		accounts: [
			{ id: 'card', name: 'Карта', allowedResourceIds: ['RUB'], categoryId: 'everyday', archived: false },
			{
				id: 'broker',
				name: 'Брокерский',
				allowedResourceIds: ['RUB', 'USD', 'bond'],
				categoryId: 'everyday',
				archived: false
			},
			{ id: 'tank', name: 'Бак', allowedResourceIds: ['fuel'], categoryId: 'everyday', archived: false },
			{ id: 'bonus-account', name: 'Бонусный', allowedResourceIds: ['bonus'], categoryId: 'everyday', archived: false }
		],
		priceHistory: [
			{
				id: 'fuel-price',
				commandId: 'buy-fuel',
				resourceId: 'fuel',
				price: {
					amountPerUnit: d('75'),
					quoteResourceId: 'RUB',
					asOf: '2026.11.01',
					revision: 1,
					sourceEventUid: 'purchase',
					commandId: 'buy-fuel'
				},
				previousPrice: { amountPerUnit: d('70'), quoteResourceId: 'RUB', asOf: '2026.10.01', revision: 0 }
			}
		],
		cashbackCategories: [{ id: 'gas', name: 'АЗС' }],
		cashbackMonthSettings: [settings],
		completedList: [
			{
				eventUid: 'purchase',
				name: 'Заправка',
				start: '2026.11.01',
				projectId: 'default',
				originalPlan: {
					eventUid: 'purchase',
					name: 'Заправка',
					start: '2026.11.01',
					projectId: 'default',
					plannedOperation: originalPlan
				},
				actualOperation: {
					kind: 'exchange',
					effectiveDate: '2026.11.01',
					movements: [
						{ id: 'pay', resourceId: 'RUB', quantity: d('-3000'), role: 'principal', accountId: 'card' },
						{ id: 'get-fuel', resourceId: 'fuel', quantity: d('40'), role: 'principal', accountId: 'tank' },
						{ id: 'fee', resourceId: 'RUB', quantity: d('-5'), role: 'fee', accountId: 'card' }
					],
					originalPlan,
					pricing: [
						{ pricedMovementId: 'get-fuel', quoteResourceId: 'RUB', pricePerUnit: d('75'), updateResourcePrice: true }
					],
					cashback: { categoryId: 'gas', paymentMovementIds: ['pay'] },
					cashbackSnapshots: [
						{
							source,
							settings,
							ruleId: 'gas-rule',
							calculationAmount: d('3000'),
							expectedRewardQuantity: d('150'),
							approximate: false,
							cashbackPayoutUid: 'payout'
						}
					]
				}
			}
		],
		plannedList: [
			{
				eventUid: 'payout',
				name: 'Выплата бонусов',
				start: '2026.12.01',
				projectId: 'default',
				plannedOperation: {
					kind: 'income',
					movements: [
						{
							id: 'reward',
							resourceId: 'bonus',
							quantity: d('150'),
							role: 'principal',
							target: { kind: 'account', accountId: 'bonus-account' }
						}
					],
					cashbackPayout: { sourcePurchases: [source], purchaseMonth: '2026-11', rewardResourceId: 'bonus' }
				}
			},
			{
				eventUid: 'series',
				seriesUid: 'series-origin',
				name: 'Повторяемый план',
				start: '2026.11.02',
				repeat: '/7',
				end: '2026.12.01',
				projectId: 'default',
				plannedOperation: {
					kind: 'expense',
					movements: [
						{
							id: 'series-pay',
							resourceId: 'RUB',
							quantity: d('-500'),
							role: 'principal',
							target: { kind: 'unassigned' }
						}
					]
				}
			}
		]
	}
}
