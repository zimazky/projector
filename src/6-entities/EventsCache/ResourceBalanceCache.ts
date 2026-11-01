import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { documentDate } from '../Document/model/DocumentFormat'
import { freezeSnapshot } from '../Document/model/DocumentSyncFingerprint'
import type { ResourceDocumentData } from '../Document/model/ResourceDocument.types'
import type { IEventsStoreProvider, DocumentStores } from '../Document/model/DocumentStoreManager.types'
import type { ReadonlyJson } from '../Resources/DocumentCatalogStore'
import { createPriceSnapshot, ValuationService } from '../Resources/ValuationService'
import { documentToday } from '../Operations/ResourceOperationCommands'
import { BoundedCache } from './BoundedCache'
import { HoldingsIndex } from './HoldingsIndex'
import { ForecastIndex } from './ForecastIndex'
import { combinePositions, projectResourceQuantities } from './ResourceBalanceProjection'
import { ResourceBalanceClock } from './ResourceBalanceClock'
import type { OverduePlan, QuantityReport, ResourceBalanceReport } from './ResourceBalance.types'

export const RESOURCE_BALANCE_CACHE_CAPACITY = 512
export const RESOURCE_DOCUMENT_CACHE_CAPACITY = 16
export type ResourceBalanceOptions = { forecastFrom?: string; mode?: 'actual' | 'forecast' }
type Context = {
	stores: DocumentStores
	eventsVersion: number
	holdings: HoldingsIndex
	forecast: ForecastIndex
	priceContext: unknown[]
	viewContext: unknown[]
	resourceGroups: string
	valuation: ValuationService
	quantities: BoundedCache<string, QuantityReport>
	projections: BoundedCache<string, ReturnType<typeof projectResourceQuantities>>
	reports: BoundedCache<string, ReadonlyJson<ResourceBalanceReport>>
	overdue: BoundedCache<string, OverduePlan[]>
	stats: { indexBuilds: number; priceSets: number; quantityReads: number; reportReads: number }
}
const equal = (left: unknown[], right: unknown[]) =>
	left.length === right.length && left.every((value, index) => value === right[index])

