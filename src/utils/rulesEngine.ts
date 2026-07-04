/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AttendanceRecord,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  Subject,
} from '../types';

/**
 * Rules Engine for "The Arc" Rule-Based Attendance Assistant
 */

export interface AttendanceAnalytics {
  overallPercentage: number;
  theoryPercentage: number;
  labPercentage: number;
  subjectWise: Record<string, {
    code: string;
    name: string;
    attended: number;
    total: number;
    percent: number;
    isLab: boolean;
  }>;
  totalPresentHours: number;
  totalScheduledHours: number;
  presentDaysCount: number;
  absentDaysCount: number;
  holidayDaysCount: number;
  examDaysCount: number;
  safeBunkHours: number;
}

// Check special day overrides (highest priority: Sudden Holiday, Extra Working Day, Half Day, Cancelled Classes)
export function getSpecialOverride(
  dateStr: string,
  overrides: SpecialDayOverride[]
): SpecialDayOverride | undefined {
  return overrides.find(o => o.date === dateStr);
}

// Check Academic Calendar (Holiday, Festival Holiday, Mid Examination, Semester Examination, College Event)
export function getAcademicCalendarEvent(
  dateStr: string,
  calendar: AcademicCalendarItem[]
): AcademicCalendarItem | undefined {
  return calendar.find(c => c.date === dateStr);
}

// Rule based Day Type evaluation
export function determineDayType(
  dateStr: string,
  overrides: SpecialDayOverride[],
  calendar: AcademicCalendarItem[]
): { dayType: AttendanceRecord['dayType']; sourceName: string } {
  // Overrides always have highest priority
  const override = getSpecialOverride(dateStr, overrides);
  if (override) {
    return { dayType: override.type, sourceName: override.note || `Override: ${override.type}` };
  }

  const calendarEvent = getAcademicCalendarEvent(dateStr, calendar);
  if (calendarEvent) {
    return { dayType: calendarEvent.type, sourceName: calendarEvent.name };
  }

  return { dayType: 'Regular', sourceName: '' };
}

// Check if attendance is required on a day
export function isAttendanceRequired(dayType: AttendanceRecord['dayType']): boolean {
  if (
    dayType === 'Holiday' ||
    dayType === 'Festival' ||
    dayType === 'MidExam' ||
    dayType === 'SemesterExam' ||
    dayType === 'SuddenHoliday' ||
    dayType === 'CancelledClasses'
  ) {
    return false;
  }
  return true;
}

// Get pending/unmarked working attendance days from semester start date up to simulated currentDate
export function getPendingUnmarkedDays(
  currentDate: string,
  records: AttendanceRecord[],
  timetables: Timetable[],
  academicCalendar: AcademicCalendarItem[],
  specialOverrides: SpecialDayOverride[],
  semesterStartDate?: string
): { date: string; dayOfWeek: string; scheduledHours: number; dayType: string }[] {
  const pending: { date: string; dayOfWeek: string; scheduledHours: number; dayType: string }[] = [];
  
  // Parse Simulated currentDate
  const parts = currentDate.split('-');
  if (parts.length !== 3) return [];
  const currentYear = parseInt(parts[0], 10);
  const currentMonth = parseInt(parts[1], 10) - 1;
  const currentDay = parseInt(parts[2], 10);
  const end = new Date(currentYear, currentMonth, currentDay);
  
  // Semester starts at semesterStartDate or May 1st, 2026 in local timezone
  let start = new Date(2026, 4, 1);
  if (semesterStartDate) {
    const sParts = semesterStartDate.split('-');
    if (sParts.length === 3) {
      start = new Date(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10));
    }
  }
  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const { dayType } = determineDayType(dateStr, specialOverrides, academicCalendar);
    if (!isAttendanceRequired(dayType)) {
      continue;
    }
    
    const activeTimetable = getTimetableForDate(dateStr, timetables);
    const dayIndexStr = String(d.getDay());
    const scheduledSlots = activeTimetable ? activeTimetable.slots[dayIndexStr] || [] : [];
    const totalScheduledHours = scheduledSlots.reduce((sum, s) => sum + s.hours, 0);
    
    if (totalScheduledHours === 0) {
      continue; // Off days (typically Sat/Sun) with zero scheduled custom hours
    }
    
    const record = records.find(r => r.date === dateStr);
    if (!record || !record.isMarked) {
      pending.push({
        date: dateStr,
        dayOfWeek: dayOfWeekNames[d.getDay()],
        scheduledHours: totalScheduledHours,
        dayType
      });
    }
  }
  
  return pending;
}

// Get active timetable for a specific date
export function getTimetableForDate(
  dateStr: string,
  timetables: Timetable[]
): Timetable | undefined {
  if (timetables.length === 0) return undefined;
  
  // Sort timetables by effective date, latest first, but prior to dateStr
  const applicable = timetables
    .map((t, idx) => ({ t, idx }))
    .filter(item => item.t.effectiveFrom <= dateStr)
    .sort((a, b) => {
      const cmp = b.t.effectiveFrom.localeCompare(a.t.effectiveFrom);
      if (cmp !== 0) return cmp;
      return b.idx - a.idx; // Prefer the tie-breaker: the one added/updated last (higher index)
    });

  return applicable[0]?.t || timetables[0];
}

