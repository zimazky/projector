import React, { useContext, useRef } from 'react'
import { observer } from 'mobx-react-lite'

import { max, min } from 'src/7-shared/helpers/utils'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import useUpdate from 'src/7-shared/hooks/useUpdate'

import Modal from 'src/7-shared/ui/Modal/Modal'

import { StoreContext } from 'src/1-app/Providers/StoreContext'

import EventForm from 'src/4-widgets/EventForm/EventForm'

import CalendarDay from './CalendarDay'
import CalendarEventItem from './CalendarEventItem'

import styles from './Calendar.module.css'
import { useCalendarScroll } from './useCalendarScroll'

const Calendar: React.FC = observer(function () {
	const forceUpdate = useUpdate()
	const { calendarStore, eventFormStore, documentTabsStore, uiStore } = useContext(StoreContext)
	const stores = documentTabsStore.getActiveDocumentStores()
	const eventsStore = stores?.eventsStore
	const bodyRef = useRef<HTMLDivElement | null>(null)

	const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)
	const zeroPoint = calendarStore.week

	const calendarWeeks = calendarStore.getCalendarDataStructure(zeroPoint)
	const { onScrollHandle } = useCalendarScroll({ calendarStore, calendarWeeks, zeroPoint })

	React.useEffect(() => {
		const container = bodyRef.current
		if (!container) return
		const selector = `[data-week-timestamp="${calendarStore.week}"]`
		const weekDiv = container.querySelector<HTMLElement>(selector)
		weekDiv?.scrollIntoView({ block: 'start' })
	}, [calendarStore.week, uiStore.mustForceUpdate])

	const dragDrop = (e: React.DragEvent<HTMLElement>, timestamp: timestamp) => {
		e.preventDefault()
		console.log(e.dataTransfer)
		const c = JSON.parse(e.dataTransfer.getData('event_item'))
		if (!eventsStore) return
		if (e.ctrlKey) eventsStore.copyToDate(c.id, timestamp)
		else eventsStore.shiftToDate(c.id, timestamp, c.start)
		forceUpdate()
	}

	console.log('draw calendar')

	return (
		<div className={styles.wrapper}>
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
									<CalendarEventItem key={i} event={t} daysInCurrentWeek={min(t.days, 7 - j)} timestamp={d.timestamp} />
								))}
							</CalendarDay>
						))}
					</div>
				))}
			</div>
			<Modal open={eventFormStore.isShow} onClose={eventFormStore.hideForm}>
				<EventForm />
			</Modal>
		</div>
	)
})

export default Calendar
