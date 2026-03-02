import React from 'react'

export default function useLatest(current: any) {
	const storedValue = React.useRef(current)
	React.useLayoutEffect(() => {
		storedValue.current = current
	})
	return storedValue.current
}
