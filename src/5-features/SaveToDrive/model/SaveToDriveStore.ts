import { makeAutoObservable, runInAction } from 'mobx';
import { GoogleApiService, SaveFileResult } from 'src/7-shared/services/GoogleApiService';
import { DriveFileMetadata } from 'src/7-shared/services/gapi'; // Import DriveFileMetadata

export class SaveToDriveStore {
  isOpen: boolean = false;
  fileName: string = '';
  fileContent: string | Blob | null = null;
  mimeType: string = 'text/plain';

  isSaving: boolean = false;
  error: string | null = null;

  // New state for conflict resolution
  showConflictDialog: boolean = false;
  conflictingFiles: DriveFileMetadata[] = [];
  newFileNameForConflict: string = ''; // For the rename option

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
    this.resetConflictState(); // Ensure conflict state is reset on open
  };

  close = () => {
    this.isOpen = false;
    this.resetState();
    this.resetConflictState();
  };

  setFileName = (name: string) => {
    this.fileName = name;
  };

  setNewFileNameForConflict = (name: string) => {
    this.newFileNameForConflict = name;
  };

  closeConflictDialog = () => {
    this.showConflictDialog = false;
    this.resetConflictState();
  };

  // The core save method, now handling conflict resolution
  saveFile = async (selectedFolderId: string, spaces: string, currentFileName: string = this.fileName, fileContentToSave: string | Blob | null = this.fileContent, fileIdToUpdate: string | null = null) => {
    if (!fileContentToSave || !currentFileName) {
      this.error = "Имя файла и содержимое не могут быть пустыми.";
      runInAction(() => { this.isSaving = false; }); // Ensure isSaving is reset on early exit
      return;
    }

    this.isSaving = true;
    this.error = null;
    try {
      if (!this.googleApiService.isGoogleLoggedIn) {
        await this.googleApiService.logIn();
      }

      if (this.googleApiService.isGoogleLoggedIn) {
        const result: SaveFileResult = await this.googleApiService.saveFile(
          currentFileName,
          fileContentToSave,
          this.mimeType,
          selectedFolderId,
          spaces, // Pass spaces to GoogleApiService.saveFile
          fileIdToUpdate // Pass the file ID if we are updating
        );

        runInAction(() => {
          if (result.status === 'success') {
            console.log("Файл успешно сохранен:", result.file);
            this.close(); // Close dialog on success
          } else if (result.status === 'conflict') {
            this.conflictingFiles = result.existingFiles;
            this.newFileNameForConflict = this.generateUniqueFileName(currentFileName, result.existingFiles); // Suggest a new name
            this.showConflictDialog = true; // Show conflict dialog
          } else { // result.status === 'error'
            this.error = result.message;
          }
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

  // Action to resolve conflict based on user's choice
  resolveConflict = async (resolution: 'overwrite' | 'rename' | 'cancel', selectedFolderId: string, spaces: string) => {
    this.closeConflictDialog(); // Close the conflict dialog immediately

    if (resolution === 'cancel') {
      this.isSaving = false; // Stop saving process
      return;
    }

    if (!this.fileContent) {
      this.error = "Содержимое файла отсутствует.";
      return;
    }

    if (resolution === 'overwrite') {
      const fileToOverwriteId = this.conflictingFiles.length > 0 ? this.conflictingFiles[0].id : null;
      if (fileToOverwriteId) {
        // Call saveFile again, but this time with the ID of the file to update
        await this.saveFile(selectedFolderId, spaces, this.fileName, this.fileContent, fileToOverwriteId);
      } else {
        this.error = "Нет файла для перезаписи.";
      }
    } else if (resolution === 'rename') {
      if (this.newFileNameForConflict.trim() === '') {
        this.error = "Новое имя файла не может быть пустым.";
        return;
      }
      // Call saveFile again, but with the new unique name
      await this.saveFile(selectedFolderId, spaces, this.newFileNameForConflict, this.fileContent);
    }
  };

  private resetState = () => {
    this.fileName = '';
    this.fileContent = null;
    this.mimeType = 'text/plain';
    this.isSaving = false;
    this.error = null;
  };

  private resetConflictState = () => {
    this.showConflictDialog = false;
    this.conflictingFiles = [];
    this.newFileNameForConflict = '';
  };

  private generateUniqueFileName = (originalName: string, existingFiles: DriveFileMetadata[]): string => {
    let newName = originalName;
    let counter = 1;
    const nameParts = originalName.split('.');
    const extension = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
    const nameWithoutExt = nameParts.join('.');

    while (existingFiles.some(file => file.name === newName)) {
        newName = `${nameWithoutExt} (${counter})${extension}`;
        counter++;
    }
    return newName;
  };
}
