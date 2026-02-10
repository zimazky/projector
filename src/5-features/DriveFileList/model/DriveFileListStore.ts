import { makeAutoObservable, runInAction } from 'mobx';
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService';
import { DriveFileMetadata } from 'src/7-shared/services/gapi';
import { IDriveItem } from 'src/7-shared/types/IDriveItem'; // Новый импорт
import { createDriveItem } from 'src/7-shared/adapters/GoogleDriveItemAdapter'; // Новый импорт
import { MainStore } from 'src/1-app/Stores/MainStore'; // Import MainStore

export interface PathSegment {
  id: string;
  name: string;
}

export class DriveFileListStore {
  currentFolderId: string = 'root'; // ID текущей отображаемой папки, 'root' для корневой
  currentPath: PathSegment[] = [{ id: 'root', name: 'Мой диск' }]; // Массив объектов для отображения "хлебных крошек" и навигации вверх
  items: IDriveItem[] = []; // Изменено
  isLoading: boolean = false; // Флаг состояния загрузки
  error: string | null = null; // Сообщение об ошибке, если есть
  selectedItem: IDriveItem | null = null; // Изменено
  isCreatingFolder: boolean = false;
  newFolderName: string = '';
  currentFolderMetadata: DriveFileMetadata | null = null; // Здесь остается DriveFileMetadata
  isConfirmingDelete: boolean = false;
  itemToDelete: IDriveItem | null = null; // Изменено
  currentSpace: string = 'drive'; // 'drive' or 'appDataFolder'

  private googleApiService: GoogleApiService;
  private mainStore: MainStore; // Reference to MainStore

  constructor(googleApiService: GoogleApiService, mainStore: MainStore) {
    makeAutoObservable(this);
    this.googleApiService = googleApiService;
    this.mainStore = mainStore;

    // Subscribe to file saved notifications
    this.mainStore.fileSavedNotifier.subscribe(() => {
      // Refresh the current folder when a file is saved
      this.loadFolder(this.currentFolderId, this.currentSpace);
    });
  }

  setNewFolderName = (name: string) => {
    this.newFolderName = name;
  }

  startCreatingFolder = () => {
    this.isCreatingFolder = true;
    this.newFolderName = ''; // Clear previous name
  }

  cancelCreatingFolder = () => {
    this.isCreatingFolder = false;
    this.newFolderName = '';
  }

