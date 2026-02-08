import { makeAutoObservable, runInAction } from 'mobx';
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService';
import { DriveFileMetadata } from 'src/7-shared/services/gapi';

interface PathSegment {
  id: string;
  name: string;
}

export class DrivePickerStore {
  currentFolderId: string | null = 'root'; // ID текущей отображаемой папки, 'root' для корневой
  currentPath: PathSegment[] = [{ id: 'root', name: 'Мой диск' }]; // Массив объектов для отображения "хлебных крошек" и навигации вверх
  items: DriveFileMetadata[] = []; // Массив объектов, представляющих файлы и папки в текущей папке
  isLoading: boolean = false; // Флаг состояния загрузки
  error: string | null = null; // Сообщение об ошибке, если есть
  selectedFile: DriveFileMetadata | null = null; // Выбранный файл

  private googleApiService: GoogleApiService;

  constructor(googleApiService: GoogleApiService) {
    makeAutoObservable(this);
    this.googleApiService = googleApiService;
  }

  /**
   * Загружает содержимое папки с Google Drive.
   * @param folderId ID папки для загрузки.
   */
  async loadFolder(folderId: string) {
    if (this.isLoading) return;

    runInAction(() => {
      this.isLoading = true;
      this.error = null;
      this.items = [];
    });

    try {
      const driveItems = await this.googleApiService.listDriveFolderContents(folderId);

      runInAction(() => {
        this.currentFolderId = folderId;
        this.items = driveItems;

        // Обновляем currentPath
        if (folderId === 'root') {
          this.currentPath = [{ id: 'root', name: 'Мой диск' }];
        } else {
          const existingPathIndex = this.currentPath.findIndex(segment => segment.id === folderId);
          if (existingPathIndex === -1) {
            // Если папка не 'root' и не в пути, получаем ее имя и добавляем в путь
            // Это требует получения метаданных самой папки
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
      await this.loadFolder(parentFolder.id);
      runInAction(() => {
        this.currentPath.pop(); // Удаляем текущую папку из пути
      });
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
   * Сбрасывает состояние пикера.
   */
  reset() {
    this.currentFolderId = 'root';
    this.currentPath = [{ id: 'root', name: 'Мой диск' }];
    this.items = [];
    this.isLoading = false;
    this.error = null;
    this.selectedFile = null;
  }
}
