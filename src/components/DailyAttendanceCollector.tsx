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
  FileCheck
} from 'lucide-react';
import {
  Subject,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  AttendanceRecord,
  DayType
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
  onClose
}: DailyAttendanceCollectorProps) {
  // Check if today already has attendance recorded
  const existingRecord = records.find(r => r.date === currentDate);

  // States
  const [step, setStep] = useState<'status_check' | 'collect_hours' | 'partial_details' | 'confirm' | 'saved'>('status_check');
  const [attendedHours, setAttendedHours] = useState<number>(0);
  
  // For Lab evaluation
  const [labAttendedSlots, setLabAttendedSlots] = useState<number>(0);
  const [missedTheoryCodes, setMissedTheoryCodes] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string>('');

  // Evaluate basic today details
  const dayInfo = getDayOfWeekFromDate(currentDate);
  const { dayType, sourceName } = determineDayType(currentDate, specialOverrides, academicCalendar);

  const activeTimetable = getTimetableForDate(currentDate, timetables);
  const scheduledSlots = activeTimetable ? activeTimetable.slots[dayInfo.indexStr] || [] : [];
  const totalScheduledHours = scheduledSlots.reduce((sum, s) => sum + s.hours, 0);

  const labSlot = scheduledSlots.find(s => {
    const origSub = subjects.find(sub => sub.code === s.subjectCode);
    return origSub?.isLab;
  });

  // Calculate limits
  const totalLabHours = labSlot ? labSlot.hours : 0;
  const totalTheoryHours = totalScheduledHours - totalLabHours;

  // Sync state if editing/already marked
  useEffect(() => {
    setStep('status_check');
    setValidationError('');
    setMissedTheoryCodes([]);
    setAttendedHours(0);
    setLabAttendedSlots(0);
  }, [currentDate, existingRecord]);

  // Handle entering mark attendance flow
  const startMarkingFlow = () => {
    if (!isAttendanceRequired(dayType)) {
      // Non-attendance day types (Holiday, exams, etc.) don't require tracking hours
      // Save day type automatically
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

    if (totalScheduledHours === 0) {
      setValidationError('No classes scheduled for this day in the current timetable.');
      setStep('collect_hours');
      return;
    }

    // Default values
    setAttendedHours(totalScheduledHours);
    setLabAttendedSlots(totalLabHours);
    setMissedTheoryCodes([]);
    setValidationError('');
    setStep('collect_hours');
  };

  const handleHoursSelect = (hours: number) => {
    setAttendedHours(hours);
    setValidationError('');
    
    // Auto preset lab hours if present
    if (labSlot) {
      // Limit lab hours appropriately
      const suggestedLab = Math.min(hours, totalLabHours);
      setLabAttendedSlots(suggestedLab);
    }
  };

  const handleNextFromHours = () => {
    if (attendedHours === totalScheduledHours) {
      // All present
      setMissedTheoryCodes([]);
      setStep('confirm');
    } else {
      // Partial representation
      if (labSlot) {
        // Lab Day flow
        setStep('partial_details');
        validatePartialLabFlow(labAttendedSlots, attendedHours);
      } else {
        // Theory-only Day missed classes evaluation
        const requiredMissedCount = totalScheduledHours - attendedHours;
        setValidationError(`Select exactly ${requiredMissedCount} missed class${requiredMissedCount > 1 ? 'es' : ''} to continue.`);
        setStep('partial_details');
      }
    }
  };

  const validatePartialLabFlow = (labAttSlots: number, totalAttHours: number) => {
    // Math checks:
    // Lab slots attended = labAttSlots
    // Lab slots scheduled = totalLabHours (e.g. 3)
    // Theory slots scheduled = totalTheoryHours (e.g. 2)
    // Total attended chosen by user = totalAttHours (e.g. 3)

    // Lab attended hours can't exceed total lab hours or overall attended hours
    const theoryAttended = totalAttHours - labAttSlots;
    const theoryMissed = totalTheoryHours - theoryAttended;

    if (theoryAttended < 0) {
      setValidationError(`Invalid breakdown: Lab attended (${labAttSlots} hrs) cannot exceed total attended hours (${totalAttHours} hrs).`);
      return false;
    }
    if (theoryAttended > totalTheoryHours) {
      setValidationError(`Invalid breakdown: Theory attended (${theoryAttended} hrs) cannot exceed total scheduled theory hours (${totalTheoryHours} hrs). Try adjusting lab slots attended.`);
      return false;
    }

    setValidationError(`Select exactly ${theoryMissed} missed theory class${theoryMissed > 1 ? 'es' : ''} below.`);
    return true;
  };

  const handleLabSlotsChange = (slots: number) => {
    setLabAttendedSlots(slots);
    validatePartialLabFlow(slots, attendedHours);
    // Reset missed checklist selection to allow fresh clicks
    setMissedTheoryCodes([]);
  };

  const handleToggleTheoryMissed = (code: string) => {
    let updated = [...missedTheoryCodes];
    if (updated.includes(code)) {
      updated = updated.filter(c => c !== code);
    } else {
      updated.push(code);
    }
    setMissedTheoryCodes(updated);

    // Dynamic validation
    if (labSlot) {
      const theoryAttended = attendedHours - labAttendedSlots;
      const expectedMissed = totalTheoryHours - theoryAttended;
      if (updated.length === expectedMissed) {
        setValidationError('');
      } else {
        setValidationError(`Selected ${updated.length} of ${expectedMissed} required missed theory classes.`);
      }
    } else {
      const expectedMissed = totalScheduledHours - attendedHours;
      if (updated.length === expectedMissed) {
        setValidationError('');
      } else {
        setValidationError(`Selected ${updated.length} of ${expectedMissed} required missed classes.`);
      }
    }
  };

  const handleProceedToConfirm = () => {
    // Double check counts on save
    if (labSlot) {
      const theoryAttended = attendedHours - labAttendedSlots;
      const expectedMissed = totalTheoryHours - theoryAttended;
      if (missedTheoryCodes.length !== expectedMissed) {
        setValidationError(`Missed theory count mismatch. Please select exactly ${expectedMissed} missed class(es).`);
        return;
      }
    } else {
      const expectedMissed = totalScheduledHours - attendedHours;
      if (missedTheoryCodes.length !== expectedMissed) {
        setValidationError(`Missed theory count mismatch. Please select exactly ${expectedMissed} missed class(es).`);
        return;
      }
    }

    setValidationError('');
    setStep('confirm');
  };

  const handleSaveFinal = () => {
    const finalRecord: AttendanceRecord = {
      date: currentDate,
      dayOfWeek: dayInfo.name,
      dayType,
      scheduledHours: totalScheduledHours,
      attendedHours,
      missedClasses: missedTheoryCodes,
      isMarked: true,
      editTimestamp: new Date().toISOString()
    };

    if (labSlot) {
      finalRecord.labAttendance = {
        subjectCode: labSlot.subjectCode,
        attendedSlots: labAttendedSlots,
        totalSlots: totalLabHours
      };
      
      // If lab was missed, add to missed classes list as well for subject statistics
      if (labAttendedSlots < totalLabHours) {
        finalRecord.missedClasses = [...missedTheoryCodes, labSlot.subjectCode];
      }
    }

    onSave(finalRecord);
    setStep('saved');
  };

  const handleEditExisting = () => {
    if (existingRecord) {
      setAttendedHours(existingRecord.attendedHours);
      if (existingRecord.labAttendance) {
        setLabAttendedSlots(existingRecord.labAttendance.attendedSlots);
        // Exclude the lab code itself from missed theory list to read properly
        const labCode = existingRecord.labAttendance.subjectCode;
        setMissedTheoryCodes(existingRecord.missedClasses.filter(c => c !== labCode));
      } else {
        setMissedTheoryCodes(existingRecord.missedClasses);
      }
      setStep('collect_hours');
    }
  };

  // Helper renderers
  return (
    <div id="attendance-collector-card" className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden text-slate-800">
      {/* Date header banner */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarDays className="h-5 w-5 text-slate-500" />
          <div>
            <h3 className="font-sans font-semibold text-sm tracking-tight text-slate-900">
              {dayInfo.name}, {formatDateToDDMMYYYY(currentDate)}
            </h3>
            <p className="text-xs font-mono text-slate-500">
              Day Status: <span className="font-semibold text-slate-700">{dayType}</span>
              {sourceName && ` (${sourceName})`}
            </p>
          </div>
        </div>

        {existingRecord && step === 'status_check' && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
            Recorded
          </span>
        )}
      </div>

      <div className="p-6">
        {step === 'status_check' && (
          <div className="space-y-4">
            {existingRecord ? (
              // Status Check: Already Marked
              <div className="space-y-4">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-5 flex items-start space-x-4">
                  <div className="bg-emerald-100 rounded-full p-2 text-emerald-600 mt-0.5">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="font-sans font-medium text-sm text-slate-900">Today's attendance already recorded ✅</h4>
                    
                    {existingRecord.scheduledHours > 0 ? (
                      <div className="text-xs text-slate-600 space-y-1.5 pt-2">
                        <div className="flex justify-between max-w-xs">
                          <span>Total Scheduled Hours:</span>
                          <span className="font-mono font-medium text-slate-800">{existingRecord.scheduledHours} hrs</span>
                        </div>
                        <div className="flex justify-between max-w-xs">
                          <span>Hours Attended:</span>
                          <span className="font-mono font-bold text-emerald-700">{existingRecord.attendedHours} hrs</span>
                        </div>
                        <div className="flex justify-between max-w-xs">
                          <span>Status Rate:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {((existingRecord.attendedHours / existingRecord.scheduledHours) * 100).toFixed(0)}%
                          </span>
                        </div>
                        
                        {existingRecord.missedClasses.length > 0 && (
                          <div className="pt-1.5">
                            <span className="text-red-700 font-medium">Missed Classes:</span>
                            <span className="ml-1.5 px-2 py-0.5 rounded bg-red-50 text-red-700 font-mono text-[10px] uppercase font-bold border border-red-100">
                              {existingRecord.missedClasses.join(', ')}
                            </span>
                          </div>
                        )}
                        {existingRecord.labAttendance && (
                          <div className="pt-0.5 text-[11px] text-slate-500 italic">
                            Lab Work: {existingRecord.labAttendance.attendedSlots}/{existingRecord.labAttendance.totalSlots} slots of {existingRecord.labAttendance.subjectCode} logged.
                          </div>
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
                    onClick={handleEditExisting}
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
              // Status Check: Ready to Mark
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
                        "No classes found on standard timetable for today."
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
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Step 1: Collection
              </label>
              <h4 className="font-sans font-medium text-slate-900 text-base">
                How many hours did you attend today?
              </h4>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-4 text-xs">
              <div className="flex items-center space-x-2 text-slate-600">
                <Clock className="h-4 w-4" />
                <span>Scheduled Classes:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 text-right">{totalScheduledHours} Hours</span>

              {labSlot && (
                <>
                  <div className="flex items-center space-x-2 text-slate-500">
                    <BookOpen className="h-4 w-4" />
                    <span>Includes Lab:</span>
                  </div>
                  <span className="font-mono text-slate-600 text-right">{labSlot.subjectCode} ({totalLabHours} hrs)</span>
                </>
              )}
            </div>

            {totalScheduledHours > 0 ? (
              <div className="flex flex-wrap gap-2 justify-center py-2">
                {Array.from({ length: totalScheduledHours + 1 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleHoursSelect(i)}
                    className={`h-11 w-11 rounded-lg border font-mono font-bold text-sm flex items-center justify-center transition cursor-pointer ${
                      attendedHours === i
                        ? 'bg-slate-900 text-white border-slate-900 scale-105'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-amber-50 rounded-lg text-amber-800 border border-amber-100 text-xs">
                <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-600" />
                {validationError}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setStep('status_check')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Back
              </button>
              
              {totalScheduledHours > 0 && (
                <button
                  onClick={handleNextFromHours}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-950 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
                >
                  <span>{attendedHours === totalScheduledHours ? "Confirm All Present" : "Continue"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'partial_details' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Step 2: Partial Attendance Breakdown
              </label>
              <h4 className="font-sans font-medium text-slate-900">
                Specify what you attended / missed
              </h4>
              <p className="text-xs text-slate-500">
                Total logged attended: <span className="font-mono font-bold text-slate-700">{attendedHours} of {totalScheduledHours} hours</span>.
              </p>
            </div>

            {labSlot && (
              <div className="bg-slate-50/70 border border-slate-100 rounded-lg p-4 space-y-3">
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono">
                  Lab Attendance Breakdown
                </h5>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-800">{labSlot.subjectCode} Lab Duration:</p>
                    <p className="text-[10px] text-slate-500">Scheduled for {totalLabHours} hours today</p>
                  </div>

                  <div className="flex items-center space-x-1">
                    {Array.from({ length: totalLabHours + 1 }).map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleLabSlotsChange(idx)}
                        className={`px-2 py-1 rounded border text-xs font-mono font-bold transition ${
                          labAttendedSlots === idx
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {idx}/{totalLabHours}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono">
                Select skipped classes
              </h5>

              <div className="grid grid-cols-1 gap-2">
                {scheduledSlots
                  .filter(slot => !labSlot || slot.subjectCode !== labSlot.subjectCode)
                  .map((slot, i) => {
                    const isSelected = missedTheoryCodes.includes(slot.subjectCode);
                    const parsedSub = subjects.find(s => s.code === slot.subjectCode);

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleToggleTheoryMissed(slot.subjectCode)}
                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition ${
                          isSelected
                            ? 'bg-red-50/50 border-red-300 text-red-900 ring-1 ring-red-300'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-red-500' : 'bg-slate-300'}`} />
                          <div>
                            <p className="text-xs font-bold font-mono tracking-wider">{slot.subjectCode}</p>
                            <p className="text-[10px] text-slate-500 line-clamp-1">{parsedSub?.name || 'Theory Subject'}</p>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {slot.hours} Hr
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {validationError && (
              <div className="flex items-start space-x-2 bg-amber-50/70 border border-amber-100 text-amber-800 p-3 rounded-lg text-xs">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep('collect_hours')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Back
              </button>
              
              <button
                type="button"
                onClick={handleProceedToConfirm}
                disabled={!!validationError && validationError.includes('Mismatch') || (labSlot && attendedHours - labAttendedSlots < 0)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition cursor-pointer"
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
                Step 3: Confirmation
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
                <span className="text-slate-500">Scheduled Hours:</span>
                <span className="font-bold font-mono text-slate-800">{totalScheduledHours} Hours</span>
              </div>

              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 text-emerald-800 font-medium">Attended Hours:</span>
                <span className="font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  {attendedHours} Hours
                </span>
              </div>

              {/* Class by class summary */}
              <div className="space-y-2 pt-1">
                <p className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider font-mono">
                  Subject Allocations
                </p>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {scheduledSlots.map((slot, i) => {
                    const isLabComp = labSlot && slot.subjectCode === labSlot.subjectCode;
                    let recordStatus: 'Present' | 'Absent' | 'Partial' = 'Present';

                    if (isLabComp) {
                      if (labAttendedSlots === totalLabHours) recordStatus = 'Present';
                      else if (labAttendedSlots === 0) recordStatus = 'Absent';
                      else recordStatus = 'Partial';
                    } else if (missedTheoryCodes.includes(slot.subjectCode)) {
                      recordStatus = 'Absent';
                    }

                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-2 rounded border text-[11px] ${
                          recordStatus === 'Present'
                            ? 'bg-emerald-50/35 border-emerald-100 text-emerald-900'
                            : recordStatus === 'Absent'
                            ? 'bg-red-50/35 border-red-100 text-red-950'
                            : 'bg-amber-50/35 border-amber-100 text-amber-950'
                        }`}
                      >
                        <div className="font-medium">
                          <span className="font-mono font-bold mr-1.5">{slot.subjectCode}</span>
                          <span className="text-[10px] text-slate-500">
                            ({slot.hours} hr)
                          </span>
                        </div>

                        <span className="font-semibold font-mono uppercase text-[9px] tracking-wide">
                          {isLabComp && recordStatus === 'Partial'
                            ? `Lab Attended ${labAttendedSlots}/${totalLabHours}`
                            : recordStatus}
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
                onClick={() => setStep(labSlot ? 'partial_details' : 'collect_hours')}
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
