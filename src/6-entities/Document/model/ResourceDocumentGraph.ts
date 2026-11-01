import { decimal, parseQuantity, parseDecimal } from 'src/7-shared/libs/Decimal/Decimal'
import { DEFAULT_PROJECT_ID } from '../../Projects/ProjectId'
import { validateEventIdentities } from '../../Events/EventIdentity'
import type { EventDto } from '../../Events/EventDto'
import type { PlannedOperation, ActualOperation } from '../../Operations/OperationContracts'
import type { CashbackMonthSettings, PurchaseReference } from '../../Cashback/CashbackContracts'
import type { ResourcePrice } from '../../Resources/ResourceContracts'
import { parseDocumentData, parseEventFields } from './DocumentFormat'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import type { ResourceDocumentData } from './ResourceDocument.types'
import { invalidResource } from './ResourceDocumentSchema'

const zero = parseDecimal('0')
const hundred = parseDecimal('100')

function index<T extends { id: string }>(items: T[], path: string): Map<string, T> {
	const result = new Map<string, T>()
	for (const item of items) {
		if (result.has(item.id)) invalidResource(path, 'повторяется ID ' + item.id)
		result.set(item.id, item)
	}
	return result
}
function reference<T>(items: Map<string, T>, id: string, path: string): T {
	const item = items.get(id)
	if (!item) invalidResource(path, 'неизвестная ссылка ' + id)
	return item
}
function distinct(values: string[], path: string): void {
	if (new Set(values).size !== values.length) invalidResource(path, 'повторяются ссылки')
}

