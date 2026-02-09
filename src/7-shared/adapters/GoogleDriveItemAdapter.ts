import { DriveFileMetadata } from 'src/7-shared/services/gapi';
import { IDriveItem } from 'src/7-shared/types/IDriveItem';

export function createDriveItem(metadata: DriveFileMetadata): IDriveItem {
  return {
    id: metadata.id,
    name: metadata.name,
    isFolder: () => metadata.mimeType === 'application/vnd.google-apps.folder',
  };
}