// Parse day of week index from YYYY-MM-DD
export function getDayOfWeekFromDate(dateStr: string): { name: string; indexStr: string } {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed month
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const index = d.getDay();
  return {
    name: days[index],
    indexStr: String(index),
  };
}

// Analytics calculation engine
export function calculateAnalytics(
  records: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  minRequiredPercent: number = 75
): AttendanceAnalytics {
  let totalAttendedHours = 0;
  let totalScheduledHours = 0;

  let theoryAttended = 0;
  let theoryScheduled = 0;

  let labAttended = 0;
  let labScheduled = 0;

  let presentDaysCount = 0;
  let absentDaysCount = 0;
  let holidayDaysCount = 0;
  let examDaysCount = 0;

  // Initialize subject record accumulator
  const subjMap: Record<string, { code: string; name: string; attended: number; total: number; isLab: boolean }> = {};
  subjects.forEach(s => {
    subjMap[s.code] = {
      code: s.code,
      name: s.name,
      attended: 0,
      total: 0,
      isLab: s.isLab,
    };
  });

  // Safe check if standard map needs addition
  const getOrAddSubject = (code: string) => {
    if (!subjMap[code]) {
      subjMap[code] = {
        code,
        name: code,
        attended: 0,
        total: 0,
        isLab: code.toLowerCase().includes('lab'),
      };
    }
    return subjMap[code];
  };

  records.forEach(r => {
    // Count days
    if (r.dayType === 'Holiday' || r.dayType === 'Festival' || r.dayType === 'SuddenHoliday' || r.dayType === 'CancelledClasses') {
      holidayDaysCount++;
    } else if (r.dayType === 'MidExam' || r.dayType === 'SemesterExam') {
      examDaysCount++;
    } else {
      // Regular or working days
      if (r.scheduledHours > 0) {
        if (r.attendedHours > 0) {
          presentDaysCount++;
        } else {
          absentDaysCount++;
        }
      }
    }

    // Skip calculations if attendance not active on this day type
    if (!isAttendanceRequired(r.dayType)) {
      return;
    }

    // Accumulate overall
    totalAttendedHours += r.attendedHours;
    totalScheduledHours += r.scheduledHours;

    // Load active timetable slot detail to allocate subjects
    const ttable = getTimetableForDate(r.date, timetables);
    if (!ttable) return;

    const dayInfo = getDayOfWeekFromDate(r.date);
    const scheduledSlots = ttable.slots[dayInfo.indexStr] || [];

    // If completely present and no specific lab logged
    if (r.attendedHours === r.scheduledHours) {
      scheduledSlots.forEach(slot => {
        const s = getOrAddSubject(slot.subjectCode);
        s.attended += slot.hours;
        s.total += slot.hours;

        if (s.isLab) {
          labAttended += slot.hours;
          labScheduled += slot.hours;
        } else {
          theoryAttended += slot.hours;
          theoryScheduled += slot.hours;
        }
      });
    } else if (r.attendedHours === 0) {
      // Completely absent
      scheduledSlots.forEach(slot => {
        const s = getOrAddSubject(slot.subjectCode);
        s.total += slot.hours;

        if (s.isLab) {
          labScheduled += slot.hours;
        } else {
          theoryScheduled += slot.hours;
        }
      });
    } else {
      // Partial Attendance log checking
      let currentHandledAttended = 0;
      
      // If there's an exact lab field stored
      if (r.labAttendance) {
        const labCode = r.labAttendance.subjectCode;
        const labObj = getOrAddSubject(labCode);
        
        labObj.attended += r.labAttendance.attendedSlots;
        labObj.total += r.labAttendance.totalSlots;
        labAttended += r.labAttendance.attendedSlots;
        labScheduled += r.labAttendance.totalSlots;

        currentHandledAttended += r.labAttendance.attendedSlots;
      }

      // Distribute remaining slots
      scheduledSlots.forEach(slot => {
        // Skip lab if already handled
        if (r.labAttendance && slot.subjectCode === r.labAttendance.subjectCode) {
          return;
        }

        const isMissed = r.missedClasses.includes(slot.subjectCode);
        const s = getOrAddSubject(slot.subjectCode);
        s.total += slot.hours;

        if (isMissed) {
          // Missed this class
          if (s.isLab) {
            labScheduled += slot.hours;
          } else {
            theoryScheduled += slot.hours;
          }
        } else {
          // Attended this class
          s.attended += slot.hours;
          if (s.isLab) {
            labAttended += slot.hours;
            labScheduled += slot.hours;
            currentHandledAttended += slot.hours;
          } else {
            theoryAttended += slot.hours;
            theoryScheduled += slot.hours;
            currentHandledAttended += slot.hours;
          }
        }
      });
    }
  });

  // Calculate percentages
  const overallPercentage = totalScheduledHours > 0 ? (totalAttendedHours / totalScheduledHours) * 100 : 0;
  const theoryPercentage = theoryScheduled > 0 ? (theoryAttended / theoryScheduled) * 100 : 0;
  const labPercentage = labScheduled > 0 ? (labAttended / labScheduled) * 100 : 0;

  const subjectWise: AttendanceAnalytics['subjectWise'] = {};
  Object.keys(subjMap).forEach(code => {
    const s = subjMap[code];
    subjectWise[code] = {
      code: s.code,
      name: s.name,
      attended: s.attended,
      total: s.total,
      percent: s.total > 0 ? (s.attended / s.total) * 100 : 0,
      isLab: s.isLab,
    };
  });

  // Calculated Safe Bunk limit (how many future hours we can bunk)
  // Overall consecutive bunk limit:
  // (A) / (T + B) >= (MinRequired / 100)
  // B <= (A * 100 / MinRequired) - T
  const coef = minRequiredPercent / 100;
  let safeBunkHours = 0;
  if (overallPercentage >= minRequiredPercent && totalScheduledHours > 0) {
    safeBunkHours = Math.floor(totalAttendedHours / coef - totalScheduledHours);
    if (safeBunkHours < 0) safeBunkHours = 0;
  }

  return {
    overallPercentage: parseFloat(overallPercentage.toFixed(1)),
    theoryPercentage: parseFloat(theoryPercentage.toFixed(1)),
    labPercentage: parseFloat(labPercentage.toFixed(1)),
    subjectWise,
    totalPresentHours: totalAttendedHours,
    totalScheduledHours,
    presentDaysCount,
    absentDaysCount,
    holidayDaysCount,
    examDaysCount,
    safeBunkHours,
  };
}