/** Проверяется весь граф до возврата данных вызывающему коду или первому стору. */
export function validateResourceDocumentGraph(data: ResourceDocumentData): void {
	const fail = (message: string): never => invalidResource('graph', message)
	parseDocumentData({ schemaVersion: 2, projectsList: data.projectsList, plannedList: [], completedList: [] })
	const projects = new Set([DEFAULT_PROJECT_ID, ...data.projectsList.map(project => project.id)])
	const units = index(data.units, 'units')
	const resources = index(data.resources, 'resources')
	const accounts = index(data.accounts, 'accounts')
	const categories = index(data.balanceCategories, 'balanceCategories')
	const cashbackCategories = index(data.cashbackCategories ?? [], 'cashbackCategories')
	index(data.priceHistory, 'priceHistory')
	const allEvents = [...data.completedList, ...data.plannedList]
	const events = new Map(allEvents.map(event => [event.eventUid!, event]))
	validateEventIdentities(allEvents)
	const completed = new Set(data.completedList.map(event => event.eventUid))
	const base = reference(resources, data.baseResourceId, 'baseResourceId')
	if (
		base.kind !== 'currency' ||
		!base.price ||
		base.price.amountPerUnit !== '1' ||
		base.price.quoteResourceId !== base.id
	)
		fail('основная валюта требует цену 1 в самой себе')
	for (const dimension of ['account', 'resource'])
		if (!data.balanceCategories.some(category => category.dimension === dimension))
			fail('отсутствует категория ' + dimension)
	for (const unit of data.units) if (unit.scale > 18) fail('масштаб единицы превышает 18')
	const unitFor = (resourceId: string) =>
		reference(units, reference(resources, resourceId, 'resourceId').unitId, 'unitId')
	const currency = (resourceId: string) => {
		const resource = reference(resources, resourceId, 'currency')
		if (resource.kind !== 'currency') fail('денежная ссылка указывает не на валюту')
		return resource
	}
	const nonnegative = (amount: Parameters<typeof decimal.compare>[0], path: string) => {
		if (decimal.compare(amount, zero) < 0) invalidResource(path, 'количество не может быть отрицательным')
	}
	const quantity = (amount: Parameters<typeof parseQuantity>[0], resourceId: string) =>
		parseQuantity(amount, unitFor(resourceId).scale)
	const compatible = (accountId: string, resourceId: string) => {
		const account = reference(accounts, accountId, 'accountId')
		if (!account.allowedResourceIds.includes(resourceId)) fail('счёт не разрешает ресурс ' + resourceId)
		return account
	}
	const price = (value: ResourcePrice) => {
		currency(value.quoteResourceId)
		if (value.sourceEventUid && !completed.has(value.sourceEventUid))
			fail('источник цены не является выполненным событием')
	}
	for (const resource of data.resources) {
		reference(units, resource.unitId, 'resource.unitId')
		if (reference(categories, resource.categoryId, 'resource.categoryId').dimension !== 'resource')
			fail('ресурсу назначена категория счетов')
		if (resource.price) {
			price(resource.price)
			const quote = reference(resources, resource.price.quoteResourceId, 'price.quoteResourceId')
			if (quote.id !== base.id && quote.price && quote.price.quoteResourceId !== base.id)
				fail('поддерживаются только прямая цена и один валютный шаг до основной валюты')
		}
	}
	for (const account of data.accounts) {
		if (reference(categories, account.categoryId, 'account.categoryId').dimension !== 'account')
			fail('счёту назначена категория ресурсов')
		if (!account.allowedResourceIds.length) fail('счёту требуется хотя бы один допустимый ресурс')
		distinct(account.allowedResourceIds, 'allowedResourceIds')
		account.allowedResourceIds.forEach(resourceId => reference(resources, resourceId, 'allowedResourceIds'))
	}
	for (const change of data.priceHistory) {
		reference(resources, change.resourceId, 'priceHistory.resourceId')
		price(change.price)
		if (change.previousPrice) {
			price(change.previousPrice)
			if (change.previousPrice.revision >= change.price.revision) fail('ревизия новой цены должна возрастать')
		}
	}

	function settings(value: CashbackMonthSettings): void {
		const account = reference(accounts, value.accountId, 'cashback.accountId')
		if (!account.allowedResourceIds.some(resourceId => resources.get(resourceId)?.kind === 'currency'))
			fail('счёт оплаты кэшбэка должен разрешать денежный ресурс')
		currency(value.calculationResourceId)
		reference(resources, value.rewardResourceId, 'cashback.rewardResourceId')
		if (value.rewardAccountId) compatible(value.rewardAccountId, value.rewardResourceId)
		if (decimal.compare(value.rewardUnitsPerCalculationUnit, zero) <= 0)
			fail('коэффициент начисления должен быть положительным')
		if (value.rounding.scale > unitFor(value.rewardResourceId).scale) fail('округление кэшбэка точнее единицы выплаты')
		index(value.rules, 'cashback.rules')
		distinct(
			value.rules.map(rule => JSON.stringify(rule.categoryId ?? null)),
			'cashback.rules.categoryId'
		)
		for (const rule of value.rules) {
			if (rule.categoryId) reference(cashbackCategories, rule.categoryId, 'cashback.rule.categoryId')
			if (decimal.compare(rule.ratePercent, zero) < 0 || decimal.compare(rule.ratePercent, hundred) > 0)
				fail('ставка должна быть от 0 до 100')
			if (rule.limitAmount !== undefined) {
				nonnegative(rule.limitAmount, 'cashback.limitAmount')
				quantity(rule.limitAmount, value.rewardResourceId)
			}
			if (rule.minimumPurchaseAmount !== undefined) {
				nonnegative(rule.minimumPurchaseAmount, 'cashback.minimumPurchaseAmount')
				quantity(rule.minimumPurchaseAmount, value.calculationResourceId)
			}
		}
		if (value.totalLimitAmount !== undefined) {
			nonnegative(value.totalLimitAmount, 'cashback.totalLimitAmount')
			quantity(value.totalLimitAmount, value.rewardResourceId)
		}
	}
	const months = data.cashbackMonthSettings ?? []
	distinct(
		months.map(value => JSON.stringify([value.accountId, value.month])),
		'cashbackMonthSettings'
	)
	months.forEach(settings)

	function operation(value: PlannedOperation | ActualOperation, actual: boolean): void {
		if (!value.movements.length) fail('операции требуется хотя бы одно движение')
		const movements = new Map(value.movements.map(movement => [movement.id, movement]))
		if (movements.size !== value.movements.length) fail('повторяются ID движений внутри операции или исходного плана')
		for (const movement of value.movements) {
			quantity(movement.quantity, movement.resourceId)
			if ('accountId' in movement) compatible(movement.accountId, movement.resourceId)
			else if (movement.target.kind === 'account') compatible(movement.target.accountId, movement.resourceId)
			else if (
				movement.target.kind === 'account-category' &&
				reference(categories, movement.target.categoryId, 'target.categoryId').dimension !== 'account'
			)
				fail('цель плана должна ссылаться на категорию счетов')
			if (actual !== 'accountId' in movement) fail('перепутаны плановое и фактическое движения')
		}
		for (const item of value.pricing ?? []) {
			const movement = reference(movements, item.pricedMovementId, 'pricing.pricedMovementId')
			currency(item.quoteResourceId)
			if (movement.resourceId === base.id && item.updateResourcePrice) fail('операция не меняет цену основной валюты')
		}
		if (value.cashback) {
			reference(cashbackCategories, value.cashback.categoryId, 'cashback.categoryId')
			if (!['expense', 'exchange'].includes(value.kind) || !value.cashback.paymentMovementIds.length)
				fail('кэшбэк требует расходные стороны покупки')
			distinct(value.cashback.paymentMovementIds, 'cashback.paymentMovementIds')
			for (const movementId of value.cashback.paymentMovementIds) {
				const movement = reference(movements, movementId, 'cashback.paymentMovementIds')
				if (movement.role !== 'principal' || decimal.compare(movement.quantity, zero) >= 0)
					fail('кэшбэк применим только к основному расходу')
				currency(movement.resourceId)
			}
		}
		if ('originalPlan' in value && value.originalPlan) operation(value.originalPlan, false)
	}

	function event(value: EventDto, actual: boolean, snapshot = false): void {
		parseEventFields(value, actual)
		if (!projects.has(value.projectId!)) fail('неизвестный проект события')
		if (value.seriesUid && !value.repeat) fail('seriesUid допустим только у расписания')
		if (actual && value.plannedOperation) fail('плановая операция в списке фактов')
		if (!actual && value.actualOperation) fail('фактическая операция в списке планов')
		if (snapshot && value.repeat) fail('исходный план не должен восстанавливать всю серию')
		if (value.plannedOperation) operation(value.plannedOperation, false)
		if (value.actualOperation) operation(value.actualOperation, true)
		if (value.originalPlan) {
			if (
				value.originalPlan.eventUid !== value.eventUid ||
				JSON.stringify(value.originalPlan.occurrence) !== JSON.stringify(value.occurrence)
			)
				fail('исходный план имеет другую идентичность')
			event(value.originalPlan, false, true)
			if (
				value.actualOperation?.originalPlan &&
				value.originalPlan.plannedOperation &&
				JSON.stringify(value.actualOperation.originalPlan) !== JSON.stringify(value.originalPlan.plannedOperation)
			)
				fail('снимки исходной ресурсной операции противоречат друг другу')
		}
	}
	data.completedList.forEach(value => event(value, true))
	data.plannedList.forEach(value => event(value, false))
	const schedules = data.plannedList.filter(value => value.repeat)
	const schedulesBySeries = new Map<string, EventDto[]>()
	for (const schedule of schedules) {
		const group = schedulesBySeries.get(schedule.seriesUid!) ?? []
		group.push(schedule)
		schedulesBySeries.set(schedule.seriesUid!, group)
	}
	for (const group of schedulesBySeries.values()) {
		group.sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0))
		for (let i = 1; i < group.length; i++)
			if (group[i].start < (group[i - 1].end ?? '9999.12.32')) fail('пересекаются сегменты одной серии')
	}
	for (const value of allEvents) {
		if (!value.occurrence) continue
		const occurrence = value.occurrence
		for (const schedule of schedulesBySeries.get(occurrence.seriesUid) ?? []) {
			if (occurrence.occurrenceDate < schedule.start || (schedule.end && occurrence.occurrenceDate >= schedule.end))
				continue
			if (
				ZCron.isMatch(
					schedule.repeat!,
					DateTime.YYYYMMDDToTimestamp(schedule.start),
					DateTime.YYYYMMDDToTimestamp(occurrence.occurrenceDate)
				)
			)
				fail('выделенное или выполненное вхождение осталось в расписании')
		}
	}

	const purchaseKey = (value: PurchaseReference) =>
		JSON.stringify([value.eventUid, value.movementId, value.occurrence?.seriesUid, value.occurrence?.occurrenceDate])
	const purchase = (value: PurchaseReference) => {
		const source = reference(events, value.eventUid, 'sourcePurchase.eventUid')
		const op = source.actualOperation ?? source.plannedOperation
		const movement = op?.movements.find(item => item.id === value.movementId)
		if (
			!movement ||
			movement.role !== 'principal' ||
			decimal.compare(movement.quantity, zero) >= 0 ||
			!op?.cashback?.paymentMovementIds.includes(movement.id)
		)
			return fail('ссылка выплаты не указывает на подходящий расход покупки')
		let purchaseDate = source.actualOperation?.effectiveDate ?? source.start
		if (source.repeat) {
			const occurrence = value.occurrence
			if (
				!occurrence ||
				occurrence.seriesUid !== source.seriesUid ||
				occurrence.occurrenceDate < source.start ||
				(source.end && occurrence.occurrenceDate >= source.end) ||
				!ZCron.isMatch(
					source.repeat,
					DateTime.YYYYMMDDToTimestamp(source.start),
					DateTime.YYYYMMDDToTimestamp(occurrence.occurrenceDate)
				)
			)
				fail('ссылка выплаты требует действительное вхождение серии')
			purchaseDate = occurrence!.occurrenceDate
		} else if (JSON.stringify(value.occurrence) !== JSON.stringify(source.occurrence))
			fail('неверное исходное вхождение покупки')
		return { source, movement, op, purchaseDate }
	}
	const paid = new Set<string>()
	for (const owner of allEvents) {
		const op = owner.actualOperation ?? owner.plannedOperation
		const payout = op?.cashbackPayout
		if (payout) {
			reference(resources, payout.rewardResourceId, 'payout.rewardResourceId')
			if (
				!payout.sourcePurchases.length ||
				!op!.movements.some(
					movement => movement.resourceId === payout.rewardResourceId && decimal.compare(movement.quantity, zero) > 0
				)
			)
				fail('выплата требует покупки и положительное движение ресурса выплаты')
			for (const item of payout.sourcePurchases) {
				const { purchaseDate } = purchase(item)
				if (purchaseDate.slice(0, 7).replace('.', '-') !== payout.purchaseMonth)
					fail('месяц лимита не совпадает с покупкой')
				const key = purchaseKey(item)
				if (paid.has(key)) fail('покупка связана с несколькими выплатами')
				paid.add(key)
			}
		}
		const snapshotKeys = new Set<string>()
		for (const snapshot of owner.actualOperation?.cashbackSnapshots ?? []) {
			const { movement } = purchase(snapshot.source)
			if (snapshot.source.eventUid !== owner.eventUid) fail('снимок условий относится к другой покупке')
			const paymentAccountId =
				'accountId' in movement ? movement.accountId : fail('снимку условий требуется фактический счёт')
			const key = purchaseKey(snapshot.source)
			if (snapshotKeys.has(key)) fail('повторяется снимок одного расходного движения')
			snapshotKeys.add(key)
			settings(snapshot.settings)
			if (
				snapshot.settings.accountId !== paymentAccountId ||
				!snapshot.settings.rules.some(rule => rule.id === snapshot.ruleId)
			)
				fail('снимок содержит чужие условия или правило')
			const appliedRule = snapshot.settings.rules.find(rule => rule.id === snapshot.ruleId)!
			if (appliedRule.categoryId && appliedRule.categoryId !== owner.actualOperation!.cashback?.categoryId)
				fail('правило снимка не соответствует категории покупки')
			if (owner.actualOperation!.effectiveDate.slice(0, 7).replace('.', '-') !== snapshot.settings.month)
				fail('неверный месяц снимка условий')
			quantity(snapshot.calculationAmount, snapshot.settings.calculationResourceId)
			quantity(snapshot.expectedRewardQuantity, snapshot.settings.rewardResourceId)
			nonnegative(snapshot.calculationAmount, 'snapshot.calculationAmount')
			nonnegative(snapshot.expectedRewardQuantity, 'snapshot.expectedRewardQuantity')
			if (snapshot.cashbackPayoutUid) {
				const linked = reference(events, snapshot.cashbackPayoutUid, 'snapshot.cashbackPayoutUid')
				const link = (linked.actualOperation ?? linked.plannedOperation)?.cashbackPayout
				if (!link || !link.sourcePurchases.some(item => purchaseKey(item) === key))
					fail('несогласованная связь снимка с выплатой')
			}
		}
	}
}
