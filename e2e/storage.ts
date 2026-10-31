import { expect, type Page } from '@playwright/test'

export async function readLocalSnapshot(page: Page) {
	await expect(page.getByTestId('local-save-pending')).toHaveCount(0)
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('projector-documents', 1)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		try {
			return await new Promise<any>((resolve, reject) => {
				const tx = db.transaction('session', 'readonly')
				const request = tx.objectStore('session').get('current')
				tx.oncomplete = () => resolve(request.result === undefined ? null : JSON.parse(request.result))
				tx.onabort = () => reject(tx.error)
			})
		} finally {
			db.close()
		}
	})
}

export async function readRecoveryArchives(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('projector-documents', 1)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		try {
			return await new Promise<string[]>((resolve, reject) => {
				const tx = db.transaction('recovery', 'readonly')
				const request = tx.objectStore('recovery').getAll()
				tx.oncomplete = () => resolve(request.result)
				tx.onabort = () => reject(tx.error)
			})
		} finally {
			db.close()
		}
	})
}
