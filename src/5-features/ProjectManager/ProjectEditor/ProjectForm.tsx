import React, { useContext, useEffect } from 'react'
import { observer } from 'mobx-react-lite'

import TextField from 'src/7-shared/ui/TextField/TextField'
import TextButton from 'src/7-shared/ui/Button/TextButton'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import ColorPicker from 'src/7-shared/ui/ColorPicker/ColorPicker'

import { StoreContext } from 'src/1-app/Providers/StoreContext'

import styles from './ProjectForm.module.css'

/**
 * Форма добавления/редактирования проекта
 * Отображается в модальном диалоге
 */
const ProjectForm: React.FC = observer(() => {
	const { projectEditorStore } = useContext(StoreContext)

	// Локальное состояние для управления полями
	const [localName, setLocalName] = React.useState('')
	const [localColor, setLocalColor] = React.useState('#000000')
	const [localBackground, setLocalBackground] = React.useState('#ffffff')
	const [localErrors, setLocalErrors] = React.useState<{ name?: string; color?: string; background?: string }>({})

	// Синхронизация локальных значений с store при открытии
	useEffect(() => {
		if (projectEditorStore.isOpen) {
			setLocalName(projectEditorStore.formData.name)
			setLocalColor(projectEditorStore.formData.color)
			setLocalBackground(projectEditorStore.formData.background)
			setLocalErrors({})
		}
	}, [projectEditorStore.isOpen, projectEditorStore.formData])

	// Синхронизация ошибок из store
	useEffect(() => {
		setLocalErrors(projectEditorStore.errors)
	}, [projectEditorStore.errors])

	const handleSave = () => {
		// Обновляем store из локальных значений
		projectEditorStore.updateField('name', localName)
		projectEditorStore.updateField('color', localColor)
		projectEditorStore.updateField('background', localBackground)

		const success = projectEditorStore.save()
		if (!success) {
			// Ошибки уже установлены в store
			setLocalErrors(projectEditorStore.errors)
		}
	}

	const handleClose = () => {
		projectEditorStore.close()
	}

	return (
		<Dialog open={projectEditorStore.isOpen} onClose={handleClose}>
			<DialogContent>
				<h2 className={styles.title}>{projectEditorStore.mode === 'add' ? 'Add Project' : 'Edit Project'}</h2>

				<form className={styles.form}>
					<TextField
						label="Project Name"
						value={localName}
						error={!!localErrors.name}
						onChange={e => {
							const val = (e.target as HTMLInputElement).value
							setLocalName(val)
							projectEditorStore.updateField('name', val)
						}}
					/>

					<div className={styles.colorGrid}>
						<ColorPicker
							value={localColor}
							onChange={color => {
								setLocalColor(color)
								projectEditorStore.updateField('color', color)
							}}
							label="Text Color"
							error={!!localErrors.color}
						/>

						<ColorPicker
							value={localBackground}
							onChange={background => {
								setLocalBackground(background)
								projectEditorStore.updateField('background', background)
							}}
							label="Background Color"
							error={!!localErrors.background}
						/>
					</div>

					{/* Предпросмотр проекта */}
					<div className={styles.preview}>
						<div
							className={styles.previewCard}
							style={{
								color: localColor,
								backgroundColor: localBackground
							}}
						>
							{localName || 'Project Preview'}
						</div>
					</div>
				</form>
			</DialogContent>

			<DialogActions>
				<TextButton onClick={handleSave}>{projectEditorStore.mode === 'add' ? 'Add' : 'Save'}</TextButton>
				<TextButton onClick={handleClose}>Cancel</TextButton>
			</DialogActions>
		</Dialog>
	)
})

export default ProjectForm
