import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import styles from './SaveToDrive.module.css';

// Import UI components
import Dialog from 'src/7-shared/ui/Dialog/Dialog';
import TextField from 'src/7-shared/ui/TextField/TextField';
import Button from 'src/7-shared/ui/Button/Button';
import Spinner from 'src/7-shared/ui/Spinner/Spinner';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent';
import DriveContentExplorer from 'src/5-features/DriveContentExplorer/DriveContentExplorer'; // Updated import path

import { StoreContext, IRootStore } from 'src/1-app/Providers/StoreContext';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';

interface SaveToDriveProps {
  // Define props if any needed to initialize the store or pass data
  // For now, the store manages its own state and takes initial data via `open` method
}

const SaveToDrive: React.FC<SaveToDriveProps> = observer(() => {
  const { saveToDriveStore } = React.useContext(StoreContext) as IRootStore;
  const [activeTab, setActiveTab] = useState(0); // 0 for My Drive, 1 for App Data Folder
  const [selectedExplorerItem, setSelectedExplorerItem] = useState<IDriveItem | null>(null);

  const handleSave = () => {
    if (selectedExplorerItem && selectedExplorerItem.isFolder()) {
      saveToDriveStore.saveFile(selectedExplorerItem.id);
    } else {
      saveToDriveStore.error = "Пожалуйста, выберите папку для сохранения файла.";
    }
  };

  // Кнопка "Сохранить" должна быть активна, если выбрана папка и введено имя файла
  const isSaveButtonDisabled =
    saveToDriveStore.isSaving ||
    !saveToDriveStore.fileName.trim() ||
    !selectedExplorerItem ||
    !selectedExplorerItem.isFolder();

  return (
    <Dialog open={saveToDriveStore.isOpen} onClose={saveToDriveStore.close}>
      <h3 className={styles.dialogTitle}>Сохранить на Google Диск</h3>
      <DialogContent>
        <TextField
          label="Имя файла"
          value={saveToDriveStore.fileName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => saveToDriveStore.setFileName(e.target.value)}
          className={styles.fileNameInput}
          disabled={saveToDriveStore.isSaving}
        />

        {/* Интегрируем DriveContentExplorer */}
        <div className={styles.driveContentExplorerContainer}>
          <DriveContentExplorer
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onItemSelected={setSelectedExplorerItem} // DriveContentExplorer reports its selected item
            showCreateDeleteButtons={false}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={saveToDriveStore.close} disabled={saveToDriveStore.isSaving}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={isSaveButtonDisabled}>
          {saveToDriveStore.isSaving ? <Spinner /> : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default SaveToDrive;
