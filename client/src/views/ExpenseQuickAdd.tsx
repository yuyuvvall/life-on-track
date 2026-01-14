import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateExpense, useUpdateExpense, useExpense, useCreateRecurringExpense } from '@/hooks';
import type { RecurrenceType } from '@/types';

// Categories with icons and colors
const CATEGORIES = [
  { id: 'Food', icon: '🍴', color: 'bg-orange-500' },
  { id: 'Groceries', icon: '🛒', color: 'bg-blue-500' },
  { id: 'Transport', icon: '🚌', color: 'bg-amber-500' },
  { id: 'Shopping', icon: '🛍️', color: 'bg-pink-500' },
  { id: 'Bills', icon: '📄', color: 'bg-slate-500' },
  { id: 'Entertainment', icon: '🎮', color: 'bg-purple-500' },
  { id: 'Health', icon: '💊', color: 'bg-emerald-500' },
  { id: 'Other', icon: '📦', color: 'bg-gray-500' },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ExpenseQuickAdd() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const expenseId = id ? parseInt(id, 10) : undefined;
  const isEditMode = expenseId !== undefined;

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const createRecurringExpense = useCreateRecurringExpense();
  const { data: existingExpense, isLoading: isLoadingExpense } = useExpense(expenseId);

  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState<CategoryId>('Food');
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Recurring expense state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('monthly');
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [showRecurringOptions, setShowRecurringOptions] = useState(false);

  // Load existing expense data when editing
  useEffect(() => {
    if (existingExpense) {
      setAmount(existingExpense.amount.toString());
      setCategory(existingExpense.category as CategoryId);
      setNote(existingExpense.note || '');
      setSelectedDate(new Date(existingExpense.createdAt));
    }
  }, [existingExpense]);

  const selectedCat = CATEGORIES.find(c => c.id === category)!;

  const isPending = createExpense.isPending || updateExpense.isPending || createRecurringExpense.isPending;

  // Handle keypad input
  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (key === '.') {
      if (!amount.includes('.')) {
        setAmount(prev => prev + '.');
      }
    } else if (key === 'clear') {
      setAmount('0');
    } else {
      // Number keys
      if (amount === '0' && key !== '.') {
        setAmount(key);
      } else {
        // Limit to 2 decimal places
        const parts = amount.split('.');
        if (parts[1] && parts[1].length >= 2) return;
        setAmount(prev => prev + key);
      }
    }
  };

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    if (isRecurring && !isEditMode) {
      // Create recurring expense template
      createRecurringExpense.mutate(
        {
          amount: parsedAmount,
          category,
          note: note || undefined,
          recurrenceType,
          recurrenceDay,
        },
        { onSuccess: () => navigate(-1) }
      );
    } else if (isEditMode && expenseId) {
      // Update existing expense
      updateExpense.mutate(
        {
          id: expenseId,
          data: {
            amount: parsedAmount,
            category,
            note: note || undefined,
            createdAt: selectedDate.toISOString(),
          },
        },
        { onSuccess: () => navigate(-1) }
      );
    } else {
      // Create new regular expense
      createExpense.mutate(
        { 
          amount: parsedAmount, 
          category, 
          note: note || undefined,
          createdAt: selectedDate.toISOString(),
        },
        { onSuccess: () => navigate(-1) }
      );
    }
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return `Today, ${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getRecurrenceLabel = () => {
    if (recurrenceType === 'weekly') {
      return `Every ${DAYS_OF_WEEK[recurrenceDay]}`;
    }
    return `Every month on the ${recurrenceDay}${getOrdinalSuffix(recurrenceDay)}`;
  };

  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  if (isLoadingExpense && isEditMode) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {/* Header */}
      <header className="bg-surface-800 px-4 py-3 flex items-center justify-between border-b border-surface-700">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 text-gray-400 hover:text-gray-200"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-gray-200 font-medium">
          {isEditMode ? 'Edit Expense' : 'Add Expense'}
        </h1>
        {!isEditMode && !isRecurring && (
          <button 
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1 text-gray-400 text-sm"
          >
            {formatDate(selectedDate).split(',')[0]}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {isEditMode && (
          <button 
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1 text-gray-400 text-sm"
          >
            {formatDate(selectedDate).split(',')[0]}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {!isEditMode && isRecurring && <div className="w-20" />}
      </header>

      {/* Category Scroll */}
      <div className="bg-surface-800 px-2 py-3">
        <div className="flex flex-wrap gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`flex flex-col items-center min-w-[70px] transition-transform p-1 ${
                category === cat.id ? 'scale-110' : ''
              }`}
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl
                ${category === cat.id 
                  ? `${cat.color} text-white shadow-lg` 
                  : 'bg-surface-600 text-gray-400'}`}
              >
                {cat.icon}
              </div>
              <span className={`text-xs mt-1 ${
                category === cat.id ? 'text-accent-blue font-medium' : 'text-gray-500'
              }`}>
                {cat.id}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Category Banner */}
      <div className="bg-gradient-to-r from-accent-blue to-indigo-600 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-blue-200 text-xs">Category</p>
          <p className="text-white text-xl font-semibold">{category}</p>
        </div>
        <div className="w-12 h-12 bg-surface-800 rounded-full flex items-center justify-center text-2xl shadow-lg">
          {selectedCat.icon}
        </div>
      </div>

      {/* Recurring Toggle (only in create mode) */}
      {!isEditMode && (
        <div className="bg-surface-800 px-4 py-3 border-b border-surface-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔄</span>
              <div>
                <p className="text-gray-200 font-medium">Recurring Expense</p>
                {isRecurring && (
                  <p className="text-gray-500 text-sm">{getRecurrenceLabel()}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (!isRecurring) {
                  setIsRecurring(true);
                  setShowRecurringOptions(true);
                } else {
                  setIsRecurring(false);
                }
              }}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                isRecurring ? 'bg-accent-blue' : 'bg-surface-600'
              }`}
            >
              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                isRecurring ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {isRecurring && (
            <button
              onClick={() => setShowRecurringOptions(true)}
              className="mt-2 text-accent-blue text-sm hover:underline"
            >
              Change schedule
            </button>
          )}
        </div>
      )}

      {/* Amount Display */}
      <div className="flex-1 bg-surface-900 flex flex-col items-center justify-center px-4">
        <p className="text-accent-blue text-sm mb-1">
          {isRecurring ? 'Recurring Amount' : 'Expense'}
        </p>
        <p className="text-5xl font-light text-gray-100">
          <span className="text-3xl text-accent-blue">₪</span> {amount}
        </p>
        
        {/* Notes Input */}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notes..."
          className="mt-4 w-full max-w-xs text-center bg-surface-700 border-0 rounded-xl px-4 py-3 text-gray-200 placeholder-gray-500"
        />
      </div>

      {/* Custom Keypad */}
      <div className="bg-surface-800 p-2">
        <div className="grid grid-cols-5 gap-1">
          {/* Row 1 */}
          <KeypadButton label="÷" onClick={() => {}} disabled className="text-gray-600" />
          <KeypadButton label="7" onClick={() => handleKeyPress('7')} />
          <KeypadButton label="8" onClick={() => handleKeyPress('8')} />
          <KeypadButton label="9" onClick={() => handleKeyPress('9')} />
          <KeypadButton 
            label="⌫" 
            onClick={() => handleKeyPress('backspace')} 
            className="text-accent-red"
          />

          {/* Row 2 */}
          <KeypadButton label="×" onClick={() => {}} disabled className="text-gray-600" />
          <KeypadButton label="4" onClick={() => handleKeyPress('4')} />
          <KeypadButton label="5" onClick={() => handleKeyPress('5')} />
          <KeypadButton label="6" onClick={() => handleKeyPress('6')} />
          <KeypadButton 
            label="📅" 
            onClick={() => isRecurring ? setShowRecurringOptions(true) : setShowDatePicker(true)}
            className="text-accent-amber"
          />

          {/* Row 3 */}
          <KeypadButton label="−" onClick={() => {}} disabled className="text-gray-600" />
          <KeypadButton label="1" onClick={() => handleKeyPress('1')} />
          <KeypadButton label="2" onClick={() => handleKeyPress('2')} />
          <KeypadButton label="3" onClick={() => handleKeyPress('3')} />
          <button
            onClick={handleSubmit}
            disabled={isPending || parseFloat(amount) <= 0}
            className="row-span-2 bg-accent-green hover:bg-emerald-600 disabled:bg-surface-600 text-white rounded-xl flex items-center justify-center transition-colors"
          >
            {isPending ? (
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {/* Row 4 */}
          <KeypadButton label="+" onClick={() => {}} disabled className="text-gray-600" />
          <KeypadButton label="₪" onClick={() => {}} disabled className="text-gray-600" />
          <KeypadButton label="0" onClick={() => handleKeyPress('0')} />
          <KeypadButton label="." onClick={() => handleKeyPress('.')} />
        </div>
      </div>

      {/* Date Footer */}
      <div className="bg-surface-800 text-center py-2 text-gray-400 text-sm border-t border-surface-700">
        {isRecurring ? getRecurrenceLabel() : formatDate(selectedDate)}
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DatePickerModal
          selectedDate={selectedDate}
          onSelect={(date) => {
            setSelectedDate(date);
            setShowDatePicker(false);
          }}
          onCancel={() => setShowDatePicker(false)}
        />
      )}

      {/* Recurring Options Modal */}
      {showRecurringOptions && (
        <RecurringOptionsModal
          recurrenceType={recurrenceType}
          recurrenceDay={recurrenceDay}
          onSave={(type, day) => {
            setRecurrenceType(type);
            setRecurrenceDay(day);
            setShowRecurringOptions(false);
          }}
          onCancel={() => setShowRecurringOptions(false)}
        />
      )}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

// Keypad button component
function KeypadButton({ 
  label, 
  onClick, 
  disabled = false,
  className = ''
}: { 
  label: string; 
  onClick: () => void; 
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-14 bg-surface-700 rounded-xl text-xl font-medium text-gray-200 
        hover:bg-surface-600 active:bg-surface-500 disabled:text-gray-600 
        disabled:hover:bg-surface-700 transition-colors ${className}`}
    >
      {label}
    </button>
  );
}

