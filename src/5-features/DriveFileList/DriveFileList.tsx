import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { StoreContext } from 'src/1-app/Providers/StoreContext';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';
import FileList from 'src/7-shared/ui/FileList/FileList';
import Breadcrumbs from 'src/7-shared/ui/Breadcrumbs/Breadcrumbs';
import { DriveFileListStore, PathSegment } from './model/DriveFileListStore'; // Import PathSegment
import styles from './DriveFileList.module.css';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import Modal from 'src/7-shared/ui/Modal/Modal';
import TextField from 'src/7-shared/ui/TextField/TextField';
import Spinner from 'src/7-shared/ui/Spinner/Spinner';

interface DriveFileListFeatureProps {
  space: string; // 'drive' or 'appDataFolder'
  onItemSelected?: (item: IDriveItem | null) => void;
  onCurrentFolderChange?: (folderId: string, path: PathSegment[]) => void;
}

const DriveFileList: React.FC<DriveFileListFeatureProps> = observer(
  ({ space, onItemSelected, onCurrentFolderChange }) => {
    const { googleApiService, mainStore } = React.useContext(StoreContext);
    const [driveFileListStore] = React.useState(() => new DriveFileListStore(googleApiService, mainStore));

    useEffect(() => {
      driveFileListStore.reset(space);
    }, [space, driveFileListStore]);

    useEffect(() => {
      if (onItemSelected) {
        onItemSelected(driveFileListStore.selectedItem);
      }
    }, [driveFileListStore.selectedItem, onItemSelected]);

    useEffect(() => {
      if (onCurrentFolderChange) {
        onCurrentFolderChange(driveFileListStore.currentFolderId, driveFileListStore.currentPath);
      }
    }, [driveFileListStore.currentFolderId, driveFileListStore.currentPath, onCurrentFolderChange]);

    const handleItemDoubleClickInternal = (item: IDriveItem) => {
      if (item.isFolder()) {
        driveFileListStore.loadFolder(item.id);
      }
    };

    const renderContent = () => (
      <>
        <Breadcrumbs
          currentPath={driveFileListStore.currentPath}
          onBreadcrumbClick={(folderId) => driveFileListStore.loadFolder(folderId)}
        />
        <div className={styles.listActions}>
          <TextButton onClick={driveFileListStore.startCreatingFolder}>Создать папку</TextButton>
          <TextButton
            onClick={() => driveFileListStore.startDeletingItem(driveFileListStore.selectedItem!)}
            disabled={!driveFileListStore.selectedItem}
          >
            Удалить
          </TextButton>
        </div>
        <FileList
          items={driveFileListStore.items}
          selectedItem={driveFileListStore.selectedItem}
          onItemClick={driveFileListStore.setSelectedItem}
          onItemDoubleClick={handleItemDoubleClickInternal}
        />
      </>
    );

    return (
      <div className={styles.container}>
        {driveFileListStore.isLoading && (
          <div className={styles.spinnerOverlay}>
            <Spinner />
          </div>
        )}
        {driveFileListStore.error && <div className={styles.error}>{driveFileListStore.error}</div>}

        {driveFileListStore.isCreatingFolder ? (
          <div className={styles.createFolderContainer}>
            <TextField
              label="Имя новой папки"
              value={driveFileListStore.newFolderName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => driveFileListStore.setNewFolderName(e.target.value)}
            />
            <DialogActions>
              <TextButton onClick={driveFileListStore.cancelCreatingFolder}>Отмена</TextButton>
              <TextButton
                onClick={driveFileListStore.createFolder}
                disabled={!driveFileListStore.newFolderName.trim()}
              >
                Создать
              </TextButton>
            </DialogActions>
          </div>
        ) : (
          renderContent()
        )}

        <Modal open={driveFileListStore.isConfirmingDelete} onClose={driveFileListStore.cancelDeletingItem}>
          <div className={styles.deleteConfirmationContainer}>
            <p>Вы действительно хотите удалить {driveFileListStore.itemToDelete?.name}?</p>
            <DialogActions>
              <TextButton onClick={driveFileListStore.cancelDeletingItem}>Нет</TextButton>
              <TextButton onClick={driveFileListStore.deleteItem}>Да</TextButton>
            </DialogActions>
          </div>
        </Modal>
      </div>
    );
  }
);

export default DriveFileList;
