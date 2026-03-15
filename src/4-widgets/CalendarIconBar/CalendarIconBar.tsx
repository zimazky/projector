import React, { useContext, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'
import SwgIcon from 'src/7-shared/ui/Icons/SwgIcon'
import {
	Diskette,
	DownloadSign,
	Fullscreen,
	Google,
	Menu,
	ModifiedAsterisk,
	UploadSign,
	Weather,
	Sync
} from 'src/7-shared/ui/Icons/Icons'

import YesNoCancelConfirmation, {
	YesNoCancelDecision
} from 'src/7-shared/ui/YesNoCancelConfirmation/YesNoCancelConfirmation'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import DriveFilePicker from 'src/4-widgets/DriveFilePicker/DriveFilePicker'
import { IDriveItem } from 'src/7-shared/types/IDriveItem'

import SaveToDrive from 'src/4-widgets/SaveToDrive/SaveToDrive'
import ConflictDialog, { type ConflictDialogProps } from 'src/7-shared/ui/ConflictDialog'

function fullScreen() {
	document.getElementById('root')?.requestFullscreen()
}

const CalendarIconBar: React.FC = observer(function () {
	const { uiStore, googleApiService, storageService, weatherStore, saveToDriveStore, documentTabsStore } =
		useContext(StoreContext)

	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [unsavedDialogActionName, setUnsavedDialogActionName] = useState('')
	const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false)
	const [conflictDialogData, setConflictDialogData] = useState<ConflictDialogProps | null>(null)
	const unsavedDecisionResolverRef = useRef<((decision: YesNoCancelDecision) => void) | null>(null)

	const activeDoc = documentTabsStore.activeDocument

	const handleSaveAsToDrive = () => {
		if (!activeDoc) {
			alert('Нет активного документа для сохранения')
			return
		}
		const dataToSave = storageService.getContentToSave()
		const fileName = activeDoc.ref?.name || `calendar_data_${new Date().toISOString().slice(0, 10)}.json`
		const mimeType = activeDoc.ref?.mimeType || 'application/json'
		saveToDriveStore.open(fileName, JSON.stringify(dataToSave, null, 2), mimeType)
	}

	const handleSaveCurrentDocument = async () => {
		if (!activeDoc?.ref?.fileId) {
			alert('Нет открытого документа для сохранения. Используйте "Сохранить как...".')
			return false
		}

		const isSaved = await documentTabsStore.saveActiveDocument()
		if (!isSaved && activeDoc.state.error) {
			alert(activeDoc.state.error)
		}
		return isSaved
	}

	const handleSyncWithDrive = async () => {
		if (!activeDoc?.ref?.fileId) {
			alert('Нет связанного документа с Google Drive для синхронизации.')
			return
		}

		const result = await documentTabsStore.syncActiveDocumentWithDrive()
		if (result.status === 'conflict') {
			setConflictDialogData({
				open: true,
				localModifiedAt: result.localModifiedAt,
				remoteModifiedAt: result.remoteModifiedAt,
				hasLocalChanges: result.hasLocalChanges,
				hasRemoteChanges: result.hasRemoteChanges,
				remoteMetadata: result.remoteMetadata,
				onChooseLocal: handleChooseLocalVersion,
				onChooseRemote: handleChooseRemoteVersion,
				onCancel: handleCloseConflictDialog
			})
		} else if (result.status === 'error') {
			alert(result.message)
		}
	}

	const handleChooseLocalVersion = async () => {
		const saved = await documentTabsStore.saveActiveDocument()
		if (saved) {
			handleCloseConflictDialog()
		} else if (activeDoc?.state.error) {
			alert(activeDoc.state.error)
		}
	}

	const handleChooseRemoteVersion = async () => {
		if (!activeDoc?.ref?.fileId) return

		try {
			const content = await googleApiService.downloadFileContent(activeDoc.ref.fileId)

			// Применение данных
			const session = documentTabsStore.activeDocument
			if (session) {
				session.data = content as any
				session.state.syncStatus = 'synced'
				session.state.lastSyncedAt = Date.now()
				session.state.lastLoadedAt = Date.now()

				// Применение к сторам
				storageService.applyContent(session.data)
			}

			handleCloseConflictDialog()
		} catch (error: any) {
			alert(error.message)
		}
	}

	const handleCloseConflictDialog = () => {
		setConflictDialogData(null)
	}

	const requestUnsavedDecision = (actionName: string): Promise<YesNoCancelDecision> => {
		setUnsavedDialogActionName(actionName)
		setIsUnsavedDialogOpen(true)
		return new Promise<YesNoCancelDecision>(resolve => {
			unsavedDecisionResolverRef.current = resolve
		})
	}

	const resolveUnsavedDecision = (decision: YesNoCancelDecision) => {
		setIsUnsavedDialogOpen(false)
		setUnsavedDialogActionName('')
		const resolver = unsavedDecisionResolverRef.current
		unsavedDecisionResolverRef.current = null
		resolver?.(decision)
	}

	const ensureSafeTransition = async (actionName: string): Promise<boolean> => {
		if (!activeDoc?.state.isDirty) return true

		const decision = await requestUnsavedDecision(actionName)
		if (decision === 'cancel') return false
		if (decision === 'yes') {
			const saved = await handleSaveCurrentDocument()
			return Boolean(saved)
		}
		return true
	}

	const handleCreateNewDocument = async () => {
		const canProceed = await ensureSafeTransition('Новый документ')
		if (!canProceed) return

		documentTabsStore.openNewDocument('Новый документ')
	}

	const handleCloseDocument = async () => {
		const canProceed = await ensureSafeTransition('Закрыть документ')
		if (!canProceed) return

		if (activeDoc) {
			documentTabsStore.closeDocument(activeDoc.id)
		} else {
			storageService.resetToEmptyContent()
		}
	}

	const handleOpenDriveFilePicker = async () => {
		const canProceed = await ensureSafeTransition('Открыть документ')
		if (!canProceed) return
		setIsPickerOpen(true)
	}

	const handleLoadLastOpenedDocument = async () => {
		// Восстановление через DocumentTabsStore
		const restored = await documentTabsStore.restoreFromLocalStorage()
		if (!restored) {
			alert('В локальном хранилище нет сохранённых документов.')
		}
	}

	let icons: IconItem[] = []
	let menu: MenuItem[] = []

	menu.push({ name: 'Сохранить локально', fn: storageService.saveToLocalStorage })
	icons.push({
		name: '',
		jsx: (
			<SwgIcon>
				<Menu />
			</SwgIcon>
		),
		fn: () => {
			uiStore.toggleMenu(true)
		}
	})
	icons.push({
		name: 'Сохранить локально',
		jsx: (
			<SwgIcon>
				<Diskette />
				{storageService.isSyncWithLocalstorage || <ModifiedAsterisk />}
			</SwgIcon>
		),
		fn: storageService.saveToLocalStorage
	})

	icons.push({
		name: 'Открыть последний документ',
		jsx: (
			<SwgIcon>
				<Google />
				<DownloadSign />
			</SwgIcon>
		),
		fn: handleLoadLastOpenedDocument
	})

	if (googleApiService.isGoogleLoggedIn) {
		menu.push({ name: 'Выйти', fn: googleApiService.logOut })
		menu.push({ name: 'Новый документ', fn: handleCreateNewDocument })
		menu.push({ name: 'Закрыть документ', fn: handleCloseDocument })
		menu.push({ name: 'Сохранить', fn: handleSaveCurrentDocument })
		menu.push({ name: 'Сохранить как...', fn: handleSaveAsToDrive })
		menu.push({ name: 'Открыть последний документ', fn: handleLoadLastOpenedDocument })
		menu.push({ name: 'Открыть из Google Drive', fn: handleOpenDriveFilePicker })

		icons.push({
			name: 'Сохранить',
			jsx: (
				<SwgIcon>
					<Google />
					<UploadSign />
					{activeDoc?.state.isDirty ? <ModifiedAsterisk /> : null}
				</SwgIcon>
			),
			fn: handleSaveCurrentDocument
		})

		icons.push({
			name: 'Открыть из Google Drive',
			jsx: (
				<SwgIcon>
					<Google />
					<DownloadSign />
				</SwgIcon>
			),
			fn: handleOpenDriveFilePicker
		})

		icons.push({
			name: 'Сохранить как...',
			jsx: (
				<SwgIcon>
					<Google />
					<UploadSign />
				</SwgIcon>
			),
			fn: handleSaveAsToDrive
		})

		icons.push({
			name: 'Синхронизировать с Google Drive',
			jsx: (
				<SwgIcon>
					<Sync />
					{activeDoc?.ref?.fileId && (activeDoc.state.syncStatus === 'needs-sync' ||
						activeDoc.state.syncStatus === 'update-available' ||
						activeDoc.state.syncStatus === 'offline') && <ModifiedAsterisk />}
				</SwgIcon>
			),
			fn: handleSyncWithDrive,
			disabled: !activeDoc?.ref?.fileId
		})
	} else {
		menu.push({ name: 'Войти', fn: googleApiService.logIn })
		menu.push({ name: 'Новый документ', fn: handleCreateNewDocument })
		menu.push({ name: 'Закрыть документ', fn: handleCloseDocument })
	}

	icons.push({
		name: 'Загрузить погоду',
		jsx: (
			<SwgIcon>
				<Weather />
				<DownloadSign />
			</SwgIcon>
		),
		fn: weatherStore.loadForecast
	})
	icons.push({
		name: 'Полный экран',
		jsx: (
			<SwgIcon>
				<Fullscreen />
			</SwgIcon>
		),
		fn: fullScreen
	})

	if (uiStore.viewMode !== 'Calendar') {
		menu.push({
			name: 'Calendar',
			fn: () => {
				uiStore.changeViewMode({ mode: 'Calendar' })
			}
		})
	}

	if (uiStore.viewMode !== 'Projects') {
		menu.push({
			name: 'Projects',
			fn: () => {
				uiStore.changeViewMode({ mode: 'Projects' })
			}
		})
	}

	const handleFileSelect = async (file: IDriveItem) => {
		console.log('Selected file:', file)
		if (file.isFolder()) return

		await documentTabsStore.openFromDrive(file.id)
		if (activeDoc?.state.error) {
			alert(activeDoc.state.error)
		}
	}

	return (
		<>
			<IconBar icons={icons} />
			<Drawer open={uiStore.isMenuOpen} onClose={() => uiStore.toggleMenu(false)}>
				<List>
					{menu.map((m, i) => (
						<ListItem key={i} onClick={m.fn}>
							{m.name}
						</ListItem>
					))}
				</List>
			</Drawer>
			<DriveFilePicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={handleFileSelect} />
			<SaveToDrive />
			<YesNoCancelConfirmation
				open={isUnsavedDialogOpen}
				onDecision={resolveUnsavedDecision}
				yesLabel="Сохранить"
				noLabel="Не сохранять"
			>
				Есть несохраненные изменения.
				<br />
				Что сделать перед действием "{unsavedDialogActionName}"?
			</YesNoCancelConfirmation>
			{conflictDialogData && (
				<ConflictDialog
					open={conflictDialogData.open}
					localModifiedAt={conflictDialogData.localModifiedAt}
					remoteModifiedAt={conflictDialogData.remoteModifiedAt}
					hasLocalChanges={conflictDialogData.hasLocalChanges}
					hasRemoteChanges={conflictDialogData.hasRemoteChanges}
					remoteMetadata={conflictDialogData.remoteMetadata}
					onChooseLocal={conflictDialogData.onChooseLocal}
					onChooseRemote={conflictDialogData.onChooseRemote}
					onCancel={conflictDialogData.onCancel}
				/>
			)}
		</>
	)
})

export default CalendarIconBar

type MenuItem = {
	name: string
	fn: () => void
}
