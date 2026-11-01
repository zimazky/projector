import { action, computed, makeObservable, observable } from 'mobx'

export type ReadonlyJson<T> = T extends string | number | boolean | null | undefined
	? T
	: { readonly [K in keyof T]: ReadonlyJson<T[K]> }

function immutable<T>(value: T): ReadonlyJson<T> {
	const copy = JSON.parse(JSON.stringify(value))
	const freeze = (item: object) => {
		Object.values(item).forEach(value => {
			if (value && typeof value === 'object') freeze(value)
		})
		Object.freeze(item)
	}
	freeze(copy)
	return copy
}

/** Изменения проверяет владелец документа до замены наблюдаемого снимка. */
export class DocumentCatalogStore<T> {
	private items: ReadonlyJson<T[]> = immutable<T[]>([])
	version = 0

	constructor(
		private readonly key: (item: ReadonlyJson<T>) => string,
		private readonly commit: (items: T[]) => void
	) {
		makeObservable<this, 'items'>(this, {
			items: observable.ref,
			version: observable,
			list: computed,
			install: action.bound
		})
	}

	get list(): ReadonlyJson<T[]> {
		return this.items
	}

	getById(id: string): ReadonlyJson<T> | undefined {
		return this.items.find(item => this.key(item) === id)
	}

	replace(items: ReadonlyJson<T[]>): void {
		this.commit(JSON.parse(JSON.stringify(items)))
	}

	upsert(item: ReadonlyJson<T>): void {
		const items = this.snapshot()
		const index = items.findIndex(
			existing => this.key(existing as ReadonlyJson<T>) === this.key(item as ReadonlyJson<T>)
		)
		const copy: T = JSON.parse(JSON.stringify(item))
		if (index === -1) items.push(copy)
		else items[index] = copy
		this.replace(items as ReadonlyJson<T[]>)
	}

	remove(id: string): void {
		this.replace(this.items.filter(item => this.key(item) !== id))
	}

	snapshot(): T[] {
		return JSON.parse(JSON.stringify(this.items))
	}

	/** @internal Только подготовленное состояние из менеджера документа. */
	install(items: T[]): void {
		if (JSON.stringify(items) === JSON.stringify(this.items)) return
		this.items = immutable(items)
		this.version++
	}
}
