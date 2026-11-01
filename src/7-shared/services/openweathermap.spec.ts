import OpenWeatherMap from './openweathermap'
import { weatherForecast, weatherInterval } from 'src/test-utils/weatherForecast'

describe('OpenWeatherMap', () => {
	const originalFetch = global.fetch
	const dt = Date.UTC(2026, 10, 1) / 1000
	let fetchMock: jest.Mock
	const respond = (body: unknown, status = 200) => {
		const json = jest.fn().mockResolvedValue(body)
		fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json })
		return json
	}

	beforeEach(() => {
		jest.useFakeTimers()
		fetchMock = jest.fn()
		global.fetch = fetchMock
	})
	afterEach(() => {
		global.fetch = originalFetch
		jest.useRealTimers()
	})

	it('accepts optional missing precipitation, normalizes only used fields and clears timeout', async () => {
		respond({ cod: '200', city: { unused: true }, list: [weatherInterval(dt)] })
		await expect(OpenWeatherMap.getForecast(12, 34)).resolves.toEqual(weatherForecast(weatherInterval(dt)))
		expect(fetchMock.mock.calls[0][0]).toContain('lat=12&lon=34&units=metric')
		expect(jest.getTimerCount()).toBe(0)
	})

	it.each([401, 429, 500])('rejects HTTP %s before reading JSON', async status => {
		const json = respond({ message: 'must not be shown' }, status)
		await expect(OpenWeatherMap.getForecast(0, 0)).rejects.toThrow('HTTP ' + status)
		expect(json).not.toHaveBeenCalled()
		expect(jest.getTimerCount()).toBe(0)
	})

	it('rejects invalid JSON and clears timeout', async () => {
		fetchMock.mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError('bad JSON')) })
		await expect(OpenWeatherMap.getForecast(0, 0)).rejects.toThrow(SyntaxError)
		expect(jest.getTimerCount()).toBe(0)
	})

	it('propagates network errors and clears timeout', async () => {
		fetchMock.mockRejectedValue(new TypeError('network'))
		await expect(OpenWeatherMap.getForecast(0, 0)).rejects.toThrow('network')
		expect(jest.getTimerCount()).toBe(0)
	})

	it.each([
		null,
		[],
		{},
		{ cod: '401', list: [weatherInterval(dt)] },
		{ list: [] },
		{ list: [null] },
		{ list: [weatherInterval(dt), weatherInterval(dt)] },
		{ list: [weatherInterval(dt, { dt: NaN })] },
		{ list: [weatherInterval(dt, { dt: 0.5 })] },
		{ list: [weatherInterval(dt, { dt: 9e12 })] },
		{ list: [weatherInterval(dt, { main: { temp_min: 5, temp_max: 4, humidity: 50 } })] },
		{ list: [weatherInterval(dt, { main: { temp_min: 5, temp_max: Infinity, humidity: 50 } })] },
		{ list: [weatherInterval(dt, { main: { temp_min: 5, temp_max: 6, humidity: 101 } })] },
		{ list: [weatherInterval(dt, { clouds: { all: -1 } })] },
		{ list: [weatherInterval(dt, { pop: '0.5' as unknown as number })] },
		{ list: [weatherInterval(dt, { pop: 1.1 })] },
		{ list: [weatherInterval(dt, { weather: [] })] },
		{ list: [weatherInterval(dt, { weather: [{ id: 200.5 }] })] },
		{ list: [weatherInterval(dt, { rain: {} as { '3h': number } })] },
		{ list: [weatherInterval(dt, { snow: { '3h': -1 } })] },
		{ list: [weatherInterval(dt), weatherInterval(dt + 10800, { pop: NaN })] }
	])('rejects malformed forecast %#', async body => {
		respond(body)
		await expect(OpenWeatherMap.getForecast(0, 0)).rejects.toThrow('Некорректный ответ')
		expect(jest.getTimerCount()).toBe(0)
	})

	it.each(['headers', 'body'])('aborts a stalled request during %s after 15 seconds', async stage => {
		fetchMock.mockImplementation((_url, { signal }: RequestInit) => {
			const waitForAbort = () =>
				new Promise((_resolve, reject) => {
					signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
				})
			return stage === 'headers' ? waitForAbort() : Promise.resolve({ ok: true, json: waitForAbort })
		})
		const request = OpenWeatherMap.getForecast(0, 0)
		const rejection = expect(request).rejects.toThrow('aborted')
		await jest.advanceTimersByTimeAsync(15000)
		await rejection
		expect(jest.getTimerCount()).toBe(0)
	})
})
