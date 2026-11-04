import React from 'react'
import { observer } from 'mobx-react-lite'
import DateTime, { type timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import type { EventCacheStructure } from 'src/6-entities/EventsCache/EventCacheStructure'
import { useStores } from 'src/1-app/Providers/StoreContext'
import { describeMovements } from 'src/6-entities/Resources/ResourcePresentation'
import styles from './DayListEventItem.module.css'

const DayListEventItem = observer(function DayListEventItem({
	event,
	timestamp
}: {
	event: EventCacheStructure
	timestamp: timestamp
}) {
	const { eventFormStore, documentTabsStore: tabs, eventSearchStore: search } = useStores()
	const stores = tabs.getDocumentStores(event.sourceDocumentId ?? tabs.activeDocumentId ?? '')
	const dto = stores?.eventsStore.getEventDto(event.id)
	const project = dto && stores?.projectsStore.getById(dto.projectId ?? 'default')
	const movement = event.financial?.actualOperation ?? event.financial?.plannedOperation
	const descriptions = describeMovements(movement, stores?.resourceStores)
	const accountingDate = event.financial?.actualOperation?.effectiveDate
	const date = DateTime.getYYYYMMDD(timestamp)
	const highlight = search.isHighlighted(event.id, event.repeatable ? timestamp : event.start)
	const open = () => eventFormStore.openEvent(event)
	return (
		<button
			type="button"
			aria-label={event.name}
			data-testid="day-event"
			onClick={open}
			className={`${event.completed ? styles.completed : event.repeatable ? styles.repeatable : styles.item} ${highlight ? styles.highlighted : ''}`}
			style={{ backgroundColor: event.background, color: event.color }}
		>
			<span className={styles.time}>{event.time === null ? 'Весь день' : DateTime.secondsToHMM(event.time)}</span>
			<span className={styles.name}>{event.name}</span>
			<span className={styles.status}>
				{event.completed ? '✓ Выполнено' : event.repeatable ? '↻ По расписанию' : '○ План'}
			</span>
			<span className={styles.meta}>
				{project ? `Проект: ${project.name}` : 'Без проекта'}
				{event.days > 1 || event.start < timestamp
					? ` · с ${DateTime.getYYYYMMDD(event.start)} до ${DateTime.getYYYYMMDD(event.end)}`
					: ''}
				{accountingDate ? ` · учёт ${accountingDate}${accountingDate !== date ? ' (другая дата)' : ''}` : ''}
			</span>
			{descriptions.length ? (
				<span className={styles.movements}>
					{descriptions.map((text, index) => (
						<span key={index}>{text}</span>
					))}
				</span>
			) : event.credit || event.debit ? (
				<span className={styles.movements}>
					{event.credit ? `+${event.credit.toFixed(2)}` : ''}
					{event.debit ? ` −${event.debit.toFixed(2)}` : ''}
				</span>
			) : null}
			{dto?.comment && <span className={styles.comment}>{dto.comment}</span>}
		</button>
	)
})
export default DayListEventItem
