import { comparer, reaction, type IReactionDisposer } from 'mobx'
import type { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import type { DocumentTabsStore } from './DocumentTabsStore'
import type { DocumentSession } from './DocumentTabsStore.types'
import { shouldCheckRemote } from './DocumentSyncSelectors'

/** Фоновая проверка metadata: TTL и дедупликация не являются защитой записи. */
export class DriveSyncCoordinator {
	private disposeReaction: IReactionDisposer | null = null
	private timer: ReturnType<typeof setInterval> | null = null
	private pending = new Map<DocumentSession, { promise: Promise<void>; token: number | null }>()
	private online = true
	private running = false
	constructor(
		private documents: DocumentTabsStore,
		private api: GoogleApiService
	) {}

	start(): void {
		if (this.running) return
		this.running = true
		this.online = typeof navigator === 'undefined' || navigator.onLine
		this.disposeReaction = reaction(
			() => ({
				loggedIn: this.api.isGoogleLoggedIn,
				active: this.documents.activeDocumentId,
				linked: this.documents.documents.filter(doc => doc.ref?.fileId).map(doc => doc.id + ':' + doc.ref!.fileId)
			}),
			(state, previous) => {
				if (!state.loggedIn || !this.online) {
					this.invalidate()
					return
				}
				if (!previous?.loggedIn) void this.refreshAll(true)
				else {
					if (state.active) void this.refresh(state.active)
					if (!comparer.structural(state.linked, previous.linked)) void this.refreshAll()
				}
			},
			{ fireImmediately: true, equals: comparer.structural }
		)
		this.timer = setInterval(() => {
			for (const doc of this.documents.documents) {
				if (shouldCheckRemote(doc, 'drive-available')) this.documents.requireRemoteCheck(doc.id)
			}
			void this.refreshAll()
		}, 30_000)
		if (typeof window !== 'undefined') {
			window.addEventListener('online', this.onOnline)
			window.addEventListener('offline', this.onOffline)
		}
	}

	private onOnline = () => {
		this.online = true
		void this.refreshAll(true)
	}
	private onOffline = () => {
		this.online = false
		this.invalidate()
	}
	private invalidate(): void {
		for (const [doc, request] of this.pending) this.documents.cancelBackgroundCheck(doc.id, request.token)
		this.pending.clear()
		for (const doc of this.documents.documents) this.documents.requireRemoteCheck(doc.id)
	}

	async refreshAll(force = false): Promise<void> {
		await Promise.all(this.documents.documents.map(doc => this.refresh(doc.id, force)))
	}

	refresh(id: string, force = false): Promise<void> {
		const doc = this.documents.documents.find(item => item.id === id)
		if (!this.running || !this.online || !this.api.isGoogleLoggedIn || !doc?.ref?.fileId) return Promise.resolve()
		const pending = this.pending.get(doc)
		if (pending?.token === doc.operationToken) return pending.promise
		if (pending) this.pending.delete(doc)
		if (doc.operation !== 'idle' || (!force && !shouldCheckRemote(doc, 'drive-available'))) return Promise.resolve()
		const check = this.documents.checkDocument(id, { background: true })
		const request = { token: doc.operationToken, promise: Promise.resolve() }
		request.promise = check
			.then(
				() => undefined,
				() => undefined
			)
			.finally(() => {
				if (this.pending.get(doc) === request) this.pending.delete(doc)
			})
		this.pending.set(doc, request)
		return request.promise
	}

	dispose(): void {
		if (!this.running) return
		this.running = false
		this.disposeReaction?.()
		this.disposeReaction = null
		if (this.timer !== null) clearInterval(this.timer)
		this.timer = null
		if (typeof window !== 'undefined') {
			window.removeEventListener('online', this.onOnline)
			window.removeEventListener('offline', this.onOffline)
		}
		this.invalidate()
	}
}
