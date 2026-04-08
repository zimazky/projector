import { AggregatedEventResolver } from './AggregatedEventResolver'

describe('AggregatedEventResolver', () => {
	describe('parseAggregatedId', () => {
		it('должен корректно парсить составной ID с хешем', () => {
			const result = AggregatedEventResolver.parseAggregatedId('abc123_k8x9m2p4')
			expect(result).toEqual({
				documentId: 'doc_abc123',
				eventHash: 'k8x9m2p4'
			})
		})

		it('должен возвращать null для обычного числового ID', () => {
			const result = AggregatedEventResolver.parseAggregatedId(123)
			expect(result).toBeNull()
		})

		it('должен возвращать null для строкового числового ID', () => {
			const result = AggregatedEventResolver.parseAggregatedId('456')
			expect(result).toBeNull()
		})

		it('должен возвращать null для ID без подчёркивания', () => {
			const result = AggregatedEventResolver.parseAggregatedId('nohash')
			expect(result).toBeNull()
		})

		it('должен возвращать null для ID с неправильным хешем (слишком короткий)', () => {
			const result = AggregatedEventResolver.parseAggregatedId('abc123_short')
			expect(result).toBeNull()
		})

		it('должен возвращать null для ID с неправильным хешем (слишком длинный)', () => {
			const result = AggregatedEventResolver.parseAggregatedId('abc123_toolonghash')
			expect(result).toBeNull()
		})

		it('должен возвращать null для ID с не-base36 символами в хеше', () => {
			const result = AggregatedEventResolver.parseAggregatedId('abc123_ZZZZZZZZ')
			expect(result).toBeNull()
		})

		it('должен обрабатывать ID с несколькими подчёркиваниями в префиксе', () => {
			const result = AggregatedEventResolver.parseAggregatedId('abc_def_ghi_k8x9m2p4')
			expect(result).toEqual({
				documentId: 'doc_abc_def_ghi',
				eventHash: 'k8x9m2p4'
			})
		})

		it('должен возвращать null для ID с префиксом virt', () => {
			const result = AggregatedEventResolver.parseAggregatedId('virt_k8x9m2p4')
			expect(result).toBeNull()
		})

		it('должен корректно парсить ID с цифрами в префиксе', () => {
			const result = AggregatedEventResolver.parseAggregatedId('1712345678901_abc12345')
			expect(result).toEqual({
				documentId: 'doc_1712345678901',
				eventHash: 'abc12345'
			})
		})
	})

	describe('isAggregatedId', () => {
		it('должен возвращать true для составного ID с хешем', () => {
			expect(AggregatedEventResolver.isAggregatedId('abc123_k8x9m2p4')).toBe(true)
		})

		it('должен возвращать false для обычного числового ID', () => {
			expect(AggregatedEventResolver.isAggregatedId(123)).toBe(false)
		})

		it('должен возвращать false для ID без хеша', () => {
			expect(AggregatedEventResolver.isAggregatedId('nohash')).toBe(false)
		})

		it('должен возвращать false для ID с неправильным хешем', () => {
			expect(AggregatedEventResolver.isAggregatedId('abc_short')).toBe(false)
		})
	})

	describe('findSourceDocument', () => {
		it('должен возвращать null для обычного ID', () => {
			const mockStore = {
				documents: []
			} as any
			const result = AggregatedEventResolver.findSourceDocument(123, mockStore)
			expect(result).toBeNull()
		})

		it('должен возвращать null для ID с префиксом virt', () => {
			const mockStore = {
				documents: []
			} as any
			const result = AggregatedEventResolver.findSourceDocument('virt_k8x9m2p4', mockStore)
			expect(result).toBeNull()
		})
	})
})
