import React from 'react'
import { createRoot } from 'react-dom/client'
import { createApplication } from 'src/1-app/root'
import StoreProvider from 'src/1-app/Providers/StoreProvider'
import App from 'src/1-app/App/App'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { resourceBalanceDocument, balancePlan } from './resourceBalanceDocument'
import 'src/1-app/index.css'

/** Только внутренний браузерный стенд; production entry не включает этот модуль. */
async function mount() {
	DateTime.initLocale(3)
	const app = createApplication({
		documentRuntime: createResourceDocumentRuntime({
			id: 'catalog-browser',
			currency: { code: 'RUB', scale: 2 },
			currencyConfirmed: true,
			asOf: '2026.11.01',
			timezone: 'Europe/Moscow'
		})
	})
	await app.stores.documentTabsStore.restoreFromLocalStorage()
	app.stores.uiStore.changeViewMode({ mode: 'Accounts' })
	app.stores.eventsCache.start()
	const container = document.createElement('div')
	container.id = 'root'
	document.body.append(container)
	const root = createRoot(container)
	root.render(
		<StoreProvider {...app.stores}>
			<App />
		</StoreProvider>
	)
	return app
}
Object.assign(window, { __catalog: { mount, resourceBalanceDocument, balancePlan } })
