import { makeAutoObservable } from 'mobx'

/** Один сигнал времени на экземпляр приложения; таймер запускается явным start. */
export class ResourceBalanceClock {
	now: number
	private timer: ReturnType<typeof setInterval> | undefined
	constructor(private readonly readNow: () => number = Date.now) {
		this.now = readNow()
		makeAutoObservable<this, 'timer' | 'readNow'>(this, { timer: false, readNow: false }, { autoBind: true })
	}
	refresh(now = this.readNow()): void {
		this.now = now
	}
	start(): void {
		if (this.timer === undefined) {
			this.refresh()
			this.timer = setInterval(this.refresh, 30000)
		}
	}
	dispose(): void {
		if (this.timer !== undefined) clearInterval(this.timer)
		this.timer = undefined
	}
}
