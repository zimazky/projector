import React from 'react';
import { observer } from 'mobx-react-lite';
import Tabs from 'src/7-shared/ui/Tabs/Tabs';
import TabPanel from 'src/7-shared/ui/Tabs/TabPanel';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';
import DriveFileList from 'src/5-features/DriveFileList/DriveFileList'; // New import
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'; // Import PathSegment
import styles from './DriveContentExplorer.module.css';


interface DriveContentExplorerProps {
  activeTab: number;
  setActiveTab: (tabIndex: number) => void;
  onItemSelected?: (item: IDriveItem | null) => void; // New prop to communicate selected item
  onCurrentFolderChange?: (folderId: string, path: PathSegment[]) => void;
}

const DriveContentExplorer: React.FC<DriveContentExplorerProps> = observer(
  ({ activeTab, setActiveTab, onItemSelected, onCurrentFolderChange }) => {
    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
      setActiveTab(newValue);
    };

    return (
      <div className={styles.container}>
        <Tabs value={activeTab} labels={['Мой диск', 'Раздел приложения']} onChange={handleTabChange} />

        <TabPanel value={activeTab} index={0}>
          <DriveFileList space="drive" onItemSelected={onItemSelected} onCurrentFolderChange={onCurrentFolderChange} />
        </TabPanel>
        <TabPanel value={activeTab} index={1}>
          <DriveFileList space="appDataFolder" onItemSelected={onItemSelected} onCurrentFolderChange={onCurrentFolderChange} />
        </TabPanel>
      </div>
    );
  }
);

export default DriveContentExplorer;