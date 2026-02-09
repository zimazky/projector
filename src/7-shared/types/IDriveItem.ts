// src/7-shared/types/IDriveItem.ts
export interface IDriveItem {
  id: string;
  name: string;
  isFolder(): boolean;
}
