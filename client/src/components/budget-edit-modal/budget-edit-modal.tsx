import { useState } from 'react'
import { CURRENCY_SYMBOL } from '@/utils/currency'
import './budget-edit-modal.less'

export type BudgetSaveMode = 'this-month-only' | 'from-now-on'
export type BudgetRemoveMode = 'this-month-only' | 'entirely'

export type BudgetEditModalProps = {
  category: string
  currentAmount: number
  /** The month this effective budget was originally set for, or null if no budget exists. */
  inheritedFromMonth: string | null
  /** Label of the month currently being viewed (e.g. 'April 2026'). */
  currentMonthLabel: string
  existingBudgetId: number | null
  onSave: (amount: number, mode: BudgetSaveMode) => void
  onRemove: (mode: BudgetRemoveMode) => void
  onCancel: () => void
}

const formatInheritedFromLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return monthKey
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const BudgetEditModal = ({
  category,
  currentAmount,
  inheritedFromMonth,
  currentMonthLabel,
  existingBudgetId,
  onSave,
  onRemove,
  onCancel,
}: BudgetEditModalProps) => {
  const [value, setValue] = useState(currentAmount > 0 ? String(currentAmount) : '')

  const parsed = Number(value)
  const canSave = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
  const isInherited = inheritedFromMonth !== null

  return (
    <div className="budget-edit-modal" onClick={onCancel}>
      <div
        className="budget-edit-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="budget-edit-modal__header">
          <p className="budget-edit-modal__subtitle">Monthly budget</p>
          <p className="budget-edit-modal__category">{category}</p>
          {isInherited && (
            <p className="budget-edit-modal__inherited-hint">
              Carried from {formatInheritedFromLabel(inheritedFromMonth!)}
            </p>
          )}
        </div>

        <div className="budget-edit-modal__body">
          <label className="budget-edit-modal__label" htmlFor="budget-amount">Amount ({CURRENCY_SYMBOL})</label>
          <input
            id="budget-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            autoFocus
            className="budget-edit-modal__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave && !isInherited) onSave(parsed, 'from-now-on')
            }}
          />
        </div>

        {isInherited ? (
          <div className="budget-edit-modal__choice-group">
            <button
              className="budget-edit-modal__choice-btn"
              onClick={() => onSave(parsed, 'this-month-only')}
              disabled={!canSave}
              type="button"
            >
              <span className="budget-edit-modal__choice-title">Set for {currentMonthLabel} only</span>
              <span className="budget-edit-modal__choice-sub">Future months keep inheriting</span>
            </button>
            <button
              className="budget-edit-modal__choice-btn budget-edit-modal__choice-btn--primary"
              onClick={() => onSave(parsed, 'from-now-on')}
              disabled={!canSave}
              type="button"
            >
              <span className="budget-edit-modal__choice-title">Change from now on</span>
              <span className="budget-edit-modal__choice-sub">Applies to {currentMonthLabel} and all later months</span>
            </button>
            <button
              className="budget-edit-modal__choice-btn budget-edit-modal__choice-btn--danger"
              onClick={() => onRemove('this-month-only')}
              type="button"
            >
              <span className="budget-edit-modal__choice-title">Remove for {currentMonthLabel} only</span>
              <span className="budget-edit-modal__choice-sub">Sets budget to 0 for this month</span>
            </button>
            <button
              className="budget-edit-modal__choice-btn budget-edit-modal__choice-btn--danger"
              onClick={() => onRemove('entirely')}
              type="button"
            >
              <span className="budget-edit-modal__choice-title">Remove entirely from {currentMonthLabel} onward</span>
              <span className="budget-edit-modal__choice-sub">Clears all future overrides too</span>
            </button>
            <button
              className="budget-edit-modal__cancel-btn budget-edit-modal__cancel-btn--standalone"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="budget-edit-modal__actions">
            <button
              className="budget-edit-modal__cancel-btn"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            {existingBudgetId !== null && (
              <button
                className="budget-edit-modal__remove-btn"
                onClick={() => onRemove('this-month-only')}
                type="button"
              >
                Remove
              </button>
            )}
            <button
              className="budget-edit-modal__save-btn"
              onClick={() => onSave(parsed, 'from-now-on')}
              disabled={!canSave}
              type="button"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default BudgetEditModal
