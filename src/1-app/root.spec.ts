import { createApplication } from './root'
import GAPI from 'src/7-shared/services/gapi'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { LocalDocumentPersistence, type DocumentPersistence } from 'src/6-entities/Document/model/DocumentPersistence'
import type { DocumentTabsSnapshot } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import { deferred } from 'src/test-utils/deferred'
import OpenWeatherMap from 'src/7-shared/services/openweathermap'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import type { DocumentRuntime } from 'src/6-entities/Document/model/DocumentRuntime'

describe('Явный жизненный цикл приложения', () => {
	beforeEach(() => {
		localStorage.clear()
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	function setup(persistence?: DocumentPersistence, documentRuntime?: DocumentRuntime) {
		const api = new GoogleApiService()
		const init = jest.spyOn(GAPI, 'init').mockImplementation(async ({ onSuccess }) => {
			onSuccess?.()
		})
		jest.spyOn(GAPI, 'isLoggedIn').mockReturnValue(false)
		const app = createApplication({ googleApiService: api, persistence, documentRuntime })
		return { app, api, init }
	}

	it('импорт root не создаёт сервисы и не читает хранилище', () => {
		const init = jest.spyOn(GAPI, 'init')
		const load = jest.spyOn(LocalDocumentPersistence.prototype, 'load')
		jest.isolateModules(() => require('./root'))
		expect(init).not.toHaveBeenCalled()
		expect(load).not.toHaveBeenCalled()
		expect(document.querySelectorAll('script')).toHaveLength(0)
		expect(jest.getTimerCount()).toBe(0)
	})

	it('создание изолировано; повторный start не дублирует загрузку и таймер', () => {
		const persistence = { load: jest.fn(() => null), save: jest.fn(), clear: jest.fn(), exportSource: () => '' }
		const { app, init } = setup(persistence)
		const other = setup().app
		expect(init).not.toHaveBeenCalled()
		expect(persistence.load).not.toHaveBeenCalled()
		expect(jest.getTimerCount()).toBe(0)
		app.start()
		app.start()
		expect(init).toHaveBeenCalledTimes(1)
		expect(persistence.load).toHaveBeenCalledTimes(1)
		expect(jest.getTimerCount()).toBe(1)
		app.stores.documentTabsStore.openNewDocument()
		expect(other.stores.documentTabsStore.documents).toHaveLength(0)
		app.dispose()
		app.dispose()
		app.start()
		expect(init).toHaveBeenCalledTimes(1)
		expect(jest.getTimerCount()).toBe(0)
		expect(persistence.clear).not.toHaveBeenCalled()
		other.dispose()
	})

	it('часы прогноза запускаются только во внутреннем ресурсном режиме и освобождаются вместе с приложением', () => {
		const documentRuntime = createResourceDocumentRuntime({
			id: 'clock-test',
			currency: { code: 'RUB', scale: 2 },
			currencyConfirmed: true,
			asOf: '2026.11.01',
			timezone: 'Europe/Moscow'
		})
		const { app } = setup(undefined, documentRuntime)
		expect(jest.getTimerCount()).toBe(0)
		app.start()
		app.start()
		expect(jest.getTimerCount()).toBe(2)
		jest.advanceTimersByTime(30000)
		expect(app.stores.eventsCache.resourceBalances.clock.now).toBe(Date.now())
		app.dispose()
		expect(jest.getTimerCount()).toBe(0)
	})

	it('dispose снимает online/offline и reaction, сохраняя последнюю локальную сессию', async () => {
		const { app, api } = setup()
		const { documentTabsStore: tabs, eventSearchStore: search } = app.stores
		const remove = jest.spyOn(window, 'removeEventListener')
		app.start()
		tabs.openNewDocument()
		const id = tabs.activeDocumentId
		search.setQuery('test')
		const source = localStorage.getItem('documentTabs')
		app.dispose()
		expect(remove.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['online', 'offline']))
		expect(search.isSearchPending).toBe(false)
		api.isGoogleLoggedIn = true
		window.dispatchEvent(new Event('online'))
		jest.advanceTimersByTime(60_000)
		expect(jest.getTimerCount()).toBe(0)
		expect(localStorage.getItem('documentTabs')).toBe(source)
		expect(tabs.documents[0].id).toBe(id)
	})

	it('позднее восстановление после dispose не устанавливает и не перезаписывает снимок', async () => {
		const loaded = deferred<DocumentTabsSnapshot | null>()
		const persistence = { load: () => loaded.promise, save: jest.fn(), clear: jest.fn(), exportSource: () => '' }
		const { app } = setup(persistence)
		app.start()
		app.dispose()
		loaded.resolve({ schemaVersion: 3, documents: [], documentOrder: [], activeDocumentId: null, savedAt: 1 })
		await loaded.promise
		await Promise.resolve()
		expect(app.stores.documentTabsStore.documents).toHaveLength(0)
		expect(app.stores.documentTabsStore.isRestoringLocalSession).toBe(false)
		expect(persistence.save).not.toHaveBeenCalled()
	})

	it('dispose не прерывает уже поставленную в очередь локальную запись', async () => {
		const written = deferred<void>()
		const persistence = {
			load: () => null,
			save: jest.fn(() => written.promise),
			clear: jest.fn(),
			exportSource: () => ''
		}
		const { app } = setup(persistence)
		app.start()
		app.stores.documentTabsStore.openNewDocument()
		app.dispose()
		written.resolve()
		expect(await app.stores.documentTabsStore.waitForLocalPersistence()).toBe(true)
		expect(persistence.save).toHaveBeenCalledTimes(1)
		expect(persistence.clear).not.toHaveBeenCalled()
	})

	it('dispose отменяет погоду и игнорирует поздний ответ', async () => {
		const forecast = deferred<any>()
		const get = jest.spyOn(OpenWeatherMap, 'getForecast').mockReturnValue(forecast.promise)
		const { app } = setup()
		const weather = app.stores.weatherStore
		const pending = weather.loadForecast()
		const signal = get.mock.calls[0][3]!
		app.dispose()
		expect(signal.aborted).toBe(true)
		forecast.resolve({ list: [] })
		await pending
		expect(weather.state).toBe('undefined')
		expect(weather.data1d).toEqual([])
	})
})
