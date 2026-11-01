import type { Forecast, OpenWeatherMapResponse } from 'src/7-shared/services/openweathermap'

export function weatherInterval(dt: number, overrides: Partial<Forecast> = {}): Forecast {
	return {
		dt,
		main: { temp_min: 5, temp_max: 10, humidity: 60 },
		clouds: { all: 20 },
		pop: 0.2,
		weather: [{ id: 800 }],
		...overrides
	}
}

export function weatherForecast(...list: Forecast[]): OpenWeatherMapResponse {
	return { list }
}
