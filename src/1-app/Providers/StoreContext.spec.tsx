import React from 'react'
import { renderHook } from '@testing-library/react'
import { useStores } from './StoreContext'
import StoreProvider from './StoreProvider'
import { createApplication } from '../root'

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
