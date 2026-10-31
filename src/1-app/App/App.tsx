import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'
import useUpdate from 'src/7-shared/hooks/useUpdate'

import { StoreContext } from 'src/1-app/Providers/StoreContext'

import Header from 'src/4-widgets/Header/Header'
import Calendar from 'src/3-pages/Calendar/Calendar'
import DayList from 'src/3-pages/DayList/DayList'
import ProjectsForm from 'src/3-pages/Projects/ProjectsForm'
import DocumentTabs from 'src/7-shared/ui/DocumentTabs'
import EmptyState from 'src/7-shared/ui/EmptyState'
import YesNoCancelConfirmation, {
	YesNoCancelDecision
} from 'src/7-shared/ui/YesNoCancelConfirmation/YesNoCancelConfirmation'

import './App.css'
import { downloadJson } from 'src/7-shared/libs/downloadJson'
import type { DocumentUiState } from 'src/6-entities/Document/model/DocumentSyncSelectors'
import {
	storageGroupLabels,
	storageOperationLabels,
	storageSizeLabel
} from 'src/6-entities/Document/model/DocumentStorageDiagnostic'

const App: React.FC = observer(function () {
	const forceUpdate = useUpdate()
	const { uiStore, documentTabsStore, saveToDriveStore, mainStore } = useContext(StoreContext)
	const storageFailure = documentTabsStore.persistenceDiagnostic
	React.useEffect(() => {
		mainStore.startSyncCoordinator()
		return () => mainStore.stopSyncCoordinator()
	}, [mainStore])

	React.useEffect(forceUpdate, [uiStore.mustForceUpdate])
	React.useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (
				documentTabsStore.isPersistingLocalSession ||
				(documentTabsStore.persistenceError && documentTabsStore.documents.length)
			) {
				event.preventDefault()
				event.returnValue = ''
			}
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [documentTabsStore])

	const [unsavedDialogOpen, setUnsavedDialogOpen] = React.useState(false)
	const [dialogMessage, setDialogMessage] = React.useState('Есть несохранённые изменения.')
	const unsavedDecisionResolverRef = React.useRef<((decision: YesNoCancelDecision) => void) | null>(null)
	const closePendingRef = React.useRef(false)
	React.useEffect(
		() => () => {
			unsavedDecisionResolverRef.current?.('cancel')
			unsavedDecisionResolverRef.current = null
		},
		[]
	)

	const handleActivate = (id: string) => {
		documentTabsStore.activateDocument(id)
	}

	const requestUnsavedDecision = (ui: DocumentUiState): Promise<YesNoCancelDecision> => {
		setDialogMessage(ui.closeMessage)
		setUnsavedDialogOpen(true)
		return new Promise<YesNoCancelDecision>(resolve => {
			unsavedDecisionResolverRef.current = resolve
		})
	}

	const resolveUnsavedDecision = (decision: YesNoCancelDecision) => {
		setUnsavedDialogOpen(false)
		const resolver = unsavedDecisionResolverRef.current
		unsavedDecisionResolverRef.current = null
		resolver?.(decision)
	}

	const handleClose = async (id: string) => {
		if (closePendingRef.current) return
		closePendingRef.current = true
		try {
			const result = await documentTabsStore.requestCloseDocument(
				id,
				async ui => {
					const decision = await requestUnsavedDecision(ui)
					return decision === 'yes' ? 'save' : decision === 'no' ? 'discard' : 'cancel'
				},
				documentId => {
					const doc = documentTabsStore.documents.find(document => document.id === documentId)
					return doc?.ref?.fileId
						? documentTabsStore.saveDocument(documentId)
						: saveToDriveStore.openForDocument(documentId)
				}
			)
			if (result.status === 'failed' || result.status === 'conflict') window.alert(result.message)
		} finally {
			closePendingRef.current = false
		}
	}

	const handleNew = () => {
		documentTabsStore.openNewDocument()
	}
	const exportSession = async (source = false) => {
		try {
			const content = source ? await documentTabsStore.exportRecoverySource() : documentTabsStore.exportLocalSession()
			downloadJson(content, source ? 'projector-recovery-source.json' : 'projector-session.json')
		} catch {
			window.alert('Не удалось экспортировать данные. Доступ к хранилищу может быть запрещён.')
		}
	}

	const handleOpenFromDrive = () => {
		// Открываем Drive file picker через кастомное событие
		// CalendarIconBar слушает это событие и открывает picker
		window.dispatchEvent(new CustomEvent('open-drive-file-picker'))
	}

	// Рендерим страницу в зависимости от режима просмотра
	const renderPage = () => {
		switch (uiStore.viewMode) {
			case 'Calendar':
				return <Calendar />
			case 'Day':
				return <DayList />
			case 'Projects':
				return <ProjectsForm />
			default:
				return <Calendar />
		}
	}

	console.log('app')

	return (
		<>
			<Header onCloseDocument={handleClose} />
			{documentTabsStore.documents.length > 0 && (
				<div data-testid="document-tabs-wrapper">
					<DocumentTabs
						documents={documentTabsStore.documents}
						activeDocumentId={documentTabsStore.activeDocument?.id ?? null}
						onActivate={handleActivate}
						onClose={handleClose}
						onNew={handleNew}
					/>
				</div>
			)}
			<main>
				{documentTabsStore.isPersistingLocalSession && (
					<div role="status" data-testid="local-save-pending">
						Сохраняется локальная копия…
					</div>
				)}
				{documentTabsStore.persistenceError && (
					<div role="alert" className="local-storage-error">
						<p>{documentTabsStore.persistenceError}</p>
						{documentTabsStore.canPersistLocalSession ? (
							<button onClick={() => documentTabsStore.retryLocalPersistence()}>Повторить локальное сохранение</button>
						) : documentTabsStore.documents.length === 0 ? (
							<button onClick={() => void documentTabsStore.restoreFromLocalStorage()}>Повторить восстановление</button>
						) : null}
						<button onClick={() => exportSession()}>Экспортировать открытую сессию</button>
						<button onClick={() => exportSession(true)}>Экспортировать исходный снимок</button>
						{storageFailure && (
							<details className="local-storage-diagnostic">
								<summary>Подробности ошибки</summary>
								<dl>
									<dt>Хранилище</dt>
									<dd>{storageFailure.backend}</dd>
									<dt>Ошибка браузера</dt>
									<dd>{storageFailure.errorName}</dd>
									<dt>Операция</dt>
									<dd>{storageOperationLabels[storageFailure.operation]}</dd>
									<dt>Размер неудавшейся записи</dt>
									<dd>{storageSizeLabel(storageFailure.attemptedBytes)}</dd>
									<dt>Оценка объёма localStorage</dt>
									<dd>{storageSizeLabel(storageFailure.storedBytes)}</dd>
									{storageFailure.groups.map(item => (
										<React.Fragment key={item.group}>
											<dt>
												{storageGroupLabels[item.group]} ({item.entries})
											</dt>
											<dd>{storageSizeLabel(item.bytes)}</dd>
										</React.Fragment>
									))}
								</dl>
								<p>Размеры — оценка строк UTF-16. Лимит хранилища и свободное место браузер здесь не сообщает.</p>
							</details>
						)}
					</div>
				)}
				{documentTabsStore.isRestoringLocalSession ? (
					<div role="status">Восстановление локальных документов…</div>
				) : documentTabsStore.documents.length === 0 ? (
					<EmptyState onCreateNew={handleNew} onOpenFromDrive={handleOpenFromDrive} />
				) : (
					renderPage()
				)}
			</main>
			<YesNoCancelConfirmation
				open={unsavedDialogOpen}
				onDecision={resolveUnsavedDecision}
				yesLabel="Сохранить"
				noLabel="Не сохранять"
			>
				{dialogMessage}
				<br />
				Что сделать перед закрытием вкладки?
			</YesNoCancelConfirmation>
		</>
	)
})

export default App
