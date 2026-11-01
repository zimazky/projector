import GAPI from 'src/7-shared/services/gapi'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { driveErrorCode } from 'src/7-shared/services/DriveApiError'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'

export type DriveProbeReport = {
	passed: boolean
	startedAt: string
	finishedAt?: string
	steps: { name: string; passed: boolean }[]
	testFiles: string[]
	cleanupFailed: string[]
	versions: { v2: string | undefined; v3Before: string | undefined; v3After: string | undefined }[]
	operations: { name: string; status: string; version?: string; message?: string }[]
	failure?: { step: string; httpStatus: number | null }
}

/** Работает только с созданными здесь файлами; секреты и пользовательские данные в отчёт не попадают. */
export async function verifyDriveConditionalWrite(api: GoogleApiService): Promise<DriveProbeReport> {
	const report: DriveProbeReport = {
		passed: false,
		startedAt: new Date().toISOString(),
		steps: [],
		testFiles: [],
		cleanupFailed: [],
		versions: [],
		operations: []
	}
	const files: { id: string; name: string }[] = []
	let step = 'create-test-file'
	const check = (name: string, passed: boolean) => {
		step = name
		report.steps.push({ name, passed })
		if (!passed) throw new Error('Probe assertion failed')
	}
	const document = (name: string) =>
		JSON.stringify({
			schemaVersion: 1,
			projectsList: [{ name, color: 'black', background: 'white' }],
			completedList: [],
			plannedList: []
		})
	const contentName = async (id: string) => {
		const content = await GAPI.download(id)
		return (typeof content === 'string' ? JSON.parse(content) : content).projectsList[0].name
	}
	try {
		const name = 'projector-s01-check-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json'
		const created = await GAPI.createDocument(name, document('Base'), 'application/json', ['root'])
		files.push({ id: created.id, name })
		report.testFiles.push(name)
		check('create-test-file', !!created.id)
		step = 'read-v2-condition'
		let stale = await GAPI.getFileWriteCondition(created.id)
		let stable = false
		for (let attempt = 0; attempt < 3; attempt++) {
			const before = await api.getFileMetadata(created.id)
			stale = await GAPI.getFileWriteCondition(created.id)
			const after = await api.getFileMetadata(created.id)
			report.versions.push({ v2: stale.file.version, v3Before: before.version, v3After: after.version })
			if (before.version === stale.file.version && stale.file.version === after.version) {
				stable = true
				break
			}
		}
		check('v2-v3-versions-agree', stable)
		step = 'update-same-file'
		const updated = await GAPI.updateDocument(created.id, document('Other client'), 'application/json', stale)
		check(
			'update-same-file',
			updated.id === created.id && updated.name === name && updated.version !== stale.file.version
		)
		// Между чтением stale и этой записью уже появился новый контент другого клиента.
		step = 'stale-etag-rejected'
		let rejected = false
		try {
			await GAPI.updateDocument(created.id, document('Must not overwrite'), 'application/json', stale)
		} catch (error: unknown) {
			if (driveErrorCode(error) !== 412) throw error
			rejected = true
		}
		check('stale-etag-rejected', rejected)
		check('concurrent-data-preserved', (await contentName(created.id)) === 'Other client')
		step = 'service-rejects-stale-version'
		const conflict = await api.updateFileContent(created.id, document('Local'), 'application/json', stale.file.version!)
		check('service-rejects-stale-version', conflict.status === 'conflict')
		step = 'service-updates-same-file'
		const serviceSave = async (name: string) => {
			let saved: Awaited<ReturnType<GoogleApiService['updateFileContent']>>
			for (let attempt = 0; attempt < 3; attempt++) {
				const latest = await api.getFileMetadata(created.id)
				saved = await api.updateFileContent(created.id, document(name), 'application/json', latest.version!)
				report.operations.push({
					name,
					status: saved.status,
					...(saved.status === 'success'
						? { version: saved.file.version }
						: saved.status === 'error'
							? { message: saved.message }
							: {})
				})
				// Только тестовый файл: свежая проверка и новое явное решение тестового клиента.
				if (saved.status !== 'conflict') return saved
			}
			return saved!
		}
		const saved = await serviceSave('Local')
		check(
			'service-updates-same-file',
			saved.status === 'success' && saved.file.id === created.id && saved.file.name === name
		)
		check('saved-data-readable-v3', (await contentName(created.id)) === 'Local')
		const after = await api.getFileMetadata(created.id)
		check(
			'write-response-version-visible-v3',
			saved.status === 'success' &&
				!!saved.file.version &&
				!!after.version &&
				BigInt(after.version) >= BigInt(saved.file.version)
		)
		step = 'repeat-save-same-file'
		const repeated = await serviceSave('Repeat')
		check(
			'repeat-save-same-file',
			repeated.status === 'success' && repeated.file.id === created.id && repeated.file.name === name
		)
		check('repeat-data-readable-v3', (await contentName(created.id)) === 'Repeat')
		// Полный путь вкладки: база берётся из ответа записи, повтор не получает её из свежего GET.
		const memory = { load: () => null, save: () => {}, exportSource: () => '{}', clear: () => {} }
		const a = new DocumentTabsStore(api, memory),
			b = new DocumentTabsStore(api, memory)
		step = 'two-document-clients-open'
		check('client-a-opened', (await a.openFromDrive(created.id)).status === 'opened')
		check('client-b-opened', (await b.openFromDrive(created.id)).status === 'opened')
		a.activeProjectsStore!.update('Repeat', { name: 'Client A' })
		step = 'document-command-save'
		const first = await a.saveDocument(a.activeDocumentId!)
		report.operations.push({
			name: step,
			status: first.status,
			version: a.activeDocument!.sync.baseRevisionId ?? undefined,
			...('message' in first ? { message: first.message } : {})
		})
		check('document-command-save', first.status === 'saved')
		check('second-client-detects-change', (await b.checkDocument(b.activeDocumentId!)).status === 'conflict')
		a.activeProjectsStore!.update('Client A', { name: 'Client A twice' })
		step = 'document-command-repeat'
		const second = await a.saveDocument(a.activeDocumentId!)
		report.operations.push({
			name: step,
			status: second.status,
			version: a.activeDocument!.sync.baseRevisionId ?? undefined,
			...('message' in second ? { message: second.message } : {})
		})
		check('document-command-repeat', second.status === 'saved')
		check(
			'document-ref-unchanged',
			a.activeDocument!.ref!.fileId === created.id && a.activeDocument!.ref!.name === name
		)
		step = 'save-as-separate-file'
		const copyName = name.replace('.json', '-save-as.json')
		const copy = await api.saveFile(copyName, document('Save as'), 'application/json', 'root')
		if (copy.status === 'success') {
			files.push({ id: copy.file.id, name: copyName })
			report.testFiles.push(copyName)
		}
		check('save-as-separate-file', copy.status === 'success' && copy.file.id !== created.id)
		report.passed = true
	} catch (error: unknown) {
		report.failure = { step, httpStatus: driveErrorCode(error) }
	} finally {
		for (const file of files) {
			try {
				// Только корзина; без необратимого удаления. Исходные документы не затрагиваются.
				await gapi.client.request({
					path: '/drive/v3/files/' + encodeURIComponent(file.id),
					method: 'PATCH',
					body: { trashed: true }
				})
			} catch {
				report.cleanupFailed.push(file.name)
			}
		}
		report.finishedAt = new Date().toISOString()
	}
	return report
}
