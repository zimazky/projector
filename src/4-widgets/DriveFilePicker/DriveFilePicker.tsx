import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Modal from 'src/7-shared/ui/Modal/Modal';
import TextButton from 'src/7-shared/ui/Button/TextButton';
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
  const { googleApiService } = React.useContext(StoreContext); // Assuming GoogleApiService is provided via context
  
  // Create a new store instance for the picker, or get from context if it's meant to be a singleton
  // For now, let's assume it's created here, but injected via constructor is more MobX idiomatic for singleton stores
  const [drivePickerStore] = React.useState(() => new DrivePickerStore(googleApiService));

  useEffect(() => {
    if (isOpen) {
      drivePickerStore.reset();
      drivePickerStore.loadFolder('root');
    }
  }, [isOpen, drivePickerStore]);

  const handleItemClick = (item: DriveFileMetadata) => {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      drivePickerStore.loadFolder(item.id);
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
    drivePickerStore.loadFolder(folderId);
  };

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className={styles.container}>
        {drivePickerStore.isLoading && <Spinner />}
        {drivePickerStore.error && <div className={styles.error}>{drivePickerStore.error}</div>}

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

        <div className={styles.actions}>
          <TextButton onClick={onClose}>Отмена</TextButton>
          <TextButton onClick={handleSelectClick} disabled={!drivePickerStore.selectedFile}>Выбрать</TextButton>
        </div>
      </div>
    </Modal>
  );
});

export default DriveFilePicker;
