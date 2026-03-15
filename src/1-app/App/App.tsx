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

const App: React.FC = observer(function () {
	const forceUpdate = useUpdate()
	const { uiStore, documentTabsStore, mainStore } = useContext(StoreContext)

	React.useEffect(forceUpdate, [uiStore.mustForceUpdate])

	const [unsavedDialogOpen, setUnsavedDialogOpen] = React.useState(false)
	const [pendingDocumentId, setPendingDocumentId] = React.useState<string | null>(null)
	const [dialogMessage, setDialogMessage] = React.useState('Есть несохранённые изменения.')
	const unsavedDecisionResolverRef = React.useRef<((decision: YesNoCancelDecision) => void) | null>(null)

	const handleActivate = (id: string) => {
		documentTabsStore.activateDocument(id)
	}

	const requestUnsavedDecision = (documentId: string, hasUnsyncedChanges: boolean): Promise<YesNoCancelDecision> => {
		setPendingDocumentId(documentId)
		setDialogMessage(
			hasUnsyncedChanges ? 'Документ не синхронизирован с предыдущей сессии.' : 'Есть несохранённые изменения.'
		)
		setUnsavedDialogOpen(true)
		return new Promise<YesNoCancelDecision>(resolve => {
			unsavedDecisionResolverRef.current = resolve
		})
	}

	const resolveUnsavedDecision = (decision: YesNoCancelDecision) => {
		setUnsavedDialogOpen(false)
		const resolver = unsavedDecisionResolverRef.current
		const docId = pendingDocumentId
		unsavedDecisionResolverRef.current = null
		setPendingDocumentId(null)

		if (docId && resolver) {
			if (decision === 'yes') {
				// Save and close
				documentTabsStore.activateDocument(docId)
				documentTabsStore.saveActiveDocument().then(() => {
					documentTabsStore.closeDocument(docId)
				})
			} else if (decision === 'no') {
				// Close without saving
				documentTabsStore.closeDocument(docId)
			}
			// 'cancel' - do nothing
		}
	}

	const handleClose = async (id: string) => {
		const doc = documentTabsStore.documents.find(d => d.id === id)
		if (doc?.state.isDirty || doc?.state.hasUnsyncedChanges) {
			const decision = await requestUnsavedDecision(id, doc.state.hasUnsyncedChanges)
			if (decision === 'cancel') return
			// Decision is handled in resolveUnsavedDecision
			return
		}
		documentTabsStore.closeDocument(id)
	}

	const handleNew = async () => {
		const activeDoc = documentTabsStore.activeDocument
		if (activeDoc?.state.isDirty || activeDoc?.state.hasUnsyncedChanges) {
			const decision = await requestUnsavedDecision(activeDoc.id, activeDoc.state.hasUnsyncedChanges)
			if (decision === 'cancel') return
			if (decision === 'yes') {
				await documentTabsStore.saveActiveDocument()
			}
		}
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
			<Header />
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
