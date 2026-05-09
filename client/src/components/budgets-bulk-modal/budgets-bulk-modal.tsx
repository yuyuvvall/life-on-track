import { useState } from 'react'
import { CURRENCY_SYMBOL } from '@/utils/currency'
import './budgets-bulk-modal.less'

const CATEGORIES = [
  { id: 'Food', icon: '🍴', mod: 'food' },
  { id: 'Groceries', icon: '🛒', mod: 'groceries' },
  { id: 'Transport', icon: '🚌', mod: 'transport' },
  { id: 'Shopping', icon: '🛍️', mod: 'shopping' },
  { id: 'Bills', icon: '📄', mod: 'bills' },
  { id: 'Entertainment', icon: '🎮', mod: 'entertainment' },
  { id: 'Health', icon: '💊', mod: 'health' },
  { id: 'Other', icon: '📦', mod: 'other' },
] as const

export type BudgetBulkEntry = {
  category: string
  /** Effective budget for this category for the viewed month; 0 if none. */
  currentAmount: number
  /** Row id of a directly-set budget at this month, or null if inherited / none. */
  directRowId: number | null
  /** The month the effective budget was set for; null if no budget exists. */
  inheritedFromMonth: string | null
}

export type BudgetBulkChange = {
  category: string
  newAmount: number
  directRowId: number | null
  wasInherited: boolean
}

export type BudgetsBulkModalProps = {
  currentMonthLabel: string
  entries: BudgetBulkEntry[]
  onSave: (changes: BudgetBulkChange[]) => void
  onCancel: () => void
}

const formatMonthLabel = (monthKey: string) => {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const BudgetsBulkModal = ({
  currentMonthLabel,
  entries,
  onSave,
  onCancel,
}: BudgetsBulkModalProps) => {
  const byCategory = new Map(entries.map(e => [e.category, e]))

  const rows = CATEGORIES.map((cat) => {
    const entry = byCategory.get(cat.id) ?? {
      category: cat.id,
      currentAmount: 0,
      directRowId: null,
      inheritedFromMonth: null,
    }
    return { ...cat, ...entry }
  })

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map(r => [r.category, r.currentAmount > 0 ? String(r.currentAmount) : ''])
    )
  )

  const total = rows.reduce((sum, row) => {
    const raw = values[row.category] ?? ''
    const parsed = raw.trim() === '' ? 0 : Number(raw)
    return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0)
  }, 0)
  const totalLabel = total.toLocaleString('en-US', {
    minimumFractionDigits: total % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })

  const handleSave = () => {
    const changes: BudgetBulkChange[] = []
    for (const row of rows) {
      const raw = values[row.category] ?? ''
      const parsed = raw.trim() === '' ? 0 : Number(raw)
      if (!Number.isFinite(parsed) || parsed < 0) continue
      if (parsed === row.currentAmount) continue
      changes.push({
        category: row.category,
        newAmount: parsed,
        directRowId: row.directRowId,
        wasInherited: row.inheritedFromMonth !== null && row.directRowId === null,
      })
    }
    onSave(changes)
  }

  return (
    <div className="budgets-bulk-modal" onClick={onCancel}>
      <div
        className="budgets-bulk-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="budgets-bulk-modal__header">
          <p className="budgets-bulk-modal__subtitle">Monthly budgets</p>
          <p className="budgets-bulk-modal__month">{currentMonthLabel}</p>
        </div>

        <div className="budgets-bulk-modal__rows">
          {rows.map((row) => {
            const showInheritedHint =
              row.inheritedFromMonth !== null && row.directRowId === null
            return (
              <div key={row.category} className="budgets-bulk-modal__row">
                <div className={`budgets-bulk-modal__icon budgets-bulk-modal__icon--${row.mod}`}>
                  {row.icon}
                </div>
                <div className="budgets-bulk-modal__row-info">
                  <span className="budgets-bulk-modal__row-name">{row.category}</span>
                  {showInheritedHint && (
                    <span className="budgets-bulk-modal__row-hint">
                      carried from {formatMonthLabel(row.inheritedFromMonth!)}
                    </span>
                  )}
                </div>
                <div className="budgets-bulk-modal__input-wrap">
                  <span className="budgets-bulk-modal__currency">{CURRENCY_SYMBOL}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    className="budgets-bulk-modal__input"
                    value={values[row.category] ?? ''}
                    onChange={(e) =>
                      setValues(prev => ({ ...prev, [row.category]: e.target.value }))
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="budgets-bulk-modal__total">
          <span className="budgets-bulk-modal__total-label">Total</span>
          <span className="budgets-bulk-modal__total-amount">{CURRENCY_SYMBOL}{totalLabel}</span>
        </div>

        <div className="budgets-bulk-modal__actions">
          <button
            className="budgets-bulk-modal__cancel-btn"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="budgets-bulk-modal__save-btn"
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default BudgetsBulkModal
