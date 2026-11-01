import { decimal, parseDecimal, parsePrice, parseQuantity, roundMoney } from 'src/7-shared/libs/Decimal/Decimal'
import type { ActualOperation, ExchangePricing, PlannedOperation } from './OperationContracts'
import type { ResourceDocumentData } from '../Document/model/ResourceDocument.types'

type Operation = PlannedOperation | ActualOperation
const zero = parseDecimal('0')
export class OperationCommandError extends Error {}
export function commandError(message: string): never {
	throw new OperationCommandError(message)
}

export function resourceScale(data: ResourceDocumentData, resourceId: string): number {
	const resource =
		data.resources.find(item => item.id === resourceId) ?? commandError('Неизвестный ресурс: ' + resourceId)
	return (data.units.find(item => item.id === resource.unitId) ?? commandError('Неизвестная единица ресурса')).scale
}

/** Движения сравниваются в своих единицах. Комиссии и налоги не входят в стоимость приобретений. */
export function validateOperation(data: ResourceDocumentData, operation: Operation, previous?: Operation): void {
	if (!operation.movements.length) commandError('Операции требуется хотя бы одно движение')
	for (const movement of operation.movements) {
		parseQuantity(movement.quantity, resourceScale(data, movement.resourceId))
		if (decimal.compare(movement.quantity, zero) === 0) commandError('Количество движения не может быть нулевым')
		if (movement.role !== 'principal' && decimal.compare(movement.quantity, zero) >= 0)
			commandError('Комиссия и налог должны быть расходом')
		const accountId =
			'accountId' in movement
				? movement.accountId
				: movement.target.kind === 'account'
					? movement.target.accountId
					: undefined
		const old = previous?.movements.find(
			item =>
				item.id === movement.id &&
				item.resourceId === movement.resourceId &&
				('accountId' in item ? item.accountId : item.target.kind === 'account' ? item.target.accountId : undefined) ===
					accountId
		)
		const resource = data.resources.find(item => item.id === movement.resourceId)!
		if (!old && resource.archived) commandError('Нельзя назначить новое движение архивному ресурсу')
		if (accountId) {
			const account =
				data.accounts.find(item => item.id === accountId) ?? commandError('Неизвестный счёт: ' + accountId)
			if (!account.allowedResourceIds.includes(movement.resourceId)) commandError('Счёт не разрешает выбранный ресурс')
			if (!old && account.archived) commandError('Нельзя назначить новое движение архивному счёту')
		}
	}
	const principal = operation.movements.filter(item => item.role === 'principal')
	if (!principal.length) commandError('Операции требуется основное движение')
	const sign = (quantity: typeof zero) => decimal.compare(quantity, zero)
	if (operation.kind === 'income' && principal.some(item => sign(item.quantity) <= 0))
		commandError('Доход требует положительных основных движений')
	if (operation.kind === 'expense' && principal.some(item => sign(item.quantity) >= 0))
		commandError('Расход требует отрицательных основных движений')
	if (['opening', 'adjustment'].includes(operation.kind) && principal.length !== operation.movements.length)
		commandError('Остаток и корректировка не содержат комиссий или налогов')
	if (operation.kind === 'transfer') {
		if (
			new Set(principal.map(item => item.resourceId)).size !== 1 ||
			decimal.compare(
				principal.reduce((sum, item) => decimal.add(sum, item.quantity), zero),
				zero
			) !== 0
		)
			commandError('Перевод одного ресурса должен балансироваться в его единицах')
		if (
			'effectiveDate' in operation &&
			new Set(
				operation.movements.filter(item => item.role === 'principal').map(item => 'accountId' in item && item.accountId)
			).size < 2
		)
			commandError('Перевод требует разные счета')
	}
	if (
		operation.kind === 'exchange' &&
		(new Set(principal.map(item => item.resourceId)).size < 2 ||
			!principal.some(item => sign(item.quantity) > 0) ||
			!principal.some(item => sign(item.quantity) < 0))
	)
		commandError('Обмен требует приход и расход разных ресурсов')
	if (operation.kind !== 'exchange' && operation.pricing?.length)
		commandError('Цена сделки задаётся только для обмена или покупки ресурса')
	validatePricing(data, operation)
}

