import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import type { EventMetadata } from './EventIdentity'

/** Базовый интерфейс модели события, общий для одиночных и повторяемых событий */
export interface IEventModel extends EventMetadata {
	name: string
	repeat?: string
	comment: string
	project?: string
	projectId?: string
	start: timestamp
	time: number | null
	duration: number
	end: timestamp
	credit: number
	debit: number
}
