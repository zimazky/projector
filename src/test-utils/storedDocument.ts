import type { DocumentTabsSnapshot } from 'src/6-entities/Document/model/DocumentTabsStore.types'

export function storedDocument(id: string) {
	const snapshot = JSON.parse(localStorage.getItem('documentTabs') || 'null') as DocumentTabsSnapshot | null
	return (
		(snapshot?.documents.find(document => document.id === id) as
			| (DocumentTabsSnapshot['documents'][number] & {
					data: NonNullable<DocumentTabsSnapshot['documents'][number]['data']>
			  })
			| undefined) ?? null
	)
}
