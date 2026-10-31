export const DOCUMENT_DATABASE = 'projector-documents'

/** Результат записи подтверждается только complete всей транзакции. */
export class IndexedDocumentStorage {
	constructor(private readonly factory: IDBFactory) {}
	private open(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			let settled = false
			const request = this.factory.open(DOCUMENT_DATABASE, 1)
			const timer = setTimeout(() => {
				settled = true
				try {
					request.transaction?.abort()
				} catch {
					/* Upgrade мог уже завершиться. */
				}
				reject(new Error('Истекло время открытия IndexedDB. Закройте другие вкладки приложения и повторите.'))
			}, 10000)
			request.onupgradeneeded = () => {
				if (settled) {
					request.transaction?.abort()
					return
				}
				const db = request.result
				if (!db.objectStoreNames.contains('session')) db.createObjectStore('session')
				if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery', { autoIncrement: true })
			}
			request.onerror = () => {
				clearTimeout(timer)
				settled = true
				reject(request.error)
			}
			request.onsuccess = () => {
				clearTimeout(timer)
				if (settled) {
					request.result.close()
					return
				}
				settled = true
				request.result.onversionchange = () => request.result.close()
				resolve(request.result)
			}
		})
	}

	private async transaction<T>(
		mode: IDBTransactionMode,
		action: (tx: IDBTransaction, result: (value: T) => void) => void
	): Promise<T> {
		const db = await this.open()
		try {
			return await new Promise<T>((resolve, reject) => {
				const tx = db.transaction(['session', 'recovery'], mode)
				let value: T
				let failure: unknown
				const timer = setTimeout(() => {
					failure = new Error('Истекло время операции IndexedDB. Повторите сохранение.')
					try {
						tx.abort()
					} catch {
						reject(failure)
					}
				}, 30000)
				tx.oncomplete = () => {
					clearTimeout(timer)
					resolve(value)
				}
				tx.onabort = () => {
					clearTimeout(timer)
					reject(failure ?? tx.error ?? new Error('Транзакция IndexedDB отменена.'))
				}
				tx.onerror = event => {
					failure ??= (event.target as IDBRequest).error ?? tx.error
				}
				try {
					action(tx, result => {
						value = result
					})
				} catch (error: unknown) {
					failure = error
					tx.abort()
				}
			})
		} finally {
			db.close()
		}
	}

	read(): Promise<string | undefined> {
		return this.transaction('readonly', (tx, result) => {
			const request = tx.objectStore('session').get('current')
			request.onsuccess = () => result(request.result as string | undefined)
		})
	}

	write(snapshot: string, original?: string): Promise<void> {
		return this.transaction('readwrite', tx => {
			if (original !== undefined) tx.objectStore('recovery').add(original)
			tx.objectStore('session').put(snapshot, 'current')
		})
	}

	export(): Promise<{ current: string | undefined; recovery: unknown[] }> {
		return this.transaction('readonly', (tx, result) => {
			const session = tx.objectStore('session').get('current')
			const recovery = tx.objectStore('recovery').getAll()
			recovery.onsuccess = () => result({ current: session.result, recovery: recovery.result })
		})
	}
}