// Recurring Options Modal Component
function RecurringOptionsModal({
  recurrenceType,
  recurrenceDay,
  onSave,
  onCancel,
}: {
  recurrenceType: RecurrenceType;
  recurrenceDay: number;
  onSave: (type: RecurrenceType, day: number) => void;
  onCancel: () => void;
}) {
  const [tempType, setTempType] = useState(recurrenceType);
  const [tempDay, setTempDay] = useState(recurrenceDay);

  const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div 
        className="bg-surface-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-surface-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-surface-700">
          <p className="text-gray-500 text-sm">Recurring Schedule</p>
          <p className="text-2xl font-light text-gray-100 mt-1">Set frequency</p>
        </div>

        {/* Type Selection */}
        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setTempType('weekly');
                setTempDay(0); // Default to Monday
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                tempType === 'weekly'
                  ? 'bg-accent-blue text-white'
                  : 'bg-surface-700 text-gray-400'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => {
                setTempType('monthly');
                setTempDay(1); // Default to 1st
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                tempType === 'monthly'
                  ? 'bg-accent-blue text-white'
                  : 'bg-surface-700 text-gray-400'
              }`}
            >
              Monthly
            </button>
          </div>

          {/* Day Selection */}
          {tempType === 'weekly' ? (
            <div>
              <p className="text-gray-500 text-sm mb-2">Day of week</p>
              <div className="grid grid-cols-7 gap-1">
                {DAYS_OF_WEEK.map((day, index) => (
                  <button
                    key={day}
                    onClick={() => setTempDay(index)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                      tempDay === index
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-700 text-gray-400 hover:bg-surface-600'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-500 text-sm mb-2">Day of month</p>
              <div className="grid grid-cols-7 gap-1 max-h-48 overflow-y-auto">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    onClick={() => setTempDay(day)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                      tempDay === day
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-700 text-gray-400 hover:bg-surface-600'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-gray-400 font-medium hover:text-gray-200 hover:bg-surface-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(tempType, tempDay)}
            className="px-6 py-2 text-accent-blue font-medium hover:bg-surface-700 rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// Date Picker Modal Component
function DatePickerModal({
  selectedDate,
  onSelect,
  onCancel,
}: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onCancel: () => void;
}) {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  const [tempDate, setTempDate] = useState(new Date(selectedDate));

  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];

  // Get calendar data for current month view
  const getCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Adjust for Monday start (0 = Sunday, so we convert)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const days: (number | null)[] = [];
    
    // Empty cells before first day
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    // Days of the month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(i);
    }
    
    return days;
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    setTempDate(newDate);
  };

  const isSelected = (day: number) => {
    return tempDate.getDate() === day && 
           tempDate.getMonth() === viewDate.getMonth() && 
           tempDate.getFullYear() === viewDate.getFullYear();
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && 
           today.getMonth() === viewDate.getMonth() && 
           today.getFullYear() === viewDate.getFullYear();
  };

  const formatSelectedDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div 
        className="bg-surface-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-surface-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-surface-700">
          <p className="text-gray-500 text-sm">Select day</p>
          <p className="text-3xl font-light text-gray-100 mt-1">
            {formatSelectedDate(tempDate)}
          </p>
        </div>

        {/* Calendar */}
        <div className="px-4 pb-4 pt-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button className="flex items-center gap-1 text-gray-200">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="flex gap-2">
              <button 
                onClick={handlePrevMonth}
                className="p-2 hover:bg-surface-700 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button 
                onClick={handleNextMonth}
                className="p-2 hover:bg-surface-700 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((day, i) => (
              <div key={i} className="text-center text-sm text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {getCalendarDays().map((day, i) => (
              <div key={i} className="aspect-square flex items-center justify-center">
                {day !== null && (
                  <button
                    onClick={() => handleDayClick(day)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                      ${isSelected(day) 
                        ? 'bg-accent-blue text-white' 
                        : isToday(day)
                          ? 'text-accent-blue font-bold'
                          : 'text-gray-300 hover:bg-surface-700'
                      }`}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-gray-400 font-medium hover:text-gray-200 hover:bg-surface-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(tempDate)}
            className="px-6 py-2 text-accent-blue font-medium hover:bg-surface-700 rounded-lg transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