// Calculate Forecasts based on 10 succeeding class hours
export function calculateProjections(
  attendedHours: number,
  scheduledHours: number,
  additionalHours: number = 10
): { afterAttending: number; afterMissing: number } {
  if (scheduledHours === 0) {
    return { afterAttending: 100, afterMissing: 0 };
  }

  const afterAttending = ((attendedHours + additionalHours) / (scheduledHours + additionalHours)) * 100;
  const afterMissing = (attendedHours / (scheduledHours + additionalHours)) * 100;

  return {
    afterAttending: parseFloat(afterAttending.toFixed(1)),
    afterMissing: parseFloat(afterMissing.toFixed(1)),
  };
}

// Get exact remaining scheduled hours in the semester based on timetable/calendar
export function getRemainingSemesterHours(
  currentDate: string,
  endDate: string,
  timetables: Timetable[],
  academicCalendar: AcademicCalendarItem[],
  specialOverrides: SpecialDayOverride[]
): {
  totalRemainingHours: number;
  subjectRemainingHours: Record<string, number>;
} {
  let totalRemainingHours = 0;
  const subjectRemainingHours: Record<string, number> = {};

  const parts = currentDate.split('-');
  if (parts.length !== 3) return { totalRemainingHours, subjectRemainingHours };
  
  // Look forward from the next day onwards
  const currentYear = parseInt(parts[0], 10);
  const currentMonth = parseInt(parts[1], 10) - 1;
  const currentDay = parseInt(parts[2], 10);
  const start = new Date(currentYear, currentMonth, currentDay + 1);

  const eParts = endDate.split('-');
  if (eParts.length !== 3) return { totalRemainingHours, subjectRemainingHours };
  const end = new Date(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10));

  if (start > end) {
    return { totalRemainingHours, subjectRemainingHours };
  }

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const { dayType } = determineDayType(dateStr, specialOverrides, academicCalendar);
    if (!isAttendanceRequired(dayType)) {
      continue;
    }

    const ttable = getTimetableForDate(dateStr, timetables);
    if (!ttable) continue;

    const dayInfo = getDayOfWeekFromDate(dateStr);
    const scheduledSlots = ttable.slots[dayInfo.indexStr] || [];

    scheduledSlots.forEach(slot => {
      totalRemainingHours += slot.hours;
      subjectRemainingHours[slot.subjectCode] = (subjectRemainingHours[slot.subjectCode] || 0) + slot.hours;
    });
  }

  return { totalRemainingHours, subjectRemainingHours };
}

// Calculate sequential recovery metrics (how many consecutive hours needed to recover to target %)
export function calculateRecoveryRequired(
  attendedHours: number,
  scheduledHours: number,
  targetPercent: number = 75
): number {
  const targetCoef = targetPercent / 100;
  if (scheduledHours === 0) return 0;
  const currentAvg = attendedHours / scheduledHours;
  if (currentAvg >= targetCoef) return 0;

  // (A + R) / (T + R) >= coef
  // A + R >= coef * T + coef * R
  // R * (1 - coef) >= coef * T - A
  // R >= (coef * T - A) / (1 - coef)
  const numerator = targetCoef * scheduledHours - attendedHours;
  const denominator = 1 - targetCoef;
  return Math.ceil(numerator / denominator);
}

/**
 * Format string date 'yyyy-mm-dd' to 'dd/mm/yyyy'
 */
export function formatDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Format Date object to 'dd/mm/yyyy'
 */
export function formatDateObjToDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

