import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import Dialog from 'src/7-shared/ui/Dialog/Dialog';
import TextField from 'src/7-shared/ui/TextField/TextField';
import TextButton from 'src/7-shared/ui/Button/TextButton';
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions';
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent';
import styles from './FileConflictResolver.module.css'; // Will create this later

interface ConflictResolutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflictingFileName: string;
  isSaving: boolean;
  newFileNameForConflict: string;
  onNewFileNameChange: (newName: string) => void;
  onResolve: (resolution: 'overwrite' | 'rename' | 'cancel') => void;
}

const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = observer(
  ({
    isOpen,
    onClose,
    conflictingFileName,
    isSaving,
    newFileNameForConflict,
    onNewFileNameChange,
    onResolve,
  }) => {
    // Define state for showing the rename input field, moved from SaveToDrive
    const [showRenameInput, setShowRenameInput] = useState(false);

    const handleConfirmRename = () => {
      onResolve('rename');
      setShowRenameInput(false); // Hide rename input after resolution
    };

    const handleCancel = () => {
      onResolve('cancel');
      setShowRenameInput(false); // Hide rename input after resolution
    };

    const handleOverwrite = () => {
      onResolve('overwrite');
      setShowRenameInput(false); // Hide rename input after resolution
    }

    return (
      <Dialog open={isOpen} onClose={handleCancel}>
        <h3 className={styles.dialogTitle}>Конфликт имени файла</h3>
        <DialogContent>
          <p>Файл "{conflictingFileName}" уже существует в этой папке. Что вы хотите сделать?</p>
          {showRenameInput && (
            <TextField
              label="Новое имя файла"
              value={newFileNameForConflict}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNewFileNameChange(e.target.value)}
              className={styles.fileNameInput}
            />
          )}
        </DialogContent>
        <DialogActions>
          <TextButton onClick={handleOverwrite} disabled={isSaving}>
            Перезаписать
          </TextButton>
          <TextButton onClick={() => setShowRenameInput(true)} disabled={isSaving}>
            Переименовать
          </TextButton>
          <TextButton
            onClick={handleConfirmRename}
            disabled={isSaving || !showRenameInput || newFileNameForConflict.trim() === ''}
          >
            Подтвердить переименование
          </TextButton>
          <TextButton onClick={handleCancel} disabled={isSaving}>
            Отмена
          </TextButton>
        </DialogActions>
      </Dialog>
    );
  }
);

export default ConflictResolutionDialog;
