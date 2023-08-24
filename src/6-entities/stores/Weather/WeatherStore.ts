import {makeAutoObservable, runInAction} from 'mobx'

import DateTime from 'src/7-shared/helpers/DateTime'
import { max, min } from 'src/7-shared/helpers/utils'
import OpenWeatherMap from 'src/7-shared/services/openweathermap'

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

  constructor() {
    makeAutoObservable(this)
  }

  /** Установка локации */
  setLocation(lat: number, lon: number, name: string) {
    this.lat = lat
    this.lon = lon
    this.locationName = name
    this.state = 'undefined'
    this.data1d = []
    this.data3h = []
  }

  /** Загрузка данных прогноза погоды */
  loadForecast = async () => {
    this.state = 'pending'
    const f = await OpenWeatherMap.getForecast(this.lat, this.lon)
    runInAction(()=>{
      let t = DateTime.getBeginDayTimestamp(Date.now()/1000)
      this.state = 'ready'
      this.data1d = []
      console.log(f)
      f.list.forEach(d => {
        let clouds = d.clouds.all
        const rain = d.rain ? d.rain['3h'] : 0
        const snow = d.snow ? d.snow['3h'] : 0
        const isThunderstorm = d.weather.reduce((a, w) => a || (200 <= w.id && w.id < 300), false)
        // прогноз с периодом 3 часа
        this.data3h.push({
          timestamp: d.dt,
          temperatureMin: d.main.temp_min,
          temperatureMax: d.main.temp_max,
          humidity: d.main.humidity,
          clouds,
          pop: d.pop,
          rain,
          snow,
          isThunderstorm,
          emoji: defineEmoji(clouds, rain, snow, isThunderstorm)
        })
        // аггрегируемый прогноз с периодом 1 день
        if(d.dt > t+86400) t += 86400;
        const cd = this.data1d.find(d => d.timestamp==t);
        if(cd === undefined) this.data1d.push({
          timestamp: t,
          temperatureMin: d.main.temp_min,
          temperatureMax: d.main.temp_max,
          humidityMin: d.main.humidity,
          humidityMax: d.main.humidity,
          clouds,
          pop: d.pop,
          rain,
          snow,
          isThunderstorm,
          emoji: defineEmoji(clouds, rain, snow, isThunderstorm),
          count: 1
        })
        else {
          clouds = (cd.clouds*cd.count + clouds)/(cd.count + 1)
          cd.temperatureMin = min(cd.temperatureMin, d.main.temp_min)
          cd.temperatureMax = max(cd.temperatureMax, d.main.temp_max)
          cd.humidityMin = min(cd.humidityMin, d.main.humidity)
          cd.humidityMax = max(cd.humidityMax, d.main.humidity)
          cd.clouds = clouds
          cd.pop = Math.max(cd.pop, d.pop);
          cd.rain += d.rain ? d.rain['3h'] : 0
          cd.snow += d.snow ? d.snow['3h'] : 0
          cd.isThunderstorm ||= isThunderstorm
          cd.emoji = defineEmoji(cd.clouds, cd.rain, cd.snow, cd.isThunderstorm)
          cd.count++
        }
      })
    })
  }
}

// Иконки '☀️', '🌤️', '⛅', '☁️', '🌦️', '🌧️', '🌩️', '⛈️', '🌨️'

function defineEmoji(clouds: number, rain: number, snow: number, isThunderstorm: boolean): string {
  const cloudiness = clouds<10 ? '☀️' : clouds<30 ? '🌤️' : clouds < 70 ? '⛅' : '☁️'
  return cloudiness + (rain>0 ? '💧' : '') + (snow>0 ? '❄️' : '') + (isThunderstorm ? '⚡' : '')
}