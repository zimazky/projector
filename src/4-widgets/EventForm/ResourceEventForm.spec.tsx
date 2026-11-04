import React from 'react'
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createApplication, type Application } from 'src/1-app/root'
import StoreProvider from 'src/1-app/Providers/StoreProvider'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import { resourceBalanceDocument, balancePlan } from 'src/test-utils/resourceBalanceDocument'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import ResourceEventForm from './ResourceEventForm'

let app: Application
beforeEach(() => {
	localStorage.clear()
	DateTime.initLocale(3)
	app = createApplication({
		documentRuntime: createResourceDocumentRuntime({
			id: 'form',
			currency: { code: 'RUB', scale: 2 },
			currencyConfirmed: true,
			asOf: '2026.11.01',
			timezone: 'Europe/Moscow'
		})
	})
	app.stores.documentTabsStore.openNewDocument()
	const data = resourceBalanceDocument()
	data.plannedList = [
		balancePlan(
			'series',
			'2026.11.01',
			'RUB',
			'-25',
			{ kind: 'account-category', categoryId: 'everyday' },
			{ repeat: '/1' }
		)
	]
	app.stores.documentTabsStore.applyContentToDocument(app.stores.documentTabsStore.activeDocumentId!, data)
	app.stores.eventFormStore.openEvent(app.stores.eventsCache.getEvents(DateTime.YYYYMMDDToTimestamp('2026.11.04'))[0])
})
afterEach(() => {
	cleanup()
	app.dispose()
})

it('completes a selected series occurrence with fresh movement IDs; original series remains', () => {
	render(
		<StoreProvider {...app.stores}>
			<ResourceEventForm />
		</StoreProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }))
	fireEvent.change(screen.getByLabelText('Дата финансового учёта'), { target: { value: '2026-11-04' } })
	fireEvent.change(within(screen.getByRole('group', { name: 'Сторона 1' })).getByLabelText('Счёт'), {
		target: { value: 'card' }
	})
	fireEvent.click(screen.getByRole('button', { name: 'Подтвердить выполнение' }))
	expect(screen.queryByRole('alert')).toBeNull()
	const saved = app.stores.documentTabsStore.getDocumentDataForSave()!
	expect(saved.completedList).toHaveLength(1)
	expect(saved.completedList[0].occurrence).toEqual({ seriesUid: 'series:series', occurrenceDate: '2026.11.04' })
	const actualIds = saved.completedList[0].actualOperation!.movements.map(row => row.id)
	expect(
		saved.plannedList
			.flatMap(event => event.plannedOperation!.movements.map(row => row.id))
			.some(id => actualIds.includes(id))
	).toBe(false)
	expect(app.stores.eventsCache.getEvents(DateTime.YYYYMMDDToTimestamp('2026.11.05'))).toHaveLength(1)
})

it('edits only the selected occurrence and retains the schedule on surrounding dates', () => {
	render(
		<StoreProvider {...app.stores}>
			<ResourceEventForm />
		</StoreProvider>
	)
	fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Один особый день' } })
	fireEvent.click(screen.getByRole('button', { name: 'Сохранить вхождение' }))
	expect(screen.queryByRole('alert')).toBeNull()
	expect(app.stores.eventsCache.getEvents(DateTime.YYYYMMDDToTimestamp('2026.11.04'))[0].name).toBe('Один особый день')
	expect(app.stores.eventsCache.getEvents(DateTime.YYYYMMDDToTimestamp('2026.11.05'))[0].name).toBe('series')
})

it('rejects save after replacement without losing typed fields', () => {
	render(
		<StoreProvider {...app.stores}>
			<ResourceEventForm />
		</StoreProvider>
	)
	fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Устаревшая правка' } })
	act(() => {
		const tabs = app.stores.documentTabsStore
		tabs.applyContentToDocument(tabs.activeDocumentId!, tabs.getDocumentDataForSave())
	})
	fireEvent.click(screen.getByRole('button', { name: 'Сохранить вхождение' }))
	expect(screen.getByRole('alert')).toHaveTextContent('Откройте карточку заново')
	expect(screen.getByLabelText('Название')).toHaveValue('Устаревшая правка')
	expect(app.stores.documentTabsStore.getDocumentDataForSave()!.plannedList[0].name).toBe('series')
})