  createFolder = async () => {
    this.isLoading = true;
    this.error = null;
    try {
      const newFolder = await this.googleApiService.createFolder(this.newFolderName, this.currentFolderId);
      runInAction(() => {
        this.isCreatingFolder = false;
        this.newFolderName = '';
        this.isLoading = false; // Reset isLoading before loading the folder
        this.loadFolder(this.currentFolderId, this.currentSpace);
      });
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || 'Ошибка при создании папки.';
        console.error('Error creating folder:', err);
        this.isLoading = false; // Ensure isLoading is reset on error
      });
    }
  }

  startDeletingItem = (item: IDriveItem) => {
    this.isConfirmingDelete = true;
    this.itemToDelete = item;
  }

  cancelDeletingItem = () => {
    this.isConfirmingDelete = false;
    this.itemToDelete = null;
  }

  deleteItem = async () => {
    if (!this.itemToDelete) return;

    this.isLoading = true;
    this.error = null;
    try {
      await this.googleApiService.deleteItem(this.itemToDelete.id);
      runInAction(() => {
        this.isConfirmingDelete = false;
        this.itemToDelete = null;
        this.isLoading = false; // Reset isLoading before loading the folder
        this.loadFolder(this.currentFolderId, this.currentSpace);
      });
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || 'Ошибка при удалении элемента.';
        console.error('Error deleting item:', err);
        this.isLoading = false; // Ensure isLoading is reset on error
      });
    }
  }

  /**
   * Загружает содержимое папки с Google Drive.
   * @param folderId ID папки для загрузки.
   * @param space Пространство Google Drive (например, 'drive' или 'appDataFolder').
   */
  loadFolder = async (folderId: string, space?: string) => {
    if (this.isLoading) return;

    // Use the explicitly passed space, or currentSpace, or default to drive
    const targetSpace = space || this.currentSpace;

    runInAction(() => {
      this.isLoading = true;
      this.error = null;
      this.items = [];
      this.selectedItem = null; // Очищаем выбранный элемент при загрузке новой папки
      this.currentSpace = targetSpace; // Update current space
    });

    try {
      const driveItems = await this.googleApiService.listDriveFolderContents(folderId, undefined, targetSpace);
      const currentFolderMetadata = await this.googleApiService.getFileMetadata(folderId);

      runInAction(() => {
        this.currentFolderId = folderId;
        this.currentFolderMetadata = currentFolderMetadata;
        // Преобразуем DriveFileMetadata в IDriveItem
        this.items = driveItems.map(item => createDriveItem(item));


        // Обновляем currentPath
        // Если это первая загрузка для пространства или переключение вкладок,
        // инициализируем путь
        const isInitialLoadForSpace = (folderId === 'root' && targetSpace === 'drive') || (folderId === 'appDataFolder' && targetSpace === 'appDataFolder');

        if (isInitialLoadForSpace) {
          this.currentPath = [{ 
            id: folderId, 
            name: targetSpace === 'drive' ? 'Мой диск' : 'Раздел приложения' 
          }];
        } else {
          const existingPathIndex = this.currentPath.findIndex(segment => segment.id === folderId);
          if (existingPathIndex === -1) {
            // Если папка не 'root'/'appDataFolder' и не в пути, получаем ее имя и добавляем в путь
            this.googleApiService.getFileMetadata(folderId)
              .then(metadata => {
                runInAction(() => {
                  this.currentPath.push({ id: folderId, name: metadata.name });
                });
              })
              .catch(err => {
                console.error('Error fetching folder metadata for breadcrumb:', err);
                runInAction(() => {
                  this.currentPath.push({ id: folderId, name: 'Неизвестная папка' }); // Fallback
                });
              });
          } else {
            // Если папка уже в пути, обрезаем путь до нее
            this.currentPath = this.currentPath.slice(0, existingPathIndex + 1);
          }
        }
      });

        // Сохраняем последнее посещенное место для текущего пространства
        this.mainStore.updateDriveExplorerPersistentState(this.currentSpace, this.currentFolderId, this.currentPath);

    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || 'Ошибка загрузки содержимого Google Drive.';
        console.error('Error loading drive folder contents:', err);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Переходит на уровень выше в иерархии папок.
   */
  navigateUp = async () => {
    if (this.currentPath.length > 1) {
      const parentFolder = this.currentPath[this.currentPath.length - 2];
      await this.loadFolder(parentFolder.id); // 'space' не передаем, используем this.currentSpace
    } else if (this.currentPath.length === 1) {
        // Если уже в корне текущего пространства, сбрасываем до его корня
        const initialInfo = this.mainStore.getDriveExplorerPersistentState(this.currentSpace);
        if (initialInfo) {
            await this.loadFolder(initialInfo.folderId, this.currentSpace);
        }
    }
  }

  /**
   * Устанавливает выбранный элемент (файл или папку).
   * @param item Выбранный элемент.
   */
  setSelectedItem = (item: IDriveItem) => {
    this.selectedItem = item;
  }

  /**
   * Сбрасывает состояние пикера, загружая последнее посещенное место для данного пространства.
   * @param targetSpace Пространство для инициализации (например, 'drive' или 'appDataFolder').
   */
  reset = (targetSpace: string = 'drive') => {
    const lastVisit = this.mainStore.getDriveExplorerPersistentState(targetSpace);
    
    // Инициализация currentPath, currentFolderId, currentSpace
    runInAction(() => {
        this.currentSpace = targetSpace;
        this.currentFolderId = lastVisit.folderId;
        this.currentPath = [...lastVisit.path]; 
        this.items = [];
        this.isLoading = false;
        this.error = null;
        this.selectedItem = null;
    });

    // Загружаем содержимое последней посещенной папки
    this.loadFolder(this.currentFolderId, this.currentSpace);
  }
}
