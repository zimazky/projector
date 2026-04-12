import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'
import { Icon } from '@iconify/react'

import TextButton from 'src/7-shared/ui/Button/TextButton'
import IconButton from 'src/7-shared/ui/IconButton/IconButton'
import YesCancelConfirmation from 'src/7-shared/ui/YesCancelConfirmation/YesCancelConfirmation'

import { StoreContext } from 'src/1-app/Providers/StoreContext'

import styles from './ProjectList.module.css'

/**
 * Список проектов с возможностью редактирования и удаления
 */
const ProjectList: React.FC = observer(() => {
	const { documentTabsStore, projectEditorStore } = useContext(StoreContext)
	const projectsStore = documentTabsStore.activeProjectsStore
	const [deletingProject, setDeletingProject] = React.useState<string | null>(null)

	const handleEdit = (projectName: string) => {
		projectEditorStore.openEdit(projectName)
	}

	const handleDelete = (projectName: string) => {
		if (!projectsStore) return
		const project = projectsStore.getByName(projectName)
		if (project?.events === 0) {
			projectsStore.delete(projectName)
		}
		setDeletingProject(null)
	}

	const handleAdd = () => {
		projectEditorStore.openAdd()
	}

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<h2 className={styles.title}>Projects</h2>
				<TextButton onClick={handleAdd}>Add Project</TextButton>
			</div>

			<div className={styles.list}>
				{projectsStore?.list.map(project => (
					<div
						key={project.name}
						className={styles.projectCard}
						style={{
							color: project.color,
							backgroundColor: project.background
						}}
					>
						<span className={styles.projectName}>{project.name}</span>
						<span className={styles.eventCount}>
							{project.events} event{project.events !== 1 ? 's' : ''}
						</span>
						<div className={styles.actions}>
							<IconButton onClick={() => handleEdit(project.name)} disabled={project.name === 'Default'}>
								<Icon icon="mdi:pencil" width={20} height={20} />
							</IconButton>
							<IconButton
								onClick={() => setDeletingProject(project.name)}
								disabled={project.events > 0 || project.name === 'Default'}
							>
								<Icon icon="mdi:delete" width={20} height={20} />
							</IconButton>
						</div>
					</div>
				))}
			</div>

			<YesCancelConfirmation
				open={deletingProject !== null}
				onConfirm={() => deletingProject && handleDelete(deletingProject)}
				onClose={() => setDeletingProject(null)}
			>
				Are you sure you want to delete project "{deletingProject}"?
			</YesCancelConfirmation>
		</div>
	)
})

export default ProjectList
