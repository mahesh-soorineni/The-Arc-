/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  BookOpen,
  Edit2,
  Trash2,
  ArrowRight,
  Info,
  CalendarDays,
  FileCheck,
  Beaker,
  Plus,
  XCircle
} from 'lucide-react';
import {
  Subject,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  AttendanceRecord,
  DayType,
  SlotDetail,
  UserProfile
} from '../types';
import {
  determineDayType,
  isAttendanceRequired,
  getTimetableForDate,
  getDayOfWeekFromDate,
  formatDateToDDMMYYYY
} from '../utils/rulesEngine';

interface DailyAttendanceCollectorProps {
  currentDate: string; // YYYY-MM-DD
  subjects: Subject[];
  timetables: Timetable[];
  academicCalendar: AcademicCalendarItem[];
  specialOverrides: SpecialDayOverride[];
  records: AttendanceRecord[];
  onSave: (record: AttendanceRecord) => void;
  onDelete: (date: string) => void;
  onClose?: () => void;
  onDateChange?: (date: string) => void;
  userProfile?: UserProfile;
}

export default function DailyAttendanceCollector({
  currentDate,
  subjects,
  timetables,
  academicCalendar,
  specialOverrides,
  records,
  onSave,
  onDelete,
  onClose,
  onDateChange,
  userProfile
}: DailyAttendanceCollectorProps) {
  // Check if today already has attendance recorded
  const existingRecord = records.find(r => r.date === currentDate);

  // States
  const [step, setStep] = useState<'status_check' | 'collect_hours' | 'confirm' | 'saved'>('status_check');
  const [slotDetails, setSlotDetails] = useState<SlotDetail[]>([]);
  const [validationError, setValidationError] = useState<string>('');

  // Add Extra Class Form State
  const [showAddExtraModal, setShowAddExtraModal] = useState<boolean>(false);
  const [extraSubject, setExtraSubject] = useState<string>('');
  const [extraStartTime, setExtraStartTime] = useState<string>('09:00 AM');
  const [extraDuration, setExtraDuration] = useState<number>(1);
  const [extraNotes, setExtraNotes] = useState<string>('');

  // Evaluate basic today details
  const dayInfo = getDayOfWeekFromDate(currentDate);
  const { dayType, sourceName } = determineDayType(currentDate, specialOverrides, academicCalendar);

  const activeTimetable = getTimetableForDate(currentDate, timetables);
  const scheduledSlots = activeTimetable ? activeTimetable.slots[dayInfo.indexStr] || [] : [];
  const totalScheduledHours = scheduledSlots.reduce((sum, s) => sum + s.hours, 0);

  // Load and initialize slotDetails
  useEffect(() => {
    setStep('status_check');
    setValidationError('');
    setShowAddExtraModal(false);

    if (existingRecord && existingRecord.slotsDetails && existingRecord.slotsDetails.length > 0) {
      // Clean and sanitize slot details to guarantee a valid hours number
      const cleaned = existingRecord.slotsDetails.map((slot) => {
        let hrs = slot.hours;
        if (!hrs) {
          const match = scheduledSlots.find(s => s.subjectCode === slot.subjectCode);
          hrs = match ? match.hours : 1;
        }
        return {
          ...slot,
          hours: hrs
        };
      });
      setSlotDetails(cleaned);
    } else {
      // Fallback/Legacy init
      const initialDetails: SlotDetail[] = scheduledSlots.map((slot, idx) => {
        const subInfo = subjects.find(sub => sub.code === slot.subjectCode);
        const isLab = subInfo?.isLab || false;

        let isAttended = true;
        if (existingRecord) {
          if (isLab && existingRecord.labAttendance && existingRecord.labAttendance.subjectCode === slot.subjectCode) {
            isAttended = existingRecord.labAttendance.attendedSlots > 0;
          } else {
            isAttended = !existingRecord.missedClasses.includes(slot.subjectCode);
          }
        }

        return {
          id: `slot-${idx}-${slot.subjectCode}`,
          subjectCode: slot.subjectCode,
          hours: slot.hours || 1,
          status: 'Conducted',
          isAttended,
          isLab
        };
      });
      setSlotDetails(initialDetails);
    }
  }, [currentDate, existingRecord, timetables, subjects]);

  // Derive current metrics
  const activeConductedSlots = slotDetails.filter(s => s.status !== 'Cancelled');
  const currentScheduledHours = activeConductedSlots.reduce((sum, s) => sum + s.hours, 0);
  const currentAttendedHours = activeConductedSlots.filter(s => s.isAttended).reduce((sum, s) => sum + s.hours, 0);

  // Handle entering mark attendance flow
  const startMarkingFlow = () => {
    if (!isAttendanceRequired(dayType)) {
      // Non-attendance day types (Holiday, exams, etc.) don't require tracking hours
      const autoRecord: AttendanceRecord = {
        date: currentDate,
        dayOfWeek: dayInfo.name,
        dayType,
        scheduledHours: 0,
        attendedHours: 0,
        missedClasses: [],
        isMarked: true,
        notes: sourceName || `Evaluation: ${dayType}`,
        editTimestamp: new Date().toISOString()
      };
      onSave(autoRecord);
      setStep('saved');
      return;
    }

    if (totalScheduledHours === 0 && slotDetails.length === 0) {
      setValidationError('No classes scheduled for this day in the current timetable. You can add extra unscheduled classes.');
    }
    setStep('collect_hours');
  };

  // Sync simple hour button clicks with individual slot checkboxes
  const applyAttendedHoursCount = (hours: number) => {
    let remainingHours = hours;
    setSlotDetails(prev => prev.map(slot => {
      if (slot.status === 'Cancelled') {
        return { ...slot, isAttended: false };
      }
      const canAttend = Math.min(slot.hours, remainingHours);
      remainingHours -= canAttend;
      return {
        ...slot,
        isAttended: canAttend > 0
      };
    }));
  };

  const toggleSlotStatus = (id: string) => {
    setSlotDetails(prev => prev.map(slot => {
      if (slot.id === id) {
        const nextStatus = slot.status === 'Conducted' ? 'Cancelled' : 'Conducted';
        return {
          ...slot,
          status: nextStatus,
          isAttended: nextStatus === 'Conducted'
        };
      }
      return slot;
    }));
  };

  const toggleSlotAttendance = (id: string) => {
    setSlotDetails(prev => prev.map(slot => {
      if (slot.id === id) {
        return {
          ...slot,
          isAttended: !slot.isAttended
        };
      }
      return slot;
    }));
  };

  const handleAddExtraClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraSubject) return;

    const isLab = subjects.find(sub => sub.code === extraSubject)?.isLab || false;
    const newSlot: SlotDetail = {
      id: `extra-${Date.now()}`,
      subjectCode: extraSubject,
      hours: extraDuration,
      status: 'Extra',
      isAttended: true,
      isLab,
      startTime: extraStartTime,
      notes: extraNotes
    };

    setSlotDetails(prev => [...prev, newSlot]);
    setShowAddExtraModal(false);
    // Reset form
    setExtraSubject('');
    setExtraStartTime('09:00 AM');
    setExtraDuration(1);
    setExtraNotes('');
  };

  const removeExtraClass = (id: string) => {
    setSlotDetails(prev => prev.filter(slot => slot.id !== id));
  };

  const handleSaveFinal = () => {
    const finalRecord: AttendanceRecord = {
      date: currentDate,
      dayOfWeek: dayInfo.name,
      dayType,
      scheduledHours: currentScheduledHours,
      attendedHours: currentAttendedHours,
      missedClasses: slotDetails
        .filter(s => s.status !== 'Cancelled' && !s.isAttended)
        .map(s => s.subjectCode),
      isMarked: true,
      editTimestamp: new Date().toISOString(),
      slotsDetails: slotDetails
    };

    const labSlotDetail = slotDetails.find(s => s.isLab && s.status !== 'Cancelled');
    if (labSlotDetail) {
      finalRecord.labAttendance = {
        subjectCode: labSlotDetail.subjectCode,
        attendedSlots: labSlotDetail.isAttended ? labSlotDetail.hours : 0,
        totalSlots: labSlotDetail.hours
      };
    }

    onSave(finalRecord);
    setStep('saved');
  };

  return (
    <div id="attendance-collector-card" className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden text-slate-800">
      {/* Date header banner */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 relative cursor-pointer group">
          <CalendarDays className="h-5 w-5 text-slate-500 group-hover:text-blue-500 transition-colors" />
          <div>
            <h3 className="font-sans font-semibold text-sm tracking-tight text-slate-900 flex items-center gap-1 group-hover:text-blue-600 transition-colors">
              {dayInfo.name}, {formatDateToDDMMYYYY(currentDate)}
              <span className="text-[10px] text-slate-400 group-hover:text-blue-500">▼</span>
            </h3>
            <p className="text-xs font-mono text-slate-500">
              Day Status: <span className="font-semibold text-slate-700">{dayType}</span>
              {sourceName && ` (${sourceName})`}
            </p>
          </div>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => onDateChange?.(e.target.value)}
            min={userProfile?.name ? userProfile.semesterStartDate : undefined}
            max={userProfile?.name ? userProfile.semesterEndDate : undefined}
            className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
            title="Click to select another date within the semester"
          />
        </div>

        {existingRecord && step === 'status_check' && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
            Recorded
          </span>
        )}
      </div>

      <div className="p-6">
        {step === 'status_check' && (
          <div className="space-y-4">
            {existingRecord ? (
              <div className="space-y-4">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-5 flex items-start space-x-4">
                  <div className="bg-emerald-100 rounded-full p-2 text-emerald-600 mt-0.5 animate-pulse">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="font-sans font-medium text-sm text-slate-900">Today's attendance recorded ✅</h4>
                    
                    {existingRecord.scheduledHours > 0 || (existingRecord.slotsDetails && existingRecord.slotsDetails.length > 0) ? (
                      <div className="text-xs text-slate-600 space-y-1.5 pt-2">
                        <div className="flex justify-between max-w-xs">
                          <span>Conducted/Scheduled Hours:</span>
                          <span className="font-mono font-medium text-slate-800">{existingRecord.scheduledHours} hrs</span>
                        </div>
                        <div className="flex justify-between max-w-xs">
                          <span>Hours Attended:</span>
                          <span className="font-mono font-bold text-emerald-700">{existingRecord.attendedHours} hrs</span>
                        </div>
                        <div className="flex justify-between max-w-xs">
                          <span>Status Rate:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {existingRecord.scheduledHours > 0 
                              ? `${((existingRecord.attendedHours / existingRecord.scheduledHours) * 100).toFixed(0)}%`
                              : '100%'}
                          </span>
                        </div>
                        
                        {existingRecord.slotsDetails && existingRecord.slotsDetails.length > 0 ? (
                          <div className="pt-2.5 border-t border-slate-100 space-y-1.5 max-w-xs">
                            <span className="font-semibold text-slate-500 uppercase text-[9px] tracking-wider font-mono">Detailed Period Log:</span>
                            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                              {existingRecord.slotsDetails.map((slot, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 p-1.5 rounded border border-slate-100 font-mono">
                                  <span className="truncate max-w-[150px]">{slot.subjectCode} ({slot.hours || 1}h)</span>
                                  <span className={`font-bold uppercase text-[9px] ${
                                    slot.status === 'Cancelled' ? 'text-rose-500' : slot.isAttended ? 'text-emerald-600' : 'text-rose-600'
                                  }`}>
                                    {slot.status === 'Cancelled' ? 'Cancelled' : slot.isAttended ? 'Present' : 'Absent'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          existingRecord.missedClasses.length > 0 && (
                            <div className="pt-1.5">
                              <span className="text-red-700 font-medium">Missed Classes:</span>
                              <span className="ml-1.5 px-2 py-0.5 rounded bg-red-50 text-red-700 font-mono text-[10px] uppercase font-bold border border-red-100">
                                {existingRecord.missedClasses.join(', ')}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 pt-1">
                        No attendance required: marked as <span className="font-semibold">{existingRecord.dayType}</span>.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <button
                    id="btn-edit-attendance"
                    onClick={() => setStep('collect_hours')}
                    className="flex-1 inline-flex justify-center items-center space-x-2 px-4 py-2 border border-slate-200 text-sm font-medium rounded-lg text-slate-600 bg-white hover:bg-slate-50 transition cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                    <span>Edit Log</span>
                  </button>
                  <button
                    id="btn-delete-attendance"
                    onClick={() => onDelete(currentDate)}
                    className="inline-flex justify-center items-center p-2 border border-red-200 rounded-lg text-red-500 bg-white hover:bg-red-50 transition cursor-pointer"
                    title="Delete Record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                  <Clock className="h-6 w-6" />
                </div>
                
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="font-sans font-medium text-slate-900">Ready to mark today's attendance?</h4>
                  <p className="text-xs text-slate-500">
                    {isAttendanceRequired(dayType) ? (
                      totalScheduledHours > 0 ? (
                        `Timetable loaded: ${totalScheduledHours} scheduled hours (${scheduledSlots.length} subjects)`
                      ) : (
                        "No classes found on standard timetable. You can log unscheduled sessions."
                      )
                    ) : (
                      `No classes today due to: ${dayType} (${sourceName || 'Calendar Event'})`
                    )}
                  </p>
                </div>

                <div className="flex items-center space-x-3 justify-center pt-2 max-w-xs mx-auto">
                  <button
                    id="btn-mark-attendance"
                    onClick={startMarkingFlow}
                    className="flex-1 inline-flex justify-center items-center space-x-2 px-5 py-2.5 bg-slate-900 border border-transparent text-sm font-medium rounded-lg text-white hover:bg-slate-800 transition cursor-pointer shadow-sm"
                  >
                    <FileCheck className="h-4 w-4" />
                    <span>{isAttendanceRequired(dayType) ? "Mark Attendance" : "Record Status"}</span>
                  </button>
                  {onClose && (
                    <button
                      id="btn-later"
                      onClick={onClose}
                      className="px-4 py-2.5 border border-slate-200 text-sm font-medium rounded-lg text-slate-500 bg-white hover:bg-slate-50 cursor-pointer transition"
                    >
                      Later
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'collect_hours' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Attendance Tracker
              </label>
              <h4 className="font-sans font-medium text-slate-900 text-base">
                Log conducted and attended hours
              </h4>
            </div>

            {/* Quick selectors if we have slots */}
            {currentScheduledHours > 0 && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-xl">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                  Quick Attendance Presets
                </label>
                <div className="flex flex-wrap gap-2 justify-center py-1">
                  {Array.from({ length: currentScheduledHours + 1 }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyAttendedHoursCount(i)}
                      className={`h-10 w-10 rounded-lg border font-mono font-bold text-xs flex items-center justify-center transition cursor-pointer ${
                        currentAttendedHours === i
                          ? 'bg-slate-900 text-white border-slate-900 scale-105'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-center text-slate-500 mt-1 italic">
                  Presetting {currentAttendedHours} of {currentScheduledHours} conducted hours
                </p>
              </div>
            )}

            {/* Timetable Period Status Editor */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                  <span>Period-by-Period Status & Log</span>
                </h5>
                <span className="text-[10px] text-slate-400 italic">Toggle Cancelled/Present/Absent</span>
              </div>

              {slotDetails.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl text-slate-500 border border-slate-100 text-xs">
                  No classes logged for today yet. Use the button below to add extra or unscheduled classes.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {slotDetails.map((slot) => {
                    const subObj = subjects.find(s => s.code === slot.subjectCode);
                    const isCancelled = slot.status === 'Cancelled';
                    const isExtra = slot.status === 'Extra';

                    return (
                      <div
                        key={slot.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-all ${
                          isCancelled
                            ? 'bg-slate-50/50 border-slate-200 opacity-65 line-through decoration-slate-300 text-slate-400'
                            : isExtra
                            ? 'bg-indigo-50/20 border-indigo-200 ring-1 ring-indigo-100'
                            : slot.isAttended
                            ? 'bg-emerald-50/20 border-emerald-200'
                            : 'bg-rose-50/10 border-rose-200'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${
                            isCancelled ? 'bg-slate-200/50 text-slate-500' : isExtra ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {slot.isLab ? <Beaker className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs tracking-wide text-slate-900 uppercase">
                                {slot.subjectCode} ({slot.hours || 1}h)
                              </span>
                              <span className={`text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                isCancelled 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : isExtra 
                                  ? 'bg-indigo-100 text-indigo-800' 
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {slot.status}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                {slot.hours || 1}h
                              </span>
                              {slot.startTime && (
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
                                  {slot.startTime}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              {subObj?.name || 'Theory Subject'}
                            </p>
                            {slot.notes && (
                              <p className="text-[10px] text-indigo-600 italic mt-0.5">
                                Note: {slot.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2.5 sm:mt-0 self-end sm:self-center shrink-0">
                          {!isExtra && (
                            <button
                              type="button"
                              onClick={() => toggleSlotStatus(slot.id!)}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                isCancelled
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20'
                              }`}
                            >
                              {isCancelled ? 'Re-conduct' : 'Dismiss Period'}
                            </button>
                          )}

                          {isExtra && (
                            <button
                              type="button"
                              onClick={() => removeExtraClass(slot.id!)}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                              title="Remove Extra Class"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isCancelled}
                            onClick={() => toggleSlotAttendance(slot.id!)}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                              isCancelled
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                                : slot.isAttended
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/10'
                                : 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/10'
                            }`}
                          >
                            {isCancelled ? (
                              'N/A'
                            ) : slot.isAttended ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Present</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Absent</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Extra Class Toggle Button */}
              {!showAddExtraModal && (
                <button
                  type="button"
                  onClick={() => setShowAddExtraModal(true)}
                  className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 flex items-center justify-center gap-1.5 bg-slate-50/50 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-slate-500" />
                  <span>+ Add Unscheduled / Extra Class</span>
                </button>
              )}
            </div>

            {/* Inline Add Extra Class Form */}
            {showAddExtraModal && (
              <form onSubmit={handleAddExtraClass} className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-4 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between border-b border-indigo-100/50 pb-2">
                  <h6 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                    <Plus className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Add Extra / Unscheduled Class</span>
                  </h6>
                  <button
                    type="button"
                    onClick={() => setShowAddExtraModal(false)}
                    className="text-slate-400 hover:text-slate-600 text-[10px] font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600">Select Subject</label>
                    <select
                      value={extraSubject}
                      onChange={(e) => setExtraSubject(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium focus:ring-1 focus:ring-indigo-500"
                      required
                    >
                      <option value="">-- Choose Subject --</option>
                      {subjects.map(s => (
                        <option key={s.code} value={s.code}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600">Start Time</label>
                    <input
                      type="text"
                      placeholder="e.g. 10:00 AM"
                      value={extraStartTime}
                      onChange={(e) => setExtraStartTime(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600">Duration (Hours)</label>
                    <select
                      value={extraDuration}
                      onChange={(e) => setExtraDuration(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value={1}>1 Hour</option>
                      <option value={2}>2 Hours</option>
                      <option value={3}>3 Hours</option>
                      <option value={4}>4 Hours</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Swapped session"
                      value={extraNotes}
                      onChange={(e) => setExtraNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddExtraModal(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={!extraSubject}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Add to Today
                  </button>
                </div>
              </form>
            )}

            {validationError && (
              <div className="text-center py-3 bg-amber-50 rounded-lg text-amber-850 border border-amber-100 text-xs flex items-center justify-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setStep('status_check')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Back
              </button>
              
              <button
                onClick={() => setStep('confirm')}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-950 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                <span>Preview Summary</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Confirmation Step
              </label>
              <h4 className="font-sans font-medium text-slate-900">
                Preview Attendance Entry
              </h4>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3.5 text-xs">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Date Logged:</span>
                <span className="font-bold font-mono text-slate-800">{formatDateToDDMMYYYY(currentDate)}</span>
              </div>

              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Conducted Hours:</span>
                <span className="font-bold font-mono text-slate-800">{currentScheduledHours} Hours</span>
              </div>

              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 text-emerald-800 font-medium">Attended Hours:</span>
                <span className="font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  {currentAttendedHours} Hours
                </span>
              </div>

              <div className="space-y-2 pt-1">
                <p className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider font-mono">
                  Subject Allocations
                </p>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {slotDetails.map((slot, i) => {
                    return (
                      <div
                        key={slot.id || i}
                        className={`flex items-center justify-between p-2 rounded border text-[11px] ${
                          slot.status === 'Cancelled'
                            ? 'bg-slate-100 text-slate-400 border-slate-250 line-through'
                            : slot.status === 'Extra'
                            ? 'bg-indigo-50/50 border-indigo-150 text-indigo-900'
                            : slot.isAttended
                            ? 'bg-emerald-50/35 border-emerald-100 text-emerald-900'
                            : 'bg-red-50/35 border-red-100 text-red-950'
                        }`}
                      >
                        <div className="font-medium shrink-0">
                          <span className="font-mono font-bold mr-1.5">{slot.subjectCode}</span>
                          <span className="text-[10px] text-slate-500">({slot.hours} hr)</span>
                        </div>

                        <span className="font-semibold font-mono uppercase text-[9px] tracking-wide text-right">
                          {slot.status === 'Cancelled' 
                            ? 'Cancelled' 
                            : slot.status === 'Extra' 
                            ? `Extra - ${slot.isAttended ? 'Present' : 'Absent'}` 
                            : slot.isAttended 
                            ? 'Present' 
                            : 'Absent'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep('collect_hours')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Go Back / Edit
              </button>

              <button
                type="button"
                onClick={handleSaveFinal}
                className="inline-flex justify-center items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-medium rounded-lg text-xs tracking-tight transition cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Save Attendance</span>
              </button>
            </div>
          </div>
        )}

        {step === 'saved' && (
          <div className="space-y-4 text-center py-6">
            <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h4 className="font-sans font-semibold text-slate-900 text-sm">Attendance Saved Successfully ✅</h4>
              <p className="text-xs text-slate-500">
                Rule check complete. Analytics, Safe bunk limits, and forecasting sheets updated.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setStep('status_check')}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium cursor-pointer"
              >
                View Log Summary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
