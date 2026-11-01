import { autorun } from 'mobx'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import OpenWeatherMap, { type OpenWeatherMapResponse } from 'src/7-shared/services/openweathermap'
import { deferred } from 'src/test-utils/deferred'
import { weatherForecast, weatherInterval } from 'src/test-utils/weatherForecast'
import { WeatherStore } from './WeatherStore'

describe('WeatherStore', () => {
	const timezone = DateTime.timezone
	const day = Date.UTC(2026, 10, 1) / 1000
	let getForecast: jest.SpiedFunction<typeof OpenWeatherMap.getForecast>

	beforeEach(() => {
		DateTime.timezone = 0
		getForecast = jest.spyOn(OpenWeatherMap, 'getForecast')
	})

	afterEach(() => {
		jest.restoreAllMocks()
		DateTime.timezone = timezone
	})

	it('replaces both arrays on reload and publishes a coherent snapshot', async () => {
		const store = new WeatherStore()
		getForecast.mockResolvedValue(weatherForecast(weatherInterval(day), weatherInterval(day + 10800)))
		await store.loadForecast()
		const previous1d = store.data1d
		const previous3h = store.data3h
		const published: number[][] = []
		const dispose = autorun(() => {
			if (store.state === 'ready') published.push([store.data1d[0].count, store.data3h.length])
		})
		getForecast.mockResolvedValue(weatherForecast(weatherInterval(day + 86400)))
		await store.loadForecast()
		dispose()
		expect(store.data1d).not.toBe(previous1d)
		expect(store.data3h).not.toBe(previous3h)
		expect(previous3h).toHaveLength(2)
		expect(store.data3h.map(d => d.timestamp)).toEqual([day + 86400])
		expect(published).toEqual([
			[2, 2],
			[1, 1]
		])
	})

	it.each([0, 3, 5.5, -7])('groups exact midnight, gaps and unordered intervals in timezone %s', async zone => {
		DateTime.timezone = zone
		const midnight = day - zone * 3600
		const store = new WeatherStore()
		getForecast.mockResolvedValue(
			weatherForecast(weatherInterval(midnight + 4 * 86400), weatherInterval(midnight), weatherInterval(midnight - 1))
		)
		await store.loadForecast()
		expect(store.data1d.map(d => d.timestamp)).toEqual([midnight - 86400, midnight, midnight + 4 * 86400])
		expect(store.data1d.map(d => d.count)).toEqual([1, 1, 1])
		expect(store.data3h.map(d => d.timestamp)).toEqual([midnight - 1, midnight, midnight + 4 * 86400])
	})

	it('aggregates extremes, weighted clouds, precipitation and storm icons', async () => {
		const store = new WeatherStore()
		getForecast.mockResolvedValue(
			weatherForecast(
				weatherInterval(day, { rain: { '3h': 1 }, clouds: { all: 0 } }),
				weatherInterval(day + 10800, {
					main: { temp_min: -2, temp_max: 15, humidity: 90 },
					clouds: { all: 100 },
					pop: 0.9,
					snow: { '3h': 2 },
					weather: [{ id: 211 }]
				}),
				weatherInterval(day + 21600, { rain: { '3h': 3 }, clouds: { all: 20 } })
			)
		)
		await store.loadForecast()
		expect(store.data1d[0]).toMatchObject({
			timestamp: day,
			temperatureMin: -2,
			temperatureMax: 15,
			humidityMin: 60,
			humidityMax: 90,
			clouds: 40,
			pop: 0.9,
			rain: 4,
			snow: 2,
			isThunderstorm: true,
			emoji: '⛅💧❄️⚡',
			count: 3
		})
		expect(store.data3h[0]).toMatchObject({ snow: 0, isThunderstorm: false })
	})

	it('handles network failure without rejecting the UI command and allows retry', async () => {
		const store = new WeatherStore()
		getForecast.mockRejectedValueOnce(new Error('Network with secret URL'))
		await expect(store.loadForecast()).resolves.toBeUndefined()
		expect(store.state).toBe('error')
		expect(store.errorMessage).toBe('Не удалось загрузить погоду. Повторите запрос.')
		getForecast.mockResolvedValue(weatherForecast(weatherInterval(day)))
		await store.loadForecast()
		expect(store.state).toBe('ready')
		expect(store.errorMessage).toBeNull()
	})

	it('preserves the previous complete snapshot when the next request fails', async () => {
		const store = new WeatherStore()
		getForecast.mockResolvedValueOnce(weatherForecast(weatherInterval(day)))
		await store.loadForecast()
		const previous1d = store.data1d
		const previous3h = store.data3h
		getForecast.mockRejectedValueOnce(new Error('invalid response'))
		await store.loadForecast()
		expect(store.state).toBe('error')
		expect(store.data1d).toBe(previous1d)
		expect(store.data3h).toBe(previous3h)
	})

	it.each(['resolve', 'reject'] as const)(
		'ignores late %s after changing location without a new request',
		async finish => {
			const store = new WeatherStore()
			const old = deferred<OpenWeatherMapResponse>()
			getForecast.mockReturnValueOnce(old.promise)
			const pending = store.loadForecast()
			store.setLocation(10, 20, 'New location')
			if (finish === 'resolve') old.resolve(weatherForecast(weatherInterval(day)))
			else old.reject(new Error('old error'))
			await pending
			expect(store.state).toBe('undefined')
			expect(store.errorMessage).toBeNull()
			expect(store.data1d).toEqual([])
			expect(store.data3h).toEqual([])
		}
	)

	it.each(['resolve', 'reject'] as const)(
		'ignores late %s from a previous location, even after returning to it',
		async finish => {
			const store = new WeatherStore()
			const { lat, lon, locationName } = store
			const old = deferred<OpenWeatherMapResponse>()
			getForecast.mockReturnValueOnce(old.promise)
			const first = store.loadForecast()
			store.setLocation(1, 2, 'Temporary')
			store.setLocation(lat, lon, locationName)
			getForecast.mockResolvedValueOnce(weatherForecast(weatherInterval(day + 86400)))
			await store.loadForecast()
			if (finish === 'resolve') old.resolve(weatherForecast(weatherInterval(day)))
			else old.reject(new Error('old error'))
			await first
			expect(store.state).toBe('ready')
			expect(store.data3h.map(d => d.timestamp)).toEqual([day + 86400])
			expect(store.errorMessage).toBeNull()
		}
	)

	it.each(['resolve', 'reject'] as const)('keeps the latest same-location result after late %s', async finish => {
		const store = new WeatherStore()
		const old = deferred<OpenWeatherMapResponse>()
		getForecast.mockReturnValueOnce(old.promise)
		const first = store.loadForecast()
		getForecast.mockResolvedValueOnce(weatherForecast(weatherInterval(day + 86400)))
		await store.loadForecast()
		if (finish === 'resolve') old.resolve(weatherForecast(weatherInterval(day)))
		else old.reject(new Error('old error'))
		await first
		expect(store.state).toBe('ready')
		expect(store.data3h.map(d => d.timestamp)).toEqual([day + 86400])
	})

	it('does not clear pending or error of the latest request when an old success arrives', async () => {
		const store = new WeatherStore()
		const old = deferred<OpenWeatherMapResponse>()
		const current = deferred<OpenWeatherMapResponse>()
		getForecast.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
		const first = store.loadForecast()
		const second = store.loadForecast()
		old.resolve(weatherForecast(weatherInterval(day)))
		await first
		expect(store.state).toBe('pending')
		expect(store.data3h).toEqual([])
		current.reject(new Error('current error'))
		await second
		expect(store.state).toBe('error')
	})

	it.each(['resolve', 'reject'] as const)('preserves the latest error after late %s', async finish => {
		const store = new WeatherStore()
		const old = deferred<OpenWeatherMapResponse>()
		getForecast.mockReturnValueOnce(old.promise)
		const first = store.loadForecast()
		getForecast.mockRejectedValueOnce(new Error('current error'))
		await store.loadForecast()
		if (finish === 'resolve') old.resolve(weatherForecast(weatherInterval(day)))
		else old.reject(new Error('old error'))
		await first
		expect(store.state).toBe('error')
		expect(store.errorMessage).toBe('Не удалось загрузить погоду. Повторите запрос.')
		expect(store.data3h).toEqual([])
	})
})
