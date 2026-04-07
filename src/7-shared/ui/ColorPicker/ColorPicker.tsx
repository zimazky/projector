import React from 'react'
import ReactDOM from 'react-dom'
import { HexColorPicker } from 'react-colorful'
import styles from './ColorPicker.module.css'

/** Цветовые пресеты Material Design */
const COLOR_PRESETS = [
	'#000000',
	'#FFFFFF',
	'#F44336',
	'#E91E63',
	'#9C27B0',
	'#673AB7',
	'#3F51B5',
	'#2196F3',
	'#03A9F4',
	'#00BCD4',
	'#009688',
	'#4CAF50',
	'#8BC34A',
	'#CDDC39',
	'#FFEB3B',
	'#FFC107',
	'#FF9800',
	'#FF5722',
	'#795548',
	'#9E9E9E',
	'#607D8B'
]

/** Маппинг популярных CSS алиасов в HEX */
const CSS_ALIAS_TO_HEX: Record<string, string> = {
	black: '#000000',
	white: '#FFFFFF',
	red: '#FF0000',
	green: '#008000',
	blue: '#0000FF',
	yellow: '#FFFF00',
	orange: '#FFA500',
	purple: '#800080',
	pink: '#FFC0CB',
	brown: '#A52A2A',
	gray: '#808080',
	grey: '#808080',
	silver: '#C0C0C0',
	maroon: '#800000',
	olive: '#808000',
	lime: '#00FF00',
	aqua: '#00FFFF',
	teal: '#008080',
	navy: '#000080',
	fuchsia: '#FF00FF',
	lightgray: '#D3D3D3',
	lightgrey: '#D3D3D3',
	darkgray: '#A9A9A9',
	darkgrey: '#A9A9A9',
	dimgray: '#696969',
	dimgrey: '#696969',
	slategray: '#708090',
	slategrey: '#708090'
}

/** Конвертация значения в HEX для HexColorPicker */
function toHex(value: string): string {
	const trimmed = value.trim().toLowerCase()

	// Если уже HEX
	if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed
	if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
		const r = trimmed[1]
		const g = trimmed[2]
		const b = trimmed[3]
		return `#${r}${r}${g}${g}${b}${b}`
	}

	// Если CSS алиас
	return CSS_ALIAS_TO_HEX[trimmed] || '#000000'
}

type ColorPickerProps = {
	/** Текущее значение цвета */
	value: string
	/** Callback при изменении цвета */
	onChange: (color: string) => void
	/** Ярлык */
	label?: string
	/** Признак ошибки валидации */
	error?: boolean
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label, error }) => {
	const [isOpen, setIsOpen] = React.useState(false)

	const handlePresetClick = (color: string) => {
		onChange(color.toUpperCase())
	}

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value
		// Разрешаем ввод любых символов - валидация будет при сохранении
		onChange(val)
	}

	return (
		<div className={styles.root}>
			{label && <label className={styles.label + (error ? ' ' + styles.error : '')}>{label}</label>}
			<div className={styles.control + (error ? ' ' + styles.controlError : '')} onClick={() => setIsOpen(!isOpen)}>
				<div
					className={styles.preview}
					style={{
						backgroundColor: toHex(value),
						border: value === '#FFFFFF' || value.toLowerCase() === 'white' ? '1px solid rgba(0, 0, 0, 0.23)' : 'none'
					}}
				/>
				<input
					type="text"
					className={styles.input}
					value={value}
					onChange={handleInputChange}
					placeholder="#RRGGBB"
					onClick={e => e.stopPropagation()}
				/>
			</div>

			{isOpen &&
				ReactDOM.createPortal(
					<>
						<div className={styles.backdrop} onClick={() => setIsOpen(false)} />
						<div className={styles.popover}>
							<HexColorPicker color={toHex(value)} onChange={color => onChange(color.toUpperCase())} />
							<div className={styles.presets}>
								{COLOR_PRESETS.map(color => (
									<button
										key={color}
										className={styles.swatch}
										style={{
											backgroundColor: color,
											border: color === value ? '2px solid #000' : '1px solid rgba(0, 0, 0, 0.12)',
											transform: color === value ? 'scale(1.2)' : 'scale(1)'
										}}
										onClick={() => handlePresetClick(color)}
										aria-label={`Выбрать цвет ${color}`}
									/>
								))}
							</div>
						</div>
					</>,
					document.body
				)}
		</div>
	)
}

export default ColorPicker
