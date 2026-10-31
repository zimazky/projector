import { render, screen, fireEvent, act } from '@testing-library/react'
import { waitFor } from '@testing-library/dom'
import '@testing-library/jest-dom'
import React from 'react'

import App from 'src/1-app/App/App'
import StoreProvider from 'src/1-app/Providers/StoreProvider'

jest.mock('src/4-widgets/DriveContentExplorer/DriveContentExplorer', () => ({
	__esModule: true,
	default: () => null
}))

// Импорты сторов
import {
	projectEditorStore,
	eventsCache,
	weatherStore,
	calendarStore,
	dayListStore,
	eventFormStore,
	uiStore,
	googleApiService,
	mainStore,
	documentTabsStore,
	saveToDriveStore,
	eventSearchStore
} from 'src/1-app/root'

// Мокирование внешних зависимостей
jest.mock('src/7-shared/services/GoogleApiService', () => ({
	GoogleApiService: jest.fn().mockImplementation(() => {
		let loggedIn = false
		return {
			get isGoogleLoggedIn() {
				return loggedIn
			},
			set isGoogleLoggedIn(value: boolean) {
				loggedIn = value
			},
			userName: null,
			userEmail: null,
			userAvatarUrl: null,
			initGapi: jest.fn(),
			waitForGapiReady: jest.fn().mockResolvedValue(undefined),
			logIn: jest.fn().mockResolvedValue(undefined),
			logOut: jest.fn(),
			getFileMetadata: jest.fn(),
			downloadFileContent: jest.fn(),
			saveFile: jest.fn(),
			showPicker: jest.fn()
		}
	})
}))

const stores = {
	projectEditorStore,
	eventsCache,
	weatherStore,
	calendarStore,
	dayListStore,
	eventFormStore,
	uiStore,
	googleApiService,
	mainStore,
	documentTabsStore,
	saveToDriveStore,
	eventSearchStore,
	fileSavedNotifier: mainStore.fileSavedNotifier
}

