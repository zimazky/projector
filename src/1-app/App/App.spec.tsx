import { render, screen, fireEvent } from '@testing-library/react'
import { waitFor } from '@testing-library/dom'
import '@testing-library/jest-dom'
import React from 'react'

import App from 'src/1-app/App/App'
import StoreProvider from 'src/1-app/Providers/StoreProvider'

// Импорты сторов
import {
	projectsStore,
	projectEditorStore,
	eventsStore,
	eventsCache,
	weatherStore,
	calendarStore,
	dayListStore,
	eventFormStore,
	uiStore,
	googleApiService,
	storageService,
	mainStore,
	documentTabsStore,
	saveToDriveStore,
	eventSearchStore
} from 'src/1-app/root'

// Мокирование внешних зависимостей
jest.mock('src/7-shared/services/GoogleApiService', () => ({
	GoogleApiService: jest.fn().mockImplementation(() => ({
		isGoogleLoggedIn: false,
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
	}))
}))

const stores = {
	projectsStore,
	projectEditorStore,
	eventsStore,
	eventsCache,
	weatherStore,
	calendarStore,
	dayListStore,
	eventFormStore,
	uiStore,
	googleApiService,
	storageService,
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
	})

	afterEach(() => {
		// Очистка после теста
		localStorage.clear()
		documentTabsStore.clear()
	})

	test('переключение между вкладками обновляет контент', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать два документа
		const newDocButton = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButton)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		fireEvent.click(newDocButton)
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

		// Создать документ
		const newDocButton = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButton)
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

	test('создание нового документа при наличии изменений показывает диалог', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать первый документ
		const newDocButton = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButton)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Изменить документ
		documentTabsStore.updateActiveDocumentData({
			projectsList: [],
			completedList: [],
			plannedList: []
		})

		// Создать второй документ
		fireEvent.click(newDocButton)

		// Проверить появление диалога подтверждения
		const dialogText = await screen.findByText(/Есть несохранённые изменения/i)
		expect(dialogText).toBeTruthy()
	})

	test('индикатор isDirty отображается в табе', async () => {
		render(
			<StoreProvider {...stores}>
				<App />
			</StoreProvider>
		)

		// Создать документ
		const newDocButton = screen.getByTitle('Новый документ')
		fireEvent.click(newDocButton)
		await waitFor(() => {
			expect(documentTabsStore.documents.length).toBe(1)
		})

		// Проверить отсутствие индикатора изменений
		let indicator = screen.queryByText('*')
		expect(indicator).toBeNull()

		// Изменить документ
		documentTabsStore.updateActiveDocumentData({
			projectsList: [],
			completedList: [],
			plannedList: []
		})

		// Проверить появление индикатора
		indicator = screen.getByText('*')
		expect(indicator).toBeTruthy()
		expect(indicator?.className).toContain('modifiedIndicator')
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
})
