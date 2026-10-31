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
import type { DocumentUiState } from 'src/6-entities/Document/model/DocumentSyncSelectors'

const App: React.FC = observer(function () {
	const forceUpdate = useUpdate()
	const { uiStore, documentTabsStore, saveToDriveStore, mainStore } = useContext(StoreContext)
	React.useEffect(() => {
		mainStore.startSyncCoordinator()
		return () => mainStore.stopSyncCoordinator()
	}, [mainStore])

	React.useEffect(forceUpdate, [uiStore.mustForceUpdate])

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
				{documentTabsStore.documents.length === 0 ? (
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
