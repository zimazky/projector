import GAPI from './gapi'
import { makeAutoObservable, runInAction } from 'mobx'

/**
 * Сервис для инкапсуляции логики взаимодействия с Google API.
 * Управляет инициализацией GAPI, авторизацией/деавторизацией и статусом входа.
 */
export class GoogleApiService {
  isGoogleLoggedIn: boolean = false

  constructor() {
    makeAutoObservable(this)
  }

  /**
   * Инициализирует Google API.
   * Устанавливает обработчики для успешной инициализации, входа и истечения токена.
   */
  initGapi = () => {
    GAPI.init({
      onSuccess: () => {
        runInAction(() => { this.isGoogleLoggedIn = GAPI.isLoggedIn() })
      },
      onSignIn: () => {
        runInAction(() => {
          this.isGoogleLoggedIn = GAPI.isLoggedIn()
          console.log('onSignIn in GoogleApiService', this.isGoogleLoggedIn)
        })
      },
      onExpiredToken: () => {
        runInAction(() => { this.isGoogleLoggedIn = false })
      }
    })
  }

  /**
   * Авторизоваться в Google сервисах.
   * @returns Promise<void>
   */
  logIn = async () => {
    await GAPI.logIn()
    runInAction(() => { this.isGoogleLoggedIn = GAPI.isLoggedIn() })
  }

  /**
   * Разлогиниться в Google.
   */
  logOut = () => {
    GAPI.logOut()
    runInAction(() => { this.isGoogleLoggedIn = false })
  }

  /**
   * Проверяет, авторизован ли пользователь в Google.
   * @returns boolean
   */
  isLoggedIn = (): boolean => {
    return GAPI.isLoggedIn()
  }
}


