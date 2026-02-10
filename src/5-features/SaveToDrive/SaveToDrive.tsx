import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import styles from './SaveToDrive.module.css';

// Import UI components
import Dialog from 'src/7-shared/ui/Dialog/Dialog';
import Modal from 'src/7-shared/ui/Modal/Modal';
import TextField from 'src/7-shared/ui/TextField/TextField';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import Spinner from 'src/7-shared/ui/Spinner/Spinner';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent';
import DriveContentExplorer from 'src/4-widgets/DriveContentExplorer/DriveContentExplorer';

import { StoreContext, IRootStore } from 'src/1-app/Providers/StoreContext';


interface SaveToDriveProps {
  // Define props if any needed to initialize the store or pass data
  // For now, the store manages its own state and takes initial data via `open` method
}

const SaveToDrive: React.FC<SaveToDriveProps> = observer(() => {
  const { saveToDriveStore } = React.useContext(StoreContext) as IRootStore;
  const [activeTab, setActiveTab] = useState(0); // 0 for My Drive, 1 for App Data Folder
  const [currentOpenedFolderId, setCurrentOpenedFolderId] = useState<string | null>(null);
  const handleCurrentFolderChange = (folderId: string) => {
    setCurrentOpenedFolderId(folderId);
  };

  const currentSpace = activeTab === 0 ? 'drive' : 'appDataFolder';

  const handleSave = () => {
    if (currentOpenedFolderId) {
      saveToDriveStore.saveFile(currentOpenedFolderId, currentSpace);
    } else {
      saveToDriveStore.error = "Пожалуйста, выберите папку для сохранения файла.";
    }
  };

  // Define state for showing the rename input field
  const [showRenameInput, setShowRenameInput] = useState(false);

  // Кнопка "Сохранить" должна быть активна, если открыта папка и введено имя файла, и нет активного диалога конфликта
  const isSaveButtonDisabled = saveToDriveStore.showConflictDialog ||
    saveToDriveStore.isSaving ||
    !saveToDriveStore.fileName.trim() ||
    !currentOpenedFolderId;
  
  const handleResolveConflict = (resolution: 'overwrite' | 'rename' | 'cancel') => {
    // Ensure currentOpenedFolderId is available when resolving conflict
    if (currentOpenedFolderId) {
      saveToDriveStore.resolveConflict(resolution, currentOpenedFolderId, currentSpace);
      setShowRenameInput(false); // Hide rename input after resolution
    } else {
      saveToDriveStore.error = "Не выбрана папка для сохранения.";
    }
  };

  const conflictingFileName = saveToDriveStore.conflictingFiles.length > 0
    ? saveToDriveStore.conflictingFiles[0].name
    : '';

  return (
    <>
      <Modal open={saveToDriveStore.isOpen} onClose={saveToDriveStore.close}>
        { /*<h3 className={styles.dialogTitle}>Сохранить на Google Диск</h3> */}
        <div className={styles.container}>
          <TextField
            label="Имя файла"
            value={saveToDriveStore.fileName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => saveToDriveStore.setFileName(e.target.value)}
            disabled={saveToDriveStore.isSaving}
          />
          <div className={styles.driveContentExplorerWrapper}>
            <DriveContentExplorer
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onCurrentFolderChange={handleCurrentFolderChange}
            />
          </div>
          <div className={styles.actions}>
            <TextButton onClick={saveToDriveStore.close} disabled={saveToDriveStore.isSaving}>
              Отмена
            </TextButton>
            <TextButton onClick={handleSave} disabled={isSaveButtonDisabled}>
              {saveToDriveStore.isSaving ? <Spinner /> : 'Сохранить'}
            </TextButton>
          </div>
        </div>
      </Modal>

      {/* Conflict Resolution Dialog */}
      <Dialog open={saveToDriveStore.showConflictDialog} onClose={saveToDriveStore.closeConflictDialog}>
        <h3 className={styles.dialogTitle}>Конфликт имени файла</h3>
        <DialogContent>
          <p>Файл "{conflictingFileName}" уже существует в этой папке. Что вы хотите сделать?</p>
          {showRenameInput && (
            <TextField
              label="Новое имя файла"
              value={saveToDriveStore.newFileNameForConflict}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => saveToDriveStore.setNewFileNameForConflict(e.target.value)}
              className={styles.fileNameInput}
            />
          )}
        </DialogContent>
        <DialogActions>
          <TextButton onClick={() => handleResolveConflict('overwrite')} disabled={saveToDriveStore.isSaving}>
            Перезаписать
          </TextButton>
          <TextButton onClick={() => setShowRenameInput(true)} disabled={saveToDriveStore.isSaving}>
            Переименовать
          </TextButton>
          <TextButton onClick={() => handleResolveConflict('rename')} disabled={saveToDriveStore.isSaving || !showRenameInput || saveToDriveStore.newFileNameForConflict.trim() === ''}>
            Подтвердить переименование
          </TextButton>
          <TextButton onClick={() => handleResolveConflict('cancel')} disabled={saveToDriveStore.isSaving}>
            Отмена
          </TextButton>
        </DialogActions>
      </Dialog>
    </>
  );
});

export default SaveToDrive;
