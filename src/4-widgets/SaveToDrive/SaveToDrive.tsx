import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import styles from './SaveToDrive.module.css';

// Import UI components
import Modal from 'src/7-shared/ui/Modal/Modal';
import TextField from 'src/7-shared/ui/TextField/TextField';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import Spinner from 'src/7-shared/ui/Spinner/Spinner';
import DriveContentExplorer from 'src/4-widgets/DriveContentExplorer/DriveContentExplorer';

import { StoreContext, IRootStore } from 'src/1-app/Providers/StoreContext';
import ConflictResolutionDialog from 'src/5-features/FileConflictResolver/ConflictResolutionDialog';


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



  // Кнопка "Сохранить" должна быть активна, если открыта папка и введено имя файла, и нет активного диалога конфликта
  const isSaveButtonDisabled = saveToDriveStore.showConflictDialog ||
    saveToDriveStore.isSaving ||
    !saveToDriveStore.fileName.trim() ||
    !currentOpenedFolderId;
  
  const handleResolveConflict = (resolution: 'overwrite' | 'rename' | 'cancel') => {
    // Ensure currentOpenedFolderId is available when resolving conflict
    if (currentOpenedFolderId) {
      saveToDriveStore.resolveConflict(resolution, currentOpenedFolderId, currentSpace);
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

      <ConflictResolutionDialog
        isOpen={saveToDriveStore.showConflictDialog}
        onClose={saveToDriveStore.closeConflictDialog}
        conflictingFileName={conflictingFileName}
        isSaving={saveToDriveStore.isSaving}
        newFileNameForConflict={saveToDriveStore.newFileNameForConflict}
        onNewFileNameChange={saveToDriveStore.setNewFileNameForConflict}
        onResolve={handleResolveConflict}
      />
    </>
  );
});

export default SaveToDrive;