/** LRU: число хранимых значений не зависит от длины прокрутки календаря. */
export class BoundedCache<K, V> {
	private values = new Map<K, V>()
	constructor(readonly capacity: number) {
		if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid cache capacity')
	}
	get size(): number {
		return this.values.size
	}
	get(key: K): V | undefined {
		const value = this.values.get(key)
		if (value !== undefined) {
			this.values.delete(key)
			this.values.set(key, value)
		}
		return value
	}
	set(key: K, value: V): void {
		this.values.delete(key)
		this.values.set(key, value)
		if (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value!)
	}
	clear(): void {
		this.values.clear()
	}
}
