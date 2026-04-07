import React from 'react'
import { observer } from 'mobx-react-lite'

import ProjectList from 'src/5-features/ProjectManager/ProjectList/ProjectList'
import ProjectForm from 'src/5-features/ProjectManager/ProjectEditor/ProjectForm'

import styles from './ProjectsForm.module.css'

/**
 * Страница управления проектами
 * Отображает список проектов и форму добавления/редактирования
 */
const ProjectsForm: React.FC = observer(() => {
	return (
		<div className={styles.root}>
			<ProjectList />
			<ProjectForm />
		</div>
	)
})

export default ProjectsForm
