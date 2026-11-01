import { documentDate } from '../Document/model/DocumentFormat'
import { parsePrice } from 'src/7-shared/libs/Decimal/Decimal'
import type { ResourceDocumentData } from '../Document/model/ResourceDocument.types'
import type { PriceChange, ResourcePrice } from '../Resources/ResourceContracts'
import type { EventDto } from '../Events/EventDto'
import { commandError } from './OperationValidation'

export const PRICE_HISTORY_PER_RESOURCE = 20
export type PriceWarning = {
	resourceId: string
	reason: 'future-price' | 'older-price' | 'independent-price-preserved' | 'previous-price-unavailable'
}
export type PriceCommandContext = {
	commandId: string
	today: string
	applyPriceNow?: boolean
	warnings: PriceWarning[]
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const priceKey = (resourceId: string, price: ResourcePrice) =>
	JSON.stringify([resourceId, price.commandId, price.revision])

function nextRevision(data: ResourceDocumentData, resourceId: string): number {
	const revision =
		data.priceHistory
			.filter(item => item.resourceId === resourceId)
			.reduce(
				(maximum, item) => Math.max(maximum, item.price.revision),
				data.resources.find(item => item.id === resourceId)?.price?.revision ?? -1
			) + 1
	if (!Number.isSafeInteger(revision)) commandError('Исчерпан диапазон ревизий цены')
	return revision
}

function writePrice(
	data: ResourceDocumentData,
	resourceId: string,
	input: Omit<ResourcePrice, 'revision' | 'commandId'>,
	commandId: string
): void {
	const resource = data.resources.find(item => item.id === resourceId) ?? commandError('Неизвестный ресурс цены')
	if (data.priceHistory.some(item => item.commandId === commandId && item.resourceId === resourceId))
		commandError('Идентификатор команды цены уже использован')
	const price: ResourcePrice = { ...copy(input), revision: nextRevision(data, resourceId), commandId }
	data.priceHistory.push({
		id: `price:${encodeURIComponent(commandId)}:${encodeURIComponent(resourceId)}`,
		commandId,
		resourceId,
		...(resource.price ? { previousPrice: copy(resource.price) } : {}),
		price: copy(price)
	})
	resource.price = price
}

export function writeManualPrice(
	data: ResourceDocumentData,
	resourceId: string,
	price: Omit<ResourcePrice, 'revision' | 'sourceEventUid' | 'commandId'>,
	context: PriceCommandContext
): void {
	const asOf = documentDate(price.asOf)
	const amountPerUnit = parsePrice(price.amountPerUnit)
	if (asOf > context.today) commandError('Текущая цена не может быть датирована будущим днём')
	if (resourceId === data.baseResourceId) commandError('Цена основной валюты всегда равна 1')
	const earlier = data.priceHistory.find(item => item.commandId === context.commandId && item.resourceId === resourceId)
	if (earlier) {
		if (
			earlier.price.sourceEventUid ||
			earlier.price.amountPerUnit !== amountPerUnit ||
			earlier.price.quoteResourceId !== price.quoteResourceId ||
			earlier.price.asOf !== asOf
		)
			commandError('Идентификатор команды уже использован для другой цены')
		return
	}
	writePrice(data, resourceId, { amountPerUnit, quoteResourceId: price.quoteResourceId, asOf }, context.commandId)
}

/** Пишет только явно указанные цены совершённого обмена. */
export function writeEventPrices(
	data: ResourceDocumentData,
	event: EventDto,
	context: PriceCommandContext,
	protectedResources = new Set<string>()
): void {
	const operation = event.actualOperation
	if (!operation || operation.kind !== 'exchange') return
	const updates = new Map<string, NonNullable<typeof operation.pricing>[number]>()
	for (const price of operation.pricing ?? [])
		if (price.updateResourcePrice) {
			const resourceId = operation.movements.find(item => item.id === price.pricedMovementId)!.resourceId
			updates.set(resourceId, price)
		}
	for (const [resourceId, price] of updates) {
		const resource = data.resources.find(item => item.id === resourceId)!
		const earlier = data.priceHistory.find(
			item => item.commandId === context.commandId && item.resourceId === resourceId
		)
		if (earlier) {
			if (
				earlier.undone ||
				earlier.price.sourceEventUid !== event.eventUid ||
				earlier.price.amountPerUnit !== price.pricePerUnit ||
				earlier.price.quoteResourceId !== price.quoteResourceId ||
				earlier.price.asOf !== operation.effectiveDate
			)
				commandError('Идентификатор команды уже использован для другой или отменённой цены')
			continue
		}
		if (operation.effectiveDate > context.today) {
			context.warnings.push({ resourceId, reason: 'future-price' })
			continue
		}
		if (protectedResources.has(resourceId) && !context.applyPriceNow) {
			continue
		}
		if (resource.price && operation.effectiveDate < resource.price.asOf && !context.applyPriceNow) {
			context.warnings.push({ resourceId, reason: 'older-price' })
			continue
		}
		if (protectedResources.has(resourceId) && context.applyPriceNow) {
			for (let index = context.warnings.length - 1; index >= 0; index--)
				if (
					context.warnings[index].resourceId === resourceId &&
					context.warnings[index].reason === 'independent-price-preserved'
				)
					context.warnings.splice(index, 1)
		}
		writePrice(
			data,
			resourceId,
			{
				amountPerUnit: price.pricePerUnit,
				quoteResourceId: price.quoteResourceId,
				asOf: operation.effectiveDate,
				sourceEventUid: event.eventUid
			},
			context.commandId
		)
	}
}

function previousIndependent(
	data: ResourceDocumentData,
	resourceId: string,
	initial: ResourcePrice | undefined,
	unavailable = false
): { price?: ResourcePrice; unavailable: boolean } {
	const completed = new Set(data.completedList.map(item => item.eventUid))
	const history = new Map(data.priceHistory.map(item => [priceKey(item.resourceId, item.price), item]))
	const seen = new Set<string>()
	let price = initial
	while (price) {
		const key = priceKey(resourceId, price)
		if (seen.has(key)) return { unavailable: true }
		seen.add(key)
		const entry = history.get(key)
		if (!entry?.undone && (!price.sourceEventUid || completed.has(price.sourceEventUid)))
			return { price: copy(price), unavailable }
		if (!entry) return { unavailable: true }
		unavailable ||= !!entry.previousPriceUnavailable
		price = entry.previousPrice
	}
	return { unavailable }
}

/** Не возвращает отменённую цену из цепочки. Независимая текущая запись остаётся на месте. */
export function revertEventPrices(
	data: ResourceDocumentData,
	eventUid: string,
	context: PriceCommandContext
): Set<string> {
	const protectedResources = new Set<string>()
	const owned = data.priceHistory.filter(item => item.price.sourceEventUid === eventUid && !item.undone)
	for (const entry of owned) entry.undone = true
	for (const resource of data.resources) {
		if (resource.price?.sourceEventUid !== eventUid) {
			if (owned.some(item => item.resourceId === resource.id)) {
				protectedResources.add(resource.id)
				context.warnings.push({ resourceId: resource.id, reason: 'independent-price-preserved' })
			}
			continue
		}
		const current = resource.price
		const entry = data.priceHistory.find(
			item => item.resourceId === resource.id && priceKey(resource.id, item.price) === priceKey(resource.id, current)
		)
		const previous = entry
			? previousIndependent(data, resource.id, entry.previousPrice, !!entry.previousPriceUnavailable)
			: { unavailable: true }
		if (previous.price) {
			const { revision: _revision, commandId: _commandId, ...input } = previous.price
			// Restoration is a new revision and remains attributable to an earlier, still active event.
			writePrice(data, resource.id, input, context.commandId + ':restore')
		} else delete resource.price
		if (previous.unavailable) context.warnings.push({ resourceId: resource.id, reason: 'previous-price-unavailable' })
	}
	return protectedResources
}

/** Ограничение на ресурс; устаревшие ссылки отменённых источников сворачиваются до безопасного предшественника. */
export function trimPriceHistory(data: ResourceDocumentData): void {
	const counts = new Map<string, number>()
	const retained: PriceChange[] = []
	for (const entry of [...data.priceHistory].reverse()) {
		const count = counts.get(entry.resourceId) ?? 0
		if (count < PRICE_HISTORY_PER_RESOURCE) retained.push(entry)
		counts.set(entry.resourceId, count + 1)
	}
	for (const entry of retained)
		if (entry.previousPrice) {
			const resolved = previousIndependent(
				data,
				entry.resourceId,
				entry.previousPrice,
				!!entry.previousPriceUnavailable
			)
			if (resolved.price) entry.previousPrice = resolved.price
			else delete entry.previousPrice
			if (resolved.unavailable) {
				delete entry.previousPrice
				entry.previousPriceUnavailable = true
			}
		}
	data.priceHistory = retained.reverse()
}
