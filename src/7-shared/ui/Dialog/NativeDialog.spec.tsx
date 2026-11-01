import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Dialog from './Dialog'
import Modal from '../Modal/Modal'
import Drawer from '../Drawer/Drawer'
import YesCancelConfirmation from '../YesCancelConfirmation/YesCancelConfirmation'
import YesNoCancelConfirmation from '../YesNoCancelConfirmation/YesNoCancelConfirmation'

it.each([Dialog, Modal, Drawer])('opens only while controlled open and has an accessible name: %p', Component => {
	const view = render(
		<Component open={false} aria-label="Example">
			Content
		</Component>
	)
	expect(screen.queryByRole('dialog')).toBeNull()
	view.rerender(
		<Component open aria-label="Example">
			Content
		</Component>
	)
	expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
	view.rerender(
		<Component open={false} aria-label="Example">
			Content
		</Component>
	)
	expect(screen.queryByRole('dialog')).toBeNull()
})

it('links a visible title and focuses the explicit safe action', () => {
	render(
		<Dialog open title="Confirm">
			<button>Destructive</button>
			<button data-dialog-initial-focus>Cancel</button>
		</Dialog>
	)
	expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
})

it('links confirmation text as an accessible description', () => {
	const view = render(<YesCancelConfirmation open>Delete the selected event?</YesCancelConfirmation>)
	expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Delete the selected event?')
	view.rerender(
		<YesNoCancelConfirmation open onDecision={() => {}}>
			Save the local changes?
		</YesNoCancelConfirmation>
	)
	expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Save the local changes?')
})

it('restores focus after React removes the portal and remains correct in StrictMode', () => {
	function Example() {
		const [open, setOpen] = React.useState(false)
		return (
			<>
				<button onClick={() => setOpen(true)}>Open</button>
				<Dialog open={open} onClose={() => setOpen(false)} title="Example">
					<button data-dialog-initial-focus onClick={() => setOpen(false)}>
						Cancel
					</button>
				</Dialog>
			</>
		)
	}
	render(
		<React.StrictMode>
			<Example />
		</React.StrictMode>
	)
	const trigger = screen.getByRole('button', { name: 'Open' })
	trigger.focus()
	fireEvent.click(trigger)
	expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
	expect(trigger).toHaveFocus()
	expect(screen.queryByRole('dialog')).toBeNull()
})

it('cancels only the top dialog and does not dismiss a busy operation', () => {
	const parentClose = jest.fn()
	const childClose = jest.fn()
	const view = render(
		<Dialog open title="Parent" onClose={parentClose}>
			<Dialog open title="Child" onClose={childClose}>
				<button>Child action</button>
			</Dialog>
		</Dialog>
	)
	const event = new Event('cancel', { bubbles: true, cancelable: true })
	fireEvent(screen.getByRole('dialog', { name: 'Child' }), event)
	expect(event.defaultPrevented).toBe(true)
	expect(childClose).toHaveBeenCalledTimes(1)
	expect(parentClose).not.toHaveBeenCalled()
	view.rerender(
		<Dialog open dismissible={false} title="Parent" onClose={parentClose}>
			<button>Busy</button>
		</Dialog>
	)
	fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
	expect(parentClose).not.toHaveBeenCalled()
})

it('dismisses by backdrop only, and honours a non-dismissible operation', () => {
	const close = jest.fn()
	const view = render(
		<Dialog open onClose={close} title="Example">
			<button>Inside</button>
		</Dialog>
	)
	fireEvent.click(screen.getByRole('button'))
	expect(close).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('dialog'))
	expect(close).toHaveBeenCalledTimes(1)
	view.rerender(
		<Dialog open onClose={close} dismissible={false} title="Example">
			<button>Inside</button>
		</Dialog>
	)
	fireEvent.click(screen.getByRole('dialog'))
	expect(close).toHaveBeenCalledTimes(1)
})

it.each([Dialog, Modal, Drawer])('rapid close/reopen has no delayed close or remaining timers: %p', Component => {
	jest.useFakeTimers()
	try {
		const view = render(<Component open>Content</Component>)
		view.rerender(<Component open={false}>Content</Component>)
		act(() => jest.advanceTimersByTime(100))
		view.rerender(<Component open>Content</Component>)
		act(() => jest.advanceTimersByTime(1000))
		expect(screen.getByRole('dialog')).toBeInTheDocument()
		view.unmount()
		expect(jest.getTimerCount()).toBe(0)
	} finally {
		jest.useRealTimers()
	}
})
