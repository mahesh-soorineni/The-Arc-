/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { UserProfile, Subject, Timetable, AttendanceRecord } from '../types';
import { calculateAnalytics, isAttendanceRequired, getTimetableForDate, getDayOfWeekFromDate } from './rulesEngine';

/**
 * Universal file downloader or Android/iOS Share Sheet proxy
 */
export async function downloadOrShareFile(
  blob: Blob,
  filename: string,
  mimeType: string,
  setFeedback?: (msg: string) => void
): Promise<{ shared: boolean }> {
  try {
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: filename,
        text: 'Attendance Export'
      });
      if (setFeedback) {
        setFeedback('Export shared successfully! 🚀');
        setTimeout(() => setFeedback(''), 3000);
      }
      return { shared: true };
    }
  } catch (err) {
    console.warn('Web Share failed or unsupported:', err);
  }

  // Fallback programmatic download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 150);
    if (setFeedback) {
      setFeedback('Export downloaded successfully! 📥');
      setTimeout(() => setFeedback(''), 3000);
    }
  } catch (err) {
    console.error('File download failed:', err);
  }
  return { shared: false };
}

/**
 * Compile month-wise attendance summary for active semester period
 */
export function getMonthlyBreakdown(
  records: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  currentDate: string
) {
  const monthsData: Record<string, AttendanceRecord[]> = {};
  records.forEach(r => {
    if (!r.isMarked || !isAttendanceRequired(r.dayType) || r.date > currentDate) return;
    
    // Check semester dates bounds
    if (userProfile.semesterStartDate && r.date < userProfile.semesterStartDate) return;
    if (userProfile.semesterEndDate && r.date > userProfile.semesterEndDate) return;

    const monthKey = r.date.substring(0, 7); // "YYYY-MM"
    if (!monthsData[monthKey]) {
      monthsData[monthKey] = [];
    }
    monthsData[monthKey].push(r);
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return Object.keys(monthsData).sort().map(monthKey => {
    const monthRecords = monthsData[monthKey];
    const monthAnalytics = calculateAnalytics(monthRecords, subjects, timetables, userProfile.minAttendance, {});
    const [year, monthStr] = monthKey.split('-');
    const name = `${monthNames[parseInt(monthStr, 10) - 1]} ${year}`;
    
    let totalC = 0, totalA = 0;
    Object.values(monthAnalytics.subjectWise).forEach(sw => {
      totalC += sw.total;
      totalA += sw.attended;
    });

    return {
      monthKey,
      name,
      conducted: totalC,
      attended: totalA,
      missed: totalC - totalA,
      pct: totalC > 0 ? (totalA / totalC) * 100 : 0
    };
  });
}

/**
 * Format a standard date header like "dd-mm"
 */
export function formatDateHeader(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}`;
}

/**
 * Get status code for cell: 'P', 'A', 'C', or '-'
 */
export function getCellStatus(
  records: AttendanceRecord[],
  timetables: Timetable[],
  subjectCode: string,
  dateStr: string
): string {
  const r = records.find(record => record.date === dateStr);
  if (!r || !r.isMarked) return '-';

  if (r.slotsDetails && r.slotsDetails.length > 0) {
    const matchSlots = r.slotsDetails.filter(s => s.subjectCode === subjectCode);
    if (matchSlots.length === 0) return '-';

    const indicators: string[] = [];
    matchSlots.forEach(s => {
      if (s.status === 'Cancelled') {
        indicators.push('C');
      } else if (s.isAttended) {
        indicators.push('P');
      } else {
        indicators.push('A');
      }
    });
    return indicators.join(' ');
  }

  const ttable = getTimetableForDate(dateStr, timetables);
  if (!ttable) return '-';

  const dayInfo = getDayOfWeekFromDate(dateStr);
  const scheduledSlots = ttable.slots[dayInfo.indexStr] || [];
  
  const matchSlots = scheduledSlots.filter(s => s.subjectCode === subjectCode);
  if (matchSlots.length === 0) return '-';

  const hours = matchSlots.reduce((sum, s) => sum + s.hours, 0);

  if (r.attendedHours === r.scheduledHours) {
    return Array(hours).fill('P').join(' ');
  } else if (r.attendedHours === 0) {
    return Array(hours).fill('A').join(' ');
  } else {
    if (r.labAttendance && r.labAttendance.subjectCode === subjectCode) {
      const p = r.labAttendance.attendedSlots;
      const a = r.labAttendance.totalSlots - p;
      const arr: string[] = [];
      for (let i = 0; i < p; i++) arr.push('P');
      for (let i = 0; i < a; i++) arr.push('A');
      return arr.join(' ');
    }

    const isMissed = r.missedClasses.includes(subjectCode);
    if (isMissed) {
      return Array(hours).fill('A').join(' ');
    } else {
      return Array(hours).fill('P').join(' ');
    }
  }
}

/**
 * EXPORT 1: PDF Ledger (Subject-wise summary)
 */
export async function exportLedgerPDF(
  activePeriodRecords: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  activeReportRangeStr: string,
  setFeedback?: (msg: string) => void
) {
  const analyticsResult = calculateAnalytics(
    activePeriodRecords,
    subjects,
    timetables,
    userProfile.minAttendance,
    {}
  );

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = 15;

  // Header institutional branding
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor('#0F172A');
  doc.text((userProfile.collegeName || 'COLLEGE').toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor('#475569');
  doc.text('(AUTONOMOUS) • KADAPA, ANDHRA PRADESH - 516003', pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor('#94A3B8');
  doc.text('Approved by AICTE • Affiliated to JNTUA • Certified ISO 9001:2015', pageWidth / 2, y, { align: 'center' });
  y += 5;

  // Divider line
  doc.setDrawColor('#0F172A');
  doc.setLineWidth(0.45);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Title
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor('#1E293B');
  doc.text('OFFICIAL STUDENT ATTENDANCE LEDGER STATEMENT', pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor('#2563EB');
  doc.text(`Evaluation Period: ${activeReportRangeStr}`, pageWidth / 2, y, { align: 'center' });
  y += 7;

  // Student details panel
  const boxHeight = 29;
  doc.setFillColor('#F8FAFC');
  doc.setDrawColor('#CBD5E1');
  doc.setLineWidth(0.25);
  doc.rect(margin, y, contentWidth, boxHeight, 'FD');

  const startX = margin + 6;
  const colonX = startX + 28;
  const valueX = startX + 31;
  let textY = y + 4.5;

  const profileData = [
    { label: 'STUDENT NAME', val: userProfile.name.toUpperCase() },
    { label: 'ROLL NO', val: (userProfile.rollNo || 'N/A').toUpperCase() },
    { label: 'SEMESTER', val: (userProfile.semester || 'N/A').toUpperCase() },
    { label: 'BRANCH', val: (userProfile.branch || 'Information Technology').toUpperCase() },
    { label: 'DEGREE', val: (userProfile.degree || 'B.Tech').toUpperCase() },
    { label: 'EMAIL ADDRESS', val: userProfile.email || 'N/A' }
  ];

  profileData.forEach((row, i) => {
    // 2 columns
    const isCol2 = i % 2 !== 0;
    const colX = isCol2 ? margin + contentWidth / 2 + 3 : startX;
    const colColonX = colX + 24;
    const colValueX = colX + 27;
    const rowY = y + 5 + Math.floor(i / 2) * 5.5;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor('#64748B');
    doc.text(row.label, colX, rowY);
    doc.text(':', colColonX, rowY);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor('#0F172A');
    doc.setFontSize(7.5);
    doc.text(row.val, colValueX, rowY);
  });

  y += boxHeight + 8;

  // Draw subject ledger table headers
  doc.setFillColor('#1E293B');
  doc.rect(margin, y, contentWidth, 7, 'F');
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor('#FFFFFF');
  doc.text('Sl.No.', margin + 2, y + 4.8);
  doc.text('Subject Description', margin + 12, y + 4.8);
  doc.text('Conducted', margin + 95, y + 4.8, { align: 'center' });
  doc.text('Attended', margin + 120, y + 4.8, { align: 'center' });
  doc.text('Missed', margin + 145, y + 4.8, { align: 'center' });
  doc.text('Attendance %', margin + 170, y + 4.8, { align: 'center' });

  y += 7;

  let totalC = 0;
  let totalA = 0;

  subjects.forEach((sub, idx) => {
    const stats = analyticsResult.subjectWise[sub.code] || { total: 0, attended: 0, percent: 0 };
    totalC += stats.total;
    totalA += stats.attended;

    doc.setDrawColor('#E2E8F0');
    doc.setLineWidth(0.2);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#334155');
    
    doc.text(String(idx + 1), margin + 3, y + 4.8);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor('#0284C7');
    doc.text(sub.code, margin + 12, y + 4.8);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor('#334155');
    doc.text(` - ${sub.name}`, margin + 28, y + 4.8);

    doc.text(String(stats.total), margin + 95, y + 4.8, { align: 'center' });
    doc.setTextColor('#16A34A');
    doc.text(String(stats.attended), margin + 120, y + 4.8, { align: 'center' });
    doc.setTextColor('#DC2626');
    doc.text(String(stats.total - stats.attended), margin + 145, y + 4.8, { align: 'center' });
    
    const pct = stats.percent;
    doc.setTextColor(pct >= userProfile.minAttendance ? '#16A34A' : '#DC2626');
    doc.setFont('Helvetica', 'bold');
    doc.text(`${pct.toFixed(2)}%`, margin + 170, y + 4.8, { align: 'center' });

    y += 7;
  });

  // Totals Row
  doc.setFillColor('#F1F5F9');
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setDrawColor('#94A3B8');
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 7, 'D');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor('#0F172A');
  doc.text('CUMULATIVE TOTALS', margin + 12, y + 4.8);
  doc.text(String(totalC), margin + 95, y + 4.8, { align: 'center' });
  doc.setTextColor('#16A34A');
  doc.text(String(totalA), margin + 120, y + 4.8, { align: 'center' });
  doc.setTextColor('#DC2626');
  doc.text(String(totalC - totalA), margin + 145, y + 4.8, { align: 'center' });

  const overallPct = totalC > 0 ? (totalA / totalC) * 100 : 0;
  doc.setTextColor(overallPct >= userProfile.minAttendance ? '#16A34A' : '#DC2626');
  doc.text(`${overallPct.toFixed(2)}%`, margin + 170, y + 4.8, { align: 'center' });

  y += 12;

  // Theory & Lab Breakdown Panel
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#0F172A');
  doc.text('CLASS TYPE METRICS', margin, y);
  y += 4.5;

  let theoryC = 0, theoryA = 0, labC = 0, labA = 0;
  subjects.forEach(sub => {
    const sw = analyticsResult.subjectWise[sub.code] || { total: 0, attended: 0 };
    if (sub.isLab) {
      labC += sw.total;
      labA += sw.attended;
    } else {
      theoryC += sw.total;
      theoryA += sw.attended;
    }
  });

  doc.setFillColor('#F8FAFC');
  doc.rect(margin, y, contentWidth, 16, 'F');
  doc.rect(margin, y, contentWidth, 16, 'D');

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor('#475569');
  doc.text('Theory Subjects', margin + 6, y + 5);
  doc.text(':', margin + 35, y + 5);
  doc.setFont('Helvetica', 'bold');
  doc.text(`Conducted: ${theoryC}  |  Attended: ${theoryA}  |  Missed: ${theoryC - theoryA}  |  Percentage: ${theoryC > 0 ? (theoryA/theoryC*100).toFixed(2) : '0.00'}%`, margin + 38, y + 5);

  doc.setFont('Helvetica', 'normal');
  doc.text('Lab / Practical', margin + 6, y + 11);
  doc.text(':', margin + 35, y + 11);
  doc.setFont('Helvetica', 'bold');
  doc.text(`Conducted: ${labC}  |  Attended: ${labA}  |  Missed: ${labC - labA}  |  Percentage: ${labC > 0 ? (labA/labC*100).toFixed(2) : '0.00'}%`, margin + 38, y + 11);

  y += 24;

  // Monthly Breakdown
  const months = getMonthlyBreakdown(activePeriodRecords, subjects, timetables, userProfile, '2026-12-31');
  if (months.length > 0) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor('#0F172A');
    doc.text('MONTH-WISE ATTENDANCE BREAKDOWN', margin, y);
    y += 5;

    // Draw monthly summary table
    doc.setFillColor('#E2E8F0');
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Month Description', margin + 4, y + 4.2);
    doc.text('Conducted', margin + 70, y + 4.2, { align: 'center' });
    doc.text('Attended', margin + 100, y + 4.2, { align: 'center' });
    doc.text('Missed', margin + 130, y + 4.2, { align: 'center' });
    doc.text('Attendance %', margin + 160, y + 4.2, { align: 'center' });

    y += 6;

    months.forEach(m => {
      doc.setDrawColor('#E2E8F0');
      doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(m.name, margin + 4, y + 4);
      doc.text(String(m.conducted), margin + 70, y + 4, { align: 'center' });
      doc.text(String(m.attended), margin + 100, y + 4, { align: 'center' });
      doc.text(String(m.missed), margin + 130, y + 4, { align: 'center' });
      doc.setFont('Helvetica', 'bold');
      doc.text(`${m.pct.toFixed(2)}%`, margin + 160, y + 4, { align: 'center' });

      y += 5.5;
    });
  }

  // Footer / Signatures
  y = Math.max(y + 15, pageHeight - 35);
  doc.setDrawColor('#CBD5E1');
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Report Generated On: ${new Date().toLocaleString()}  |  System Integrity Verified`, margin, y);
  doc.text('Academic Registrar Head Signature', pageWidth - margin - 40, y, { align: 'center' });
  doc.line(pageWidth - margin - 60, y - 1, pageWidth - margin, y - 1);

  const cleanName = userProfile.name.toLowerCase().replace(/\s+/g, '_');
  const filename = `THE_ARC_Attendance_Ledger_${cleanName}.pdf`;
  const pdfBlob = doc.output('blob');
  await downloadOrShareFile(pdfBlob, filename, 'application/pdf', setFeedback);
}

