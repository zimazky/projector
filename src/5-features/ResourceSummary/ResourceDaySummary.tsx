import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreContext'
import type { ResourceBalanceReport, ResourceQuantity } from 'src/6-entities/EventsCache/ResourceBalance.types'
import type { ReadonlyJson } from 'src/6-entities/Resources/DocumentCatalogStore'
import { valuationLabel } from 'src/6-entities/Resources/ResourcePresentation'
import styles from './ResourceDaySummary.module.css'

const ResourceDaySummary = observer(function ResourceDaySummary({
	report,
	compact = false
}: {
	report: ReadonlyJson<ResourceBalanceReport>
	compact?: boolean
}) {
	const { documentTabsStore: tabs, eventsCache } = useStores()
	const catalogs = tabs.getDocumentStores(report.documentId)?.resourceStores
	if (!catalogs) return null
	const quantities = (rows: readonly ReadonlyJson<ResourceQuantity>[]) =>
		rows.map(row => `${catalogs.resourcesStore.getById(row.resourceId)?.name}: ${row.quantity}`).join(', ')
	const groups = report.accountCategories.map(
		row => `${catalogs.balanceCategoriesStore.getById(row.categoryId)?.name}: ${quantities(row.resources)}`
	)
	const unvalued = report.grandTotal.unvaluedPositions.map(
		row => `${catalogs.resourcesStore.getById(row.resourceId)?.name}: ${row.quantity}`
	)
	const title = [
		`На начало ${report.date}. Текущая оценка.`,
		...groups,
		...(unvalued.length ? ['Без оценки: ' + unvalued.join('; ')] : [])
	].join('\n')
	if (compact)
		return (
			<span title={title} data-testid="resource-day-balance">
				{!report.grandTotal.complete && 'Часть: '}
				{valuationLabel(report, catalogs)}
			</span>
		)
	const actual = eventsCache.resourceBalances.get(report.documentId, report.date, { mode: 'actual' })
	return (
		<section className={styles.summary} aria-label="Баланс дня">
			<div className={styles.totals}>
				<div>
					<span>Факт на начало дня</span>
					<strong data-testid="day-actual-total">{valuationLabel(actual, catalogs)}</strong>
				</div>
				<div>
					<span>{report.grandTotal.complete ? 'Прогноз на начало дня' : 'Известная часть прогноза'}</span>
					<strong data-testid="day-forecast-total">{valuationLabel(report, catalogs)}</strong>
				</div>
			</div>
			<p>Текущие цены справочника · планы с {report.forecastFrom} · просроченные планы не переносятся автоматически</p>
			{unvalued.length > 0 && <p role="status">Нет оценки: {unvalued.join('; ')}. Количества сохранены.</p>}
			<details>
				<summary>Состав баланса и обязательства</summary>
				<h3>По счетам</h3>
				<ul>
					{report.accounts
						.filter(row => row.showInSummary)
						.map(row => (
							<li key={row.accountId}>
								<b>{catalogs.accountsStore.getById(row.accountId)?.name}</b>
								<span>
									{quantities(row.resources) || 'Нет позиций'}
									{!row.includeInGrandTotal && ' · вне общего баланса'}
								</span>
							</li>
						))}
				</ul>
				<div className={styles.groups}>
					<section>
						<h3>По категориям счетов</h3>
						<ul>
							{report.accountCategories.map(row => (
								<li key={row.categoryId}>
									<b>{catalogs.balanceCategoriesStore.getById(row.categoryId)?.name}</b>
									<span>
										{quantities(row.resources) || 'Нет позиций'}
										{!row.includeInGrandTotal && ' · вне общего баланса'}
									</span>
								</li>
							))}
						</ul>
					</section>
					<section>
						<h3>По категориям ресурсов</h3>
						<ul>
							{report.resourceCategories.map(row => (
								<li key={row.categoryId}>
									<b>{catalogs.balanceCategoriesStore.getById(row.categoryId)?.name}</b>
									<span>
										{quantities(row.resources) || 'Нет позиций'}
										{!row.includeInGrandTotal && ' · вне общего баланса'}
									</span>
								</li>
							))}
						</ul>
					</section>
				</div>
				<p>Обе группировки описывают одни позиции; их итоги не складываются.</p>
				<h3>Не распределено</h3>
				<p>{quantities(report.unassigned) || 'Нераспределённых движений нет.'}</p>
				<h3>Просроченные планы</h3>
				{report.overdue.length ? (
					<ul>
						{report.overdue.map(row => (
							<li key={row.eventUid}>
								{row.name} · {row.occurrenceCount} вхождений · {row.start}
							</li>
						))}
					</ul>
				) : (
					<p>Просроченных планов нет.</p>
				)}
			</details>
		</section>
	)
})
export default ResourceDaySummary
