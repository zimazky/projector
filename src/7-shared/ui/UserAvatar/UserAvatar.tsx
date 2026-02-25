import React from 'react'

import styles from './UserAvatar.module.css'

type UserAvatarProps = {
  /** Признак авторизации пользователя в Google */
  isLoggedIn: boolean
  /** URL аватарки пользователя (опционально, на будущее расширение) */
  avatarUrl?: string | null
  /** Имя пользователя, используется для инициалов и aria-label */
  userName?: string | null
  /** Обработчик клика по аватару (для будущего меню пользователя) */
  onClick?: React.MouseEventHandler<HTMLDivElement>
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  isLoggedIn,
  avatarUrl,
  userName,
  onClick
}) => {
  if (!isLoggedIn) {
    return null
  }

  const isClickable = typeof onClick === 'function'

  const className = [
    styles.avatar,
    isClickable ? styles.avatarClickable : ''
  ].filter(Boolean).join(' ')

  if (avatarUrl) {
    return (
      <div
        className={className}
        onClick={onClick}
        aria-label={userName || 'Google user'}
      >
        <img
          src={avatarUrl}
          alt={userName || 'Google user'}
          className={styles.avatarImage}
        />
      </div>
    )
  }

  const initials = getInitials(userName)

  return (
    <div
      className={className}
      onClick={onClick}
      aria-label={userName || 'Google user'}
    >
      {initials
        ? initials
        : <div className={styles.placeholderIcon} />}
    </div>
  )
}

function getInitials(name?: string | null): string | null {
  if (!name) return null

  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return null

  const [first, second] = parts

  if (parts.length === 1) {
    return first.charAt(0).toUpperCase()
  }

  return (first.charAt(0) + second.charAt(0)).toUpperCase()
}

export default UserAvatar

