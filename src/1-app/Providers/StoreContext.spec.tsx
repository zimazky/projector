import React from 'react'
import { renderHook } from '@testing-library/react'
import { useStores, useDocumentStores } from './StoreContext'
import StoreProvider from './StoreProvider'
import { createApplication } from '../root'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'

it('useStores сообщает об отсутствующем провайдере', () => {
	const error = jest.spyOn(console, 'error').mockImplementation(() => {})
	try {
		expect(() => renderHook(() => useStores())).toThrow('внутри StoreProvider')
	} finally {
		error.mockRestore()
	}
})

it('useStores возвращает зависимости своего провайдера', () => {
	const app = createApplication()
	const { result, unmount } = renderHook(() => useStores(), {
		wrapper: ({ children }) => <StoreProvider {...app.stores}>{children}</StoreProvider>
	})
	expect(result.current.documentTabsStore).toBe(app.stores.documentTabsStore)
	unmount()
	app.dispose()
})

it('провайдер ресурсного режима удерживает исходный документ при переключении вкладки', () => {
	const app = createApplication({
		documentRuntime: createResourceDocumentRuntime({
			id: 'provider-test',
			currency: { code: 'RUB', scale: 2 },
			currencyConfirmed: true,
			asOf: '2026.11.01',
			timezone: 'Europe/Moscow'
		})
	})
	const tabs = app.stores.documentTabsStore
	tabs.openNewDocument('Первый')
	const firstId = tabs.activeDocumentId!
	const { result, rerender, unmount } = renderHook(
		() => ({ source: useDocumentStores(firstId), active: useDocumentStores() }),
		{
			wrapper: ({ children }) => <StoreProvider {...app.stores}>{children}</StoreProvider>
		}
	)
	const first = result.current.source
	expect(first!.resourceStores).toBeDefined()
	tabs.openNewDocument('Второй')
	rerender()
	expect(result.current.source).toBe(first)
	expect(result.current.active!.documentId).toBe(tabs.activeDocumentId)
	expect(result.current.active).not.toBe(first)
	unmount()
	app.dispose()
})
