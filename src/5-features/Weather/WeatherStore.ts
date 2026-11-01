import { makeAutoObservable, runInAction } from 'mobx'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { max, min } from 'src/7-shared/helpers/utils'
import OpenWeatherMap, { type OpenWeatherMapResponse } from 'src/7-shared/services/openweathermap'

/** Погодные условия, аггрегированные за день */
export type ForecastData1d = {
	/** Временная метка дня, unixtime, UTC */
	timestamp: number
	/** Минимальная температура за день */
	temperatureMin: number
	/** Максимальная температура за день */
	temperatureMax: number
	/** Минимальная влажность за день в % */
	humidityMin: number
	/** Максимальная влажность за день в % */
	humidityMax: number
	/** Облачность в % */
	clouds: number
	/** Вероятность осадков 0..1 */
	pop: number
	/** Количество осадков в виде дождя в мм */
	rain: number
	/** Количество осадков в виде снега в мм */
	snow: number
	/** Признак грозы */
	isThunderstorm: boolean
	/** Строка с иконками emoji */
	emoji: string
	/** Число выборок в пределах дня */
	count: number
}

/** Погодные условия за 3 часа */
export type ForecastData3h = {
	/** Временная метка времени, unixtime, UTC */
	timestamp: number
	/** Минимальная температура, С */
	temperatureMin: number
	/** Максимальная температура, С */
	temperatureMax: number
	/** Влажность в % */
	humidity: number
	/** Облачность в % */
	clouds: number
	/** Вероятность осадков 0..1 */
	pop: number
	/** Количество осадков в виде дождя в мм */
	rain: number
	/** Количество осадков в виде снега в мм */
	snow: number
	/** Признак грозы */
	isThunderstorm: boolean
	/** Строка с иконками emoji */
	emoji: string
}

export class WeatherStore {
	/**
	 * Состояние хранилища
	 * 'undefined' - данные не определены
	 * 'pending'   - ожидание
	 * 'ready'     - данные получены
	 * 'error'     - произошла ошибка
	 */
	state: 'undefined' | 'pending' | 'ready' | 'error' = 'undefined'
	/** Наименование локации */
	locationName: string = 'Ольховец'
	/** Широта локации */
	lat: number = 58.666408
	/** Долгота локации */
	lon: number = 32.366389
	/** Данные прогноза погоды на 5-6 дней, аггрегированные по дням */
	data1d: ForecastData1d[] = []
	/** Данные прогноза погоды на 5-6 дней по интервалам 3h */
	data3h: ForecastData3h[] = []
	/** Сообщение без URL запроса и ключа API. */
	errorMessage: string | null = null
	private requestId = 0
	private disposed = false
	private requestController: AbortController | null = null

	constructor() {
		makeAutoObservable<this, 'requestId'>(this, { requestId: false })
	}

	/** Установка локации */
	setLocation(lat: number, lon: number, name: string) {
		this.requestId++
		this.requestController?.abort()
		this.errorMessage = null
		this.lat = lat
		this.lon = lon
		this.locationName = name
		this.state = 'undefined'
		this.data1d = []
		this.data3h = []
	}

	/** Загрузка данных прогноза погоды */
	loadForecast = async (): Promise<void> => {
		if (this.disposed) return
		const requestId = ++this.requestId
		this.requestController?.abort()
		const controller = new AbortController()
		this.requestController = controller
		const { lat, lon } = this
		this.state = 'pending'
		this.errorMessage = null
		const isCurrent = () => requestId === this.requestId && lat === this.lat && lon === this.lon
		try {
			const forecast = await OpenWeatherMap.getForecast(lat, lon, 'metric', controller.signal)
			if (!isCurrent()) return
			const { data1d, data3h } = buildSnapshot(forecast)
			runInAction(() => {
				this.data1d = data1d
				this.data3h = data3h
				this.state = 'ready'
			})
		} catch {
			if (!isCurrent()) return
			runInAction(() => {
				this.state = 'error'
				this.errorMessage = 'Не удалось загрузить погоду. Повторите запрос.'
			})
		} finally {
			if (this.requestController === controller) this.requestController = null
		}
	}

	dispose(): void {
		this.disposed = true
		this.requestId++
		this.requestController?.abort()
		this.requestController = null
		if (this.state === 'pending') this.state = 'undefined'
	}
}

/** Снимок строится целиком до публикации; дни совпадают с часовым поясом календаря. */
function buildSnapshot(forecast: OpenWeatherMapResponse) {
	const data3h: ForecastData3h[] = forecast.list.map(d => {
		const rain = d.rain?.['3h'] ?? 0
		const snow = d.snow?.['3h'] ?? 0
		const isThunderstorm = d.weather.some(w => 200 <= w.id && w.id < 300)
		return {
			timestamp: d.dt,
			temperatureMin: d.main.temp_min,
			temperatureMax: d.main.temp_max,
			humidity: d.main.humidity,
			clouds: d.clouds.all,
			pop: d.pop,
			rain,
			snow,
			isThunderstorm,
			emoji: defineEmoji(d.clouds.all, rain, snow, isThunderstorm)
		}
	})
	data3h.sort((a, b) => a.timestamp - b.timestamp)
	const days = new Map<number, ForecastData1d>()
	for (const d of data3h) {
		const timestamp = DateTime.getBeginDayTimestamp(d.timestamp)
		const day = days.get(timestamp)
		if (!day) {
			days.set(timestamp, {
				...d,
				timestamp,
				humidityMin: d.humidity,
				humidityMax: d.humidity,
				count: 1
			})
		} else {
			day.temperatureMin = min(day.temperatureMin, d.temperatureMin)
			day.temperatureMax = max(day.temperatureMax, d.temperatureMax)
			day.humidityMin = min(day.humidityMin, d.humidity)
			day.humidityMax = max(day.humidityMax, d.humidity)
			day.clouds = (day.clouds * day.count + d.clouds) / (day.count + 1)
			day.pop = max(day.pop, d.pop)
			day.rain += d.rain
			day.snow += d.snow
			day.isThunderstorm ||= d.isThunderstorm
			day.emoji = defineEmoji(day.clouds, day.rain, day.snow, day.isThunderstorm)
			day.count++
		}
	}
	return { data1d: Array.from(days.values()), data3h }
}

// Иконки '☀️', '🌤️', '⛅', '☁️', '🌦️', '🌧️', '🌩️', '⛈️', '🌨️'

function defineEmoji(clouds: number, rain: number, snow: number, isThunderstorm: boolean): string {
	const cloudiness = clouds < 10 ? '☀️' : clouds < 30 ? '🌤️' : clouds < 70 ? '⛅' : '☁️'
	return cloudiness + (rain > 0 ? '💧' : '') + (snow > 0 ? '❄️' : '') + (isThunderstorm ? '⚡' : '')
}
