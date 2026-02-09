import { makeAutoObservable, runInAction } from 'mobx';
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService';

export class SaveToDriveStore {
  isOpen: boolean = false;
  fileName: string = '';
  fileContent: string | Blob | null = null;
  mimeType: string = 'text/plain';
  
  isSaving: boolean = false;
  error: string | null = null;

  constructor(private googleApiService: GoogleApiService) {
    makeAutoObservable(this);
  }

  // Actions
  open = (initialFileName: string, content: string | Blob, mime: string = 'text/plain') => {
    this.isOpen = true;
    this.fileName = initialFileName;
    this.fileContent = content;
    this.mimeType = mime;
    this.error = null;
  };

  close = () => {
    this.isOpen = false;
    this.resetState();
  };

  setFileName = (name: string) => {
    this.fileName = name;
  };

  saveFile = async (selectedFolderId: string) => { // Now accepts selectedFolderId
    if (!this.fileContent || !this.fileName) {
      this.error = "Имя файла и содержимое не могут быть пустыми.";
      return;
    }

    this.isSaving = true;
    this.error = null;
    try {
      if (!this.googleApiService.isGoogleLoggedIn) {
        await this.googleApiService.logIn();
      }

      if (this.googleApiService.isGoogleLoggedIn) {
        const result = await this.googleApiService.saveFile(
          this.fileName,
          this.fileContent,
          this.mimeType,
          selectedFolderId // Use the ID of the selected folder passed as argument
        );
        runInAction(() => {
          console.log("Файл успешно сохранен:", result);
          this.close(); // Close dialog on success
        });
      } else {
        runInAction(() => {
          this.error = "Пожалуйста, войдите в Google для сохранения файла.";
        });
      }
    } catch (e: any) {
      runInAction(() => {
        console.error("Не удалось сохранить файл на Диск:", e);
        this.error = e.message || "Не удалось сохранить файл на Диск.";
      });
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  };

  private resetState = () => {
    this.fileName = '';
    this.fileContent = null;
    this.mimeType = 'text/plain';
    this.isSaving = false;
    this.error = null;
  };
}
