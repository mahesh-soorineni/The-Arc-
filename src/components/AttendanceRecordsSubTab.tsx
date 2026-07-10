/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { safeLocalStorage as localStorage } from '../utils/storage';
import {
  Calendar,
  Layers,
  FileText,
  Download,
  Share2,
  CheckCircle,
  Activity,
  FileCheck2,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Check
} from 'lucide-react';
import { AttendanceRecord, Subject, Timetable, DayType, UserProfile } from '../types';
import {
  isAttendanceRequired,
  getDayOfWeekFromDate,
  getTimetableForDate
} from '../utils/rulesEngine';
import { jsPDF } from 'jspdf';

interface AttendanceRecordsSubTabProps {
  records: AttendanceRecord[];
  subjects: Subject[];
  timetables: Timetable[];
  currentDate: string;
  userProfile: UserProfile;
}

// Date Formatter Helper
export function formatRecordsDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function AttendanceRecordsSubTab({
  records,
  subjects,
  timetables,
  currentDate,
  userProfile
}: AttendanceRecordsSubTabProps) {
  // --- States ---
  const [reportMode, setReportMode] = useState<'monthly' | 'custom' | 'till_now'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<string>('06'); // June default
  const [selectedYear, setSelectedYear] = useState<string>('2026'); // 2026 default
  const [fromDate, setFromDate] = useState<string>(() => userProfile.semesterStartDate || '2026-05-01');
  const [toDate, setToDate] = useState<string>(() => currentDate || '2026-06-12');
  const [excludeInactive, setExcludeInactive] = useState<boolean>(false);

  React.useEffect(() => {
    if (userProfile.semesterStartDate) {
      setFromDate(userProfile.semesterStartDate);
    }
  }, [userProfile.semesterStartDate]);

  React.useEffect(() => {
    if (currentDate) {
      setToDate(currentDate);
    }
  }, [currentDate]);

  // Print & PDF Layout Controls
  const [isPrintLayout, setIsPrintLayout] = useState<boolean>(true);
  const pdfOrientation: 'portrait' | 'landscape' = 'portrait';
  const pdfTheme: any = 'monochrome';
  const pdfIncludeSubjectName = false;
  const pdfShowSignatures = false;

  // Sorting
  const [sortField, setSortField] = useState<'subject' | 'conducted' | 'attended' | 'missed' | 'pct'>('subject');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Generated Report Cache
  const [reportGenerated, setReportGenerated] = useState<boolean>(false);
  const [activeReportMode, setActiveReportMode] = useState<'monthly' | 'custom' | 'till_now'>('monthly');
  const [activeReportRangeStr, setActiveReportRangeStr] = useState<string>('');
  const [generatedRows, setGeneratedRows] = useState<any[]>([]);
  const [shareFeedback, setShareFeedback] = useState<string>('');

  // Manual Overrides
  const [editingRowCode, setEditingRowCode] = useState<string | null>(null);
  const [editConducted, setEditConducted] = useState<number>(0);
  const [editAttended, setEditAttended] = useState<number>(0);
  const [editMissed, setEditMissed] = useState<number>(0);

  const [overrides, setOverrides] = useState<Record<string, { conducted: number; attended: number; missed: number }>>(() => {
    try {
      const saved = localStorage.getItem('the_arc_manual_stats_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const handleStartEdit = (row: any) => {
    setEditingRowCode(row.subjectCode);
    setEditConducted(row.conducted);
    setEditAttended(row.attended);
    setEditMissed(row.missed);
  };

  const handleSaveEdit = (subjectCode: string) => {
    const updated = {
      ...overrides,
      [subjectCode]: {
        conducted: editConducted,
        attended: editAttended,
        missed: editMissed
      }
    };
    setOverrides(updated);
    localStorage.setItem('the_arc_manual_stats_overrides', JSON.stringify(updated));
    setEditingRowCode(null);
    triggerFeedback(`Attendance stats updated for ${subjectCode}!`);

    // Force updates to active report rows
    const updatedRows = generatedRows.map(r => {
      if (r.subjectCode === subjectCode) {
        const pct = editConducted > 0 ? (editAttended / editConducted) * 100 : 0.00;
        return {
          ...r,
          conducted: editConducted,
          attended: editAttended,
          missed: editMissed,
          pct: parseFloat(pct.toFixed(2))
        };
      }
      return r;
    });
    setGeneratedRows(updatedRows);
  };

  const handleCancelEdit = () => {
    setEditingRowCode(null);
  };

  // Auto-generate report initially
  useEffect(() => {
    generateReport(false);
  }, [records, timetables, subjects]);

  const generateReport = (userTriggered: boolean = true) => {
    // 1. Accumulate statistics subject-wise for records that match the selected filter range
    const runningStats: Record<string, { conducted: number; attended: number; missed: number }> = {};
    subjects.forEach(sub => {
      runningStats[sub.code] = { conducted: 0, attended: 0, missed: 0 };
    });

    const activePeriodRecords = records.filter(r => {
      if (!r.isMarked) return false;
      if (!isAttendanceRequired(r.dayType)) return false;
      if (r.date > currentDate) return false; // Prevent simulated future records from ever counting

      let isInRange = false;
      if (reportMode === 'monthly') {
        isInRange = r.date.startsWith(`${selectedYear}-${selectedMonth}`);
      } else if (reportMode === 'custom') {
        isInRange = r.date >= fromDate && r.date <= toDate;
      } else { // till_now
        isInRange = true; // since r.date <= currentDate is already guaranteed by the check above
      }
      return isInRange;
    });

    activePeriodRecords.forEach(r => {
      const ttable = getTimetableForDate(r.date, timetables);
      if (!ttable) return;

      const dayInfo = getDayOfWeekFromDate(r.date);
      const scheduledSlots = ttable.slots[dayInfo.indexStr] || [];

      if (r.attendedHours === r.scheduledHours) {
        // Completely present
        scheduledSlots.forEach(slot => {
          const code = slot.subjectCode;
          if (!runningStats[code]) {
            runningStats[code] = { conducted: 0, attended: 0, missed: 0 };
          }
          runningStats[code].conducted += slot.hours;
          runningStats[code].attended += slot.hours;
        });
      } else if (r.attendedHours === 0) {
        // Completely absent
        scheduledSlots.forEach(slot => {
          const code = slot.subjectCode;
          if (!runningStats[code]) {
            runningStats[code] = { conducted: 0, attended: 0, missed: 0 };
          }
          runningStats[code].conducted += slot.hours;
          runningStats[code].missed += slot.hours;
        });
      } else {
        // Partial attendance distribution
        if (r.labAttendance) {
          const labCode = r.labAttendance.subjectCode;
          if (!runningStats[labCode]) {
            runningStats[labCode] = { conducted: 0, attended: 0, missed: 0 };
          }
          runningStats[labCode].conducted += r.labAttendance.totalSlots;
          runningStats[labCode].attended += r.labAttendance.attendedSlots;
          runningStats[labCode].missed += (r.labAttendance.totalSlots - r.labAttendance.attendedSlots);
        }

        scheduledSlots.forEach(slot => {
          if (r.labAttendance && slot.subjectCode === r.labAttendance.subjectCode) {
            return; // processed
          }
          const code = slot.subjectCode;
          if (!runningStats[code]) {
            runningStats[code] = { conducted: 0, attended: 0, missed: 0 };
          }
          runningStats[code].conducted += slot.hours;
          const isMissed = r.missedClasses.includes(code);
          if (isMissed) {
            runningStats[code].missed += slot.hours;
          } else {
            runningStats[code].attended += slot.hours;
          }
        });
      }
    });

    const rows: any[] = [];
    let currentOverrides = overrides;
    try {
      const saved = localStorage.getItem('the_arc_manual_stats_overrides');
      if (saved) currentOverrides = JSON.parse(saved);
    } catch (e) {}

    subjects.forEach(sub => {
      const realStats = runningStats[sub.code] || { conducted: 0, attended: 0, missed: 0 };
      const o = currentOverrides[sub.code] || realStats;
      const pct = o.conducted > 0 ? (o.attended / o.conducted) * 100 : 0.00;
      rows.push({
        subjectCode: sub.code,
        subjectName: sub.name,
        conducted: o.conducted,
        attended: o.attended,
        missed: o.missed,
        pct: parseFloat(pct.toFixed(2))
      });
    });

    setGeneratedRows(rows);
    setActiveReportMode(reportMode);

    let rangeLabel = '';
    if (reportMode === 'monthly') {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIdx = parseInt(selectedMonth, 10) - 1;
      rangeLabel = `${monthNames[monthIdx]} ${selectedYear}`;
    } else if (reportMode === 'custom') {
      rangeLabel = `${formatRecordsDate(fromDate)} to ${formatRecordsDate(toDate)}`;
    } else {
      rangeLabel = `Till Now (As of ${formatRecordsDate(currentDate)})`;
    }

    setActiveReportRangeStr(rangeLabel);
    setReportGenerated(true);

    if (userTriggered) {
      triggerFeedback('ERP subject summary generated successfully! View the results below.');
    }
  };

  const triggerFeedback = (msg: string) => {
    setShareFeedback(msg);
    setTimeout(() => setShareFeedback(''), 4000);
  };

  const handleSort = (field: 'subject' | 'conducted' | 'attended' | 'missed' | 'pct') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Optional filter applied: hide subjects with zero conducted classes
  const filteredRows = generatedRows.filter(row => {
    if (excludeInactive && row.conducted === 0) return false;
    return true;
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortField === 'subject') {
      valA = a.subjectName;
      valB = b.subjectName;
    } else {
      valA = a[sortField];
      valB = b[sortField];
    }

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' 
        ? valA - valB 
        : valB - valA;
    }
  });

  // Calculate totals
  const totalConducted = filteredRows.reduce((sum, r) => sum + r.conducted, 0);
  const totalAttended = filteredRows.reduce((sum, r) => sum + r.attended, 0);
  const totalMissed = filteredRows.reduce((sum, r) => sum + r.missed, 0);
  const overallPercentage = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0.00;

  // CSV Generator
  const triggerExportCSV = () => {
    if (filteredRows.length === 0) {
      alert('No data available to export.');
      return;
    }
    const headers = ['Subject', 'Conducted', 'Attended', 'Missed', 'Attendance %'];
    const rows = sortedRows.map(r => [
      `${r.subjectCode} - ${r.subjectName}`,
      r.conducted,
      r.attended,
      r.missed,
      `${r.pct.toFixed(2)}%`
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ERP_Attendance_Records_${activeReportMode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerFeedback('CSV Records file downloaded! 📄');
  };

  // Excel Generator
  const triggerExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('No data available to export.');
      return;
    }
    const headers = ['Subject Code', 'Subject Name', 'Conducted', 'Attended', 'Missed', 'Attendance %'];
    const rows = sortedRows.map(r => [
      r.subjectCode,
      r.subjectName,
      r.conducted,
      r.attended,
      r.missed,
      `${r.pct.toFixed(2)}%`
    ]);

    const excelContent = [headers, ...rows]
      .map(row => row.join('\t'))
      .join('\n');

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ERP_Attendance_Records_${activeReportMode}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerFeedback('Excel compatible spreadsheet ledger downloaded! 📊');
  };

  // PDF print & direct jsPDF generation representation with university branding
  const handleExportPDF = () => {
    if (sortedRows.length === 0) {
      alert('No data available to export.');
      return;
    }

    const doc = new jsPDF({
      orientation: pdfOrientation,
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdfOrientation === 'portrait' ? 210 : 297;
    const pageHeight = pdfOrientation === 'portrait' ? 297 : 210;
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;

    let y = 15;

    // Helper for running page headers to keep records clearly formatted on page flow splits
    const drawRunningHeader = () => {
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(pdfTheme === 'portal' ? '#64748B' : '#000000');
      doc.text(`${userProfile.collegeName || 'COLLEGE'} - Attendance Report (${activeReportRangeStr})`, margin, y);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, y, { align: 'right' });
      y += 3;
      doc.setDrawColor(pdfTheme === 'portal' ? '#E2E8F0' : '#000000');
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - 15) {
        doc.addPage();
        y = 15;
        drawRunningHeader();
      }
    };

    // --- Header matching student portal ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13); // A4 standard is large enough
    doc.setTextColor('#1E293B'); // Slate-800
    doc.text((userProfile.collegeName || 'KSRM COLLEGE OF ENGINEERING').toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 4.5;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#64748B'); // Slate-500
    doc.text('(AUTONOMOUS) • KADAPA, ANDHRA PRADESH - 516003', pageWidth / 2, y, { align: 'center' });
    y += 4;

    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor('#94A3B8'); // Slate-400
    doc.text('Approved by AICTE • Affiliated to JNTUA • Certified ISO 9001:2015', pageWidth / 2, y, { align: 'center' });
    y += 4.5;

    // Divider line (thick, matching doc's border-b-2)
    doc.setDrawColor('#0F172A'); // Slate-900
    doc.setLineWidth(0.45);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Official Statement Document Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor('#1E293B');
    doc.text('OFFICIAL STUDENT ATTENDANCE STATEMENT', pageWidth / 2, y, { align: 'center' });
    y += 4;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#2563EB'); // Blue-600
    doc.text(`Evaluation Period: ${activeReportRangeStr}`, pageWidth / 2, y, { align: 'center' });
    y += 7;

    // Student Credentials Card: Box wrapper like doc's
    const boxWidth = 110;
    const boxHeight = 29;
    const boxX = (pageWidth - boxWidth) / 2;
    
    doc.setDrawColor('#CBD5E1'); // Slate-300 border
    doc.setFillColor('#F8FAFC'); // Slate-50 bg
    doc.setLineWidth(0.25);
    doc.rect(boxX, y, boxWidth, boxHeight, 'FD');

    const startX = boxX + 6;
    const colonX = startX + 28;
    const valueX = startX + 31;
    let textY = y + 4.5;

    // Student Name
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('STUDENT NAME', startX, textY);
    doc.text(':', colonX, textY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#0F172A');
    doc.text(userProfile.name.toUpperCase(), valueX, textY);
    textY += 4.2;

    // Roll No
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('ROLL NO', startX, textY);
    doc.text(':', colonX, textY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#0F172A');
    doc.text((userProfile.rollNo || 'N/A').toUpperCase(), valueX, textY);
    textY += 4.2;

    // Semester
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('SEMESTER', startX, textY);
    doc.text(':', colonX, textY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#0F172A');
    doc.text((userProfile.semester || 'N/A').toUpperCase(), valueX, textY);
    textY += 4.2;

    // Branch
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('BRANCH', startX, textY);
    doc.text(':', colonX, textY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#0F172A');
    doc.text((userProfile.branch || 'Information Technology').toUpperCase(), valueX, textY);
    textY += 4.2;

    // Degree
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('DEGREE', startX, textY);
    doc.text(':', colonX, textY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#0F172A');
    doc.text((userProfile.degree || 'B.Tech').toUpperCase(), valueX, textY);
    textY += 4.2;

    // Email Address
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('EMAIL ADDRESS', startX, textY);
    doc.text(':', colonX, textY);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor('#334155');
    const emailStr = (userProfile.email || 'N/A').toLowerCase();
    doc.text(emailStr.length > 40 ? emailStr.substring(0, 37) + '...' : emailStr, valueX, textY);

    y += boxHeight + 8;

    // --- Table Headers ---
    const colSlNoX = margin;
    const colSubjectX = margin + (pdfOrientation === 'portrait' ? 12 : 15);
    const colHeldX = margin + (pdfOrientation === 'portrait' ? 100 : 167);
    const colAttendX = margin + (pdfOrientation === 'portrait' ? 120 : 192);
    const colMissedX = margin + (pdfOrientation === 'portrait' ? 140 : 217);
    const colPctX = margin + (pdfOrientation === 'portrait' ? 160 : 242);

    const slNoWidth = colSubjectX - colSlNoX;
    const heldWidth = colAttendX - colHeldX;
    const attendWidth = colMissedX - colAttendX;
    const missedWidth = colPctX - colMissedX;
    const pctWidth = (pageWidth - margin) - colPctX;

    // Draw header rect background matching portal style or monochrome style
    if (pdfTheme === 'portal') {
      doc.setFillColor('#E2E8F0');
      doc.setDrawColor('#94A3B8');
    } else {
      doc.setFillColor('#FFFFFF');
      doc.setDrawColor('#000000');
    }
    doc.setLineWidth(0.35);
    doc.rect(margin, y, contentWidth, 7, pdfTheme === 'portal' ? 'FD' : 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(pdfTheme === 'portal' ? '#0F172A' : '#000000');

    doc.text('Sl.No.', colSlNoX + slNoWidth / 2, y + 4.8, { align: 'center' });
    doc.text('Subject', colSubjectX + 3, y + 4.8);
    doc.text('Held', colHeldX + heldWidth / 2, y + 4.8, { align: 'center' });
    doc.text('Attend', colAttendX + attendWidth / 2, y + 4.8, { align: 'center' });
    doc.text('Missed', colMissedX + missedWidth / 2, y + 4.8, { align: 'center' });
    doc.text('%', colPctX + pctWidth / 2, y + 4.8, { align: 'center' });

    y += 7;

    // Table rows
    sortedRows.forEach((row, index) => {
      ensureSpace(7);

      // Draw grid borders
      doc.setDrawColor(pdfTheme === 'portal' ? '#CBD5E1' : '#000000');
      doc.setLineWidth(0.25);
      doc.rect(margin, y, contentWidth, 6.8, 'D');

      // Draw vertical delimiters
      doc.line(colSubjectX, y, colSubjectX, y + 6.8);
      doc.line(colHeldX, y, colHeldX, y + 6.8);
      doc.line(colAttendX, y, colAttendX, y + 6.8);
      doc.line(colMissedX, y, colMissedX, y + 6.8);
      doc.line(colPctX, y, colPctX, y + 6.8);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(pdfTheme === 'portal' ? '#334155' : '#000000');

      // Sl.No.
      doc.text(String(index + 1), colSlNoX + slNoWidth / 2, y + 4.6, { align: 'center' });
      
      // Subject Code + optional complete Subject Name
      let subjectText = row.subjectCode;
      if (pdfIncludeSubjectName) {
        const found = subjects.find(s => s.code === row.subjectCode);
        const subName = found ? found.name : row.subjectName;
        subjectText = `${row.subjectCode} - ${subName}`;
      }
      
      const maxChars = pdfOrientation === 'portrait' ? 48 : 88;
      const displaySubjectText = subjectText.length > maxChars 
        ? subjectText.substring(0, maxChars - 3) + '...' 
        : subjectText;

      doc.text(displaySubjectText, colSubjectX + 3, y + 4.6);
      
      // Held
      doc.text(String(row.conducted), colHeldX + heldWidth / 2, y + 4.6, { align: 'center' });
      // Attend
      doc.text(String(row.attended), colAttendX + attendWidth / 2, y + 4.6, { align: 'center' });
      // Missed
      doc.text(String(row.missed), colMissedX + missedWidth / 2, y + 4.6, { align: 'center' });
      // %
      const pctVal = row.conducted > 0 ? row.pct : 0.00;
      const pctStr = row.conducted > 0 ? pctVal.toFixed(2) : '.00';
      doc.text(pctStr, colPctX + pctWidth / 2, y + 4.6, { align: 'center' });

      y += 6.8;
    });

    // TOTAL Row
    ensureSpace(7);
    if (pdfTheme === 'portal') {
      doc.setFillColor('#E2E8F0');
      doc.setDrawColor('#94A3B8');
    } else {
      doc.setFillColor('#FFFFFF');
      doc.setDrawColor('#000000');
    }
    doc.rect(margin, y, contentWidth, 7, pdfTheme === 'portal' ? 'FD' : 'D');
    doc.line(colSubjectX, y, colSubjectX, y + 7);
    doc.line(colHeldX, y, colHeldX, y + 7);
    doc.line(colAttendX, y, colAttendX, y + 7);
    doc.line(colMissedX, y, colMissedX, y + 7);
    doc.line(colPctX, y, colPctX, y + 7);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(pdfTheme === 'portal' ? '#0F172A' : '#000000');

    doc.text('TOTAL', colSubjectX + 3, y + 4.8);
    doc.text(String(totalConducted), colHeldX + heldWidth / 2, y + 4.8, { align: 'center' });
    doc.text(String(totalAttended), colAttendX + attendWidth / 2, y + 4.8, { align: 'center' });
    doc.text(String(totalMissed), colMissedX + missedWidth / 2, y + 4.8, { align: 'center' });
    doc.text(overallPercentage.toFixed(2), colPctX + pctWidth / 2, y + 4.8, { align: 'center' });

    y += 10;

    // --- Bottom details summaries 2x2 grid card to match screenshot style ---
    ensureSpace(38);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(pdfTheme === 'portal' ? '#0F172A' : '#000000');
    
    let headingLabel = '';
    if (activeReportMode === 'monthly') {
      headingLabel = `Attendance Snapshot - ${activeReportRangeStr}`;
    } else if (activeReportMode === 'custom') {
      headingLabel = `Attendance Snapshot - ${activeReportRangeStr}`;
    } else {
      headingLabel = 'Attendance Snapshot';
    }
    doc.text(headingLabel.toUpperCase(), margin, y);
    y += 4;

    const gridHeight = 24;
    const gridWidth = contentWidth;
    const gridX = margin;
    const gridY = y;

    // Draw the main grid card border
    doc.setDrawColor(pdfTheme === 'portal' ? '#CBD5E1' : '#000000');
    doc.setLineWidth(0.35);
    doc.rect(gridX, gridY, gridWidth, gridHeight, 'D');

    // Vertical split line
    const midX = gridX + gridWidth / 2;
    doc.line(midX, gridY, midX, gridY + gridHeight);

    // Horizontal split line
    const midY = gridY + gridHeight / 2;
    doc.line(gridX, midY, gridX + gridWidth, midY);

    const padLeft = 6;
    const padLabelY = 4.2;
    const padValueY = 9.4;
    const rowHeight = gridHeight / 2;
    const halfWidth = gridWidth / 2;

    // Box 1: Top Left - Total Conducted Classes
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('TOTAL CONDUCTED CLASSES', gridX + padLeft, gridY + padLabelY);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#1E293B');
    doc.text('Conducted : ', gridX + padLeft, gridY + padValueY);
    const labelW1 = doc.getTextWidth('Conducted : ');
    doc.setTextColor('#2563EB'); // Blue-600
    doc.text(String(totalConducted), gridX + padLeft + labelW1, gridY + padValueY);

    // Box 2: Top Right - Total Attend Classes
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('TOTAL ATTEND CLASSES', midX + padLeft, gridY + padLabelY);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#1E293B');
    doc.text('Attended : ', midX + padLeft, gridY + padValueY);
    const labelW2 = doc.getTextWidth('Attended : ');
    doc.setTextColor('#16A34A'); // Emerald-600
    doc.text(String(totalAttended), midX + padLeft + labelW2, gridY + padValueY);

    // Box 3: Bottom Left - Total Missed Classes
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('TOTAL MISSED CLASSES', gridX + padLeft, midY + padLabelY);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#1E293B');
    doc.text('Missed : ', gridX + padLeft, midY + padValueY);
    const labelW3 = doc.getTextWidth('Missed : ');
    doc.setTextColor('#DC2626'); // Red-600
    doc.text(String(totalMissed), gridX + padLeft + labelW3, midY + padValueY);

    // Box 4: Bottom Right - Overall Attendance
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor('#64748B');
    doc.text('OVERALL ATTENDANCE %', midX + padLeft, midY + padLabelY);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#1E293B');
    doc.text('OA : ', midX + padLeft, midY + padValueY);
    const labelW4 = doc.getTextWidth('OA : ');
    const metPct = overallPercentage >= 75;
    doc.setTextColor(metPct ? '#16A34A' : '#DC2626'); // Emerald vs Red
    doc.text(`${overallPercentage.toFixed(2)}%`, midX + padLeft + labelW4, midY + padValueY);

    y += gridHeight + 6;

    // --- Bottom verification signature endorsement ---
    if (pdfShowSignatures) {
      ensureSpace(35);
      y += 12;

      const sigY = y + 15;
      const lineLength = pdfOrientation === 'portrait' ? 44 : 54;
      const gap = (contentWidth - 3 * lineLength) / 2;

      const sig1X = margin;
      const sig2X = margin + lineLength + gap;
      const sig3X = pageWidth - margin - lineLength;

      doc.setDrawColor(pdfTheme === 'portal' ? '#94A3B8' : '#000000');
      doc.setLineWidth(0.25);

      doc.line(sig1X, sigY, sig1X + lineLength, sigY);
      doc.line(sig2X, sigY, sig2X + lineLength, sigY);
      doc.line(sig3X, sigY, sig3X + lineLength, sigY);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(pdfTheme === 'portal' ? '#475569' : '#000000');

      doc.text("Student's Signature", sig1X + lineLength / 2, sigY + 4.5, { align: 'center' });
      doc.text("Class Coordinator", sig2X + lineLength / 2, sigY + 4.5, { align: 'center' });
      doc.text("HOD / Academic Registrar Officio", sig3X + lineLength / 2, sigY + 4.5, { align: 'center' });
    }

    doc.save(`KSRM_Attendance_Report_${activeReportMode}_${pdfOrientation}.pdf`);
    triggerFeedback(`PDF Attendance Report (${pdfOrientation.toUpperCase()}) downloaded! 📄`);
  };

  // Clipboard copy functions
  const triggerShareReportTable = () => {
    if (filteredRows.length === 0) {
      alert('No data to share.');
      return;
    }
    let tableStr = `📊 *ERP SUBJECT-WISE ATTENDANCE REPORT* 📊\n`;
    tableStr += `Range: ${activeReportRangeStr}\n`;
    tableStr += `----------------------------------------------\n`;
    tableStr += `Subject | Conducted | Attended | Missed | Percentage\n`;
    tableStr += `----------------------------------------------\n`;
    sortedRows.forEach(r => {
      tableStr += `${r.subjectName} (${r.subjectCode}) | ${r.conducted} | ${r.attended} | ${r.missed} | ${r.pct.toFixed(2)}%\n`;
    });
    tableStr += `----------------------------------------------\n`;
    tableStr += `Total Conducted: ${totalConducted}\n`;
    tableStr += `Total Attended: ${totalAttended}\n`;
    tableStr += `Total Missed: ${totalMissed}\n`;
    tableStr += `Overall Attendance: ${overallPercentage.toFixed(2)}%\n`;

    navigator.clipboard.writeText(tableStr);
    triggerFeedback('ERP Summary Table copied to clipboard! 📋');
  };

  const triggerShareSummaryOnly = () => {
    const summaryStr = `📚 *Attendance Records Brief Summary* 📚\n\n*Period Range*: ${activeReportRangeStr}\n*Conducted Hours*: ${totalConducted} hrs\n*Attended Hours*: ${totalAttended} hrs\n*Missed Hours*: ${totalMissed} hrs\n*Overall Attendance*: *${overallPercentage.toFixed(2)}%*`;
    navigator.clipboard.writeText(summaryStr);
    triggerFeedback('Attendance brief copied to clipboard! 🚀');
  };

  return (
    <div className="space-y-6">
      
      {/* ERP Select Form Wrapper */}
      <div className="bg-[#0D1117] border border-white/5 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
        
        {/* Step 1: Select Mode */}
        <div className="space-y-2">
          <label className="text-[11px] font-mono uppercase text-slate-400 font-bold block">
            Step 1: Select Assessment Report Mode
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[
              { id: 'monthly', title: 'Monthly Mode', desc: 'Select specific month' },
              { id: 'custom', title: 'Custom Date Range', desc: 'Define arbitrary boundary' },
              { id: 'till_now', title: 'Till Now Mode', desc: 'Total history evaluation' }
            ].map(col => (
              <button
                key={col.id}
                onClick={() => setReportMode(col.id as any)}
                className={`p-3.5 text-left rounded-xl border text-xs transition relative flex flex-col justify-between cursor-pointer ${
                  reportMode === col.id
                    ? 'bg-blue-600/10 border-blue-500 text-white shadow-md shadow-blue-600/5'
                    : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/5 text-slate-350'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold">{col.title}</span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    reportMode === col.id ? 'border-blue-400 bg-blue-500' : 'border-slate-600'
                  }`}>
                    {reportMode === col.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <span className="text-[10px] text-slate-450 mt-1.5 block">
                  {col.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Filters Config */}
        <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4.5 space-y-4">
          <label className="text-[11px] font-mono uppercase text-slate-400 font-semibold block">
            Step 2: Configure Constraints & Filters
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Conditional Dropdowns based on Mode selection */}
            {reportMode === 'monthly' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-450 block">Selected Month:</span>
                  <div className="relative">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-[#161B22] border border-white/5 rounded-lg p-2.5 text-xs text-white appearance-none outline-none focus:border-blue-500 cursor-pointer font-medium"
                    >
                      {[
                        { val: '01', l: 'January' },
                        { val: '02', l: 'February' },
                        { val: '03', l: 'March' },
                        { val: '04', l: 'April' },
                        { val: '05', l: 'May' },
                        { val: '06', l: 'June' },
                        { val: '07', l: 'July' },
                        { val: '08', l: 'August' },
                        { val: '09', l: 'September' },
                        { val: '10', l: 'October' },
                        { val: '11', l: 'November' },
                        { val: '12', l: 'December' }
                      ].map(mo => (
                        <option key={mo.val} value={mo.val}>{mo.l}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-450 block">Selected Year:</span>
                  <div className="relative">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full bg-[#161B22] border border-white/5 rounded-lg p-2.5 text-xs text-white appearance-none outline-none focus:border-blue-500 cursor-pointer font-medium"
                    >
                      {['2025', '2026', '2027'].map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>
            )}

            {reportMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-450 block">From Date:</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full bg-[#161B22] border border-white/5 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-450 block">To Date:</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full bg-[#161B22] border border-white/5 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer font-mono"
                  />
                </div>
              </div>
            )}

            {reportMode === 'till_now' && (
              <div className="flex items-center bg-[#161B22]/50 border border-white/[0.03] rounded-lg p-3 text-xs text-slate-400">
                <Activity className="h-4.5 w-4.5 text-blue-400 animate-pulse mr-2.5 shrink-0" />
                <span>
                  Evaluates history starting from your oldest logged record to today: <strong>{formatRecordsDate(currentDate)}</strong>. No input parameters needed.
                </span>
              </div>
            )}

            {/* Checkbox tool to filter inactive subjects */}
            <div className="flex items-center md:pl-4">
              <label 
                className="flex items-center space-x-3 text-xs text-slate-350 cursor-pointer select-none group w-full"
                onClick={() => setExcludeInactive(!excludeInactive)}
              >
                <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition shrink-0 ${
                  excludeInactive ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-650 bg-transparent group-hover:border-slate-500'
                }`}>
                  {excludeInactive && <Check className="h-3 w-3" />}
                </div>
                <div>
                  <span className="font-bold text-slate-200 group-hover:text-blue-400 transition block">
                    Exclude Inactive Subjects
                  </span>
                  <p className="text-[10px] text-slate-500 font-medium">Hide subjects with 0 conducted classes in chronological scope</p>
                </div>
              </label>
            </div>

          </div>
        </div>

        {/* Step 3: Trigger Button */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <p className="text-[10px] text-slate-450 font-mono">
            * Selected Period: {reportMode.toUpperCase()} | Excluding Inactives: {excludeInactive ? 'YES' : 'NO'}
          </p>
          <button
            onClick={() => generateReport(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/10 flex items-center space-x-1.5 cursor-pointer"
          >
            <span>Show Report</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>

      {shareFeedback && (
        <div className="p-3 bg-[#161B22] border border-blue-500/20 text-blue-350 rounded-xl text-xs font-mono flex items-center space-x-2 shadow-lg animate-fade-in print:hidden">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{shareFeedback}</span>
        </div>
      )}

      {/* Grid Results View */}
      {reportGenerated && (
        <div className="bg-[#0D1117] border border-white/5 rounded-2xl p-5 md:p-6 shadow-xl space-y-5">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <p className="text-[9px] font-mono text-blue-400 font-black tracking-widest uppercase">
                ACADEMIC ERP LEDGER SUMMARY
              </p>
              <h4 className="text-sm font-extrabold text-white mt-1">
                Subject-Wise Attendance Report: <span className="text-blue-300 font-mono">{activeReportRangeStr}</span>
              </h4>
            </div>

            {/* Toggle switch for Print layout & Exports */}
            <div className="flex items-center flex-wrap gap-2.5 print:hidden">
              
              {/* Google Docs style Print layout switch */}
              <button
                type="button"
                onClick={() => setIsPrintLayout(prev => !prev)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-2.5 cursor-pointer transition ${
                  isPrintLayout 
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-200' 
                    : 'bg-[#161B22] border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {/* Switch indicator */}
                <span className="relative flex h-3 w-6 items-center rounded-full bg-slate-700 transition">
                  <span className={`h-2 w-2 rounded-full bg-white transition-all ${isPrintLayout ? 'translate-x-3 bg-blue-400' : 'translate-x-1'}`} />
                </span>
                <span>Print layout</span>
              </button>

              <div className="h-5 w-[1px] bg-white/5 hidden sm:block mx-1" />

              <button
                onClick={handleExportPDF}
                className="px-2.5 py-1.5 bg-[#161B22] hover:bg-slate-800 text-slate-300 border border-white/5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                title="Download Beautiful PDF Report"
              >
                <FileText className="h-3.5 w-3.5 text-blue-400" />
                <span>PDF Ledger</span>
              </button>

              <button
                onClick={triggerExportExcel}
                className="px-2.5 py-1.5 bg-[#161B22] hover:bg-slate-800 text-slate-300 border border-white/5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                title="Export Excel Sheet"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                <span>Excel</span>
              </button>

              <button
                onClick={triggerExportCSV}
                className="px-2.5 py-1.5 bg-[#161B22] hover:bg-slate-800 text-slate-300 border border-white/5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                title="Download CSV spreadsheet"
              >
                <Download className="h-3.5 w-3.5 text-amber-500" />
                <span>CSV</span>
              </button>

              <div className="h-5 w-[1px] bg-white/5 mx-1" />

              <div className="relative group">
                <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer">
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share Report</span>
                </button>
                <div className="absolute right-0 top-full mt-1 bg-slate-900 border border-white/10 rounded-xl p-1.5 shadow-2xl hidden group-hover:block z-50 w-44">
                  <button
                    onClick={triggerShareReportTable}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-white/5 text-[11px] text-slate-200 font-bold transition rounded-lg"
                  >
                    📋 Attendance Report
                  </button>
                  <button
                    onClick={triggerShareSummaryOnly}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-white/5 text-[11px] text-slate-200 font-bold transition rounded-lg"
                  >
                    📊 Attendance Summary
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area (Printers Document Preview vs Default Interactive Table List) */}
          {sortedRows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 italic font-mono text-xs">
              No attendance history matches this range constraints. Select other parameters.
            </div>
          ) : isPrintLayout ? (
            /* PRINT LAYOUT: High-fidelity A4 document mockup depicting the exact print outcomes */
            <div className="bg-[#15191E] border border-white/5 rounded-xl p-1.5 sm:p-3 md:p-6 flex justify-center overflow-x-auto print:bg-white print:border-none print:p-0">
              <div className="w-full max-w-[760px] bg-white text-slate-900 shadow-2xl rounded-sm p-3.5 xs:p-6 sm:p-11 border border-slate-300 font-sans relative print:shadow-none print:border-none print:p-0" id="print-layout-doc">
                
                {/* Visual Accent */}
                <div className="absolute top-4 right-4 text-[9px] font-mono font-bold tracking-wider text-slate-400 uppercase border border-slate-200 rounded px-1.5 py-0.5 print:hidden select-none">
                  Document Preview
                </div>

                {/* College Registry Letterhead Banner */}
                <div className="text-center space-y-1 pb-4.5 border-b-2 border-slate-900">
                  <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 uppercase tracking-tight">
                    {userProfile.collegeName || 'KSRM COLLEGE OF ENGINEERING'}
                  </h3>
                  <p className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wide uppercase">
                    (AUTONOMOUS) • KADAPA, ANDHRA PRADESH - 516003
                  </p>
                  <p className="text-[8px] sm:text-[9px] text-slate-400 uppercase font-mono italic tracking-normal">
                    Approved by AICTE • Affiliated to JNTUA • Certified ISO 9001:2015
                  </p>
                </div>

                {/* Official Statement Document Title */}
                <div className="text-center my-6 space-y-1.5">
                  <span className="text-[10.5px] font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-black tracking-widest uppercase">
                    OFFICIAL STUDENT ATTENDANCE STATEMENT
                  </span>
                  <p className="text-[11px] font-bold text-blue-600 font-mono">
                    Evaluation Period: {activeReportRangeStr}
                  </p>
                </div>

                {/* Student Credentials List: Compact layout, line-by-line vertically, perfectly aligned colons */}
                <div className="border border-slate-205 bg-slate-50/50 rounded-lg p-3 sm:p-3.5 mb-6 font-mono text-[9.5px] sm:text-[10.5px] max-w-[440px] mx-auto space-y-1.5 w-full">
                  <div className="flex items-start">
                    <span className="w-20 sm:w-24 font-bold text-slate-800 shrink-0 uppercase tracking-tight">Student Name</span>
                    <span className="mr-2 sm:mr-3 font-bold text-slate-900 shrink-0">:</span>
                    <span className="font-extrabold text-slate-900 uppercase break-words whitespace-normal flex-1">{userProfile.name}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="w-20 sm:w-24 font-bold text-slate-800 shrink-0 uppercase tracking-tight">Roll No</span>
                    <span className="mr-2 sm:mr-3 font-bold text-slate-900 shrink-0">:</span>
                    <span className="font-bold text-slate-900 uppercase break-words whitespace-normal flex-1">{userProfile.rollNo || 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="w-20 sm:w-24 font-bold text-slate-800 shrink-0 uppercase tracking-tight">Semester</span>
                    <span className="mr-2 sm:mr-3 font-bold text-slate-900 shrink-0">:</span>
                    <span className="font-semibold text-slate-900 break-words whitespace-normal flex-1">{userProfile.semester || 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="w-20 sm:w-24 font-bold text-slate-800 shrink-0 uppercase tracking-tight">Branch</span>
                    <span className="mr-2 sm:mr-3 font-bold text-slate-900 shrink-0">:</span>
                    <span className="font-semibold text-slate-900 uppercase break-words whitespace-normal flex-1">{userProfile.branch || 'Information Technology'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="w-20 sm:w-24 font-bold text-slate-800 shrink-0 uppercase tracking-tight">Degree</span>
                    <span className="mr-2 sm:mr-3 font-bold text-slate-900 shrink-0">:</span>
                    <span className="font-semibold text-slate-900 break-words whitespace-normal flex-1">{userProfile.degree}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="w-20 sm:w-24 font-bold text-slate-800 shrink-0 uppercase tracking-tight">Email Address</span>
                    <span className="mr-2 sm:mr-3 font-bold text-slate-900 shrink-0">:</span>
                    <span className="text-slate-800 font-medium break-all whitespace-normal select-all flex-1">{userProfile.email || 'N/A'}</span>
                  </div>
                </div>

                {/* Print layout main table */}
                <div className="overflow-x-auto -mx-3.5 sm:mx-0 border border-slate-200 sm:border-none rounded-lg">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className="bg-slate-100 text-slate-705 font-bold border border-slate-350">
                        <th className="p-1.5 sm:p-2.5 border border-slate-300 text-center w-8 sm:w-12 font-bold select-none text-[9px] sm:text-[11px] uppercase">Sl.No.</th>
                        <th className="p-1.5 sm:p-2.5 border border-slate-300 font-bold text-[9px] sm:text-[11px] uppercase">Subjects</th>
                        <th className="p-1.5 sm:p-2.5 border border-slate-300 text-center w-12 sm:w-16 font-bold text-[9px] sm:text-[11px] uppercase">Held</th>
                        <th className="p-1.5 sm:p-2.5 border border-slate-300 text-center w-12 sm:w-16 font-bold text-[9px] sm:text-[11px] uppercase">Attend</th>
                        <th className="p-1.5 sm:p-2.5 border border-slate-300 text-center w-12 sm:w-16 font-bold text-[9px] sm:text-[11px] uppercase">Missed</th>
                        <th className="p-1.5 sm:p-2.5 border border-slate-300 text-center w-16 sm:w-20 font-bold text-[9px] sm:text-[11px] uppercase">Att. %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-250">
                      {sortedRows.map((row, index) => {
                        const isCondonation = row.pct < 75 && row.conducted > 0;
                        return (
                          <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono font-medium text-slate-600 text-[10px] sm:text-xs">
                              {index + 1}
                            </td>
                            <td className="p-1.5 sm:p-2.5 border border-slate-300">
                              <span className="font-mono font-bold text-slate-800 text-[10.5px] sm:text-xs uppercase tracking-wide">
                                {row.subjectCode}
                              </span>
                            </td>
                            <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-slate-700 text-[10px] sm:text-xs">
                              {row.conducted}
                            </td>
                            <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-emerald-700 font-bold text-[10px] sm:text-xs">
                              {row.attended}
                            </td>
                            <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-red-600 font-semibold text-[10px] sm:text-xs">
                              {row.missed}
                            </td>
                            <td className={`p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono font-black text-[10px] sm:text-xs ${
                              isCondonation ? 'text-red-650 bg-red-50/10 font-bold' : 'text-emerald-750'
                            }`}>
                              {row.pct.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                      {/* TABLE CUMULATIVE STATS FOOTER */}
                      <tr className="bg-slate-50 font-bold border-2 border-slate-350">
                        <td colSpan={2} className="p-1.5 sm:p-2.5 border border-slate-300 text-right text-slate-800 pr-2 sm:pr-4 uppercase font-bold text-[8.5px] sm:text-[10px] tracking-wide">
                          <span className="hidden sm:inline">Cumulative </span>Total
                        </td>
                        <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-slate-900 font-black text-[10px] sm:text-xs">
                          {totalConducted}
                        </td>
                        <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-emerald-800 font-black text-[10px] sm:text-xs">
                          {totalAttended}
                        </td>
                        <td className="p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-red-700 font-bold text-[10px] sm:text-xs">
                          {totalMissed}
                        </td>
                        <td className={`p-1.5 sm:p-2.5 border border-slate-300 text-center font-mono text-[10px] sm:text-xs font-black ${
                          overallPercentage >= 75 ? 'text-emerald-800' : 'text-red-705 bg-red-50/10'
                        }`}>
                          {overallPercentage.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ATTENDANCE SNAPSHOT: Styled as a 2x2 grid card matching the requested screenshot format */}
                <div className="mt-8 border border-slate-300 bg-slate-50/50 p-3 sm:p-4 rounded-lg text-slate-900">
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-tight text-[10px] sm:text-[11px] mb-3 pb-2 border-b border-slate-300 text-center">
                    {activeReportMode === 'monthly' 
                      ? `ATTENDANCE SNAPSHOT - ${activeReportRangeStr.toUpperCase()}`
                      : activeReportMode === 'custom'
                      ? `ATTENDANCE SNAPSHOT - ${activeReportRangeStr.toUpperCase()}`
                      : 'ATTENDANCE SNAPSHOT'}
                  </h4>

                  <div className="grid grid-cols-2 text-center relative font-mono text-[9px] sm:text-[11.5px] max-w-[500px] mx-auto py-1">
                    {/* Vertical divider line */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-slate-250 -translate-x-1/2"></div>
                    {/* Horizontal divider line */}
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-slate-250 -translate-y-1/2"></div>

                    {/* Top Left: Total Conducted Classes */}
                    <div className="pb-3 pr-2 flex flex-col items-center justify-center min-h-[42px] sm:min-h-[46px]">
                      <span className="text-[7.5px] min-[360px]:text-[8.5px] sm:text-[9.5px] text-slate-500 font-extrabold tracking-wider uppercase text-center block max-w-full truncate" title="CONDUCTED CLASSES">CONDUCTED CLASSES</span>
                      <span className="text-[9.5px] min-[360px]:text-[11px] sm:text-[13px] font-bold text-slate-800 mt-1 whitespace-nowrap">Conducted: <span className="text-blue-600 font-black">{totalConducted}</span></span>
                    </div>

                    {/* Top Right: Total Attend Classes */}
                    <div className="pb-3 pl-2 flex flex-col items-center justify-center min-h-[42px] sm:min-h-[46px]">
                      <span className="text-[7.5px] min-[360px]:text-[8.5px] sm:text-[9.5px] text-slate-500 font-extrabold tracking-wider uppercase text-center block max-w-full truncate" title="ATTENDED CLASSES">ATTENDED CLASSES</span>
                      <span className="text-[9.5px] min-[360px]:text-[11px] sm:text-[13px] font-bold text-slate-800 mt-1 whitespace-nowrap">Attended: <span className="text-emerald-600 font-black">{totalAttended}</span></span>
                    </div>

                    {/* Bottom Left: Total Missed Classes */}
                    <div className="pt-3 pr-2 flex flex-col items-center justify-center min-h-[42px] sm:min-h-[46px]">
                      <span className="text-[7.5px] min-[360px]:text-[8.5px] sm:text-[9.5px] text-slate-500 font-extrabold tracking-wider uppercase text-center block max-w-full truncate" title="MISSED CLASSES">MISSED CLASSES</span>
                      <span className="text-[9.5px] min-[360px]:text-[11px] sm:text-[13px] font-bold text-slate-800 mt-1 whitespace-nowrap">Missed: <span className="text-red-500 font-black">{totalMissed}</span></span>
                    </div>

                    {/* Bottom Right: Overall Attendance */}
                    <div className="pt-3 pl-2 flex flex-col items-center justify-center min-h-[42px] sm:min-h-[46px]">
                      <span className="text-[7.5px] min-[360px]:text-[8.5px] sm:text-[9.5px] text-slate-500 font-extrabold tracking-wider uppercase text-center block max-w-full truncate" title="OVERALL ATTENDANCE %">OVERALL ATTENDANCE %</span>
                      <span className="text-[9.5px] min-[360px]:text-[11px] sm:text-[13px] font-bold text-slate-800 mt-1 whitespace-nowrap">OA: <span className={overallPercentage >= 75 ? "text-emerald-600 font-black" : "text-red-500 font-black"}>{overallPercentage.toFixed(2)}%</span></span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            /* DEFAULT VIEW: Interactive Black Slate Portal Table List */
            <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#161B22]/10 scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-[#161B22]/80 text-slate-400 font-mono text-[10px] uppercase tracking-wider border-b border-white/5">
                    
                    <th 
                      onClick={() => handleSort('subject')}
                      className="p-3.5 select-none hover:text-white cursor-pointer group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Subject</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('conducted')}
                      className="p-3.5 select-none hover:text-white cursor-pointer group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Conducted</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('attended')}
                      className="p-3.5 select-none hover:text-white cursor-pointer group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Attended</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('missed')}
                      className="p-3.5 select-none hover:text-white cursor-pointer group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Missed</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('pct')}
                      className="p-3.5 select-none hover:text-white cursor-pointer group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Attendance %</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition" />
                      </div>
                    </th>

                    <th className="p-3.5 text-right font-mono text-[10px] uppercase tracking-wider print:hidden w-28">
                      Actions
                    </th>

                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-xs text-slate-200">
                  {sortedRows.map((row, i) => {
                    const isEditing = editingRowCode === row.subjectCode;

                    return (
                      <tr key={i} className={`transition-all ${isEditing ? 'bg-blue-600/[0.03] hover:bg-blue-600/[0.04]' : 'hover:bg-white/[0.01]'}`}>
                        
                        <td className="p-3.5 font-sans whitespace-nowrap">
                          <span className="font-bold font-mono text-blue-400 text-[10px] bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 mr-2.5">
                            {row.subjectCode}
                          </span>
                          <span className="text-slate-200 font-medium">{row.subjectName}</span>
                        </td>

                        {isEditing ? (
                          <>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={editConducted}
                                onChange={(e) => setEditConducted(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-16 bg-slate-900 text-white font-mono text-xs font-bold px-2 py-1 border border-blue-500/40 rounded focus:border-blue-500 outline-none animate-pulse"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={editAttended}
                                onChange={(e) => setEditAttended(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-16 bg-slate-900 text-emerald-400 font-mono text-xs font-bold px-2 py-1 border border-blue-500/40 rounded focus:border-blue-500 outline-none animate-pulse"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={editMissed}
                                onChange={(e) => setEditMissed(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-16 bg-slate-900 text-red-500 font-mono text-xs font-bold px-2 py-1 border border-blue-500/40 rounded focus:border-blue-500 outline-none animate-pulse"
                              />
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-amber-400 text-xs text-left block">
                                {(editConducted > 0 ? (editAttended / editConducted) * 100 : 0.00).toFixed(2)}%
                              </span>
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap print:hidden">
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  onClick={() => handleSaveEdit(row.subjectCode)}
                                  className="bg-emerald-605 bg-emerald-605 text-white font-black text-[10px] px-2.5 py-1 rounded inline-flex items-center space-x-1 cursor-pointer transition font-mono uppercase bg-emerald-700 hover:bg-emerald-600"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold text-[10px] px-2.5 py-1 rounded inline-flex items-center space-x-1 cursor-pointer transition font-mono uppercase"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3.5 text-slate-300 font-bold">
                              {row.conducted}
                            </td>
                            <td className="p-3.5 text-emerald-400 font-bold">
                              {row.attended}
                            </td>
                            <td className="p-3.5 text-red-500 font-semibold">
                              {row.missed}
                            </td>
                            <td className="p-3.5">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-12 h-1.5 rounded bg-white/5 overflow-hidden block shrink-0">
                                  <div 
                                    className={`h-full transition-all ${
                                      row.pct >= 75 ? 'bg-emerald-500' : 'bg-red-500'
                                    }`} 
                                    style={{ width: `${Math.min(row.pct, 100)}%` }} 
                                  />
                                </div>
                                <span className={`font-bold ${row.pct >= 75 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {row.pct.toFixed(2)}%
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap print:hidden">
                              <button
                                onClick={() => handleStartEdit(row)}
                                className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 font-bold text-[10px] px-2.5 py-1 rounded inline-flex items-center space-x-1 border border-blue-500/20 cursor-pointer transition font-mono uppercase"
                              >
                                  Edit
                              </button>
                            </td>
                          </>
                        )}

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub Totals Footer (Only rendered when not in print layout to avoid redundency since print layout embeds the summary) */}
          {sortedRows.length > 0 && !isPrintLayout && (
            <div className="bg-[#161B22]/60 border border-white/5 rounded-xl p-4.5 mt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                    Total Conducted
                  </span>
                  <p className="font-sans font-extrabold text-[#E2E8F0] text-sm tracking-tight">
                    Conducted: <span className="font-mono text-base font-black text-blue-300">{totalConducted}</span>
                  </p>
                </div>

                <div className="space-y-0.5 border-l border-white/5">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                    Total Attended
                  </span>
                  <p className="font-sans font-extrabold text-emerald-400 text-sm tracking-tight">
                    Attended: <span className="font-mono text-base font-black">{totalAttended}</span>
                  </p>
                </div>

                <div className="space-y-0.5 border-l border-white/5">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                    Total Missed
                  </span>
                  <p className="font-sans font-extrabold text-red-400 text-sm tracking-tight">
                    Missed: <span className="font-mono text-base font-black">{totalMissed}</span>
                  </p>
                </div>

                <div className="space-y-0.5 border-l border-white/5">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                    Overall Attendance %
                  </span>
                  <p className={`font-sans font-extrabold text-sm tracking-tight ${
                    overallPercentage >= 75 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    Overall Attendance: <span className="font-mono text-base font-black">{overallPercentage.toFixed(2)}%</span>
                  </p>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
