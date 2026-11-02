import React from 'react'
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createApplication, type Application } from 'src/1-app/root'
import StoreProvider from 'src/1-app/Providers/StoreProvider'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import { resourceBalanceDocument, balanceActual, balancePlan } from 'src/test-utils/resourceBalanceDocument'
import ResourceCatalogPage from './ResourceCatalogPage'
import ResourceBalances from './ResourceBalances'

let app: Application
beforeEach(() => {
	localStorage.clear()
	app = createApplication({
		documentRuntime: createResourceDocumentRuntime({
			id: 'ui-test',
			currency: { code: 'RUB', scale: 2 },
			currencyConfirmed: true,
			asOf: '2026.11.01',
			timezone: 'Europe/Moscow'
		})
	})
})
afterEach(() => {
	cleanup()
	app.dispose()
})

it('catalog pages tolerate no document', () => {
	render(
		<StoreProvider {...app.stores}>
			<ResourceCatalogPage section="Accounts" />
		</StoreProvider>
	)
	expect(screen.getByText('Откройте документ с учётом ресурсов, чтобы настроить справочники.')).toBeVisible()
	expect(screen.queryByRole('button', { name: 'Добавить счёт' })).toBeNull()
})

it('visibility changes update mounted balances without changing the grand total', () => {
	const tabs = app.stores.documentTabsStore
	tabs.openNewDocument()
	const id = tabs.activeDocumentId!,
		data = resourceBalanceDocument()
	data.completedList = [balanceActual('money', '2026.11.01', 'card', 'RUB', '100')]
	tabs.applyContentToDocument(id, data)
	render(
		<StoreProvider {...app.stores}>
			<ResourceBalances onAdjust={() => {}} />
		</StoreProvider>
	)
	fireEvent.change(screen.getByLabelText('Дата границы'), { target: { value: '2026-11-03' } })
	expect(screen.getByRole('heading', { name: 'Карта' })).toBeVisible()
	expect(screen.getByTestId('resource-grand-total')).toHaveTextContent('Общий баланс: 100 Рубли')
	act(() =>
		tabs.editDocument(id, draft => {
			if ('schemaVersion' in draft) draft.balanceCategories.find(row => row.id === 'everyday')!.showInSummary = false
		})
	)
	expect(screen.queryByRole('heading', { name: 'Карта' })).toBeNull()
	expect(screen.getByTestId('resource-grand-total')).toHaveTextContent('Общий баланс: 100 Рубли')
})

it('returning from warnings retains all unsaved input', () => {
	const tabs = app.stores.documentTabsStore
	tabs.openNewDocument()
	const data = resourceBalanceDocument()
	data.plannedList = [balancePlan('Покупка', '2026.11.10', 'RUB', '-10', { kind: 'account', accountId: 'card' })]
	tabs.applyContentToDocument(tabs.activeDocumentId!, data)
	render(
		<StoreProvider {...app.stores}>
			<ResourceCatalogPage section="Accounts" />
		</StoreProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Изменить счёт Карта' }))
	fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Изменённая карта' } })
	fireEvent.click(screen.getByLabelText('В архиве'))
	fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
	expect(screen.getByText(/План «Покупка»/)).toBeVisible()
	fireEvent.click(screen.getByRole('button', { name: 'Вернуться к форме' }))
	expect(screen.getByLabelText('Название')).toHaveValue('Изменённая карта')
	expect(screen.getByLabelText('В архиве')).toBeChecked()
})
