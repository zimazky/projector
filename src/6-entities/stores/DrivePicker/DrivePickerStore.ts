import { makeAutoObservable, runInAction } from 'mobx';
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService';
import { DriveFileMetadata } from 'src/7-shared/services/gapi';

interface PathSegment {
  id: string;
  name: string;
}

export class DrivePickerStore {
  currentFolderId: string = 'root'; // ID текущей отображаемой папки, 'root' для корневой
  currentPath: PathSegment[] = [{ id: 'root', name: 'Мой диск' }]; // Массив объектов для отображения "хлебных крошек" и навигации вверх
  items: DriveFileMetadata[] = []; // Массив объектов, представляющих файлы и папки в текущей папке
  isLoading: boolean = false; // Флаг состояния загрузки
  error: string | null = null; // Сообщение об ошибке, если есть
  selectedFile: DriveFileMetadata | null = null; // Выбранный файл
  currentSpace: string = 'drive'; // 'drive' or 'appDataFolder'
  lastVisitedFolders: Map<string, { folderId: string, path: PathSegment[] }>;

  private googleApiService: GoogleApiService;

  constructor(googleApiService: GoogleApiService) {
    makeAutoObservable(this);
    this.googleApiService = googleApiService;
    this.lastVisitedFolders = new Map();
    this.lastVisitedFolders.set('drive', { folderId: 'root', path: [{ id: 'root', name: 'Мой диск' }] });
    this.lastVisitedFolders.set('appDataFolder', { folderId: 'appDataFolder', path: [{ id: 'appDataFolder', name: 'Раздел приложения' }] });
  }

  /**
   * Загружает содержимое папки с Google Drive.
   * @param folderId ID папки для загрузки.
   * @param space Пространство Google Drive (например, 'drive' или 'appDataFolder').
   */
  async loadFolder(folderId: string, space?: string) {
    if (this.isLoading) return;

    // Use the explicitly passed space, or currentSpace, or default to drive
    const targetSpace = space || this.currentSpace;

    runInAction(() => {
      this.isLoading = true;
      this.error = null;
      this.items = [];
      this.currentSpace = targetSpace; // Update current space
    });

    try {
      const driveItems = await this.googleApiService.listDriveFolderContents(folderId, undefined, targetSpace);

      runInAction(() => {
        this.currentFolderId = folderId;
        this.items = driveItems;

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
      this.lastVisitedFolders.set(this.currentSpace, {
        folderId: this.currentFolderId,
        path: this.currentPath,
      });

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
  async navigateUp() {
    if (this.currentPath.length > 1) {
      const parentFolder = this.currentPath[this.currentPath.length - 2];
      await this.loadFolder(parentFolder.id); // 'space' не передаем, используем this.currentSpace
    } else if (this.currentPath.length === 1) {
        // Если уже в корне текущего пространства, сбрасываем до его корня
        const initialInfo = this.lastVisitedFolders.get(this.currentSpace);
        if (initialInfo) {
            await this.loadFolder(initialInfo.folderId, this.currentSpace);
        }
    }
  }

  /**
   * Выбирает файл.
   * @param file Выбранный файл.
   */
  selectFile(file: DriveFileMetadata) {
    this.selectedFile = file;
  }

  /**
   * Сбрасывает состояние пикера, загружая последнее посещенное место для данного пространства.
   * @param targetSpace Пространство для инициализации (например, 'drive' или 'appDataFolder').
   */
  reset(targetSpace: string = 'drive') {
    const lastVisit = this.lastVisitedFolders.get(targetSpace);
    
    // Инициализация currentPath, currentFolderId, currentSpace
    runInAction(() => {
        this.currentSpace = targetSpace;
        this.currentFolderId = lastVisit ? lastVisit.folderId : (targetSpace === 'drive' ? 'root' : 'appDataFolder');
        this.currentPath = lastVisit ? [...lastVisit.path] : 
                          [{ id: this.currentFolderId, name: targetSpace === 'drive' ? 'Мой диск' : 'Раздел приложения' }];
        this.items = [];
        this.isLoading = false;
        this.error = null;
        this.selectedFile = null;
    });

    // Загружаем содержимое последней посещенной папки
    this.loadFolder(this.currentFolderId, this.currentSpace);
  }
}