/**
 * EXPORT 2: PDF Register (Date-by-date grid)
 */
export async function exportRegisterPDF(
  activePeriodRecords: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  activeReportRangeStr: string,
  excludeInactive: boolean,
  currentDate: string,
  visibleDates: string[],
  setFeedback?: (msg: string) => void
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin; // 273 mm
  let y = 14;

  // Header branding
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor('#0F172A');
  doc.text((userProfile.collegeName || 'COLLEGE').toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setDrawColor('#94A3B8');
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('ACADEMIC ATTENDANCE REGISTER MATRIX', pageWidth / 2, y, { align: 'center' });
  y += 7;

  // Student Registry Info
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor('#334155');

  const col1X = margin + 5;
  const col2X = pageWidth / 2 + 10;

  doc.text(`Student Name : ${userProfile.name.toUpperCase()}`, col1X, y);
  doc.text(`Degree : ${userProfile.degree.toUpperCase()}`, col2X, y);
  y += 4.5;

  doc.text(`RollNo : ${userProfile.rollNo || 'N/A'}`, col1X, y);
  doc.text(`Branch : ${userProfile.branch || 'N/A'}`, col2X, y);
  y += 4.5;

  doc.text(`Email Address : ${userProfile.email || 'N/A'}`, col1X, y);
  doc.text(`Semester : ${userProfile.semester || 'N/A'}`, col2X, y);
  y += 4.5;

  doc.text(`Scope Register : ${activeReportRangeStr.toUpperCase()}`, col2X, y);
  y += 8;

  // Render subject register rows
  const analyticsResult = calculateAnalytics(activePeriodRecords, subjects, timetables, userProfile.minAttendance, {});
  
  const getSubjectStats = (subjectCode: string) => {
    const subjectStat = analyticsResult.subjectWise[subjectCode] || { total: 0, attended: 0, percent: 0 };
    return {
      conducted: subjectStat.total,
      attended: statsOverrideValue(subjectCode, 'attended', subjectStat.attended),
      missed: statsOverrideValue(subjectCode, 'missed', subjectStat.total - subjectStat.attended),
      percent: subjectStat.total > 0 ? (subjectStat.attended / subjectStat.total) * 100 : 0
    };
  };

  const statsOverrideValue = (code: string, type: 'attended' | 'missed', defaultValue: number) => {
    return defaultValue;
  };

  const renderedSubjects = subjects.filter(sub => {
    if (!excludeInactive) return true;
    const stats = getSubjectStats(sub.code);
    return stats.conducted > 0;
  });

  // Table Headers
  const colSlNoX = margin;
  const colSubjectX = margin + 10;
  const dateStartColX = margin + 50;
  const rightColsStartX = 205;

  const N = Math.max(1, visibleDates.length);
  const dateColWidth = 148 / N;

  doc.setFillColor('#E2E8F0');
  doc.setDrawColor('#94A3B8');
  doc.setLineWidth(0.35);
  doc.rect(margin, y, contentWidth, 7.5, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor('#1E293B');

  doc.text('Sl.No.', colSlNoX + 5, y + 4.8, { align: 'center' });
  doc.text('Subject Description', colSubjectX + 3, y + 4.8);

  // Date headers
  visibleDates.forEach((d, idx) => {
    const cellX = dateStartColX + (idx * dateColWidth);
    doc.text(formatDateHeader(d), cellX + dateColWidth / 2, y + 4.8, { align: 'center' });
  });

  // Right summary headers
  doc.text('Held', rightColsStartX + 9, y + 4.8, { align: 'center' });
  doc.text('Attend', rightColsStartX + 27, y + 4.8, { align: 'center' });
  doc.text('Missed', rightColsStartX + 45, y + 4.8, { align: 'center' });
  doc.text('%', rightColsStartX + 61, y + 4.8, { align: 'center' });

  y += 7.5;

  let totalConducted = 0;
  let totalAttended = 0;
  let totalMissed = 0;

  renderedSubjects.forEach((sub, rowIdx) => {
    const stats = getSubjectStats(sub.code);
    totalConducted += stats.conducted;
    totalAttended += stats.attended;
    totalMissed += stats.missed;

    doc.setDrawColor('#CBD5E1');
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentWidth, 7, 'D');

    // Vertical grid separators
    doc.line(colSubjectX, y, colSubjectX, y + 7);
    doc.line(dateStartColX, y, dateStartColX, y + 7);
    doc.line(rightColsStartX, y, rightColsStartX, y + 7);
    doc.line(rightColsStartX + 18, y, rightColsStartX + 18, y + 7);
    doc.line(rightColsStartX + 36, y, rightColsStartX + 36, y + 7);
    doc.line(rightColsStartX + 54, y, rightColsStartX + 54, y + 7);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor('#334155');

    doc.text(String(rowIdx + 1), colSlNoX + 5, y + 4.8, { align: 'center' });
    
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor('#0284C7');
    doc.text(sub.code, colSubjectX + 2, y + 4.8);

    // Status codes
    visibleDates.forEach((d, dIdx) => {
      const val = getCellStatus(activePeriodRecords, timetables, sub.code, d);
      const cellX = dateStartColX + (dIdx * dateColWidth);

      if (dIdx > 0) {
        doc.line(cellX, y, cellX, y + 7);
      }

      if (val.includes('P')) {
        doc.setTextColor('#059669');
        doc.setFont('Helvetica', 'bold');
      } else if (val.includes('A')) {
        doc.setTextColor('#DC2626');
        doc.setFont('Helvetica', 'bold');
      } else {
        doc.setTextColor('#94A3B8');
        doc.setFont('Helvetica', 'normal');
      }
      doc.text(val, cellX + dateColWidth / 2, y + 4.8, { align: 'center' });
    });

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor('#334155');

    doc.text(String(stats.conducted), rightColsStartX + 9, y + 4.8, { align: 'center' });
    doc.setTextColor('#059669');
    doc.text(String(stats.attended), rightColsStartX + 27, y + 4.8, { align: 'center' });
    doc.setTextColor('#DC2626');
    doc.text(String(stats.missed), rightColsStartX + 45, y + 4.8, { align: 'center' });
    
    doc.setTextColor(stats.percent >= userProfile.minAttendance ? '#059669' : '#DC2626');
    doc.setFont('Helvetica', 'bold');
    doc.text(`${stats.percent.toFixed(2)}%`, rightColsStartX + 61, y + 4.8, { align: 'center' });

    y += 7;
  });

  // TOTAL Row
  doc.setFillColor('#E2E8F0');
  doc.setDrawColor('#94A3B8');
  doc.rect(margin, y, contentWidth, 7, 'FD');
  doc.line(colSubjectX, y, colSubjectX, y + 7);
  doc.line(dateStartColX, y, dateStartColX, y + 7);
  doc.line(rightColsStartX, y, rightColsStartX, y + 7);
  doc.line(rightColsStartX + 18, y, rightColsStartX + 18, y + 7);
  doc.line(rightColsStartX + 36, y, rightColsStartX + 36, y + 7);
  doc.line(rightColsStartX + 54, y, rightColsStartX + 54, y + 7);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor('#0F172A');

  doc.text('TOTAL', dateStartColX - 5, y + 4.8, { align: 'right' });
  doc.text(String(totalConducted), rightColsStartX + 9, y + 4.8, { align: 'center' });
  doc.text(String(totalAttended), rightColsStartX + 27, y + 4.8, { align: 'center' });
  doc.text(String(totalMissed), rightColsStartX + 45, y + 4.8, { align: 'center' });
  const overallPercentage = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0;
  doc.text(`${overallPercentage.toFixed(2)}%`, rightColsStartX + 61, y + 4.8, { align: 'center' });

  y += 11;

  // Cumulative strength summary overall bottom panel
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CUMULATIVE REGISTER STATUS OVERALL', margin, y);
  y += 5;

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor('#475569');

  const sumLabelX = margin + 5;
  const sumColonX = margin + 42;
  const sumValueX = margin + 45;

  doc.text('Total Conducted Classes', sumLabelX, y);
  doc.text(':', sumColonX, y);
  doc.setFont('Helvetica', 'bold');
  doc.text(String(totalConducted), sumValueX, y);
  y += 4.5;

  doc.setFont('Helvetica', 'normal');
  doc.text('Total Attended Hours', sumLabelX, y);
  doc.text(':', sumColonX, y);
  doc.setFont('Helvetica', 'bold');
  doc.text(String(totalAttended), sumValueX, y);
  y += 4.5;

  doc.setFont('Helvetica', 'normal');
  doc.text('Total Missed Hours', sumLabelX, y);
  doc.text(':', sumColonX, y);
  doc.setFont('Helvetica', 'bold');
  doc.text(String(totalMissed), sumValueX, y);
  y += 4.5;

  doc.setFont('Helvetica', 'normal');
  doc.text('Overall Attendance', sumLabelX, y);
  doc.text(':', sumColonX, y);
  doc.setFont('Helvetica', 'bold');
  doc.text(`${overallPercentage.toFixed(2)}%`, sumValueX, y);

  // Date of print footer
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor('#94A3B8');
  doc.text(`Generated: ${new Date().toLocaleString()}  |  THE ARC Academic Register Module`, pageWidth - margin - 70, pageHeight - 10);

  const cleanName = userProfile.name.toLowerCase().replace(/\s+/g, '_');
  const filename = `THE_ARC_Academic_Register_${cleanName}.pdf`;
  const pdfBlob = doc.output('blob');
  await downloadOrShareFile(pdfBlob, filename, 'application/pdf', setFeedback);
}

/**
 * EXPORT 3: Excel Ledger (Complete styled ledger)
 */
export async function exportLedgerExcel(
  activePeriodRecords: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  activeReportRangeStr: string,
  setFeedback?: (msg: string) => void
) {
  const analyticsResult = calculateAnalytics(activePeriodRecords, subjects, timetables, userProfile.minAttendance, {});
  const months = getMonthlyBreakdown(activePeriodRecords, subjects, timetables, userProfile, '2026-12-31');

  let totalC = 0, totalA = 0, theoryC = 0, theoryA = 0, labC = 0, labA = 0;
  subjects.forEach(sub => {
    const sw = analyticsResult.subjectWise[sub.code] || { total: 0, attended: 0 };
    totalC += sw.total;
    totalA += sw.attended;
    if (sub.isLab) {
      labC += sw.total;
      labA += sw.attended;
    } else {
      theoryC += sw.total;
      theoryA += sw.attended;
    }
  });

  const overallPercentage = totalC > 0 ? (totalA / totalC) * 100 : 0;
  const theoryPct = theoryC > 0 ? (theoryA / theoryC) * 100 : 0;
  const labPct = labC > 0 ? (labA / labC) * 100 : 0;

  const subjectRowsHtml = subjects.map((sub, i) => {
    const stats = analyticsResult.subjectWise[sub.code] || { total: 0, attended: 0, percent: 0 };
    const isLabStr = sub.isLab ? 'Lab' : 'Theory';
    return `
      <tr>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #cbd5e1; font-weight: bold; color: #0284c7;">${sub.code}</td>
        <td style="border: 1px solid #cbd5e1;">${sub.name}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${isLabStr}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${stats.total}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; color: #16a34a; font-weight: bold;">${stats.attended}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; color: #dc2626;">${stats.total - stats.attended}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${stats.percent >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${stats.percent.toFixed(2)}%</td>
      </tr>
    `;
  }).join('');

  const monthlyRowsHtml = months.map(m => `
    <tr>
      <td colspan="3" style="border: 1px solid #cbd5e1; font-weight: bold;">${m.name}</td>
      <td style="border: 1px solid #cbd5e1; text-align: center;">${m.conducted}</td>
      <td style="border: 1px solid #cbd5e1; text-align: center; color: #16a34a; font-weight: bold;">${m.attended}</td>
      <td style="border: 1px solid #cbd5e1; text-align: center; color: #dc2626;">${m.missed}</td>
      <td colspan="2" style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${m.pct >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${m.pct.toFixed(2)}%</td>
    </tr>
  `).join('');

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Attendance Ledger</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #1e293b; color: #ffffff; font-weight: bold; padding: 8px; border: 1px solid #cbd5e1; font-size: 11px; }
        td { padding: 6px; border: 1px solid #cbd5e1; font-size: 11px; }
        .title { font-size: 16px; font-weight: bold; color: #0f172a; text-align: center; }
        .subtitle { font-size: 11px; color: #64748b; text-align: center; font-style: italic; }
        .bold-label { font-weight: bold; color: #475569; background-color: #f8fafc; }
        .total-row { background-color: #e2e8f0; font-weight: bold; }
        .section-header { font-size: 13px; font-weight: bold; color: #0f172a; padding-top: 15px; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="8" class="title">${(userProfile.collegeName || 'COLLEGE').toUpperCase()}</td></tr>
        <tr><td colspan="8" class="subtitle">OFFICIAL ATTENDANCE LEDGER REPORT</td></tr>
        <tr><td colspan="8">&nbsp;</td></tr>

        <!-- Identity Block -->
        <tr>
          <td class="bold-label" colspan="2">Student Name:</td><td colspan="2">${userProfile.name}</td>
          <td class="bold-label" colspan="2">Roll Number:</td><td colspan="2">${userProfile.rollNo || 'N/A'}</td>
        </tr>
        <tr>
          <td class="bold-label" colspan="2">Degree Course:</td><td colspan="2">${userProfile.degree}</td>
          <td class="bold-label" colspan="2">Specialization Branch:</td><td colspan="2">${userProfile.branch || 'N/A'}</td>
        </tr>
        <tr>
          <td class="bold-label" colspan="2">Academic Semester:</td><td colspan="2">${userProfile.semester || 'N/A'}</td>
          <td class="bold-label" colspan="2">Report Filter Scope:</td><td colspan="2">${activeReportRangeStr}</td>
        </tr>
        <tr>
          <td class="bold-label" colspan="2">Report Generation:</td><td colspan="2">${new Date().toLocaleString()}</td>
          <td class="bold-label" colspan="2">Target Threshold:</td><td colspan="2">${userProfile.minAttendance}%</td>
        </tr>
        <tr><td colspan="8">&nbsp;</td></tr>

        <!-- Subject Wise Table -->
        <tr>
          <th style="width: 50px;">Sl.No</th>
          <th style="width: 100px; text-align: left;">Subject Code</th>
          <th style="width: 250px; text-align: left;">Subject Description</th>
          <th style="width: 80px;">Type</th>
          <th style="width: 80px;">Conducted</th>
          <th style="width: 80px;">Attended</th>
          <th style="width: 80px;">Missed</th>
          <th style="width: 100px;">Attendance %</th>
        </tr>
        ${subjectRowsHtml}
        <tr class="total-row">
          <td colspan="4">CUMULATIVE SUMMARY TOTALS</td>
          <td style="text-align: center;">${totalC}</td>
          <td style="text-align: center; color: #16a34a;">${totalA}</td>
          <td style="text-align: center; color: #dc2626;">${totalC - totalA}</td>
          <td style="text-align: center; color: ${overallPercentage >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${overallPercentage.toFixed(2)}%</td>
        </tr>
        <tr><td colspan="8">&nbsp;</td></tr>

        <!-- Type metrics -->
        <tr><td colspan="8" class="section-header">CLASS TYPE ANALYSIS METRICS</td></tr>
        <tr>
          <th colspan="3" style="text-align: left;">Category Type</th>
          <th>Conducted</th>
          <th>Attended</th>
          <th>Missed</th>
          <th colspan="2">Percentage</th>
        </tr>
        <tr style="background-color: #f0fdf4;">
          <td colspan="3" style="font-weight: bold;">Theory Class Hours</td>
          <td style="text-align: center;">${theoryC}</td>
          <td style="text-align: center; color: #16a34a; font-weight: bold;">${theoryA}</td>
          <td style="text-align: center; color: #dc2626;">${theoryC - theoryA}</td>
          <td colspan="2" style="text-align: center; font-weight: bold; color: ${theoryPct >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${theoryPct.toFixed(2)}%</td>
        </tr>
        <tr style="background-color: #f0f9ff;">
          <td colspan="3" style="font-weight: bold;">Laboratory Class Hours</td>
          <td style="text-align: center;">${labC}</td>
          <td style="text-align: center; color: #16a34a; font-weight: bold;">${labA}</td>
          <td style="text-align: center; color: #dc2626;">${labC - labA}</td>
          <td colspan="2" style="text-align: center; font-weight: bold; color: ${labPct >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${labPct.toFixed(2)}%</td>
        </tr>
        <tr><td colspan="8">&nbsp;</td></tr>

        <!-- Monthly breakdowns -->
        ${months.length > 0 ? `
          <tr><td colspan="8" class="section-header">MONTH-WISE ATTENDANCE STRENGTH</td></tr>
          <tr>
            <th colspan="3" style="text-align: left;">Month Description</th>
            <th>Conducted</th>
            <th>Attended</th>
            <th>Missed</th>
            <th colspan="2">Percentage</th>
          </tr>
          ${monthlyRowsHtml}
        ` : ''}

      </table>
    </body>
    </html>
  `;

  const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const cleanName = userProfile.name.toLowerCase().replace(/\s+/g, '_');
  const filename = `THE_ARC_Attendance_Ledger_${cleanName}.xls`;
  await downloadOrShareFile(blob, filename, 'application/vnd.ms-excel', setFeedback);
}

/**
 * EXPORT 4: Excel Register (Detailed date-wise grid matrix)
 */
export async function exportRegisterExcel(
  activePeriodRecords: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  activeReportRangeStr: string,
  excludeInactive: boolean,
  currentDate: string,
  visibleDates: string[],
  setFeedback?: (msg: string) => void
) {
  const analyticsResult = calculateAnalytics(activePeriodRecords, subjects, timetables, userProfile.minAttendance, {});
  
  const getSubjectStats = (subjectCode: string) => {
    const subjectStat = analyticsResult.subjectWise[subjectCode] || { total: 0, attended: 0, percent: 0 };
    return {
      conducted: subjectStat.total,
      attended: subjectStat.attended,
      missed: subjectStat.total - subjectStat.attended,
      percent: subjectStat.total > 0 ? (subjectStat.attended / subjectStat.total) * 100 : 0
    };
  };

  const renderedSubjects = subjects.filter(sub => {
    if (!excludeInactive) return true;
    const stats = getSubjectStats(sub.code);
    return stats.conducted > 0;
  });

  const headersHtml = `
    <tr>
      <th style="width: 50px;">Sl.No</th>
      <th style="width: 100px; text-align: left;">Subject Code</th>
      <th style="width: 250px; text-align: left;">Subject Name</th>
      ${visibleDates.map(d => `<th style="width: 45px; text-align: center;">${formatDateHeader(d)}</th>`).join('')}
      <th style="width: 70px;">Held</th>
      <th style="width: 70px;">Attended</th>
      <th style="width: 70px;">Missed</th>
      <th style="width: 90px;">Attendance %</th>
    </tr>
  `;

  const rowsHtml = renderedSubjects.map((sub, i) => {
    const stats = getSubjectStats(sub.code);
    const dateCells = visibleDates.map(d => {
      const val = getCellStatus(activePeriodRecords, timetables, sub.code, d);
      let color = '#94a3b8'; // gray
      let weight = 'normal';
      if (val.includes('P')) {
        color = '#16a34a'; // green
        weight = 'bold';
      } else if (val.includes('A')) {
        color = '#dc2626'; // red
        weight = 'bold';
      }
      return `<td style="border: 1px solid #cbd5e1; text-align: center; color: ${color}; font-weight: ${weight};">${val}</td>`;
    }).join('');

    return `
      <tr>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #cbd5e1; font-weight: bold; color: #0284c7;">${sub.code}</td>
        <td style="border: 1px solid #cbd5e1; text-align: left;">${sub.name}</td>
        ${dateCells}
        <td style="border: 1px solid #cbd5e1; text-align: center;">${stats.conducted}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; color: #16a34a; font-weight: bold;">${stats.attended}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; color: #dc2626;">${stats.missed}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${stats.percent >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${stats.percent.toFixed(2)}%</td>
      </tr>
    `;
  }).join('');

  let totalC = 0, totalA = 0, totalM = 0;
  renderedSubjects.forEach(sub => {
    const stats = getSubjectStats(sub.code);
    totalC += stats.conducted;
    totalA += stats.attended;
    totalM += stats.missed;
  });
  const overallPercentage = totalC > 0 ? (totalA / totalC) * 100 : 0;

  const totalRowHtml = `
    <tr style="background-color: #e2e8f0; font-weight: bold;">
      <td colspan="3">SUMMARY TOTALS</td>
      ${visibleDates.map(() => `<td style="text-align: center; color: #94a3b8;">-</td>`).join('')}
      <td style="text-align: center;">${totalC}</td>
      <td style="text-align: center; color: #16a34a;">${totalA}</td>
      <td style="text-align: center; color: #dc2626;">${totalM}</td>
      <td style="text-align: center; color: ${overallPercentage >= userProfile.minAttendance ? '#16a34a' : '#dc2626'};">${overallPercentage.toFixed(2)}%</td>
    </tr>
  `;

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Academic Register</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; }
        table { border-collapse: collapse; }
        th { background-color: #1e293b; color: #ffffff; font-weight: bold; padding: 6px; border: 1px solid #cbd5e1; font-size: 10px; }
        td { padding: 5px; border: 1px solid #cbd5e1; font-size: 10px; }
        .title { font-size: 16px; font-weight: bold; color: #0f172a; text-align: center; }
        .subtitle { font-size: 11px; color: #64748b; text-align: center; font-style: italic; }
        .bold-label { font-weight: bold; color: #475569; background-color: #f8fafc; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="${visibleDates.length + 7}" class="title">${(userProfile.collegeName || 'COLLEGE').toUpperCase()}</td></tr>
        <tr><td colspan="${visibleDates.length + 7}" class="subtitle">ACADEMIC ATTENDANCE REGISTER MATRIX</td></tr>
        <tr><td colspan="${visibleDates.length + 7}">&nbsp;</td></tr>

        <!-- Identity Block -->
        <tr>
          <td class="bold-label" colspan="2">Student Name:</td><td colspan="2">${userProfile.name}</td>
          <td class="bold-label" colspan="2">Roll Number:</td><td colspan="${visibleDates.length + 1}">${userProfile.rollNo || 'N/A'}</td>
        </tr>
        <tr>
          <td class="bold-label" colspan="2">Degree Course:</td><td colspan="2">${userProfile.degree}</td>
          <td class="bold-label" colspan="2">Specialization Branch:</td><td colspan="${visibleDates.length + 1}">${userProfile.branch || 'N/A'}</td>
        </tr>
        <tr>
          <td class="bold-label" colspan="2">Academic Semester:</td><td colspan="2">${userProfile.semester || 'N/A'}</td>
          <td class="bold-label" colspan="2">Report Filter Scope:</td><td colspan="${visibleDates.length + 1}">${activeReportRangeStr}</td>
        </tr>
        <tr>
          <td class="bold-label" colspan="2">Report Generation:</td><td colspan="2">${new Date().toLocaleString()}</td>
          <td class="bold-label" colspan="2">Target Threshold:</td><td colspan="${visibleDates.length + 1}">${userProfile.minAttendance}%</td>
        </tr>
        <tr><td colspan="${visibleDates.length + 7}">&nbsp;</td></tr>

        <!-- Register Table -->
        ${headersHtml}
        ${rowsHtml}
        ${totalRowHtml}
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const cleanName = userProfile.name.toLowerCase().replace(/\s+/g, '_');
  const filename = `THE_ARC_Academic_Register_${cleanName}.xls`;
  await downloadOrShareFile(blob, filename, 'application/vnd.ms-excel', setFeedback);
}

/**
 * EXPORT 5: CSV Ledger (UTF-8 BOM ledger export)
 */
export async function exportLedgerCSV(
  activePeriodRecords: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  activeReportRangeStr: string,
  setFeedback?: (msg: string) => void
) {
  const analyticsResult = calculateAnalytics(activePeriodRecords, subjects, timetables, userProfile.minAttendance, {});

  const headers = ['Subject Code', 'Subject Name', 'Conducted', 'Attended', 'Missed', 'Attendance %'];
  const rows = subjects.map(sub => {
    const stats = analyticsResult.subjectWise[sub.code] || { total: 0, attended: 0, percent: 0 };
    return [
      sub.code,
      sub.name,
      stats.total,
      stats.attended,
      stats.total - stats.attended,
      `${stats.percent.toFixed(2)}%`
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // Prefix BOM (Byte Order Mark) for UTF-8 compatibility with Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const cleanName = userProfile.name.toLowerCase().replace(/\s+/g, '_');
  const filename = `THE_ARC_Attendance_Ledger_${cleanName}.csv`;
  await downloadOrShareFile(blob, filename, 'text/csv', setFeedback);
}

/**
 * EXPORT 6: CSV Register (UTF-8 BOM register export)
 */
export async function exportRegisterCSV(
  activePeriodRecords: AttendanceRecord[],
  subjects: Subject[],
  timetables: Timetable[],
  userProfile: UserProfile,
  activeReportRangeStr: string,
  excludeInactive: boolean,
  currentDate: string,
  visibleDates: string[],
  setFeedback?: (msg: string) => void
) {
  const analyticsResult = calculateAnalytics(activePeriodRecords, subjects, timetables, userProfile.minAttendance, {});
  
  const getSubjectStats = (subjectCode: string) => {
    const subjectStat = analyticsResult.subjectWise[subjectCode] || { total: 0, attended: 0, percent: 0 };
    return {
      conducted: subjectStat.total,
      attended: subjectStat.attended,
      missed: subjectStat.total - subjectStat.attended,
      percent: subjectStat.total > 0 ? (subjectStat.attended / subjectStat.total) * 100 : 0
    };
  };

  const renderedSubjects = subjects.filter(sub => {
    if (!excludeInactive) return true;
    const stats = getSubjectStats(sub.code);
    return stats.conducted > 0;
  });

  const headers = [
    'SI.No',
    'Subject Code',
    'Subject Name',
    ...visibleDates,
    'Conducted',
    'Attended',
    'Missed',
    'Attendance %'
  ];

  const rows = renderedSubjects.map((sub, i) => {
    const stats = getSubjectStats(sub.code);
    return [
      String(i + 1),
      sub.code,
      sub.name,
      ...visibleDates.map(d => getCellStatus(activePeriodRecords, timetables, sub.code, d)),
      String(stats.conducted),
      String(stats.attended),
      String(stats.missed),
      `${stats.percent.toFixed(2)}%`
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const cleanName = userProfile.name.toLowerCase().replace(/\s+/g, '_');
  const filename = `THE_ARC_Academic_Register_${cleanName}.csv`;
  await downloadOrShareFile(blob, filename, 'text/csv', setFeedback);
}
