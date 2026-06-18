/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Subject {
  code: string;
  name: string;
  isLab: boolean;
  labHours?: number; // e.g. 3 hours for a lab session
}

export interface TimetableSlot {
  subjectCode: string;
  hours: number;
}

export interface Timetable {
  id: string; // unique ID
  effectiveFrom: string; // YYYY-MM-DD
  // Map of day of week (Monday = '1', Tuesday = '2', ..., Saturday = '6', Sunday = '0')
  slots: Record<string, TimetableSlot[]>;
}

export type DayType =
  | 'Regular'
  | 'Holiday'
  | 'Festival'
  | 'MidExam'
  | 'SemesterExam'
  | 'Event'
  | 'SuddenHoliday'
  | 'ExtraWorkingDay'
  | 'HalfDay'
  | 'CancelledClasses';

export interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // 'Monday', 'Tuesday', ...
  dayType: DayType;
  scheduledHours: number;
  attendedHours: number;
  missedClasses: string[]; // List of missed subject codes
  labAttendance?: {
    subjectCode: string;
    attendedSlots: number; // e.g. 2
    totalSlots: number;    // e.g. 3
  };
  isMarked: boolean;
  notes?: string;
  editTimestamp?: string;
}

export interface SpecialDayOverride {
  date: string; // YYYY-MM-DD
  type: 'SuddenHoliday' | 'ExtraWorkingDay' | 'HalfDay' | 'CancelledClasses';
  note?: string;
}

export interface AcademicCalendarItem {
  date: string; // YYYY-MM-DD
  type: 'Holiday' | 'Festival' | 'MidExam' | 'SemesterExam' | 'Event';
  name: string;
}

export interface UserProfile {
  name: string;
  collegeName: string;
  rollNo?: string;
  course: string; // Keep for compatibility
  degree: string;
  branch?: string;
  semester?: string;
  mobile?: string;
  email: string;
  minAttendance: number; // e.g. 75
  dob?: string;
  joiningDate?: string;
  religion?: string;
  rank?: string;
  category?: string;
  scholarship?: string;
  aadhar?: string;
  imageUrl?: string;
  semesterStartDate?: string;
  semesterEndDate?: string;
}
