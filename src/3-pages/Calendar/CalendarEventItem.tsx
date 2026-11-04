import React from 'react'
import { observer } from 'mobx-react-lite'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import { useStores } from 'src/1-app/Providers/StoreContext'
import { EventCacheStructure } from 'src/6-entities/EventsCache/EventCacheStructure'
import styles from './CalendarEventItem.module.css'
import { describeMovements } from 'src/6-entities/Resources/ResourcePresentation'

type CalendarEventItemProps = {
	/** Данные события из кэша */
	event: EventCacheStructure
	/** Метка времени дня, unixtime */
	timestamp: timestamp
	/** Продолжительность события в днях в пределах текущей недели */
	daysInCurrentWeek: number
}

const CalendarEventItem: React.FC<CalendarEventItemProps> = observer(props => {
	const { eventFormStore, documentTabsStore, eventSearchStore } = useStores()
	const { timestamp, daysInCurrentWeek: daysInCurrentWeek } = props
	const { id, name, completed, background, color, repeatable, start, time, end, credit, debit, days } = props.event

	// Проверяем, подсвечено ли это событие поиском
	const isHighlighted = eventSearchStore.isHighlighted(id, timestamp)
	const catalogs = documentTabsStore.getDocumentStores(
		props.event.sourceDocumentId ?? documentTabsStore.activeDocumentId ?? ''
	)?.resourceStores
	const movements = describeMovements(
		props.event.financial?.actualOperation ?? props.event.financial?.plannedOperation,
		catalogs
	)
	const financialDate = props.event.financial?.actualOperation?.effectiveDate ?? DateTime.getYYYYMMDD(start)

	const openEventForm = (e: React.SyntheticEvent<HTMLElement>) => {
		e.stopPropagation()
		eventFormStore.openEvent(props.event)
	}

	const onDragStart = (e: React.DragEvent<HTMLElement>) => {
		e.dataTransfer.setData(
			'event_item',
			JSON.stringify(catalogs ? { resourceDragToken: eventFormStore.beginDrag(props.event) } : props.event)
		)
	}

	return id === -1 ? (
		<div className={styles.placeholder}></div>
	) : (
		<div
			role="button"
			aria-label={name}
			tabIndex={0}
			className={`${completed ? styles.completed : repeatable ? styles.repeatable : styles.item} ${isHighlighted ? styles.highlighted : ''}`}
			draggable={true}
			onDragStart={onDragStart}
			style={{
				width:
					props.daysInCurrentWeek == 1
						? 'calc(100% + 2px)'
						: 'calc(' + props.daysInCurrentWeek + ' * (100% + 1px) + 1px )',
				backgroundColor: background,
				color: color
			}}
			onClick={openEventForm}
			onKeyDown={event => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault()
					openEventForm(event)
				}
			}}
			title={
				name +
				(movements.length
					? '\n' + movements.join('\n') + `\n${completed ? 'Дата учёта' : 'Дата плана'}: ${financialDate}`
					: '') +
				(time !== null ? '\ntime: ' + DateTime.secondsToHMM(time) : '') +
				(credit ? '\ncredit: ' + credit : '') +
				(debit ? '\ndebit: ' + debit : '')
			}
		>
			<div className={styles.name}>
				{timestamp - start === 0 || props.event.accountingOnly
					? name
					: `${(timestamp - start) / 86400 + 1}/${(end - start) / 86400} ${name}`}
			</div>{' '}
			<div className={styles.time}>
				{movements.length
					? movements.map(row => row.split(' · ')[0]).join(' / ')
					: time === null
						? days - daysInCurrentWeek > 0
							? ` ${(timestamp - start) / 86400 + props.daysInCurrentWeek}/${(end - start) / 86400}`
							: ''
						: DateTime.secondsToHMM(time)}
			</div>
		</div>
	)
})

export default CalendarEventItem
