import React from 'react'
import { expect, test } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import Dialog from './Dialog'
import Modal from '../Modal/Modal'

test.each([Dialog, Modal])('повторное открытие %p отменяет старый таймер закрытия', Component => {
	jest.useFakeTimers()
	try {
		const view = render(<Component open>Save dialog</Component>)
		view.rerender(<Component open={false}>Save dialog</Component>)
		act(() => jest.advanceTimersByTime(100))
		view.rerender(<Component open>Save dialog</Component>)
		act(() => jest.advanceTimersByTime(300))
		expect(screen.queryByText('Save dialog')).not.toBeNull()
		view.rerender(<Component open={false}>Save dialog</Component>)
		view.unmount()
		expect(jest.getTimerCount()).toBe(0)
	} finally {
		jest.useRealTimers()
	}
})