/** Два независимых кэша: количества зависят от событий, оценка — от справочников и цен. */
export class ResourceBalanceCache {
	private contexts = new BoundedCache<string, Context>(RESOURCE_DOCUMENT_CACHE_CAPACITY)
	constructor(
		private readonly provider: IEventsStoreProvider,
		readonly clock = new ResourceBalanceClock()
	) {}
	clear(): void {
		this.contexts.clear()
	}
	start(): void {
		this.clock.start()
	}
	dispose(): void {
		this.clock.dispose()
		this.clear()
	}
	private source(documentId: string): { stores: DocumentStores; data: ResourceDocumentData } {
		const stores =
			this.provider.getDocumentStores?.(documentId) ??
			this.provider.getAllDocumentStores?.().find(item => item.documentId === documentId)
		const data =
			this.provider.getDocumentData?.(documentId) ??
			(this.provider.activeDocument?.id === documentId ? this.provider.activeDocument.data : null)
		if (!stores?.resourceStores || !data || !('schemaVersion' in data) || data.schemaVersion !== 3) {
			this.contexts.delete(documentId)
			throw new Error('Для расчёта нужен открытый ресурсный документ: ' + documentId)
		}
		return { stores, data: data as ResourceDocumentData }
	}
	private ensure(documentId: string): { context: Context; data: ResourceDocumentData } {
		const { stores, data } = this.source(documentId)
		const catalogs = stores.resourceStores!
		let context = this.contexts.get(documentId)
		if (!context || context.stores !== stores || context.eventsVersion !== stores.eventsStore.version) {
			context = {
				stores,
				eventsVersion: stores.eventsStore.version,
				holdings: new HoldingsIndex(data.completedList),
				forecast: new ForecastIndex(data.plannedList),
				priceContext: context?.priceContext ?? [],
				viewContext: [],
				resourceGroups: context?.resourceGroups ?? '',
				valuation: context?.valuation as ValuationService,
				quantities: new BoundedCache(RESOURCE_BALANCE_CACHE_CAPACITY),
				projections: new BoundedCache(RESOURCE_BALANCE_CACHE_CAPACITY),
				reports: new BoundedCache(RESOURCE_BALANCE_CACHE_CAPACITY),
				overdue: new BoundedCache(RESOURCE_BALANCE_CACHE_CAPACITY),
				stats: {
					indexBuilds: (context?.stats.indexBuilds ?? 0) + 1,
					priceSets: context?.stats.priceSets ?? 0,
					quantityReads: context?.stats.quantityReads ?? 0,
					reportReads: context?.stats.reportReads ?? 0
				}
			}
			this.contexts.set(documentId, context)
		}
		const prices = [
			catalogs.resourcesStore,
			catalogs.resourcesStore.version,
			catalogs.unitsStore,
			catalogs.unitsStore.version,
			data.baseResourceId
		]
		if (!equal(context.priceContext, prices)) {
			const resources = catalogs.resourcesStore.list
			context.resourceGroups = JSON.stringify(resources.map(resource => [resource.id, resource.categoryId]))
			const base = resources.find(item => item.id === data.baseResourceId)!
			const scale = catalogs.unitsStore.getById(base.unitId)!.scale
			context.valuation = new ValuationService(
				createPriceSnapshot(
					resources,
					data.baseResourceId,
					++context.stats.priceSets,
					new Date(this.clock.now).toISOString()
				),
				resources,
				scale
			)
			context.priceContext = prices
			context.reports.clear()
		}
		const view = [
			catalogs.accountsStore,
			catalogs.accountsStore.version,
			catalogs.balanceCategoriesStore,
			catalogs.balanceCategoriesStore.version,
			data.timezone,
			context.resourceGroups
		]
		if (!equal(context.viewContext, view)) {
			context.viewContext = view
			context.reports.clear()
			context.projections.clear()
		}
		return { context, data }
	}
	private report(
		documentId: string,
		context: Context,
		data: ResourceDocumentData,
		date: string,
		from: string,
		mode: 'actual' | 'forecast'
	): ReadonlyJson<ResourceBalanceReport> {
		const key = JSON.stringify([date, from, mode])
		const cached = context.reports.get(key)
		if (cached) return cached
		let quantities = context.quantities.get(key)
		if (!quantities) {
			quantities = {
				date,
				forecastFrom: from,
				mode,
				positions: combinePositions(
					context.holdings.before(date),
					mode === 'forecast' ? context.forecast.between(from, date) : []
				)
			}
			context.quantities.set(key, quantities)
			context.stats.quantityReads++
		}
		let overdue = context.overdue.get(from)
		if (!overdue) {
			overdue = context.forecast.overdue(from)
			context.overdue.set(from, overdue)
		}
		const catalogs = context.stores.resourceStores!
		let projection = context.projections.get(key)
		if (!projection) {
			projection = projectResourceQuantities(quantities, {
				resources: catalogs.resourcesStore.list,
				accounts: catalogs.accountsStore.list,
				balanceCategories: catalogs.balanceCategoriesStore.list
			})
			context.projections.set(key, projection)
		}
		const { included, ...groups } = projection
		const report = freezeSnapshot({
			...quantities,
			documentId,
			timezone: data.timezone,
			valuationBasis: 'current-prices' as const,
			priceSnapshot: context.valuation.snapshot,
			...groups,
			grandTotal: context.valuation.value(included),
			overdue
		})
		context.reports.set(key, report)
		context.stats.reportReads++
		return report
	}
	get(documentId: string, date?: string, options: ResourceBalanceOptions = {}): ReadonlyJson<ResourceBalanceReport> {
		const { context, data } = this.ensure(documentId)
		const from = documentDate(options.forecastFrom ?? documentToday(data.timezone, new Date(this.clock.now)))
		return this.report(documentId, context, data, documentDate(date ?? from), from, options.mode ?? 'forecast')
	}
	range(
		documentId: string,
		begin: string,
		end: string,
		options: ResourceBalanceOptions = {}
	): readonly ReadonlyJson<ResourceBalanceReport>[] {
		begin = documentDate(begin)
		end = documentDate(end)
		const start = DateTime.YYYYMMDDToTimestampUTC(begin),
			finish = DateTime.YYYYMMDDToTimestampUTC(end)
		if (finish < start || (finish - start) / 86400 > RESOURCE_BALANCE_CACHE_CAPACITY)
			throw new Error('Диапазон календаря должен содержать от 0 до 512 дней')
		const { context, data } = this.ensure(documentId)
		const from = documentDate(options.forecastFrom ?? documentToday(data.timezone, new Date(this.clock.now)))
		const result: ReadonlyJson<ResourceBalanceReport>[] = []
		for (let date = start; date < finish; date += 86400) {
			const day = DateTime.getUTCYearMonthDay(date)
			const label = `${String(day.year).padStart(4, '0')}.${String(day.month + 1).padStart(2, '0')}.${String(day.day).padStart(2, '0')}`
			result.push(this.report(documentId, context, data, label, from, options.mode ?? 'forecast'))
		}
		return Object.freeze(result)
	}
	diagnostics(documentId: string) {
		const { context } = this.ensure(documentId)
		return {
			...context.stats,
			documents: this.contexts.size,
			quantities: context.quantities.size,
			projections: context.projections.size,
			reports: context.reports.size,
			overdue: context.overdue.size,
			schedules: context.forecast.cacheSize
		}
	}
}
