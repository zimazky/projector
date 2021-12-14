import styles from './EventItem.module.css'

export default function EventItem({name, days, start = ''}) {
  return <div className={styles.EventItem} style={{width: 'calc(' +days +' * (100% + 1px) + 1px)'}}>{name + ' ' + start}</div>
}

export function EventPlaceholder() {
  return <div className={styles.EventPlaceholder} ></div>
}