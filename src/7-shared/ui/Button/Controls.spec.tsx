import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Button from './Button'
import TextButton from './TextButton'
import IconButton from '../IconButton/IconButton'
import ListItem from '../List/ListItem'
import DayButton from '../DatePicker/DayButton'
import Tabs from '../Tabs/Tabs'
import { IDriveItem } from 'src/7-shared/types/IDriveItem'
import FileList from '../FileList/FileList'

const controls = [Button, TextButton, IconButton, ListItem, DayButton]

function pointer(element: HTMLElement, name: string) {
	const event = new Event(name, { bubbles: true })
	Object.assign(event, { isPrimary: true, clientX: 5, clientY: 5 })
	fireEvent(element, event)
}

describe.each(controls)('%p native button contract', Component => {
	it('applies disabled and suppresses click, double click and ripple', () => {
		const command = jest.fn()
		render(
			<Component disabled onClick={command} onDoubleClick={command}>
				Action
			</Component>
		)
		const button = screen.getByRole('button')
		expect(button).toBeDisabled()
		fireEvent.click(button)
		fireEvent.doubleClick(button)
		pointer(button, 'pointerdown')
		expect(command).not.toHaveBeenCalled()
		expect(button.querySelector('.ripple')).toBeNull()
	})

	it('forwards native attributes and restores ordinary Tab navigation', () => {
		const command = jest.fn()
		render(
			<Component onClick={command} aria-label="Named action" title="Help">
				Action
			</Component>
		)
		const button = screen.getByRole('button', { name: 'Named action' })
		expect(button).toHaveAttribute('type', 'button')
		expect(button.tabIndex).toBe(0)
		expect(button).toHaveAttribute('title', 'Help')
		fireEvent.click(button)
		expect(command).toHaveBeenCalledTimes(1)
	})

	it('removes ripple timers and nodes on unmount', () => {
		jest.useFakeTimers()
		try {
			const view = render(<Component>Action</Component>)
			const button = screen.getByRole('button')
			pointer(button, 'pointerdown')
			expect(button.querySelector('.ripple')).not.toBeNull()
			pointer(button, 'pointerup')
			expect(jest.getTimerCount()).toBe(1)
			view.unmount()
			expect(jest.getTimerCount()).toBe(0)
			expect(button.querySelector('.ripple')).toBeNull()
			act(() => jest.advanceTimersByTime(1000))
		} finally {
			jest.useRealTimers()
		}
	})
})

it('forwards a ref and form attributes without accidental submit by default', () => {
	const ref = React.createRef<HTMLButtonElement>()
	render(
		<Button ref={ref} form="target-form" type="submit" name="save">
			Save
		</Button>
	)
	expect(ref.current).toBe(screen.getByRole('button'))
	expect(ref.current).toHaveAttribute('form', 'target-form')
	expect(ref.current).toHaveAttribute('type', 'submit')
})

it('tabs support click, arrow keys, Home/End and skip absent labels', () => {
	const onChange = jest.fn()
	render(<Tabs value={0} labels={['First', null, 'Last']} onChange={onChange} />)
	const tabs = screen.getAllByRole('tab')
	fireEvent.click(tabs[1])
	expect(onChange).toHaveBeenLastCalledWith(expect.anything(), 2)
	tabs[0].focus()
	fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
	expect(tabs[1]).toHaveFocus()
	expect(onChange).toHaveBeenLastCalledWith(expect.anything(), 2)
	fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
	expect(tabs[0]).toHaveFocus()
	fireEvent.keyDown(tabs[0], { key: 'End' })
	expect(tabs[1]).toHaveFocus()
	fireEvent.keyDown(tabs[1], { key: 'Home' })
	expect(tabs[0]).toHaveFocus()
	fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
	expect(tabs[1]).toHaveFocus()
})

it('file folders open with Enter while Space retains native selection behavior', () => {
	const item = { id: 'folder', name: 'Folder', isFolder: () => true } as IDriveItem
	const select = jest.fn()
	const open = jest.fn()
	render(<FileList items={[item]} selectedItem={null} onItemClick={select} onItemDoubleClick={open} />)
	const button = screen.getByRole('button', { name: /Folder/ })
	fireEvent.keyDown(button, { key: 'Enter' })
	expect(open).toHaveBeenCalledWith(item)
	expect(select).not.toHaveBeenCalled()
	fireEvent.click(button)
	expect(select).toHaveBeenCalledWith(item)
})
