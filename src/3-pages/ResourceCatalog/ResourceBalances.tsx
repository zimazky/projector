import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreContext'
import Button from 'src/7-shared/ui/Button/Button'
import { documentToday } from 'src/6-entities/Operations/ResourceOperationCommands'
import type { ResourceQuantity } from 'src/6-entities/EventsCache/ResourceBalance.types'
import type { ReadonlyJson } from 'src/6-entities/Resources/DocumentCatalogStore'
import styles from '../../5-features/ResourceCatalog/ResourceCatalog.module.css'

const ResourceBalances = observer(function ResourceBalances({ onAdjust }: { onAdjust(): void }) {
	const { documentTabsStore: tabs, eventsCache } = useStores()
	const [selectedDate, setDate] = React.useState('')
	const [mode, setMode] = React.useState<'actual' | 'forecast'>('actual')
	const document = tabs.activeDocument
	const catalogs = tabs.getActiveDocumentStores()?.resourceStores
	if (!document || !catalogs || !('schemaVersion' in document.data)) return null
	const today = documentToday(document.data.timezone, new Date(eventsCache.resourceBalances.clock.now))
	const date = selectedDate || today.replaceAll('.', '-')
	const report = eventsCache.resourceBalances.get(document.id, date.replaceAll('-', '.'), { mode })
	const quantity = (rows: readonly ReadonlyJson<ResourceQuantity>[]) =>
		rows.map(row => {
			const resource = catalogs.resourcesStore.getById(row.resourceId)!
			return (
				<li key={row.resourceId}>
					{resource.name}: {row.quantity} {catalogs.unitsStore.getById(resource.unitId)?.symbol}
				</li>
			)
		})
	return (
		<>
			<div className={styles.actions}>
				<label>
					Дата границы <input type="date" value={date} onChange={event => setDate(event.target.value)} />
				</label>
				<label>
					Режим{' '}
					<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
						<option value="actual">Фактические остатки</option>
						<option value="forecast">Прогноз</option>
					</select>
				</label>
				<Button onClick={onAdjust}>Изменить остаток</Button>
			</div>
			<p>
				На начало {report.date}, до операций этого дня. Прогноз включает планы с {report.forecastFrom}; просроченные
				планы показаны отдельно.
			</p>
			<p>Оценка по текущим ценам справочника, включая прошлые даты.</p>
			<p data-testid="resource-grand-total">
				{report.grandTotal.complete ? 'Общий баланс' : 'Известная часть баланса'}: {report.grandTotal.amount}{' '}
				{catalogs.resourcesStore.getById(report.grandTotal.currencyResourceId)?.name}
			</p>
			{!report.grandTotal.complete && (
				<div role="status">
					<p>Оценка неполная. Не оценены:</p>
					<ul>
						{report.grandTotal.unvaluedPositions.map((row, i) => (
							<li key={i}>
								{catalogs.resourcesStore.getById(row.resourceId)?.name}: {row.quantity} — нет подходящей цены
							</li>
						))}
					</ul>
				</div>
			)}
			<h2>По счетам</h2>
			{report.accounts
				.filter(row => row.showInSummary)
				.map(row => (
					<div key={row.accountId}>
						<h3>{catalogs.accountsStore.getById(row.accountId)?.name}</h3>
						<ul>{quantity(row.resources)}</ul>
					</div>
				))}
			<h2>По категориям счетов</h2>
			{report.accountCategories.map(row => (
				<div key={row.categoryId}>
					<h3>
						{catalogs.balanceCategoriesStore.getById(row.categoryId)?.name}
						{!row.includeInGrandTotal && ' · вне общего баланса'}
					</h3>
					<ul>{quantity(row.resources)}</ul>
				</div>
			))}
			<h2>По категориям ресурсов</h2>
			<p>Это другая группировка тех же позиций; подытоги двух группировок не складываются.</p>
			{report.resourceCategories.map(row => (
				<div key={row.categoryId}>
					<h3>
						{catalogs.balanceCategoriesStore.getById(row.categoryId)?.name}
						{!row.includeInGrandTotal && ' · вне общего баланса'}
					</h3>
					<ul>{quantity(row.resources)}</ul>
				</div>
			))}
			<h2>Не распределено</h2>
			{report.unassigned.length ? <ul>{quantity(report.unassigned)}</ul> : <p>Нераспределённых движений нет.</p>}
			<h2>Просроченные планы</h2>
			{report.overdue.length ? (
				<ul>
					{report.overdue.map(row => (
						<li key={row.eventUid}>
							{row.name} · с {row.start} · вхождений: {row.occurrenceCount}
						</li>
					))}
				</ul>
			) : (
				<p>Просроченных планов нет.</p>
			)}
		</>
	)
})

export default ResourceBalances
