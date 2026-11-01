/** Пространство Google Drive, в котором расположен документ */
export type DriveSpace = 'drive' | 'appDataFolder'

/** Сериализуемая часть проекта в документе */
export type ProjectDocumentData = {
	name: string
	color: string
	background: string
}
