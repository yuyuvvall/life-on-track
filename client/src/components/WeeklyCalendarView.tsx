import { useMemo, useState, DragEvent } from 'react';
import { useTasks, useUpdateTask } from '@/hooks';
import type { Task } from '@/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDays(): Date[] {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - currentDay);
  weekStart.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push(day);
  }
  return days;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

interface DraggableTaskProps {
  task: Task;
  onDragStart: (e: DragEvent<HTMLDivElement>, taskId: string) => void;
}

function DraggableTask({ task, onDragStart }: DraggableTaskProps) {
  const categoryColors = {
    Work: 'border-l-blue-500',
    Admin: 'border-l-purple-500',
    Personal: 'border-l-green-500',
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className={`
        px-2 py-1.5 bg-surface-700 rounded text-xs cursor-grab active:cursor-grabbing
        border-l-2 ${categoryColors[task.category]}
        hover:bg-surface-600 transition-colors
        ${task.isCompleted ? 'opacity-50 line-through' : ''}
      `}
    >
      <span className="text-gray-200 truncate block">{task.title}</span>
    </div>
  );
}

interface DayColumnProps {
  date: Date;
  tasks: Task[];
  isCurrentDay: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, date: string) => void;
  dragOver: boolean;
}

function DayColumn({ date, tasks, isCurrentDay, onDragStart, onDragOver, onDrop, dragOver }: DayColumnProps) {
  const dateKey = formatDateKey(date);
  
  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, dateKey)}
      className={`
        flex flex-col rounded-lg transition-all min-h-[120px] md:min-h-[140px]
        ${isCurrentDay 
          ? 'bg-accent-500/20 border-2 border-accent-500 col-span-2 md:col-span-1' 
          : 'bg-surface-800 border border-surface-700'
        }
        ${dragOver ? 'ring-2 ring-accent-400 bg-accent-500/10' : ''}
      `}
    >
      {/* Day header */}
      <div className={`p-2 border-b ${isCurrentDay ? 'border-accent-500/30 flex items-center justify-center gap-3 md:block md:text-center' : 'border-surface-700 text-center'}`}>
        <span className={`text-xs font-medium uppercase tracking-wider ${
          isCurrentDay ? 'text-accent-400' : 'text-gray-500'
        }`}>
          {DAY_NAMES[date.getDay()]}
        </span>
        <div className={`text-lg font-semibold ${
          isCurrentDay ? 'text-accent-300' : 'text-gray-300'
        }`}>
          {date.getDate()}
        </div>
        {isCurrentDay && (
          <span className="text-xs text-accent-400 md:hidden">Today</span>
        )}
      </div>
      
      {/* Tasks container */}
      <div className={`flex-1 p-1.5 overflow-y-auto ${isCurrentDay ? 'grid grid-cols-2 md:grid-cols-1 gap-1' : 'space-y-1'}`}>
        {tasks.map((task) => (
          <DraggableTask key={task.id} task={task} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  );
}

export function WeeklyCalendarView() {
  const { data: tasks = [], isLoading } = useTasks('Weekly calendar view');
  const updateTask = useUpdateTask();
  const weekDays = useMemo(() => getWeekDays(), []);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Group tasks by scheduled date
  const { scheduledTasks, unscheduledTasks } = useMemo(() => {
    const scheduled: Record<string, Task[]> = {};
    const unscheduled: Task[] = [];

    // Initialize all week days
    weekDays.forEach(day => {
      scheduled[formatDateKey(day)] = [];
    });

    // Filter out completed tasks and sort
    const incompleteTasks = tasks.filter(t => !t.isCompleted);

    incompleteTasks.forEach(task => {
      if (task.scheduledCompleteDate) {
        // Check if the scheduled date is in the current week
        if (scheduled[task.scheduledCompleteDate]) {
          scheduled[task.scheduledCompleteDate].push(task);
        } else {
          // Task scheduled for a different week, show as unscheduled
          unscheduled.push(task);
        }
      } else {
        unscheduled.push(task);
      }
    });

    return { scheduledTasks: scheduled, unscheduledTasks: unscheduled };
  }, [tasks, weekDays]);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, dateKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(dateKey);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, scheduledDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    updateTask.mutate({
      id: taskId,
      data: { scheduledCompleteDate: scheduledDate }
    });
  };

  const handleUnschedule = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverDate(null);
    
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    updateTask.mutate({
      id: taskId,
      data: { scheduledCompleteDate: null }
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-surface-700 rounded w-32 mx-auto"></div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-28 md:h-32 bg-surface-800 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" onDragLeave={handleDragLeave}>
      {/* Week header with month/year */}
      <div className="text-center">
        <span className="text-sm text-gray-400">
          {weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* 7-day grid - 2 cols on mobile (with today full width), 7 cols on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dateKey = formatDateKey(day);
          return (
            <DayColumn
              key={dateKey}
              date={day}
              tasks={scheduledTasks[dateKey] || []}
              isCurrentDay={isToday(day)}
              onDragStart={handleDragStart}
              onDragOver={(e) => handleDragOver(e, dateKey)}
              onDrop={handleDrop}
              dragOver={dragOverDate === dateKey}
            />
          );
        })}
      </div>

      {/* Unscheduled tasks */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverDate('unscheduled');
        }}
        onDrop={handleUnschedule}
        className={`
          bg-surface-800 rounded-lg p-3 border border-surface-700
          ${dragOverDate === 'unscheduled' ? 'ring-2 ring-accent-400' : ''}
        `}
      >
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Unscheduled Tasks ({unscheduledTasks.length})
        </h3>
        
        {unscheduledTasks.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            All tasks are scheduled! 🎉
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {unscheduledTasks.map((task) => (
              <DraggableTask key={task.id} task={task} onDragStart={handleDragStart} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
