/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Subject,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  AttendanceRecord,
  UserProfile,
  DayType,
} from '../types';

export const INITIAL_SUBJECTS: Subject[] = [
  { code: 'DBMS', name: 'Database Management Systems', isLab: false },
  { code: 'AIML', name: 'Artificial Intelligence & Machine Learning', isLab: false },
  { code: 'ME', name: 'Mechanical Engineering', isLab: false },
  { code: 'OS', name: 'Operating Systems', isLab: false },
  { code: 'CN', name: 'Computer Networks', isLab: false },
  { code: 'JAVA', name: 'Java Programming', isLab: false },
  { code: 'AIML_LAB', name: 'AIML Laboratory', isLab: true, labHours: 3 },
  { code: 'JAVA_LAB', name: 'Java Laboratory', isLab: true, labHours: 3 },
];

export const INITIAL_TIMETABLES: Timetable[] = [
  {
    id: 'tt_v2',
    effectiveFrom: '2026-05-01',
    slots: {
      // 1 = Monday
      '1': [
        { subjectCode: 'DBMS', hours: 1 },
        { subjectCode: 'AIML', hours: 1 },
        { subjectCode: 'ME', hours: 1 },
        { subjectCode: 'OS', hours: 1 },
        { subjectCode: 'CN', hours: 1 },
      ],
      // 2 = Tuesday
      '2': [
        { subjectCode: 'DBMS', hours: 1 },
        { subjectCode: 'OS', hours: 1 },
        { subjectCode: 'AIML_LAB', hours: 3 },
      ],
      // 3 = Wednesday
      '3': [
        { subjectCode: 'AIML', hours: 1 },
        { subjectCode: 'CN', hours: 1 },
        { subjectCode: 'JAVA', hours: 1 },
        { subjectCode: 'JAVA_LAB', hours: 3 },
      ],
      // 4 = Thursday
      '4': [
        { subjectCode: 'DBMS', hours: 1 },
        { subjectCode: 'ME', hours: 1 },
        { subjectCode: 'OS', hours: 1 },
        { subjectCode: 'CN', hours: 1 },
      ],
      // 5 = Friday
      '5': [
        { subjectCode: 'DBMS', hours: 1 },
        { subjectCode: 'AIML', hours: 1 },
        { subjectCode: 'ME', hours: 1 },
        { subjectCode: 'OS', hours: 2 },
        { subjectCode: 'CN', hours: 1 },
        { subjectCode: 'JAVA', hours: 1 },
      ],
      // 6 = Saturday
      '6': [], // Saturday general off
      // 0 = Sunday
      '0': [], // Sunday general off
    },
  },
];

export const INITIAL_ACADEMIC_CALENDAR: AcademicCalendarItem[] = [
  { date: '2026-05-01', type: 'Holiday', name: 'Labor Day' },
  { date: '2026-05-25', type: 'Festival', name: 'Spring Festival' },
  { date: '2026-06-05', type: 'Event', name: 'World Environment Forum & Tech Carnival' },
  { date: '2026-06-15', type: 'MidExam', name: 'Mid Sem Exam: Operating Systems & DBMS' },
  { date: '2026-06-16', type: 'MidExam', name: 'Mid Sem Exam: AIML & Comp Networks' },
  { date: '2026-06-17', type: 'MidExam', name: 'Mid Sem Exam: Mechanical Eng & Java' },
];

export const INITIAL_SPECIAL_OVERRIDES: SpecialDayOverride[] = [
  { date: '2026-06-09', type: 'CancelledClasses', note: 'Faculty development meet (No classes)' },
  { date: '2026-06-11', type: 'SuddenHoliday', note: 'Heavy rainwater stagnation alert' },
];

export const INITIAL_USER_PROFILE: UserProfile = {
  name: 'SOORINENI MAHESH',
  collegeName: 'K.S.R.M. College of Engineering',
  rollNo: '249Y1A3958',
  course: 'B.Tech',
  degree: 'B.Tech',
  branch: 'AIML',
  semester: '',
  mobile: '9392998960',
  email: '249Y1A3958@gmail.com',
  minAttendance: 75,
  dob: '16/01/2007',
  joiningDate: '19/08/2024',
  religion: 'Hindu',
  rank: '55263',
  category: 'BC_A, PATRA',
  scholarship: 'No',
  aadhar: '848689005327',
  imageUrl: '',
  semesterStartDate: '2026-05-01',
  semesterEndDate: '2026-11-30'
};

export const EMPTY_USER_PROFILE: UserProfile = {
  name: '',
  collegeName: '',
  rollNo: '',
  course: 'B.Tech',
  degree: 'B.Tech',
  branch: '',
  semester: '',
  mobile: '',
  email: '',
  minAttendance: 75,
  dob: '',
  joiningDate: '',
  religion: '',
  rank: '',
  category: '',
  scholarship: '',
  aadhar: '',
  imageUrl: '',
  semesterStartDate: '2026-05-01',
  semesterEndDate: '2026-11-30'
};

