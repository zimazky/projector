import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Modal from 'src/7-shared/ui/Modal/Modal';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import Tabs from 'src/7-shared/ui/Tabs/Tabs';
import TabPanel from 'src/7-shared/ui/Tabs/TabPanel';
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

  const loadContentForTab = (tabIndex: number) => {
    if (tabIndex === 0) {
      drivePickerStore.loadFolder('root', 'drive');
    } else {
      drivePickerStore.loadFolder('appDataFolder', 'appDataFolder');
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      if (activeTab === 0) {
        drivePickerStore.reset('drive', 'root', 'Мой диск');
      } else {
        drivePickerStore.reset('appDataFolder', 'appDataFolder', 'Раздел приложения');
      }
      loadContentForTab(activeTab);
    }
  }, [isOpen, drivePickerStore, activeTab]);

  const handleItemClick = (item: DriveFileMetadata) => {
    // When clicking an item, the currentSpace from the store should be used for subfolder navigation
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      drivePickerStore.loadFolder(item.id, drivePickerStore.currentSpace);
    } else {
      drivePickerStore.selectFile(item);
    }
  };

  const handleSelectClick = () => {
    if (drivePickerStore.selectedFile) {
      onSelect(drivePickerStore.selectedFile);
      onClose();
    }
  };

  const handleBreadcrumbClick = (folderId: string) => {
    drivePickerStore.loadFolder(folderId, drivePickerStore.currentSpace);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    if (newValue === 0) {
      drivePickerStore.reset('drive', 'root', 'Мой диск');
    } else {
      drivePickerStore.reset('appDataFolder', 'appDataFolder', 'Раздел приложения');
    }
    // loadContentForTab will be called by useEffect due to activeTab change
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
          <div className={styles.scrollableListContainer}>
            <List>
              {drivePickerStore.items.map((item) => (
                <ListItem key={item.id} onClick={() => handleItemClick(item)}>
                  <span className={styles.itemIcon}>{item.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}</span>
                  <span className={styles.itemName}>{item.name}</span>
                </ListItem>
              ))}
            </List>
          </div>
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
          <div className={styles.scrollableListContainer}>
            <List>
              {drivePickerStore.items.map((item) => (
                <ListItem key={item.id} onClick={() => handleItemClick(item)}>
                  <span className={styles.itemIcon}>{item.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}</span>
                  <span className={styles.itemName}>{item.name}</span>
                </ListItem>
              ))}
            </List>
          </div>
        </TabPanel>

        <div className={styles.actions}>
          <TextButton onClick={onClose}>Отмена</TextButton>
          <TextButton onClick={handleSelectClick} disabled={!drivePickerStore.selectedFile}>Выбрать</TextButton>
        </div>
      </div>
    </Modal>
  );
});

export default DriveFilePicker;
