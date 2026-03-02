import { makeAutoObservable } from 'mobx'

type ViewMode = 'Calendar' | 'Day' | 'Projects'

/** Класс хранилища для состояния пользовательского интерфейса */
export class UIStore {
	/** Режим отображения */
	viewMode: ViewMode = 'Calendar'
	/** Признак открытого сайдбара с меню */
	isMenuOpen: boolean = false
	/** Триггер принудительного обновления UI */
	mustForceUpdate: {} = {}

	constructor() {
		makeAutoObservable(this)
	}

	/** Изменить режим просмотра приложения */
	changeViewMode(props: { mode?: ViewMode }) {
		if (props.mode) this.viewMode = props.mode
	}

	/** Переключить состояние меню */
	toggleMenu(isOpen: boolean) {
		this.isMenuOpen = isOpen
	}

	/** Триггернуть обновление UI */
	forceUpdate() {
		console.log('UIStore.forceUpdate')
		this.mustForceUpdate = {}
	}
}
