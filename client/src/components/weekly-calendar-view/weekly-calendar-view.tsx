import { useMemo, useState, useRef, useCallback, DragEvent, TouchEvent } from 'react';
import { useTasks, useUpdateTask } from '@/hooks';
import type { Task } from '@/types';
import { WEEK_DAY_NAMES } from '@/utils/dateConstants';
import './weekly-calendar-view.less';

type TouchDragState = {
  taskId: string;
  taskTitle: string;
  startX: number;
  startY: number;
  clone: HTMLDivElement | null;
};

function getWeekDays(): Date[] {
  const today = new Date();
  const currentDay = today.getDay();
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

type DraggableTaskProps = {
  task: Task;
  onDragStart: (e: DragEvent<HTMLDivElement>, taskId: string) => void;
  onTouchStart: (e: TouchEvent<HTMLDivElement>, task: Task) => void;
  onTouchMove: (e: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLDivElement>) => void;
};

function DraggableTask({ task, onDragStart, onTouchStart, onTouchMove, onTouchEnd }: DraggableTaskProps) {
  const categoryMod = task.category.toLowerCase() as 'work' | 'admin' | 'personal';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onTouchStart={(e) => onTouchStart(e, task)}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={[
        'weekly-calendar-view__task',
        `weekly-calendar-view__task--${categoryMod}`,
        task.isCompleted && 'weekly-calendar-view__task--completed',
      ].filter(Boolean).join(' ')}
    >
      <span className="weekly-calendar-view__task-title">{task.title}</span>
    </div>
  );
}

type DayColumnProps = {
  date: Date;
  tasks: Task[];
  isCurrentDay: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, date: string) => void;
  dragOver: boolean;
  onTouchStart: (e: TouchEvent<HTMLDivElement>, task: Task) => void;
  onTouchMove: (e: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLDivElement>) => void;
};

function DayColumn({ date, tasks, isCurrentDay, onDragStart, onDragOver, onDrop, dragOver, onTouchStart, onTouchMove, onTouchEnd }: DayColumnProps) {
  const dateKey = formatDateKey(date);

  return (
    <div
      data-drop-date={dateKey}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, dateKey)}
      className={[
        'weekly-calendar-view__day',
        isCurrentDay && 'weekly-calendar-view__day--today',
        dragOver && 'weekly-calendar-view__day--drag-over',
      ].filter(Boolean).join(' ')}
    >
      <div className="weekly-calendar-view__day-header">
        <span className="weekly-calendar-view__day-name">
          {WEEK_DAY_NAMES[date.getDay()]}
        </span>
        <div className="weekly-calendar-view__day-number">
          {date.getDate()}
        </div>
        {isCurrentDay && (
          <span className="weekly-calendar-view__today-badge">Today</span>
        )}
      </div>

      <div className="weekly-calendar-view__day-tasks">
        {tasks.map((task) => (
          <DraggableTask
            key={task.id}
            task={task}
            onDragStart={onDragStart}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        ))}
      </div>
    </div>
  );
}

const WeeklyCalendarView = () => {
  const { data: tasks = [], isLoading } = useTasks('Weekly calendar view');
  const updateTask = useUpdateTask();
  const weekDays = useMemo(() => getWeekDays(), []);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const touchDragRef = useRef<TouchDragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { scheduledTasks, unscheduledTasks } = useMemo(() => {
    const scheduled: Record<string, Task[]> = {};
    const unscheduled: Task[] = [];

    weekDays.forEach(day => {
      scheduled[formatDateKey(day)] = [];
    });

    const incompleteTasks = tasks.filter(t => !t.isCompleted);

    incompleteTasks.forEach(task => {
      if (task.scheduledCompleteDate) {
        if (scheduled[task.scheduledCompleteDate]) {
          scheduled[task.scheduledCompleteDate].push(task);
        } else {
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

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>, task: Task) => {
    const touch = e.touches[0];

    const clone = document.createElement('div');
    clone.className = 'weekly-calendar-view__drag-clone';
    clone.style.left = `${touch.clientX - 50}px`;
    clone.style.top = `${touch.clientY - 20}px`;
    clone.style.width = '120px';
    clone.innerHTML = `<span class="weekly-calendar-view__task-title">${task.title}</span>`;
    document.body.appendChild(clone);

    touchDragRef.current = {
      taskId: task.id,
      taskTitle: task.title,
      startX: touch.clientX,
      startY: touch.clientY,
      clone,
    };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!touchDragRef.current) return;

    e.preventDefault();

    const touch = e.touches[0];
    const { clone } = touchDragRef.current;

    if (clone) {
      clone.style.left = `${touch.clientX - 50}px`;
      clone.style.top = `${touch.clientY - 20}px`;
    }

    if (clone) clone.style.display = 'none';
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    if (clone) clone.style.display = '';

    const dropTarget = elementBelow?.closest('[data-drop-date]') as HTMLElement | null;
    if (dropTarget) {
      const dateKey = dropTarget.getAttribute('data-drop-date');
      setDragOverDate(dateKey);
    } else {
      setDragOverDate(null);
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!touchDragRef.current) return;

    const { taskId, clone } = touchDragRef.current;

    if (clone) {
      clone.remove();
    }

    const touch = e.changedTouches[0];
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropTarget = elementBelow?.closest('[data-drop-date]') as HTMLElement | null;

    if (dropTarget) {
      const dateKey = dropTarget.getAttribute('data-drop-date');
      if (dateKey === 'unscheduled') {
        updateTask.mutate({
          id: taskId,
          data: { scheduledCompleteDate: null }
        });
      } else if (dateKey) {
        updateTask.mutate({
          id: taskId,
          data: { scheduledCompleteDate: dateKey }
        });
      }
    }

    setDragOverDate(null);
    touchDragRef.current = null;
  }, [updateTask]);

  if (isLoading) {
    return (
      <div className="weekly-calendar-view__skeleton">
        <div className="weekly-calendar-view__skeleton-label" />
        <div className="weekly-calendar-view__grid">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="weekly-calendar-view__skeleton-day" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="weekly-calendar-view" onDragLeave={handleDragLeave}>
      <div className="weekly-calendar-view__month-label">
        {weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </div>

      <div className="weekly-calendar-view__grid">
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
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          );
        })}
      </div>

      <div
        data-drop-date="unscheduled"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverDate('unscheduled');
        }}
        onDrop={handleUnschedule}
        className={[
          'weekly-calendar-view__unscheduled',
          dragOverDate === 'unscheduled' && 'weekly-calendar-view__unscheduled--drag-over',
        ].filter(Boolean).join(' ')}
      >
        <h3 className="weekly-calendar-view__unscheduled-title">
          Unscheduled Tasks ({unscheduledTasks.length})
        </h3>

        {unscheduledTasks.length === 0 ? (
          <p className="weekly-calendar-view__unscheduled-empty">
            All tasks are scheduled! 🎉
          </p>
        ) : (
          <div className="weekly-calendar-view__unscheduled-grid">
            {unscheduledTasks.map((task) => (
              <DraggableTask
                key={task.id}
                task={task}
                onDragStart={handleDragStart}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyCalendarView;
