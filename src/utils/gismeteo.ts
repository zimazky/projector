type Temperature = {
  C: number | null
}

type WindDirection = {
  degree: number
  scale_8: number
}

type WindSpeed = {
  m_s: number
}

export type GismeteoResponse = {
  /** Тип погодных данных: 'Obs' - наблюдение, 'Frc' - прогноз */
  kind: 'Obs' | 'Frc'
  /** Дата и время данных */
  date: {
    UTC: string
    unix: number
    local: string
    time_zone_offset: number
  }
  temperature: {
    air: {
      min: Temperature
      max: Temperature
      avg: Temperature
    }
    comfort: {
      min: Temperature
      max: Temperature
    }
    water: {
      min: Temperature
      max: Temperature
    }
  }
  description: {
    full: string
  }
  humidity: {
    percent: {
      min: number
      max: number
      avg: number
    }
    dew_point: Temperature
  }
  pressure: {
    mm_hg_atm: {
      min: number
      max: number
    }
  }
  cloudiness: {
    percent: number
    type: 0 | 1 | 2 | 3 | 101
  }
  storm: {
    precipitation: {
      type: 0 | 1 | 2 | 3
      amount: number | null
      intensity: 0 | 1 | 2 | 3
    }
  }
  icon: string
  gm: number
  wind: {
    direction: {
      min: WindDirection
      max: WindDirection
      avg: WindDirection
    }
    speed: {
      min: WindSpeed
      max: WindSpeed
      avg: WindSpeed
    }
  }
}

export default class Gismeteo {

  static async getAggregateForecast(days: number): Promise<any> {
    //try {
      const response = await fetch('https://api.gismeteo.net/v2/weather/forecast/aggregate/?latitude=54.35&longitude=52.52&days='+days, {
        method: 'GET',
        headers: { 'X-Gismeteo-Token': '56b30cb255.3443075' },
        //mode: 'no-cors'
      });
      const json: any = await response.json();
      return json;
    //}
    /*
    catch(err) { 
      console.log(err);
      throw new Error(err);
    }
    */
  }

}