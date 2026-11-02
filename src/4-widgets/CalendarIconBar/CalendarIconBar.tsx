import { downloadJson } from 'src/7-shared/libs/downloadJson'
import { serializeDocumentData } from 'src/6-entities/Document/model/DocumentFormat'
import { storageSizeLabel } from 'src/6-entities/Document/model/DocumentStorageDiagnostic'
import React, { useState } from 'react'
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

import { useStores } from 'src/1-app/Providers/StoreContext'
import DriveFilePicker from 'src/4-widgets/DriveFilePicker/DriveFilePicker'
import { getDocumentUiState } from 'src/6-entities/Document/model/DocumentSyncSelectors'
import type { SyncResult } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import { IDriveItem } from 'src/7-shared/types/IDriveItem'

import SaveToDrive from 'src/4-widgets/SaveToDrive/SaveToDrive'
import ConflictDialog, { type ConflictDialogProps } from 'src/7-shared/ui/ConflictDialog'
import styles from './CalendarIconBar.module.css'

function fullScreen() {
	document.getElementById('root')?.requestFullscreen()
}

const CalendarIconBar: React.FC<{ onCloseDocument: (id: string) => Promise<void> }> = observer(function ({
	onCloseDocument
}) {
	const { uiStore, googleApiService, weatherStore, saveToDriveStore, documentTabsStore } = useStores()

	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [conflictDialogData, setConflictDialogData] = useState<ConflictDialogProps | null>(null)

	const activeDoc = documentTabsStore.activeDocument
	const documentUi = activeDoc ? getDocumentUiState(activeDoc) : null
	const [saveNotice, setSaveNotice] = useState('')
	const sessionInput = React.useRef<HTMLInputElement>(null)
	const cleanupOldStorage = async () => {
		setSaveNotice('Архивирование и очистка старых локальных записей…')
		try {
			const result = await documentTabsStore.cleanupLegacyLocalStorage()
			setSaveNotice(
				result.archivedEntries === 0
					? 'Старых локальных записей для очистки нет.'
					: 'Удалено старых записей: ' +
							result.removedEntries +
							'. Освобождено примерно ' +
							storageSizeLabel(result.freedBytes) +
							'. Архив сохранён в IndexedDB.' +
							(result.changedEntries ? ' Изменившихся записей оставлено: ' + result.changedEntries + '.' : '') +
							(result.failedEntries
								? ' Не удалось удалить записей: ' + result.failedEntries + '. Повторите очистку.'
								: '')
			)
		} catch (error: unknown) {
			setSaveNotice('Очистка не выполнена. Старые записи сохранены.')
			window.alert(error instanceof Error ? error.message : 'Не удалось архивировать старые записи.')
		}
	}
	const exportRecovery = async () => {
		try {
			downloadJson(await documentTabsStore.exportRecoverySource(), 'projector-recovery-source.json')
		} catch {
			window.alert('Не удалось экспортировать резервные снимки.')
		}
	}
	const importSession = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.currentTarget.files?.[0]
		event.currentTarget.value = ''
		if (!file) return
		try {
			const count = documentTabsStore.importLocalSession(await file.text())
			setSaveNotice(
				'Восстановлено вкладок: ' + count + '. Прежние вкладки сохранены. Локальная запись выполняется отдельно.'
			)
		} catch (error: unknown) {
			window.alert(error instanceof Error ? error.message : 'Не удалось прочитать архив сессии.')
		}
	}

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
		if (result.status === 'conflict' && result.conflict) presentConflict(result.conflict)
		else if (result.status === 'failed' || result.status === 'conflict') window.alert(result.message)
		else if (result.status === 'saved') setSaveNotice('Документ сохранён в Google Drive.')
	}

	const handleSyncWithDrive = async () => {
		if (!activeDoc?.ref?.fileId) {
			alert('Нет связанного документа с Google Drive для синхронизации.')
			return
		}

		const result = await documentTabsStore.checkDocument(activeDoc.id)
		if (result.status === 'conflict') presentConflict(result)
		else if (result.status === 'error') alert(result.message)
	}

	const presentConflict = (result: Extract<SyncResult, { status: 'conflict' }>) => {
		if (!documentTabsStore.isDocumentOperationCurrent(result.context)) return
		// Решение относится к проверенной сессии, даже если пользователь переключит вкладку.
		const chooseVersion = async (choice: 'local' | 'remote') => {
			const resolved = await documentTabsStore.resolveDocumentConflict(result.context, choice)
			if (resolved.status === 'conflict' && resolved.conflict) presentConflict(resolved.conflict)
			else {
				closeThisConflict()
				if (resolved.status === 'failed' || resolved.status === 'conflict') alert(resolved.message)
				else if (resolved.status === 'saved') setSaveNotice('Локальная версия сохранена в текущий файл Drive.')
			}
		}
		const closeThisConflict = () => setConflictDialogData(current => (current === dialog ? null : current))
		const dialog: ConflictDialogProps = {
			ui: getDocumentUiState(result.context.session),
			open: true,
			localModifiedAt: result.localModifiedAt,
			remoteModifiedAt: result.remoteModifiedAt,
			hasLocalChanges: result.hasLocalChanges,
			hasRemoteChanges: result.hasRemoteChanges,
			remoteMetadata: result.remoteMetadata,
			onChooseLocal: () => void chooseVersion('local'),
			onChooseRemote: () => void chooseVersion('remote'),
			onCancel: closeThisConflict
		}
		setConflictDialogData(dialog)
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
		name: 'Меню',
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
					{documentUi?.showModifiedMark ? <ModifiedAsterisk /> : null}
				</SwgIcon>
			),
			fn: handleSaveCurrentDocument,
			disabled: !!activeDoc && activeDoc.operation !== 'idle'
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
					{documentUi?.showSyncIcon && <ModifiedAsterisk />}
				</SwgIcon>
			),
			fn: handleSyncWithDrive,
			disabled: !documentUi?.canSync
		})
	} else {
		menu.push({ name: 'Войти', fn: googleApiService.logIn })
		menu.push({ name: 'Новый документ', fn: handleCreateNewDocument })
		menu.push({ name: 'Закрыть документ', fn: handleCloseDocument })
	}

	menu.push({ name: 'Импортировать сессию из файла', fn: () => sessionInput.current?.click() })
	menu.push({ name: 'Экспортировать резервные снимки', fn: exportRecovery })
	menu.push({
		name: documentTabsStore.isCleaningLegacyStorage ? 'Очистка старых записей…' : 'Очистить старые локальные записи',
		fn: cleanupOldStorage
	})
	if (activeDoc)
		menu.push({
			name: 'Экспортировать документ',
			fn: () => {
				try {
					const data = documentTabsStore.getDocumentDataForSave(activeDoc.id) ?? activeDoc.data
					downloadJson(serializeDocumentData(data), (activeDoc.ref?.name || 'projector') + '.json')
				} catch {
					alert('Не удалось экспортировать документ.')
				}
			}
		})

	icons.push({
		name: weatherStore.state === 'error' ? 'Повторить загрузку погоды' : 'Загрузить погоду',
		jsx: (
			<SwgIcon>
				<Weather />
				<DownloadSign />
			</SwgIcon>
		),
		fn: weatherStore.loadForecast,
		disabled: weatherStore.state === 'pending'
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

	if (documentTabsStore.getActiveDocumentStores()?.resourceStores) {
		for (const [mode, name] of [
			['Accounts', 'Счета'],
			['Resources', 'Ресурсы'],
			['Categories', 'Категории'],
			['Balances', 'Остатки']
		] as const) {
			menu.push({ name, fn: () => uiStore.changeViewMode({ mode }) })
		}
	}

	const handleFileSelect = async (file: IDriveItem) => {
		console.log('Selected file:', file)
		if (file.isFolder()) return

		const result = await documentTabsStore.openFromDrive(file.id)
		if (result.status === 'failed' || result.status === 'conflict') alert(result.message)
	}

	return (
		<>
			<input
				ref={sessionInput}
				type="file"
				accept=".json,application/json"
				hidden
				onChange={importSession}
				data-testid="session-import-input"
			/>
			<IconBar icons={icons} />
			<div className={styles.notices}>
				{weatherStore.state === 'pending' && (
					<div role="status" className={styles.saveNotice}>
						Загрузка погоды: {weatherStore.locationName}…
					</div>
				)}
				{weatherStore.state === 'error' && (
					<div role="alert" className={`${styles.saveNotice} ${styles.weatherError}`}>
						{weatherStore.errorMessage}
						<button type="button" className={styles.weatherRetry} onClick={weatherStore.loadForecast}>
							Повторить загрузку погоды
						</button>
					</div>
				)}
				{saveNotice && (
					<div role="status" className={styles.saveNotice}>
						{saveNotice}
						<button type="button" title="Закрыть уведомление" onClick={() => setSaveNotice('')}>
							×
						</button>
					</div>
				)}
			</div>
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
					ui={conflictDialogData.ui}
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
