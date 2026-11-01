const API_KEY: string = process.env.OPEN_WEATHER_KEY ?? ''
const REQUEST_TIMEOUT_MS = 15000

/** Проверяемая часть ответа, используемая календарём. */
export type Forecast = {
	dt: number
	main: { temp_min: number; temp_max: number; humidity: number }
	weather: { id: number }[]
	clouds: { all: number }
	pop: number
	rain?: { '3h': number }
	snow?: { '3h': number }
}

export type OpenWeatherMapResponse = { list: Forecast[] }

const invalidResponse = () => new Error('Некорректный ответ сервиса погоды.')
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const inRange = (value: unknown, min: number, max: number): value is number =>
	isFiniteNumber(value) && value >= min && value <= max

function precipitation(value: unknown): { '3h': number } | undefined {
	if (value === undefined) return undefined
	if (!isRecord(value) || !isFiniteNumber(value['3h']) || value['3h'] < 0) throw invalidResponse()
	return { '3h': value['3h'] }
}

/** Не публикуем частичный прогноз, если хотя бы один интервал повреждён. */
function parseForecast(value: unknown): OpenWeatherMapResponse {
	if (
		!isRecord(value) ||
		(value.cod !== undefined && value.cod !== '200' && value.cod !== 200) ||
		!Array.isArray(value.list) ||
		value.list.length === 0
	)
		throw invalidResponse()
	const timestamps = new Set<number>()
	const list = value.list.map((entry: unknown): Forecast => {
		if (
			!isRecord(entry) ||
			!isFiniteNumber(entry.dt) ||
			!Number.isSafeInteger(entry.dt) ||
			!Number.isFinite(new Date(entry.dt * 1000).getTime()) ||
			timestamps.has(entry.dt) ||
			!isRecord(entry.main) ||
			!isFiniteNumber(entry.main.temp_min) ||
			!isFiniteNumber(entry.main.temp_max) ||
			entry.main.temp_min > entry.main.temp_max ||
			!inRange(entry.main.humidity, 0, 100) ||
			!isRecord(entry.clouds) ||
			!inRange(entry.clouds.all, 0, 100) ||
			!inRange(entry.pop, 0, 1) ||
			!Array.isArray(entry.weather) ||
			entry.weather.length === 0
		)
			throw invalidResponse()
		timestamps.add(entry.dt)
		const weather = entry.weather.map((condition: unknown) => {
			if (!isRecord(condition) || !inRange(condition.id, 0, 999) || !Number.isInteger(condition.id))
				throw invalidResponse()
			return { id: condition.id }
		})
		return {
			dt: entry.dt,
			main: { temp_min: entry.main.temp_min, temp_max: entry.main.temp_max, humidity: entry.main.humidity },
			clouds: { all: entry.clouds.all },
			pop: entry.pop,
			weather,
			rain: precipitation(entry.rain),
			snow: precipitation(entry.snow)
		}
	})
	return { list }
}

export default class OpenWeatherMap {
	/** Прогноз на пять дней с шагом три часа; таймаут покрывает и чтение тела. */
	static async getForecast(lat: number, lon: number, units: Units = 'metric'): Promise<OpenWeatherMapResponse> {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		try {
			const response = await fetch(
				`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`,
				{ signal: controller.signal }
			)
			if (!response.ok) throw new Error('Сервис погоды недоступен (HTTP ' + response.status + ').')
			return parseForecast(await response.json())
		} finally {
			clearTimeout(timeout)
		}
	}
}

type Units = 'standard' | 'metric' | 'imperial'
