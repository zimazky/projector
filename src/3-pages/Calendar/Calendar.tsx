import React, { useRef } from 'react'
import { observer } from 'mobx-react-lite'

import { max, min } from 'src/7-shared/helpers/utils'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { useStores } from 'src/1-app/Providers/StoreContext'

import CalendarDay from './CalendarDay'
import CalendarEventItem from './CalendarEventItem'

import styles from './Calendar.module.css'
import { useCalendarScroll } from './useCalendarScroll'

const Calendar: React.FC = observer(function () {
	const { calendarStore, eventFormStore, documentTabsStore, eventsCache } = useStores()
	const eventsStore = documentTabsStore.activeEventsStore
	const bodyRef = useRef<HTMLDivElement | null>(null)
	const [dragError, setDragError] = React.useState('')

	const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)
	const zeroPoint = calendarStore.week
	const scrollRequest = calendarStore.scrollRequest

	const calendarWeeks = calendarStore.getCalendarDataStructure(zeroPoint)
	const { onScrollHandle } = useCalendarScroll({ calendarStore, calendarWeeks, zeroPoint })

	React.useEffect(() => {
		const container = bodyRef.current
		if (!container) return
		const selector = `[data-week-timestamp="${scrollRequest?.week ?? zeroPoint}"]`
		const weekDiv = container.querySelector<HTMLElement>(selector)
		weekDiv?.scrollIntoView({ block: 'start' })
	}, [zeroPoint, scrollRequest])

	const dragDrop = (e: React.DragEvent<HTMLElement>, timestamp: timestamp) => {
		e.preventDefault()
		if (!eventsStore) return
		console.log(e.dataTransfer)
		const payload = e.dataTransfer.getData('event_item')
		if (!payload) return
		let c: { resourceDragToken?: string; id: number; start: number }
		try {
			c = JSON.parse(payload)
		} catch {
			return
		}
		if (c.resourceDragToken) {
			try {
				eventFormStore.dropResource(c.resourceDragToken, timestamp, e.ctrlKey)
				setDragError('')
			} catch (cause) {
				setDragError(cause instanceof Error ? cause.message : 'Не удалось перенести событие.')
			}
			return
		}
		if (eventsCache.resourceDocumentId) {
			setDragError('Перенос устарел. Перетащите событие заново.')
			return
		}
		if (e.ctrlKey) eventsStore.copyToDate(c.id, timestamp)
		else eventsStore.shiftToDate(c.id, timestamp, c.start)
	}

	console.log('draw calendar')

	return (
		<div className={styles.wrapper}>
			{dragError && <p role="alert">{dragError}</p>}
			<div className={styles.dayOfWeekLabels}>
				{DateTime.getWeekdaysArray().map(d => (
					<div key={d}>{d}</div>
				))}
			</div>
			<div ref={bodyRef} className={styles.CalendarBody} onScroll={onScrollHandle}>
				{calendarWeeks.map(week => (
					<div
						data-week-timestamp={week.list[0].timestamp}
						className={styles.CalendarWeek}
						key={week.list[0].timestamp}
						style={{ height: max(week.maxCount, 7) * 1.5 + 1.6 + 1.6 + 1.6 + 'em' }}
					>
						{' '}
						{week.list.map((d, j) => (
							<CalendarDay
								data={d}
								key={d.timestamp}
								isToday={today === d.timestamp}
								onDragDrop={e => dragDrop(e, d.timestamp)}
							>
								{d.events.map((t, i) => (
									<CalendarEventItem
										key={i}
										event={t}
										daysInCurrentWeek={t.financial ? 1 : min(t.days, 7 - j)}
										timestamp={d.timestamp}
									/>
								))}
							</CalendarDay>
						))}
					</div>
				))}
			</div>
		</div>
	)
})

export default Calendar
