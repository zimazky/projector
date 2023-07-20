import {makeAutoObservable, runInAction} from 'mobx'
import DateTime from '../utils/datetime';
import OpenWeatherMap from '../utils/openweathermap';

/** Погодные условия, аггрегированные за день */
export type DayForecast = {
  /** Временная метка дня, unixtime, UTC */
  timestamp: number;
  /** Минимальная температура за день */
  temperatureMin: number;
  /** Максимальная температура за день */
  temperatureMax: number;
  /** Минимальная влажность за день в % */
  humidityMin: number;
  /** Максимальная влажность за день в % */
  humidityMax: number;
  /** Облачность в % */
  clouds: number;
  /** Вероятность осадков 0..1 */
  pop: number;
  /** Количество осадков в виде дождя в мм */
  rain: number;
  /** Количество осадков в виде снега в мм */
  snow: number;
}

class WeatherStore {
  state: 'undefined' | 'pending' | 'ready' | 'error' = 'undefined'
  /** Наименование локации */
  locationName: string = 'Ольховец';
  /** Широта локации */
  lat: number = 58.666408;
  /** Долгота локации */
  lon: number = 32.366389;
  /** Данные прогноза погоды на 5-6 дней */
  data: DayForecast[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  /** Установка локации */
  setLocation(lat: number, lon: number, name: string) {
    this.lat = lat;
    this.lon = lon;
    this.locationName = name;
    this.data = [];
  }

  /** Загрузка данных прогноза погоды */
  async loadForecast() {
    this.state = 'pending';
    const f = await OpenWeatherMap.getForecast(this.lat, this.lon);
    runInAction(()=>{
      let t = DateTime.getBeginDayTimestamp(Date.now()/1000);
      this.state = 'ready';
      this.data = [];
      console.log(f);
      f.list.forEach(d => {
        if(d.dt > t+86400) t += 86400;
        const cd = this.data.find(d => d.timestamp==t);
        if(cd === undefined) this.data.push({
          timestamp: t,
          temperatureMin: d.main.temp_min,
          temperatureMax: d.main.temp_max,
          humidityMin: d.main.humidity,
          humidityMax: d.main.humidity,
          clouds: d.clouds.all,
          pop: d.pop,
          rain: d.rain ? d.rain['3h'] : 0,
          snow: d.snow ? d.snow['3h'] : 0
        })
        else {
          cd.temperatureMin = Math.min(cd.temperatureMin, d.main.temp_min);
          cd.temperatureMax = Math.max(cd.temperatureMax, d.main.temp_max);
          cd.humidityMin = Math.min(cd.humidityMin, d.main.humidity);
          cd.humidityMax = Math.max(cd.humidityMax, d.main.humidity);
          cd.clouds = Math.max(cd.clouds, d.clouds.all);
          cd.pop = Math.max(cd.pop, d.pop);
          cd.rain += d.rain ? d.rain['3h'] : 0;
          cd.snow += d.snow ? d.snow['3h'] : 0;
        }
      });
    });
  }
}

/** Синглтон-экземпляр хранилища данных прогноза погоды*/
export const weatherStore = new WeatherStore;