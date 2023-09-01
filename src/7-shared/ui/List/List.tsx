import React from 'react'
import styles from './List.module.css'

interface ListProps {
  children?: React.ReactNode
}

const List: React.FC<ListProps> = ({children}) => {
  return <ul className={styles.list}>{children}</ul>
}

export default List
