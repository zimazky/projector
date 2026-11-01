import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App/App'

import './index.css'

import { createApplication } from './root'
import StoreProvider from './Providers/StoreProvider'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Не найден DOM элемент #root')

const root = createRoot(rootElement)

const application = createApplication()
application.start()
root.render(
	<StoreProvider {...application.stores}>
		<App />
	</StoreProvider>
)

const hot = (module as NodeModule & { hot?: { dispose(callback: () => void): void } }).hot
if (hot) {
	hot.dispose(() => {
		root.unmount()
		application.dispose()
	})
}
