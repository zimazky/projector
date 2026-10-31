import React, { useContext, useState } from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'
import SwgIcon from 'src/7-shared/ui/Icons/SwgIcon'
import {
	DownloadSign,
	Fullscreen,
	Google,
	Menu,
	ModifiedAsterisk,
	UploadSign,
	Weather,
	Sync
} from 'src/7-shared/ui/Icons/Icons'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import DriveFilePicker from 'src/4-widgets/DriveFilePicker/DriveFilePicker'
import { IDriveItem } from 'src/7-shared/types/IDriveItem'

import SaveToDrive from 'src/4-widgets/SaveToDrive/SaveToDrive'
import ConflictDialog, { type ConflictDialogProps } from 'src/7-shared/ui/ConflictDialog'

function fullScreen() {
	document.getElementById('root')?.requestFullscreen()
}

const CalendarIconBar: React.FC<{ onCloseDocument: (id: string) => Promise<void> }> = observer(function ({
	onCloseDocument
}) {
	const { uiStore, googleApiService, weatherStore, saveToDriveStore, documentTabsStore } = useContext(StoreContext)

	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [conflictDialogData, setConflictDialogData] = useState<ConflictDialogProps | null>(null)

	const activeDoc = documentTabsStore.activeDocument

	// Слушаем кастомное событие для открытия Drive file picker из EmptyState
	React.useEffect(() => {
		const handleOpenPicker = () => {
			setIsPickerOpen(true)
		}
		window.addEventListener('open-drive-file-picker' as any, handleOpenPicker)
		return () => {
			window.removeEventListener('open-drive-file-picker' as any, handleOpenPicker)
		}
	}, [])

	const handleSaveAsToDrive = async () => {
		if (activeDoc) await saveToDriveStore.openForDocument(activeDoc.id)
	}

	const handleSaveCurrentDocument = async () => {
		if (!activeDoc) return
		const result = activeDoc.ref?.fileId
			? await documentTabsStore.saveDocument(activeDoc.id)
			: await saveToDriveStore.openForDocument(activeDoc.id)
		if (result.status === 'failed' || result.status === 'conflict') window.alert(result.message)
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
			documentTabsStore.applyContentToActiveDocument(content)
			handleCloseConflictDialog()
		} catch (error: any) {
			alert(error.message)
		}
	}

	const handleCloseConflictDialog = () => {
		setConflictDialogData(null)
	}

	const handleCreateNewDocument = () => {
		documentTabsStore.openNewDocument('Новый документ')
	}

	const handleCloseDocument = async () => {
		if (activeDoc) await onCloseDocument(activeDoc.id)
	}

	const handleOpenDriveFilePicker = () => {
		setIsPickerOpen(true)
	}

	let icons: IconItem[] = []
	let menu: MenuItem[] = []

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

	if (googleApiService.isGoogleLoggedIn) {
		menu.push({ name: 'Выйти', fn: googleApiService.logOut })
		menu.push({ name: 'Новый документ', fn: handleCreateNewDocument })
		menu.push({ name: 'Закрыть документ', fn: handleCloseDocument })
		menu.push({ name: 'Сохранить', fn: handleSaveCurrentDocument })
		menu.push({ name: 'Сохранить как...', fn: handleSaveAsToDrive })
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
					{activeDoc?.ref?.fileId &&
						(activeDoc.state.syncStatus === 'needs-sync' ||
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
						<ListItem
							key={i}
							onClick={() => {
								uiStore.toggleMenu(false)
								m.fn()
							}}
						>
							{m.name}
						</ListItem>
					))}
				</List>
			</Drawer>
			<DriveFilePicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={handleFileSelect} />
			<SaveToDrive />
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
