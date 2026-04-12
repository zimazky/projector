/** Публичный API model-слоя сущности Document */
export * from './types'
export * from './DocumentTabsStore'
export * from './DocumentTabsStore.types'
export { DocumentStoreManager } from './DocumentStoreManager'
export type { DocumentStores, IDocumentDataProvider, IEventsStoreProvider } from './DocumentStoreManager.types'
export type { DocumentStoreCallbacks } from './DocumentStoreManager'
export { normalizeMainStoreData } from './DocumentTabsStore.utils'
export type { MainStoreData } from './DocumentTabsStore.utils'
