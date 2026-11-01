import React from 'react'
import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import Time from './Time'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(new Date('2026-11-01T12:34:50.250Z'))
})
afterEach(() => jest.useRealTimers())

it.each([false, true])('cleans the minute timer before/after its first tick: %s', afterTick => {
	const view = render(<Time />)
	expect(jest.getTimerCount()).toBe(1)
	if (afterTick) act(() => jest.advanceTimersByTime(9750))
	expect(jest.getTimerCount()).toBe(1)
	view.unmount()
	expect(jest.getTimerCount()).toBe(0)
})

it('keeps a single aligned timer through StrictMode remount and successive minutes', () => {
	const view = render(
		<React.StrictMode>
			<Time />
		</React.StrictMode>
	)
	expect(screen.getByRole('button')).toHaveTextContent(DateTime.getHHMM(Date.now() / 1000))
	expect(jest.getTimerCount()).toBe(1)
	act(() => jest.advanceTimersByTime(9749))
	expect(screen.getByRole('button')).toHaveTextContent(DateTime.getHHMM(Date.now() / 1000))
	act(() => jest.advanceTimersByTime(1))
	expect(screen.getByRole('button')).toHaveTextContent(DateTime.getHHMM(Date.now() / 1000))
	act(() => jest.advanceTimersByTime(120000))
	expect(screen.getByRole('button')).toHaveTextContent(DateTime.getHHMM(Date.now() / 1000))
	expect(jest.getTimerCount()).toBe(1)
	view.unmount()
	expect(jest.getTimerCount()).toBe(0)
})