function validatePricing(data: ResourceDocumentData, operation: Operation): void {
	if (!operation.pricing?.length) return
	const priced = new Set<string>()
	const groups = new Map<string, { total: typeof zero; sign: number }>()
	const updates = new Map<string, string>()
	for (const item of operation.pricing) {
		const movement =
			operation.movements.find(movement => movement.id === item.pricedMovementId) ??
			commandError('Цена ссылается на неизвестное движение')
		if (priced.has(movement.id)) commandError('Движение не может дважды получать одну и ту же оплату')
		priced.add(movement.id)
		if (movement.role !== 'principal' || movement.resourceId === item.quoteResourceId)
			commandError('Цена требует отдельное основное движение ресурса')
		const quote = data.resources.find(resource => resource.id === item.quoteResourceId)
		if (quote?.kind !== 'currency') commandError('Цена сделки должна быть задана в денежном ресурсе')
		if (movement.resourceId === data.baseResourceId && item.updateResourcePrice)
			commandError('Цена основной валюты всегда равна 1')
		parsePrice(item.pricePerUnit)
		const sign = decimal.compare(movement.quantity, zero)
		const group = groups.get(item.quoteResourceId) ?? { total: zero, sign }
		if (group.sign !== sign) commandError('Неоднозначное распределение оплаты между встречными сторонами')
		group.total = decimal.add(group.total, decimal.multiply(movement.quantity, item.pricePerUnit))
		groups.set(item.quoteResourceId, group)
		if (item.updateResourcePrice) {
			const value = JSON.stringify([item.quoteResourceId, item.pricePerUnit])
			if (updates.has(movement.resourceId) && updates.get(movement.resourceId) !== value)
				commandError('Ресурс не может получить две разные цены одной командой')
			updates.set(movement.resourceId, value)
		}
	}
	for (const [quoteId, group] of groups) {
		const quoted = operation.movements.filter(item => item.role === 'principal' && item.resourceId === quoteId)
		if (
			!quoted.length ||
			quoted.some(item => priced.has(item.id) || decimal.compare(item.quantity, zero) === group.sign)
		)
			commandError('У цены нет однозначной встречной денежной стороны')
		const payment = quoted.reduce((sum, item) => decimal.add(sum, item.quantity), zero)
		if (decimal.compare(roundMoney(group.total, resourceScale(data, quoteId)), decimal.negate(payment)) !== 0)
			commandError('Оплата не согласована с количеством и ценой с учётом округления')
	}
	if (
		operation.movements.some(item => item.role === 'principal' && !priced.has(item.id) && !groups.has(item.resourceId))
	)
		commandError('Для каждой стороны приобретения требуется цена или распределение оплаты')
}

/** Вывод цены требует явного выбора оцениваемой стороны; сумма комиссии не капитализируется. */
export function derivePricing(
	data: ResourceDocumentData,
	operation: Operation,
	request: Omit<ExchangePricing, 'pricePerUnit'>
): ExchangePricing {
	const movement =
		operation.movements.find(item => item.id === request.pricedMovementId) ??
		commandError('Неизвестная оцениваемая сторона')
	const payments = operation.movements.filter(
		item => item.role === 'principal' && item.resourceId === request.quoteResourceId
	)
	if (
		operation.kind !== 'exchange' ||
		movement.role !== 'principal' ||
		decimal.compare(movement.quantity, zero) === 0 ||
		!payments.length ||
		operation.movements.some(item => item.role === 'principal' && item !== movement && !payments.includes(item))
	)
		commandError('Для вывода цены нужны одна сторона ресурса и денежная оплата')
	resourceScale(data, request.quoteResourceId)
	const paid = payments.reduce((sum, item) => decimal.add(sum, item.quantity), zero)
	return {
		...request,
		pricePerUnit: parsePrice(decimal.round(decimal.divide(decimal.negate(paid), movement.quantity), 18))
	}
}