describe('App Integration Tests', () => {
	beforeEach(() => {
		// Очистка localStorage и сброс сторов
		localStorage.clear()
		documentTabsStore.clear()
		googleApiService.isGoogleLoggedIn = false
		saveToDriveStore.close()
		;(googleApiService.saveFile as jest.Mock).mockReset()
		jest.spyOn(window, 'alert').mockImplementation(() => {})
	})

	afterEach(() => {
		// Очистка после теста
		localStorage.clear()
		act(() => {
			documentTabsStore.clear()
			saveToDriveStore.close()
		})
		jest.restoreAllMocks()
	})

	test('переключение между вкладками обновляет контент', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать первый документ (кнопка в EmptyState)
		const newDocButtonEmptyState = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButtonEmptyState)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Создать второй документ (кнопка "+" в DocumentTabs)
		const newDocButtonTabs = screen.getByTestId('new-document-button')
		fireEvent.click(newDocButtonTabs)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(2)
		})

		// Переключиться на первую вкладку
		const tabs = screen.getAllByTestId('document-tab')
		fireEvent.click(tabs[0])

		// Проверить активную вкладку
		expect(tabs[0]).toHaveClass('active')
		expect(documentTabsStore.activeDocument?.id).toBe(documentTabsStore.documents[0].id)
	})

	test('закрытие вкладки с несохранёнными изменениями показывает диалог', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать документ (кнопка в EmptyState)
		const newDocButtonEmptyState = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButtonEmptyState)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Изменить документ (эмуляция через updateActiveDocumentData)
		documentTabsStore.updateActiveDocumentData({
			projectsList: [],
			completedList: [],
			plannedList: []
		})

		// Закрыть вкладку
		const tabs = screen.getAllByTestId('document-tab')
		const closeButton = tabs[0].querySelector('button[title="Закрыть вкладку"]')
		if (closeButton) {
			fireEvent.click(closeButton)
		}

		// Проверить появление диалога подтверждения
		const dialogText = await screen.findByText(/Есть несохранённые изменения/i)
		expect(dialogText).toBeTruthy()
	})

	test('создание нового документа при наличии изменений НЕ показывает диалог и сохраняет старую вкладку', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать первый документ (кнопка в EmptyState)
		const newDocButtonEmptyState = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButtonEmptyState)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Изменить документ
		documentTabsStore.updateActiveDocumentData({
			projectsList: [],
			completedList: [],
			plannedList: []
		})

		const firstDocId = documentTabsStore.activeDocument!.id

		// Создать второй документ (кнопка "+" в DocumentTabs)
		const newDocButtonTabs = screen.getByTestId('new-document-button')
		fireEvent.click(newDocButtonTabs)

		// Проверить, что диалог НЕ появился
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(2)
		})
		const dialogText = screen.queryByText(/Есть несохранённые изменения/i)
		expect(dialogText).toBeNull()

		// Проверить, что первый документ всё ещё открыт с isDirty=true
		const firstDoc = documentTabsStore.documents.find(d => d.id === firstDocId)
		expect(firstDoc).toBeTruthy()
		expect(firstDoc!.state.isDirty).toBe(true)
	})

	test('индикатор isDirty отображается в табе', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать документ (кнопка в EmptyState)
		const newDocButtonEmptyState = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButtonEmptyState)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Проверить отсутствие индикатора изменений
		let tabs = screen.getAllByTestId('document-tab')
		let tab = tabs[0]
		let indicator = tab.querySelector('.modifiedIndicator')
		expect(indicator).toBeNull()

		// Изменить документ (оборачиваем в act для корректного обновления DOM)
		await act(async () => {
			documentTabsStore.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})
		})

		// Перенайти таб после обновления DOM
		tabs = screen.getAllByTestId('document-tab')
		tab = tabs[0]

		// Проверить появление индикатора внутри таба
		indicator = tab.querySelector('.modifiedIndicator')
		expect(indicator).toBeTruthy()
		expect(indicator?.textContent).toBe('*')
	})

	test('индикатор syncStatus отображается для документа с fileId', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать документ и установить fileId
		const newDocButton = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButton)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Установить fileId и syncStatus
		const activeDoc = documentTabsStore.activeDocument
		if (activeDoc) {
			activeDoc.ref!.fileId = 'test-file-id'
			activeDoc.state.syncStatus = 'offline'
		}

		// Проверить отображение индикатора синхронизации
		const syncIndicator = await screen.findByText('📴')
		expect(syncIndicator).toBeTruthy()
	})

	test('переключение режима просмотра работает', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Проверить, что по умолчанию отображается Calendar
		expect(uiStore.viewMode).toBe('Calendar')

		// Переключиться на Projects через меню
		const menuButton = screen.getByTitle('')
		fireEvent.click(menuButton)

		const projectsMenuItem = await screen.findByText('Projects')
		fireEvent.click(projectsMenuItem)

		await waitFor(() => {
			expect(uiStore.viewMode).toBe('Projects')
		})
	})

	test('восстановление сессии из localStorage', async () => {
		// Сначала сохраняем данные в localStorage напрямую
		const docId = 'doc-test-123'
		const tabsSnapshot = {
			activeDocumentId: docId,
			documentOrder: [docId],
			documents: [
				{
					id: docId,
					ref: {
						fileId: null,
						name: 'Тестовый документ',
						mimeType: 'application/json',
						space: null,
						parentFolderId: null
					},
					state: {
						isDirty: false,
						isLoading: false,
						isSaving: false,
						lastLoadedAt: Date.now(),
						lastSavedAt: null,
						error: null,
						syncStatus: 'offline' as const,
						lastSyncedAt: null
					},
					lastAccessedAt: Date.now()
				}
			],
			savedAt: Date.now()
		}
		const dataSnapshot = {
			data: {
				projectsList: [{ name: 'Проект 1', color: '#ff0000', background: '#ffffff' }],
				completedList: [],
				plannedList: []
			},
			savedAt: Date.now()
		}

		localStorage.setItem('documentTabs', JSON.stringify(tabsSnapshot))
		localStorage.setItem(`document_${docId}`, JSON.stringify(dataSnapshot))

		// Вызываем mainStore.init() для восстановления сессии
		mainStore.init()

		// Рендерить приложение
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Дождаться восстановления
		await waitFor(
			() => {
				expect(documentTabsStore.documents.length).toBeGreaterThan(0)
			},
			{ timeout: 2000 }
		)

		// Проверить восстановление
		expect(documentTabsStore.documents.length).toBe(1)
		expect(documentTabsStore.activeDocument?.ref?.name).toBe('Тестовый документ')
	})

	test.each(['tab', 'menu'])('закрытие из %s ждёт результата «Сохранить как»', async source => {
		googleApiService.isGoogleLoggedIn = true
		;(googleApiService.saveFile as jest.Mock).mockResolvedValue({
			status: 'success',
			file: { id: 'fake', name: 'Demo', mimeType: 'application/json' }
		})
		documentTabsStore.openNewDocument('Demo')
		documentTabsStore.updateActiveDocumentData({ projectsList: [], completedList: [], plannedList: [] })
		const documentId = documentTabsStore.activeDocument!.id
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)
		if (source === 'tab') fireEvent.click(screen.getByTitle('Закрыть вкладку'))
		else {
			fireEvent.click(screen.getByTitle(''))
			fireEvent.click(screen.getByText('Закрыть документ'))
			expect(uiStore.isMenuOpen).toBe(false)
		}
		fireEvent.click(await screen.findByText('Сохранить', { selector: 'button' }))
		await waitFor(() => expect(saveToDriveStore.isOpen).toBe(true))
		expect(documentTabsStore.documents.length).toBe(1)
		await act(async () => {
			await saveToDriveStore.saveFile('root', 'drive')
		})
		await waitFor(() => expect(documentTabsStore.documents.length).toBe(0))
		expect(localStorage.getItem(`document_${documentId}`)).toBeNull()
	})

	test.each(['tab', 'menu'])('закрытие из %s сохраняет вкладку при отказе записи', async source => {
		googleApiService.isGoogleLoggedIn = true
		;(googleApiService.saveFile as jest.Mock).mockResolvedValue({ status: 'error', message: 'Offline' })
		documentTabsStore.openNewDocument('Demo')
		const document = documentTabsStore.activeDocument!
		document.ref!.fileId = 'fake'
		document.state.isDirty = true
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)
		if (source === 'tab') fireEvent.click(screen.getByTitle('Закрыть вкладку'))
		else fireEvent.click(screen.getByText('Закрыть документ'))
		fireEvent.click(await screen.findByText('Сохранить', { selector: 'button' }))
		await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Offline'))
		expect(documentTabsStore.documents.length).toBe(1)
		expect(localStorage.getItem(`document_${document.id}`)).not.toBeNull()
	})

	test('отмена «Сохранить как» разрешает повторное закрытие без сохранения', async () => {
		documentTabsStore.openNewDocument('Demo')
		documentTabsStore.activeDocument!.state.isDirty = true
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)
		fireEvent.click(screen.getByTitle('Закрыть вкладку'))
		fireEvent.click(await screen.findByText('Сохранить', { selector: 'button' }))
		await waitFor(() => expect(saveToDriveStore.isOpen).toBe(true))
		await act(async () => {
			saveToDriveStore.close()
		})
		expect(documentTabsStore.documents.length).toBe(1)
		fireEvent.click(screen.getByTitle('Закрыть вкладку'))
		fireEvent.click(await screen.findByText('Не сохранять', { selector: 'button' }))
		await waitFor(() => expect(documentTabsStore.documents.length).toBe(0))
	})

	test('UI требует выбрать ID среди файлов с одинаковым именем', async () => {
		googleApiService.isGoogleLoggedIn = true
		documentTabsStore.openNewDocument('Demo')
		const files = [
			{ id: 'first', name: 'Demo', mimeType: 'application/json' },
			{ id: 'second', name: 'Demo', mimeType: 'application/json' }
		]
		;(googleApiService.saveFile as jest.Mock)
			.mockResolvedValueOnce({ status: 'conflict', existingFiles: files })
			.mockResolvedValueOnce({ status: 'success', file: files[1] })
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)
		fireEvent.click(screen.getByTitle('Сохранить как...'))
		await act(async () => {
			await saveToDriveStore.saveFile('root', 'drive')
		})
		expect((screen.getByText('Перезаписать') as HTMLButtonElement).disabled).toBe(true)
		fireEvent.change(screen.getByLabelText('Файл для перезаписи'), { target: { value: 'second' } })
		fireEvent.click(screen.getByText('Перезаписать'))
		await waitFor(() => expect(documentTabsStore.activeDocument?.ref?.fileId).toBe('second'))
		expect((googleApiService.saveFile as jest.Mock).mock.calls[1][5]).toBe('second')
	})

	test('новая правка при открытом «Сохранить как» остаётся локально и не закрывает вкладку', async () => {
		googleApiService.isGoogleLoggedIn = true
		;(googleApiService.saveFile as jest.Mock).mockResolvedValue({
			status: 'success',
			file: { id: 'fake', name: 'Demo', mimeType: 'application/json' }
		})
		documentTabsStore.openNewDocument('Demo')
		const document = documentTabsStore.activeDocument!
		document.state.isDirty = true
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)
		fireEvent.click(screen.getByTitle('Закрыть вкладку'))
		fireEvent.click(await screen.findByText('Сохранить', { selector: 'button' }))
		await waitFor(() => expect(saveToDriveStore.isOpen).toBe(true))
		act(() => {
			documentTabsStore
				.getDocumentStores(document.id)!
				.eventsStore.addPlannedEventDto({ name: 'New local edit', start: '2026.10.31' })
		})
		await act(async () => {
			await saveToDriveStore.saveFile('root', 'drive')
		})
		await waitFor(() => expect(window.alert).toHaveBeenCalled())
		expect(documentTabsStore.documents.length).toBe(1)
		expect(document.state.isDirty).toBe(true)
		expect(document.data.plannedList[0].name).toBe('New local edit')
		expect(JSON.parse(localStorage.getItem(`document_${document.id}`)!).data.plannedList[0].name).toBe('New local edit')
		expect(JSON.parse((googleApiService.saveFile as jest.Mock).mock.calls[0][1]).plannedList).toEqual([])
	})
})
