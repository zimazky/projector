import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { StoreContext } from 'src/1-app/Providers/StoreContext';
import Tabs from 'src/7-shared/ui/Tabs/Tabs';
import TabPanel from 'src/7-shared/ui/Tabs/TabPanel';
import Spinner from 'src/7-shared/ui/Spinner/Spinner';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';
import DriveFileList from 'src/7-shared/ui/DriveFileList/DriveFileList';
import Breadcrumbs from 'src/7-shared/ui/Breadcrumbs/Breadcrumbs';
import { DriveContentExplorerStore } from 'src/5-features/DriveContentExplorer/model/DriveContentExplorerStore';
import styles from './DriveContentExplorer.module.css';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import Modal from 'src/7-shared/ui/Modal/Modal';


interface DriveContentExplorerProps {
  activeTab: number;
  setActiveTab: (tabIndex: number) => void;
  onItemSelected: (item: IDriveItem | null) => void; // New prop to communicate selected item
  showCreateDeleteButtons?: boolean;
}

const DriveContentExplorer: React.FC<DriveContentExplorerProps> = observer(
  ({ activeTab, setActiveTab, onItemSelected, showCreateDeleteButtons = true }) => {
    const { googleApiService } = React.useContext(StoreContext);
    const [driveContentExplorerStore] = React.useState(() => new DriveContentExplorerStore(googleApiService));

    useEffect(() => {
      if (activeTab === 0) {
        driveContentExplorerStore.reset('drive');
      } else {
        driveContentExplorerStore.reset('appDataFolder');
      }
    }, [activeTab, driveContentExplorerStore]);

    // Effect to communicate selected item to parent
    useEffect(() => {
      onItemSelected(driveContentExplorerStore.selectedItem);
    }, [driveContentExplorerStore.selectedItem, onItemSelected]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
      setActiveTab(newValue);
    };

    const handleItemDoubleClickInternal = (item: IDriveItem) => {
      if (item.isFolder()) {
        driveContentExplorerStore.loadFolder(item.id);
      }
    };

    const renderContent = () => (
      <>
        <Breadcrumbs
          currentPath={driveContentExplorerStore.currentPath}
          onBreadcrumbClick={(folderId) => driveContentExplorerStore.loadFolder(folderId)}
        />
        <DriveFileList
          items={driveContentExplorerStore.items}
          selectedItem={driveContentExplorerStore.selectedItem}
          onItemClick={driveContentExplorerStore.setSelectedItem}
          onItemDoubleClick={handleItemDoubleClickInternal}
          showCreateDeleteButtons={showCreateDeleteButtons}
          isCreatingFolder={driveContentExplorerStore.isCreatingFolder}
          newFolderName={driveContentExplorerStore.newFolderName}
          onNewFolderNameChange={driveContentExplorerStore.setNewFolderName}
          onCreateFolderConfirm={driveContentExplorerStore.createFolder}
          onCancelCreatingFolder={driveContentExplorerStore.cancelCreatingFolder}
          onStartCreatingFolder={driveContentExplorerStore.startCreatingFolder}
          onStartDeletingItem={driveContentExplorerStore.startDeletingItem}

        />
      </>
    );

    return (
      <div className={styles.container}>
        {driveContentExplorerStore.isLoading && (
          <div className={styles.spinnerOverlay}>
            <Spinner />
          </div>
        )}
        {driveContentExplorerStore.error && <div className={styles.error}>{driveContentExplorerStore.error}</div>}

        <Tabs value={activeTab} labels={['Мой диск', 'Раздел приложения']} onChange={handleTabChange} />

        <TabPanel value={activeTab} index={0}>
          {renderContent()}
        </TabPanel>
        <TabPanel value={activeTab} index={1}>
          {renderContent()}
        </TabPanel>

        {/* Confirmation Modal for deletion, now internal to DriveContentExplorer */}
        <Modal open={driveContentExplorerStore.isConfirmingDelete} onClose={driveContentExplorerStore.cancelDeletingItem}>
          <div className={styles.deleteConfirmationContainer}>
            <p>Вы действительно хотите удалить {driveContentExplorerStore.itemToDelete?.name}?</p>
            <DialogActions>
              <TextButton onClick={() => driveContentExplorerStore.cancelDeletingItem()}>Нет</TextButton>
              <TextButton onClick={() => driveContentExplorerStore.deleteItem()}>Да</TextButton>
            </DialogActions>
          </div>
        </Modal>
      </div>
    );
  }
);

export default DriveContentExplorer;
