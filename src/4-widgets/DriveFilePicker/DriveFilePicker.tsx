import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Modal from 'src/7-shared/ui/Modal/Modal';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import Tabs from 'src/7-shared/ui/Tabs/Tabs';
import TabPanel from 'src/7-shared/ui/Tabs/TabPanel';
import TextField from 'src/7-shared/ui/TextField/TextField';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import List from 'src/7-shared/ui/List/List';
import ListItem from 'src/7-shared/ui/List/ListItem';
import Spinner from 'src/7-shared/ui/Spinner/Spinner';
import { DrivePickerStore } from 'src/6-entities/stores/DrivePicker/DrivePickerStore';
import { DriveFileMetadata } from 'src/7-shared/services/gapi';
import { StoreContext } from 'src/contexts/StoreContext';
import styles from './DriveFilePicker.module.css';

interface DriveFilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: DriveFileMetadata) => void;
}

const DriveFilePicker: React.FC<DriveFilePickerProps> = observer(({ isOpen, onClose, onSelect }) => {
  const { googleApiService } = React.useContext(StoreContext);
  const [drivePickerStore] = React.useState(() => new DrivePickerStore(googleApiService));
  const [activeTab, setActiveTab] = React.useState(0); // 0 for My Drive, 1 for App Data Folder

  React.useEffect(() => {
    if (isOpen) {
      if (activeTab === 0) {
        drivePickerStore.reset('drive');
      } else {
        drivePickerStore.reset('appDataFolder');
      }
    }
  }, [isOpen, drivePickerStore, activeTab]);


  const handleItemClick = (item: DriveFileMetadata) => {
    drivePickerStore.setSelectedItem(item); // Always select on single click
  };

  const handleItemDoubleClick = (item: DriveFileMetadata) => {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      drivePickerStore.loadFolder(item.id); // Navigate on double click for folders
    }
  };

  const handleSelectClick = () => {
    if (drivePickerStore.selectedItem) {
      onSelect(drivePickerStore.selectedItem);
      onClose();
    }
  };

  const handleBreadcrumbClick = (folderId: string) => {
    drivePickerStore.loadFolder(folderId); // No need to pass currentSpace explicitly here, it's stored
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    if (newValue === 0) {
      drivePickerStore.reset('drive');
    } else {
      drivePickerStore.reset('appDataFolder');
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className={styles.container}>
        {drivePickerStore.isLoading && (
          <div className={styles.spinnerOverlay}>
            <Spinner />
          </div>
        )}
        {drivePickerStore.error && <div className={styles.error}>{drivePickerStore.error}</div>}

        <Tabs value={activeTab} labels={['Мой диск', 'Раздел приложения']} onChange={handleTabChange} />

        <TabPanel value={activeTab} index={0}>
          <div className={styles.breadcrumb}>
            {drivePickerStore.currentPath.map((segment, index) => (
              <React.Fragment key={segment.id}>
                <span
                  className={styles.breadcrumbItem}
                  onClick={() => handleBreadcrumbClick(segment.id)}
                >
                  {segment.name}
                </span>
                {index < drivePickerStore.currentPath.length - 1 && <span className={styles.breadcrumbSeparator}> / </span>}
              </React.Fragment>
            ))}
          </div>
          {drivePickerStore.isCreatingFolder ? (
            <div className={styles.createFolderContainer}>
              <TextField
                label="Имя новой папки"
                value={drivePickerStore.newFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => drivePickerStore.setNewFolderName(e.target.value)}
              />
              <DialogActions>
                <TextButton onClick={() => drivePickerStore.cancelCreatingFolder()}>Отмена</TextButton>
                <TextButton
                  onClick={() => drivePickerStore.createFolder()}
                  disabled={!drivePickerStore.newFolderName.trim()}
                >
                  Создать
                </TextButton>
              </DialogActions>
            </div>
          ) : (
            <div className={styles.scrollableListContainer}>
              <div className={styles.listActions}>
                <>
                  <TextButton
                    onClick={() => drivePickerStore.startCreatingFolder()}
                  ><span className={styles.itemIcon}>➕</span><span className={styles.itemName}>Создать папку</span></TextButton>
                  <TextButton
                    onClick={() => drivePickerStore.startDeletingItem(drivePickerStore.selectedItem!)}
                    disabled={!drivePickerStore.selectedItem}
                  > Удалить </TextButton>
                </>
              </div>
              <List>
                {drivePickerStore.items.map((item) => (
                  <ListItem
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={item.mimeType === 'application/vnd.google-apps.folder' ? () => handleItemDoubleClick(item) : undefined}
                    selected={drivePickerStore.selectedItem?.id === item.id}
                  >
                    <span className={styles.itemIcon}>{item.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}</span>
                    <span className={styles.itemName}>{item.name}</span>
                  </ListItem>
                ))}
              </List>
            </div>
          )}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <div className={styles.breadcrumb}>
            {drivePickerStore.currentPath.map((segment, index) => (
              <React.Fragment key={segment.id}>
                <span
                  className={styles.breadcrumbItem}
                  onClick={() => handleBreadcrumbClick(segment.id)}
                >
                  {segment.name}
                </span>
                {index < drivePickerStore.currentPath.length - 1 && <span className={styles.breadcrumbSeparator}> / </span>}
              </React.Fragment>
            ))}
          </div>
          {drivePickerStore.isCreatingFolder ? (
            <div className={styles.createFolderContainer}>
              <TextField
                label="Имя новой папки"
                value={drivePickerStore.newFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => drivePickerStore.setNewFolderName(e.target.value)}
              />
              <DialogActions>
                <TextButton onClick={() => drivePickerStore.cancelCreatingFolder()}>Отмена</TextButton>
                <TextButton
                  onClick={() => drivePickerStore.createFolder()}
                  disabled={!drivePickerStore.newFolderName.trim()}
                >
                  Создать
                </TextButton>
              </DialogActions>
            </div>
          ) : (
            <div className={styles.scrollableListContainer}>
              <div className={styles.listActions}>
                <>
                  <TextButton
                    onClick={() => drivePickerStore.startCreatingFolder()}
                  ><span className={styles.itemIcon}>➕</span><span className={styles.itemName}>Создать папку</span></TextButton>
                  <TextButton
                    onClick={() => drivePickerStore.startDeletingItem(drivePickerStore.selectedItem!)}
                    disabled={!drivePickerStore.selectedItem}
                  > Удалить </TextButton>
                </>
              </div>
              <List>
                {drivePickerStore.items.map((item) => (
                  <ListItem
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={item.mimeType === 'application/vnd.google-apps.folder' ? () => handleItemDoubleClick(item) : undefined}
                    selected={drivePickerStore.selectedItem?.id === item.id}
                  >
                    <span className={styles.itemIcon}>{item.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}</span>
                    <span className={styles.itemName}>{item.name}</span>
                  </ListItem>
                ))}
              </List>
            </div>
          )}
        </TabPanel>

        <div className={styles.actions}>
          <TextButton onClick={onClose}>Отмена</TextButton>
          <TextButton onClick={handleSelectClick} disabled={!drivePickerStore.selectedItem}>Выбрать</TextButton>
        </div>
      </div>

      <Modal open={drivePickerStore.isConfirmingDelete} onClose={drivePickerStore.cancelDeletingItem}>
        <div className={styles.deleteConfirmationContainer}>
          <p>Вы действительно хотите удалить {drivePickerStore.itemToDelete?.name}?</p>
          <DialogActions>
            <TextButton onClick={() => drivePickerStore.cancelDeletingItem()}>Нет</TextButton>
            <TextButton onClick={() => drivePickerStore.deleteItem()}>Да</TextButton>
          </DialogActions>
        </div>
      </Modal>
    </Modal>
  );
});

export default DriveFilePicker;