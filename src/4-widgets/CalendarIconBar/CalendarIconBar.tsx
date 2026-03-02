import React, { useContext, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'
import SwgIcon, { CompoundIcon } from 'src/7-shared/ui/Icons/SwgIcon'
import {
	Diskette,
	DownloadSign,
	Fullscreen,
	Google,
	Menu,
	ModifiedAsterisk,
	UploadSign,
	Weather
} from 'src/7-shared/ui/Icons/Icons'

import YesNoCancelConfirmation, {
	YesNoCancelDecision
} from 'src/7-shared/ui/YesNoCancelConfirmation/YesNoCancelConfirmation'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import DriveFilePicker from 'src/4-widgets/DriveFilePicker/DriveFilePicker'
import { IDriveItem } from 'src/7-shared/types/IDriveItem'

import SaveToDrive from 'src/4-widgets/SaveToDrive/SaveToDrive'

function fullScreen() {
	document.getElementById('root')?.requestFullscreen()
}

const CalendarIconBar: React.FC = observer(function () {
	const { uiStore, googleApiService, storageService, weatherStore, saveToDriveStore, documentSessionStore } =
		useContext(StoreContext)

	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [unsavedDialogActionName, setUnsavedDialogActionName] = useState('')
	const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false)
	const unsavedDecisionResolverRef = useRef<((decision: YesNoCancelDecision) => void) | null>(null)

	const handleSaveAsToDrive = () => {
		const dataToSave = storageService.getContentToSave()
		const fileName =
			documentSessionStore.state.ref?.name || `calendar_data_${new Date().toISOString().slice(0, 10)}.json`
		const mimeType = documentSessionStore.state.ref?.mimeType || 'application/json'
		saveToDriveStore.open(fileName, JSON.stringify(dataToSave, null, 2), mimeType)
	}

	const handleSaveCurrentDocument = async () => {
		if (!documentSessionStore.state.ref?.fileId) {
			alert('Нет открытого документа для сохранения. Используйте "Сохранить как...".')
			return false
		}

		const isSaved = await documentSessionStore.saveToCurrentFile()
		if (!isSaved && documentSessionStore.state.error) {
			alert(documentSessionStore.state.error)
		}
		return isSaved
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
		if (!documentSessionStore.state.isDirty) return true

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

		storageService.resetToEmptyContent()
		documentSessionStore.createNew('Новый документ', 'application/json')
	}

	const handleCloseDocument = async () => {
		const canProceed = await ensureSafeTransition('Закрыть документ')
		if (!canProceed) return

		documentSessionStore.close()
		storageService.resetToEmptyContent()
	}

	const handleOpenDriveFilePicker = async () => {
		const canProceed = await ensureSafeTransition('Открыть документ')
		if (!canProceed) return
		setIsPickerOpen(true)
	}

	const handleLoadLastOpenedDocument = async () => {
		const canProceed = await ensureSafeTransition('Открыть последний документ')
		if (!canProceed) return

		if (!googleApiService.isGoogleLoggedIn) {
			try {
				await googleApiService.logIn()
			} catch (e) {
				alert('Не удалось выполнить вход в Google.')
				return
			}
		}

		if (!googleApiService.isGoogleLoggedIn) {
			alert('Для загрузки документа требуется вход в Google.')
			return
		}

		const restored = await documentSessionStore.restoreLastOpenedDocument()
		if (!restored) {
			const message = documentSessionStore.state.error || 'В локальном хранилище нет последнего открытого документа.'
			alert(message)
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
					{documentSessionStore.state.isDirty ? <ModifiedAsterisk /> : null}
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

		await documentSessionStore.openFromDriveFile(file.id)
		if (documentSessionStore.state.error) {
			alert(documentSessionStore.state.error)
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
		</>
	)
})

export default CalendarIconBar

type MenuItem = {
	name: string
	fn: () => void
}
