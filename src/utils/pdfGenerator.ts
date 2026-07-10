/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { UserProfile, Subject, Timetable, AcademicCalendarItem, SpecialDayOverride, AttendanceRecord } from '../types';
import { calculateAnalytics } from './rulesEngine';

interface GeneratePdfOptions {
  userProfile: UserProfile;
  subjects: Subject[];
  timetables: Timetable[];
  records: AttendanceRecord[];
  academicCalendar: AcademicCalendarItem[];
  specialOverrides: SpecialDayOverride[];
  manualOverrides: any;
  autoReminders: any;
  rangeType?: 'All' | 'CurrentMonth' | 'SelectedWeek';
  selectedDateRange?: { start: string; end: string };
  currentDate?: string;
}

export function generateUnifiedBackupPdf(options: GeneratePdfOptions): Blob {
  const {
    userProfile,
    subjects,
    timetables,
    records,
    rangeType = 'All',
    selectedDateRange = { start: '2026-05-01', end: '2026-06-12' },
    currentDate = '2026-06-12'
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageHeight = 297;
  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin; // 180
  let y = 15;

  const getSimulatedMonthLabel = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const parts = (currentDate || '').split('-');
    if (parts.length === 3) {
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${months[monthIdx]} ${year}`;
      }
    }
    return 'June 2026';
  };

  const getFilteredRecords = () => {
    return records.filter(r => {
      if (r.date > currentDate) return false;
      if (rangeType === 'CurrentMonth') {
        const currentMonthPrefix = currentDate.substring(0, 7);
        return r.date.startsWith(currentMonthPrefix);
      }
      if (rangeType === 'SelectedWeek') {
        return r.date >= selectedDateRange.start && r.date <= selectedDateRange.end;
      }
      return true; // All
    }).sort((a, b) => b.date.localeCompare(a.date));
  };

  const list = getFilteredRecords();

  // 1. TOP INSTITUTIONAL BRANDING HEADER
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900 (Rich Navy)
  const collegeTitle = (userProfile.collegeName || 'COLLEGE OF ENGINEERING').toUpperCase();
  doc.text(collegeTitle, pageWidth / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('(AUTONOMOUS) • KADAPA, ANDHRA PRADESH - 516003', pageWidth / 2, y, { align: 'center' });
  y += 4;
  
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Approved by AICTE • Affiliated to JNTUA • Certified ISO 9001:2015', pageWidth / 2, y, { align: 'center' });
  y += 5;

  // Header Divider Line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Document Title Banner
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('OFFICIAL STUDENT ATTENDANCE STATEMENT', pageWidth / 2, y, { align: 'center' });
  y += 4.5;
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(29, 78, 216); // Sharp active blue
  const evalPeriod = getSimulatedMonthLabel();
  doc.text(`Evaluation Period: ${evalPeriod}`, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // 2. STUDENT IDENTITY PROFILE PANEL
  const boxHeight = 36;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-200
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, boxHeight, 'FD');

  const startY = y + 4.5;
  const rowSpacing = 3.6;

  const labelX = margin + 8;
  const colonX = margin + 40;
  const valueX = margin + 43;

  doc.setFontSize(7.5);

  const profileRows = [
    { label: 'STUDENT NAME', value: userProfile.name.toUpperCase() },
    { label: 'ROLL NO', value: (userProfile.rollNo || 'N/A').toUpperCase() },
    { label: 'SEMESTER', value: (userProfile.semester || 'N/A').toUpperCase() },
    { label: 'BRANCH', value: (userProfile.branch || 'N/A').toUpperCase() },
    { label: 'DEGREE', value: (userProfile.degree || 'N/A').toUpperCase() },
    { label: 'EMAIL ADDRESS', value: userProfile.email || 'offline@phone.local' },
    { label: 'SEMESTER START', value: userProfile.semesterStartDate || '2026-05-01' },
    { label: 'SEMESTER END', value: userProfile.semesterEndDate || '2026-11-30' }
  ];

  profileRows.forEach((row, idx) => {
    const rowY = startY + idx * rowSpacing;
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, labelX, rowY);
    doc.text(':', colonX, rowY);

    doc.setTextColor(15, 23, 42);
    doc.text(row.value, valueX, rowY);
  });

  y += boxHeight + 8;

  // 3. OVERALL CUMULATIVE DATA COMPUTATION
  const totalScheduled = list.reduce((sum, r) => sum + r.scheduledHours, 0);
  const totalAttended = list.reduce((sum, r) => sum + r.attendedHours, 0);
  const totalMissed = totalScheduled - totalAttended;
  const overallPctVal = totalScheduled > 0 ? (totalAttended / totalScheduled) * 100 : 100;
  const overallPct = overallPctVal.toFixed(2);

  // 4. SUBJECT-WISE AUDIT REPORT MATRIX
  const analytics = calculateAnalytics(list, subjects, timetables, userProfile.minAttendance);
  const activeSubjects = Object.values(analytics.subjectWise);

  const tableStartY = y;
  const headerHeight = 8;
  const colX_slNo = margin + 15 / 2; // centered
  const colX_subject = margin + 15 + 3; // left-aligned with 3mm margin padding
  const colX_held = margin + 15 + 75 + 20 / 2; // centered
  const colX_attend = margin + 15 + 75 + 20 + 20 / 2; // centered
  const colX_missed = margin + 15 + 75 + 20 + 20 + 20 / 2; // centered
  const colX_pct = margin + 15 + 75 + 20 + 20 + 20 + 30 / 2; // centered

  // Headers
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  doc.text('Sl.No.', colX_slNo, y + 5, { align: 'center' });
  doc.text('Subject', colX_subject, y + 5);
  doc.text('Held', colX_held, y + 5, { align: 'center' });
  doc.text('Attend', colX_attend, y + 5, { align: 'center' });
  doc.text('Missed', colX_missed, y + 5, { align: 'center' });
  doc.text('%', colX_pct, y + 5, { align: 'center' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(margin, y + headerHeight, pageWidth - margin, y + headerHeight);

  y += headerHeight;

  // Rows
  const rowHeight = 7;
  activeSubjects.forEach((s, idx) => {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    doc.text(`${idx + 1}`, colX_slNo, y + 4.8, { align: 'center' });
    doc.text(s.code, colX_subject, y + 4.8);
    doc.text(`${s.total}`, colX_held, y + 4.8, { align: 'center' });
    doc.text(`${s.attended}`, colX_attend, y + 4.8, { align: 'center' });
    doc.text(`${s.total - s.attended}`, colX_missed, y + 4.8, { align: 'center' });
    doc.text(`${s.percent.toFixed(2)}`, colX_pct, y + 4.8, { align: 'center' });

    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  });

  // TOTAL Row
  const totalRowHeight = 8;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  doc.text('TOTAL', colX_subject, y + 5);
  doc.text(`${totalScheduled}`, colX_held, y + 5, { align: 'center' });
  doc.text(`${totalAttended}`, colX_attend, y + 5, { align: 'center' });
  doc.text(`${totalMissed}`, colX_missed, y + 5, { align: 'center' });
  doc.text(`${overallPct}`, colX_pct, y + 5, { align: 'center' });

  doc.line(margin, y + totalRowHeight, pageWidth - margin, y + totalRowHeight);

  const tableEndY = y + totalRowHeight;

  // Vertical Lines
  const colXCoords = [15, 30, 105, 125, 145, 165, 195];
  colXCoords.forEach(cx => {
    doc.line(cx, tableStartY, cx, tableEndY);
  });

  doc.line(margin, tableStartY, pageWidth - margin, tableStartY);

  y = tableEndY;

  // 5. ATTENDANCE SNAPSHOT - JUNE 2026
  y += 10;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  const evalPeriodUpper = getSimulatedMonthLabel().toUpperCase();
  doc.text(`ATTENDANCE SNAPSHOT - ${evalPeriodUpper}`, margin, y);
  y += 4.5;

  const snapshotBoxY = y;
  const boxW = contentWidth;
  const boxH = 22;
  const halfW = boxW / 2;
  const halfH = boxH / 2;

  // Outer border box
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(margin, snapshotBoxY, boxW, boxH, 'S');

  // Dividers
  doc.line(margin, snapshotBoxY + halfH, margin + boxW, snapshotBoxY + halfH);
  doc.line(margin + halfW, snapshotBoxY, margin + halfW, snapshotBoxY + boxH);

  // Quadrant 1
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL CONDUCTED CLASSES', margin + 4, snapshotBoxY + 4);
  doc.text('Conducted : ', margin + 4, snapshotBoxY + 8);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(`${totalScheduled}`, margin + 20, snapshotBoxY + 8);

  // Quadrant 2
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL ATTEND CLASSES', margin + halfW + 4, snapshotBoxY + 4);
  doc.text('Attended : ', margin + halfW + 4, snapshotBoxY + 8);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(5, 150, 105);
  doc.text(`${totalAttended}`, margin + halfW + 18, snapshotBoxY + 8);

  // Quadrant 3
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL MISSED CLASSES', margin + 4, snapshotBoxY + halfH + 4);
  doc.text('Missed : ', margin + 4, snapshotBoxY + halfH + 8);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(220, 38, 38);
  doc.text(`${totalMissed}`, margin + 15, snapshotBoxY + halfH + 8);

  // Quadrant 4
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('OVERALL ATTENDANCE %', margin + halfW + 4, snapshotBoxY + halfH + 4);
  doc.text('OA : ', margin + halfW + 4, snapshotBoxY + halfH + 8);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(5, 150, 105);
  doc.text(`${overallPct}%`, margin + halfW + 11, snapshotBoxY + halfH + 8);

  return doc.output('blob');
}
