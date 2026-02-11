import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';

import DriveContentExplorer from 'src/4-widgets/DriveContentExplorer/DriveContentExplorer';

import Modal from 'src/7-shared/ui/Modal/Modal';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';

import styles from './DriveFilePicker.module.css';

interface DriveFilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: IDriveItem) => void;
}

const DriveFilePicker: React.FC<DriveFilePickerProps> = observer(({ isOpen, onClose, onSelect }) => {
  const [activeTab, setActiveTab] = useState(0); // 0 for My Drive, 1 for App Data Folder
  const [selectedExplorerItem, setSelectedExplorerItem] = useState<IDriveItem | null>(null);

  const handleSelectClick = () => {
    if (selectedExplorerItem) {
      onSelect(selectedExplorerItem);
      onClose();
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className={styles.container}>
        <div className={styles.driveContentExplorerWrapper}>
          <DriveContentExplorer
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onItemSelected={setSelectedExplorerItem} // DriveContentExplorer reports its selected item
          />
        </div>
        <div className={styles.actions}>
          <TextButton onClick={onClose}>Отмена</TextButton>
          <TextButton onClick={handleSelectClick} disabled={!selectedExplorerItem || selectedExplorerItem.isFolder()}>Выбрать</TextButton>
        </div>
      </div>
    </Modal>
  );
});

export default DriveFilePicker;