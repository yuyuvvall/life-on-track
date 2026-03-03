import './keypad-button.less'

export type KeypadButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'operator' | 'delete' | 'calendar'
}

const KeypadButton = ({
  label,
  onClick,
  disabled = false,
  variant = 'default',
}: KeypadButtonProps) => {
  const mod = variant !== 'default' ? ` keypad-button--${variant}` : ''
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`keypad-button${mod}`}
    >
      {label}
    </button>
  )
}

export default KeypadButton
