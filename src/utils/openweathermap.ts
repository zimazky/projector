const API_KEY = '341daf273489371e5af9a9a7a6ac00d3';

type Forecast = {
  /** Time of data forecasted, unix, UTC */
  dt: number
  /** Time of data forecasted, ISO, UTC */
  dt_txt: string
  main: {
    /** Temperature. Unit Default: Kelvin, Metric: Celsius, Imperial: Fahrenheit */
    temp: number
    /** 
     * This temperature parameter accounts for the human perception of weather. 
     * Unit Default: Kelvin, Metric: Celsius, Imperial: Fahrenheit 
     * */
    feels_like: number
    /**
     * Minimum temperature at the moment of calculation.
     * This is minimal forecasted temperature (within large megalopolises and urban areas), use this parameter optionally.
     * Unit Default: Kelvin, Metric: Celsius, Imperial: Fahrenheit
     */
    temp_min: number
    /**
     * Maximum temperature at the moment of calculation.
     * This is maximal forecasted temperature (within large megalopolises and urban areas), use this parameter optionally.
     * Unit Default: Kelvin, Metric: Celsius, Imperial: Fahrenheit
     */
    temp_max: number
    /** Atmospheric pressure on the sea level by default, hPa */
    pressure: number
    /** Atmospheric pressure on the sea level, hPa */
    sea_level: number
    /** Atmospheric pressure on the ground level, hPa */
    grnd_level: number
    /** Humidity, % */
    humidity: number
    /** Internal parameter */
    temp_kf: number
  }
  weather: {
    /** Weather condition id */
    id: number
    /** Group of weather parameters (Rain, Snow, Extreme etc.) */
    main: string
    /** Weather condition within the group. You can get the output in your language */
    description: string
    /** Weather icon id */
    icon: number
  } []
  clouds: {
    /** Cloudiness, % */
    all: number
  }
  wind: {
    /** Wind speed. Unit Default: meter/sec, Metric: meter/sec, Imperial: miles/hour */
    speed: number
    /** Wind direction, degrees (meteorological) */
    deg: number
    /**  Wind gust. Unit Default: meter/sec, Metric: meter/sec, Imperial: miles/hour */
    gust: number
  }
  /** Average visibility, metres. The maximum value of the visibility is 10km */
  visibility: number
  /** 
   * Probability of precipitation.
   * The values of the parameter vary between 0 and 1, where 0 is equal to 0%, 1 is equal to 100%
   * */
  pop: number
  /**  */
  rain: {
    /** Rain volume for last 3 hours, mm */
    '3h': number
  }
  snow: {
    /** Snow volume for last 3 hours, mm */
    '3h': number
  }
  sys: {
    /** Part of the day (n - night, d - day) */
    pod: 'n' | 'd'
  }
}

export type OpenWeatherMapResponse = {
  //cod: string
  //message: number
  city: {
    /** @deprecated City ID */
    id: number
    /** @deprecated City name */
    name: string
    /** @deprecated Country code (GB, JP etc.) */
    country: string
    /** City population */
    population: number
    /** Sunrise time, Unix, UTC */
    sunrise: number
    /** Sunset time, Unix, UTC */
    sunset: number
    /** Shift in seconds from UTC */
    timezone: number
    /** City geo location */
    coord: {
      /** Latitude */
      lat: number
      /** Longitude */
      lon: number
    }
  }
  /** A number of timestamps returned in the API response */
  cnt: number
  /** List of forecasts */
  list: Forecast[]
}


export default class OpenWeatherMap {

  /**
   * 5 day forecast is available at any location on the globe. It includes weather forecast data with 3-hour step
   * @param lat 
   * @param lon 
   * @returns 
   */
  static async getForecast(lat: number, lon: number, units: Units = 'metric'): Promise<OpenWeatherMapResponse> {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`);
    const json: OpenWeatherMapResponse = await response.json();
    return json;
  }
}

type Units = 'standard' | 'metric' | 'imperial'