// Generates logs for preceding weeks from may to mid june 2026
export function generatePrepopulatedAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const start = new Date(2026, 4, 4); // May 4th, 2026 (Monday) in local timezone
  const today = new Date(2026, 5, 11); // June 11th, 2026 (Thursday) in local timezone

  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Current timetable
  const timetable = INITIAL_TIMETABLES[0];

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const dayIndex = d.getDay(); // 0-6
    const dayIndexStr = String(dayIndex);
    const dayName = dayOfWeekNames[dayIndex];

    // Check holiday in calendar
    const calendarItem = INITIAL_ACADEMIC_CALENDAR.find(item => item.date === dateStr);
    const overrideItem = INITIAL_SPECIAL_OVERRIDES.find(item => item.date === dateStr);

    let dayType: DayType = 'Regular';
    if (overrideItem) {
      dayType = overrideItem.type;
    } else if (calendarItem) {
      if (calendarItem.type === 'Holiday') dayType = 'Holiday';
      else if (calendarItem.type === 'Festival') dayType = 'Festival';
      else if (calendarItem.type === 'MidExam') dayType = 'MidExam';
      else if (calendarItem.type === 'SemesterExam') dayType = 'SemesterExam';
      else if (calendarItem.type === 'Event') dayType = 'Event';
    }

    const scheduledSlots = timetable.slots[dayIndexStr] || [];
    const totalScheduledHours = scheduledSlots.reduce((sum, slot) => sum + slot.hours, 0);

    // Skip marking weekends if there's no override and no scheduled slots
    if (totalScheduledHours === 0 && dayType === 'Regular' && (dayIndex === 0 || dayIndex === 6)) {
      continue;
    }

    let attendedHours = totalScheduledHours;
    let missedClasses: string[] = [];
    let labAttendance: AttendanceRecord['labAttendance'] = undefined;

    // Simulate realistic attendance
    if (dayType === 'Regular' && totalScheduledHours > 0) {
      const hasLab = scheduledSlots.find(s => s.subjectCode.includes('LAB'));
      // Simulate random occasional absences
      const skipChance = Math.random();
      if (skipChance < 0.12) {
        // Completely absent
        attendedHours = 0;
        missedClasses = scheduledSlots.map(s => s.subjectCode);
        if (hasLab) {
          labAttendance = {
            subjectCode: hasLab.subjectCode,
            attendedSlots: 0,
            totalSlots: hasLab.hours,
          };
        }
      } else if (skipChance < 0.3) {
        // Partial attendance
        if (hasLab) {
          // Missed 1 theory or partial lab
          attendedHours = totalScheduledHours - 1;
          const labSlots = hasLab.hours;
          const theorySlots = totalScheduledHours - labSlots;

          if (Math.random() > 0.5) {
            // Missed 1 theory
            const theoryS = scheduledSlots.filter(s => !s.subjectCode.includes('LAB'));
            if (theoryS.length > 0) {
              missedClasses = [theoryS[0].subjectCode];
            }
            labAttendance = {
              subjectCode: hasLab.subjectCode,
              attendedSlots: labSlots,
              totalSlots: labSlots,
            };
          } else {
            // Lab partial
            labAttendance = {
              subjectCode: hasLab.subjectCode,
              attendedSlots: labSlots - 1,
              totalSlots: labSlots,
            };
          }
        } else {
          // Missed 1 theory class
          attendedHours = totalScheduledHours - 1;
          const randomClass = scheduledSlots[Math.floor(Math.random() * scheduledSlots.length)];
          missedClasses = [randomClass.subjectCode];
        }
      } else {
        // Present
        attendedHours = totalScheduledHours;
        missedClasses = [];
        if (hasLab) {
          labAttendance = {
            subjectCode: hasLab.subjectCode,
            attendedSlots: hasLab.hours,
            totalSlots: hasLab.hours,
          };
        }
      }
    } else {
      // Non-regular (Holiday / Exams)
      attendedHours = 0;
      missedClasses = [];
    }

    records.push({
      date: dateStr,
      dayOfWeek: dayName,
      dayType,
      scheduledHours: dayType === 'Regular' || dayType === 'ExtraWorkingDay' || dayType === 'HalfDay' ? totalScheduledHours : 0,
      attendedHours: dayType === 'Regular' || dayType === 'ExtraWorkingDay' || dayType === 'HalfDay' ? attendedHours : 0,
      missedClasses,
      labAttendance,
      isMarked: true,
      notes: overrideItem?.note || calendarItem?.name || '',
    });
  }

  return records;
}
