import React from 'react'

import { max, throttle } from 'src/7-shared/helpers/utils'
import { CalendarStore } from './CalendarStore'

type CalendarWeek = {
	maxCount: number
	list: { timestamp: number }[]
}

interface UseCalendarScrollParams {
	calendarStore: CalendarStore
	calendarWeeks: CalendarWeek[]
	zeroPoint: number
}

export function useCalendarScroll({ calendarStore, calendarWeeks, zeroPoint }: UseCalendarScrollParams) {
	const onScrollHandle = React.useCallback(
		throttle((e: React.UIEvent<HTMLElement>) => {
			const el = e.currentTarget
			const t = el.scrollTop
			const b = el.scrollHeight - el.scrollTop - el.clientHeight

			const sumN = calendarWeeks.reduce((a, w) => a + max(w.maxCount + 3, 7 + 3), 0)
			const hAvg = el.scrollHeight / sumN

			let i = 0
			for (let H = t; H > 0; i++) {
				H -= hAvg * max(calendarWeeks[i].maxCount + 3, 7 + 3)
			}

			const w = Math.ceil(i - calendarStore.shift)
			const d = new Date((zeroPoint + w * 7 * 86400) * 1000)
			calendarStore.setMonthYear(d.getMonth(), d.getFullYear())

			const avgDayHeight = el.scrollHeight / calendarWeeks.length
			calendarStore.correctShift(t / avgDayHeight, b / avgDayHeight)
		}, 100),
		[calendarStore, calendarWeeks, zeroPoint]
	)

	return { onScrollHandle }
}
