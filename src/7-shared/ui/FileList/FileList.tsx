import React from 'react';
import { observer } from 'mobx-react-lite';

import List from 'src/7-shared/ui/List/List';
import ListItem from 'src/7-shared/ui/List/ListItem';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';

import styles from './FileList.module.css';

interface FileListProps {
  items: IDriveItem[];
  selectedItem: IDriveItem | null;
  onItemClick: (item: IDriveItem) => void;
  onItemDoubleClick: (item: IDriveItem) => void;
}

const FileList: React.FC<FileListProps> = observer(
  ({ items, selectedItem, onItemClick, onItemDoubleClick }) => {
    return (
      <List>
        {items.map((item) => (
          <ListItem
            key={item.id}
            onClick={() => onItemClick(item)}
            onDoubleClick={item.isFolder() ? () => onItemDoubleClick(item) : undefined}
            selected={selectedItem?.id === item.id}
          >
            <span className={styles.itemIcon}>{item.isFolder() ? '📁' : '📄'}</span>
            <span className={styles.itemName}>{item.name}</span>
          </ListItem>
        ))}
      </List>
    );
  }
);

export default FileList;