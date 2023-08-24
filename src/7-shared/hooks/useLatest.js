export default function useLatest(current) {
  const storedValue = React.useRef(current)
  React.useLayoutEffect(() => { storedValue.current = current })
  return storedValue.current
}