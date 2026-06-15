/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CalendarDays,
  FileText,
  Bookmark,
  Share2,
  Download,
  AlertCircle,
  FileEdit,
  Sparkles
} from 'lucide-react';
import {
  AttendanceRecord,
  AcademicCalendarItem,
  SpecialDayOverride,
  Subject,
  Timetable,
  DayType
} from '../types';
import {
  determineDayType,
  getDayOfWeekFromDate,
  getTimetableForDate
} from '../utils/rulesEngine';

interface CalendarManagerProps {
  currentDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  records: AttendanceRecord[];
  subjects: Subject[];
  timetables: Timetable[];
  academicCalendar: AcademicCalendarItem[];
  specialOverrides: SpecialDayOverride[];
  onAddCalendarItem: (item: AcademicCalendarItem) => void;
  onAddOverride: (override: SpecialDayOverride) => void;
  onDeleteCalendarItem: (date: string) => void;
  onDeleteOverride: (date: string) => void;
  onTriggerShare: (date: string) => void;
  onTriggerExport: (date: string) => void;
}

export default function CalendarManager({
  currentDate,
  onSelectDate,
  records,
  subjects,
  timetables,
  academicCalendar,
  specialOverrides,
  onAddCalendarItem,
  onAddOverride,
  onDeleteCalendarItem,
  onDeleteOverride,
  onTriggerShare,
  onTriggerExport
}: CalendarManagerProps) {
  // Local calendar navigation month/year states
  // Let's seed default month to June 2026 to match local system date of test!
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(5); // 0-indexed (5 = June)

  // Local state for opening Add event modals
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    date: '2026-06-12',
    name: 'College Cultural Fest',
    category: 'CalendarItem' as 'CalendarItem' | 'Override',
    type: 'Event' as DayType,
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Logic to build month days grid
  const firstDayOfMonthIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  // Convert day number to string date helper YYYY-MM-DD
  const formatDateString = (day: number) => {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${currentYear}-${mm}-${dd}`;
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (eventForm.category === 'Override') {
      onAddOverride({
        date: eventForm.date,
        type: eventForm.type as SpecialDayOverride['type'],
        note: eventForm.name
      });
    } else {
      onAddCalendarItem({
        date: eventForm.date,
        type: eventForm.type as AcademicCalendarItem['type'],
        name: eventForm.name
      });
    }
    setIsAddingEvent(false);
  };

  // Evaluate selected day details
  const selectedDayInfo = getDayOfWeekFromDate(currentDate);
  const selectedDayStatus = determineDayType(currentDate, specialOverrides, academicCalendar);
  const selectedRecord = records.find(r => r.date === currentDate);
  const selectedTimetable = getTimetableForDate(currentDate, timetables);
  const selectedSlots = selectedTimetable ? selectedTimetable.slots[selectedDayInfo.indexStr] || [] : [];
  const selectedTotalScheduled = selectedSlots.reduce((sum, s) => sum + s.hours, 0);

  // Active items for visual table logs inside current month
  const activeMonthHolidays = academicCalendar.filter(item => {
    const parts = item.date.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    return month === currentMonth && year === currentYear;
  });

  const activeMonthOverrides = specialOverrides.filter(item => {
    const parts = item.date.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    return month === currentMonth && year === currentYear;
  });

  return (
    <div id="calendar-manager-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* 1. Monthly Calendar Grid (Span 2) */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <CalendarDays className="h-5 w-5 text-slate-500" />
            <h3 className="font-sans font-bold text-base text-slate-900 tracking-tight">Academic Scheduler</h3>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrevMonth}
              className="p-1 px-2 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 transition cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-sans font-semibold text-sm text-slate-700 min-w-28 text-center">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 px-2 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 transition cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days of Week header */}
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-400 py-1 font-mono uppercase tracking-wider">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Month grid layout */}
        <div className="grid grid-cols-7 gap-2">
          {/* Empty paddings for first day offset */}
          {Array.from({ length: firstDayOfMonthIndex }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-10 sm:h-12 border border-transparent" />
          ))}

          {/* Month calendar cells */}
          {Array.from({ length: totalDaysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const cellDateStr = formatDateString(dayNum);
            const isSelected = currentDate === cellDateStr;
            const log = records.find(r => r.date === cellDateStr);

            // Fetch calculated status of specific date
            const cellStatus = determineDayType(cellDateStr, specialOverrides, academicCalendar);
            const cellDateInfo = getDayOfWeekFromDate(cellDateStr);
            const cellTimetable = getTimetableForDate(cellDateStr, timetables);
            const cellSlots = cellTimetable ? cellTimetable.slots[cellDateInfo.indexStr] || [] : [];

            // Determine background colors:
            // 1. Holiday/Exam - light blue
            // 2. Log is present - green
            // 3. Log is completely absent - red
            // 4. Log is partially present - orange
            let cellStyle = "bg-white text-slate-800 hover:border-slate-400 border-slate-100";
            let indicatorColor = "";

            if (
              cellStatus.dayType === 'Holiday' ||
              cellStatus.dayType === 'Festival' ||
              cellStatus.dayType === 'MidExam' ||
              cellStatus.dayType === 'SemesterExam' ||
              cellStatus.dayType === 'SuddenHoliday' ||
              cellStatus.dayType === 'CancelledClasses'
            ) {
              cellStyle = "bg-indigo-50/70 border-indigo-100/70 text-indigo-900";
              indicatorColor = "bg-indigo-505";
            } else if (log && log.isMarked) {
              if (log.scheduledHours > 0) {
                if (log.attendedHours === log.scheduledHours) {
                  cellStyle = "bg-emerald-50 text-emerald-950 border-emerald-100";
                } else if (log.attendedHours === 0) {
                  cellStyle = "bg-rose-50 text-rose-950 border-rose-100";
                } else {
                  cellStyle = "bg-amber-50 text-amber-950 border-amber-100";
                }
              } else {
                cellStyle = "bg-slate-50 text-slate-600 border-slate-100";
              }
            } else if (cellSlots.length > 0 && cellDateInfo.indexStr !== '0' && cellDateInfo.indexStr !== '6') {
              // Standard class day that is yet to be marked
              cellStyle = "bg-slate-50/50 hover:bg-slate-100/70 border-dashed border-slate-200 text-slate-700";
            }

            return (
              <button
                key={`day-${dayNum}`}
                type="button"
                onClick={() => onSelectDate(cellDateStr)}
                className={`h-11 sm:h-14 border rounded-lg transition text-xs relative flex flex-col items-center justify-between p-1.5 cursor-pointer font-sans ${cellStyle} ${
                  isSelected ? 'ring-2 ring-slate-900 scale-105 border-transparent z-10' : ''
                }`}
              >
                <span className={`font-mono font-bold ${isSelected ? 'text-slate-900 text-sm' : ''}`}>
                  {dayNum}
                </span>

                {/* Micro indicators */}
                <div className="flex gap-1 justify-center w-full">
                  {log && log.isMarked && log.scheduledHours > 0 && (
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      log.attendedHours === log.scheduledHours
                        ? 'bg-emerald-500'
                        : log.attendedHours === 0
                        ? 'bg-red-500'
                        : 'bg-amber-500'
                    }`} />
                  )}
                  {cellStatus.dayType !== 'Regular' && (
                    <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Color legend panel */}
        <div className="text-[10px] sm:text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-50 font-mono text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 bg-emerald-50 border border-emerald-100 rounded" />
            <span>Present Class</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 bg-rose-50 border border-rose-100 rounded" />
            <span>Absent Block</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 bg-amber-50 border border-amber-100 rounded" />
            <span>Partial Day</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 bg-indigo-50 border border-indigo-100 rounded" />
            <span>Holiday/Exam</span>
          </div>
        </div>

        {/* Quick Event Management List */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
              Events & Schedules ({monthNames[currentMonth]})
            </h4>
            <button
              onClick={() => {
                setEventForm({
                  date: formatDateString(12),
                  name: 'Sudden Rainstorm Holdoff',
                  category: 'Override',
                  type: 'SuddenHoliday'
                });
                setIsAddingEvent(true);
              }}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded text-xs transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Event / Override</span>
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {activeMonthHolidays.length === 0 && activeMonthOverrides.length === 0 ? (
              <p className="text-slate-400 italic py-2 text-center">No overrides or calendar events registered for this month.</p>
            ) : (
              <>
                {/* Academic Items */}
                {activeMonthHolidays.map((item, idx) => (
                  <div key={`h-${idx}`} className="flex items-center justify-between p-2 bg-indigo-50/50 rounded border border-indigo-100 text-indigo-950">
                    <div className="flex items-center space-x-2">
                      <Bookmark className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <div>
                        <span className="font-mono font-bold mr-2">{item.date}</span>
                        <span className="font-sans font-medium">{item.name}</span>
                        <span className="ml-2 italic text-[10px] text-indigo-600 bg-white/80 px-1 rounded border border-indigo-100">
                          {item.type}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteCalendarItem(item.date)}
                      className="text-indigo-600 hover:text-red-500 p-0.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Overrides */}
                {activeMonthOverrides.map((item, idx) => (
                  <div key={`o-${idx}`} className="flex items-center justify-between p-2 bg-amber-50/50 rounded border border-amber-100 text-amber-950">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <div>
                        <span className="font-mono font-bold mr-2">{item.date}</span>
                        <span className="font-sans font-medium">{item.note}</span>
                        <span className="ml-2 italic text-[10px] text-amber-700 bg-white/80 px-1 rounded border border-amber-100">
                          {item.type} (Highest Priority)
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteOverride(item.date)}
                      className="text-amber-600 hover:text-red-500 p-0.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

      </div>

      {/* 2. Side Panel: Selected Date Details (Span 1) */}
      <div id="side-selected-day-panel" className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        
        <div className="pb-3 border-b border-slate-100">
          <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
            Active Selection
          </span>
          <h3 className="font-sans font-bold text-lg text-slate-900 mt-1">
            {selectedDayInfo.name}
          </h3>
          <p className="text-xs font-mono text-slate-500">{currentDate}</p>
        </div>

        {/* Type status badge */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono">
            Scheduler Classification
          </p>
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>Day Classification:</span>
              <span className="font-mono">{selectedDayStatus.dayType}</span>
            </div>
            {selectedDayStatus.sourceName && (
              <p className="text-[11px] text-slate-500 italic">
                Source event: "{selectedDayStatus.sourceName}"
              </p>
            )}
          </div>
        </div>

        {/* Timetable on selected day */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono">
            Scheduled Classes ({selectedTotalScheduled} hrs)
          </p>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {selectedSlots.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3 text-center">No classes scheduled on this day of week.</p>
            ) : (
              selectedSlots.map((slot, i) => {
                const subObj = subjects.find(s => s.code === slot.subjectCode);
                return (
                  <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50 rounded border border-slate-100 text-xs">
                    <div>
                      <span className="font-bold font-mono text-slate-800">{slot.subjectCode}</span>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{subObj?.name || 'Class slot'}</p>
                    </div>
                    <span className="font-mono font-semibold bg-white text-slate-700 border border-slate-100 px-1.5 py-0.5 rounded">
                      {slot.hours} hr
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Log metrics */}
        <div className="space-y-2.5 pt-2 border-t border-slate-50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono">
            Recorded Status
          </p>

          {selectedRecord ? (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Attendance Rank:</span>
                  <span className="font-bold font-mono text-emerald-700">{selectedRecord.attendedHours} / {selectedRecord.scheduledHours} Hours</span>
                </div>
                {selectedRecord.missedClasses.length > 0 && (
                  <div className="pt-1 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-red-700">Missed Subjects:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedRecord.missedClasses.map((code, ind) => (
                        <span key={ind} className="px-1.5 py-0.5 bg-red-50 text-red-800 rounded font-mono text-[9px] font-semibold border border-red-100 uppercase">
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRecord.labAttendance && (
                  <div className="text-[10px] text-slate-500 pt-0.5">
                    Lab Check: {selectedRecord.labAttendance.attendedSlots}/{selectedRecord.labAttendance.totalSlots} slots attended.
                  </div>
                )}
              </div>

              {/* Share & Export */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => onTriggerShare(currentDate)}
                  className="inline-flex justify-center items-center space-x-1.5 px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share Entry</span>
                </button>

                <button
                  onClick={() => onTriggerExport(currentDate)}
                  className="inline-flex justify-center items-center space-x-1.5 px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center p-4 bg-slate-50/50 rounded-lg text-slate-400 text-xs italic">
              Attendance not marked for this date yet. Use the log console on top to mark.
            </div>
          )}
        </div>

      </div>

      {/* 3. Popup Modal: Add Event Dialog */}
      {isAddingEvent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden text-slate-800">
            
            <div className="bg-slate-950 p-4 text-white">
              <h3 className="font-sans font-bold text-sm tracking-tight flex items-center space-x-2">
                <Sparkles className="h-4 w-4" />
                <span>Configure Academic Scheduler Adjustment</span>
              </h3>
            </div>

            <form onSubmit={handleSaveEvent} className="p-5 space-y-4">
              
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                  Adjustment Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEventForm(f => ({ ...f, category: 'CalendarItem', type: 'Holiday' }))}
                    className={`p-2 rounded text-xs font-semibold border transition ${
                      eventForm.category === 'CalendarItem'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Academic Calendar
                  </button>

                  <button
                    type="button"
                    onClick={() => setEventForm(f => ({ ...f, category: 'Override', type: 'SuddenHoliday' }))}
                    className={`p-2 rounded text-xs font-semibold border transition ${
                      eventForm.category === 'Override'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Urgent Override (Priority)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                  Effective Date (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  required
                  value={eventForm.date}
                  onChange={(e) => setEventForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-xs font-mono border border-slate-200 rounded p-2 focus:ring-1 focus:ring-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                  Adjustment Type Detail
                </label>
                <select
                  value={eventForm.type}
                  onChange={(e) => setEventForm(f => ({ ...f, type: e.target.value as DayType }))}
                  className="w-full text-xs border border-slate-200 rounded p-2 focus:ring-1 focus:ring-slate-800"
                >
                  {eventForm.category === 'CalendarItem' ? (
                    <>
                      <option value="Holiday">Holiday (Break / Intersemester 휴일)</option>
                      <option value="Festival">Festival / Vacation Holiday</option>
                      <option value="MidExam">Mid Examination Day</option>
                      <option value="SemesterExam">Semester Examination Day</option>
                      <option value="Event">Special College Event / Forum</option>
                    </>
                  ) : (
                    <>
                      <option value="SuddenHoliday">Sudden Holiday (Rains / Strike / Shutdown)</option>
                      <option value="ExtraWorkingDay">Extra Working Day (E-session compensation)</option>
                      <option value="HalfDay">Half Day (Post-noon session holdoff)</option>
                      <option value="CancelledClasses">Cancelled Classes (Urgent faculty absence)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                  Notes / Description Label
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flood alarm, Holi holiday, etc."
                  value={eventForm.name}
                  onChange={(e) => setEventForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full text-xs border border-slate-200 rounded p-2 focus:ring-1 focus:ring-slate-800"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsAddingEvent(false)}
                  className="p-2 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded cursor-pointer"
                >
                  Save Schedule Adjustment
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
