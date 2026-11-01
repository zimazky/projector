import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'
import { Icon } from '@iconify/react'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { DEFAULT_PROJECT_ID } from 'src/6-entities/Projects/ProjectId'
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
	const [deletingProject, setDeletingProject] = React.useState<{
		id: string
		name: string
		store: ProjectsStore
	} | null>(null)

	const handleEdit = (projectId: string) => {
		projectEditorStore.openEdit(projectId)
	}

	const handleDelete = () => {
		if (!projectsStore || deletingProject?.store !== projectsStore) {
			setDeletingProject(null)
			return
		}
		const project = projectsStore.getById(deletingProject.id)
		if (project?.events === 0) {
			projectsStore.delete(deletingProject.id)
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
						key={project.id}
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
							<IconButton
								title={`Edit ${project.name}`}
								onClick={() => handleEdit(project.id)}
								disabled={project.id === DEFAULT_PROJECT_ID}
							>
								<Icon icon="mdi:pencil" width={20} height={20} />
							</IconButton>
							<IconButton
								title={`Delete ${project.name}`}
								onClick={() => setDeletingProject({ id: project.id, name: project.name, store: projectsStore })}
								disabled={project.events > 0 || project.id === DEFAULT_PROJECT_ID}
							>
								<Icon icon="mdi:delete" width={20} height={20} />
							</IconButton>
						</div>
					</div>
				))}
			</div>

			<YesCancelConfirmation
				open={deletingProject !== null}
				onConfirm={handleDelete}
				onClose={() => setDeletingProject(null)}
			>
				Are you sure you want to delete project "{deletingProject?.name}"?
			</YesCancelConfirmation>
		</div>
	)
})

export default ProjectList
