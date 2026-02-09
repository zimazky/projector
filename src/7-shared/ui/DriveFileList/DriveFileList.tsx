import React from 'react';
import { observer } from 'mobx-react-lite';

import TextField from 'src/7-shared/ui/TextField/TextField';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';
import DrivePureFileList from 'src/7-shared/ui/DrivePureFileList/DrivePureFileList';

import styles from './DriveFileList.module.css';

interface DriveFileListProps {
  items: IDriveItem[];
  selectedItem: IDriveItem | null;
  onItemClick: (item: IDriveItem) => void;
  onItemDoubleClick: (item: IDriveItem) => void;
  showCreateDeleteButtons?: boolean;
  isCreatingFolder: boolean;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onCreateFolderConfirm: () => void;
  onCancelCreatingFolder: () => void;
  onStartCreatingFolder: () => void;
  onStartDeletingItem: (item: IDriveItem) => void;
}

const DriveFileList: React.FC<DriveFileListProps> = observer(
  ({
    items,
    selectedItem,
    onItemClick,
    onItemDoubleClick,
    showCreateDeleteButtons = true,
    isCreatingFolder,
    newFolderName,
    onNewFolderNameChange,
    onCreateFolderConfirm,
    onCancelCreatingFolder,
    onStartCreatingFolder,
    onStartDeletingItem,

  }) => {
    return (
      <>
        {isCreatingFolder ? (
          <div className={styles.createFolderContainer}>
            <TextField
              label="Имя новой папки"
              value={newFolderName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNewFolderNameChange(e.target.value)}
            />
            <DialogActions>
              <TextButton onClick={onCancelCreatingFolder}>Отмена</TextButton>
              <TextButton
                onClick={onCreateFolderConfirm}
                disabled={!newFolderName.trim()}
              >
                Создать
              </TextButton>
            </DialogActions>
          </div>
        ) : (
          <div className={styles.scrollableListContainer}>
            {showCreateDeleteButtons && (
              <div className={styles.listActions}>
                <>
                  <TextButton
                    onClick={onStartCreatingFolder}
                  >Создать папку</TextButton>
                  <TextButton
                    onClick={() => onStartDeletingItem(selectedItem!)}
                    disabled={!selectedItem || !selectedItem.isFolder()}
                  > Удалить </TextButton>
                </>
              </div>
            )}
            <DrivePureFileList
              items={items}
              selectedItem={selectedItem}
              onItemClick={onItemClick}
              onItemDoubleClick={onItemDoubleClick}
            />
          </div>
        )}
      </>
    );
  }
);

export default DriveFileList;