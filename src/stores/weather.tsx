import {makeAutoObservable, runInAction} from 'mobx'
import DateTime from '../utils/datetime';
import OpenWeatherMap from '../utils/openweathermap';
import React from 'react';

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
  /** Признак грозы */
  isThunderstorm: boolean;
  /** Идентификатор иконки погоды */
  iconId: number;
  /** Строка с иконками emoji */
  emoji: string;
}

class WeatherStore {
  /** 
   * Состояние хранилища
   * 'undefined' - данные не определены
   * 'pending'   - ожидание
   * 'ready'     - данные получены
   * 'error'     - произошла ошибка
   */
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
        let clouds = d.clouds.all;
        const rain = d.rain ? d.rain['3h'] : 0;
        const snow = d.snow ? d.snow['3h'] : 0;
        const isThunderstorm = d.weather.reduce((a, w) => a || (200 <= w.id && w.id < 300), false);
        if(cd === undefined) this.data.push({
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
          iconId: defineIconId(clouds, rain, snow),
          emoji: defineEmoji(clouds, rain, snow, isThunderstorm),
        })
        else {
          clouds = Math.max(cd.clouds, clouds);
          cd.temperatureMin = Math.min(cd.temperatureMin, d.main.temp_min);
          cd.temperatureMax = Math.max(cd.temperatureMax, d.main.temp_max);
          cd.humidityMin = Math.min(cd.humidityMin, d.main.humidity);
          cd.humidityMax = Math.max(cd.humidityMax, d.main.humidity);
          cd.clouds = clouds;
          cd.pop = Math.max(cd.pop, d.pop);
          cd.rain += d.rain ? d.rain['3h'] : 0;
          cd.snow += d.snow ? d.snow['3h'] : 0;
          cd.iconId = defineIconId(cd.clouds, cd.rain, cd.snow);
          cd.isThunderstorm ||= isThunderstorm;
          cd.emoji = defineEmoji(cd.clouds, cd.rain, cd.snow, cd.isThunderstorm);
        }
      });
    });
  }
}

function defineIconId(clouds: number, rain: number, snow: number): number {
  return snow > 0 ? 8 : clouds<10 ? 0 : clouds<30 ? 1 : clouds < 60 ? (rain == 0 ? 2 : 4) : (rain == 0 ? 3 : 5);
}

function defineEmoji(clouds: number, rain: number, snow: number, isThunderstorm: boolean): string {
  const cloudiness = clouds<10 ? '☀️' : clouds<30 ? '🌤️' : clouds < 60 ? '⛅' : '☁️';
  return cloudiness + (rain>0 ? '💧' : '') + (snow>0 ? '❄️' : '') + (isThunderstorm ? '⚡' : '');
}

/** Синглтон-экземпляр хранилища данных прогноза погоды*/
export const weatherStore = new WeatherStore;

/** Массив с иконками погоды */
export const weatherIcons: React.JSX.Element[] = [
  // Ясно (clouds < 10%)
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#f15d46" stroke="none" d="m11 2a.8.8 90 000 18 .8.8 90 000-18"/>
  </svg>,
  // Малооблачно (clouds < 30%)
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#f15d46" stroke="none" d="m11 1a.8.8 90 000 16 .8.8 90 000-16"/>
    <path fill="#dddddd" stroke="none" d="m4 9h.2a3.2 3.2 90 01-.1-.7.8.8 90 016.5-.1 1.9 1.9 90 013.1 2l.5-.1a.8.8 90 01.2 4.8h-10.5a.8.8 90 01.1-5.9"/>
  </svg>,
  // Облачно (clouds < 60%)
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#f15d46" stroke="none" d="m16 1a1 1 0 000 12 1 1 0 000-12"></path>
    <path fill="#dddddd" stroke="none" d="m4 9h.5a4.3 4.3 90 01-.1-.9 1 1 0 018.6-.1 2.5 2.5 0 014.1 2.7l.6-.1a1 1 0 01.3 6.4h-14a1 1 0 010-8"></path>
  </svg>,
  // Пасмурно
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#aaaaaa" stroke="none" d="m8 6h.4a3.44 3.44 90 01-.08-.72.8.8 90 016.88-.08 2 2 90 013.28 2.16l.48-.08a.8.8 90 01.24 5.12h-11.2a.8.8 90 010-6.4"></path>
    <path fill="#dddddd" stroke="none" d="m4 9h.4a3.44 3.44 90 01-.08-.72.8.8 90 016.88-.08 2 2 90 013.28 2.16l.48-.08a.8.8 90 01.24 5.12h-11.2a.8.8 90 010-6.4"></path>
  </svg>,
];

export const weatherEmojis: string[] = [
  // 0. Ясно (clouds < 10%)
  '☀️',
  // 1. Малооблачно (clouds < 30%)
  '🌤️',
  // 2. Облачно (clouds < 60%)
  '⛅',
  // 3. Пасмурно
  '☁️',
  // 4. Облачно с дождем (clouds < 60% & rain > 0)
  '🌦️',
  // 5. Пасмурно с дождем (rain > 0)
  '🌧️',
  // 6. Гром и молния (???)
  '🌩️',
  // 7. Гром и молния с дождем (???)
  '⛈️',
  // 8. Пасмурно со снегом (snow > 0)
  '🌨️'
];