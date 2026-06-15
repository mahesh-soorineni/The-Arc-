/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileText,
  Download,
  Share2,
  Calendar,
  CheckCircle,
  Copy,
  Printer,
  ChevronDown,
  ExternalLink
} from 'lucide-react';
import { AttendanceRecord, Subject, UserProfile, Timetable } from '../types';
import { jsPDF } from 'jspdf';
import { calculateAnalytics, calculateRecoveryRequired } from '../utils/rulesEngine';

interface ExportShareHandlerProps {
  records: AttendanceRecord[];
  subjects: Subject[];
  userProfile: UserProfile;
  timetables: Timetable[];
  currentDate: string;
}

export default function ExportShareHandler({
  records,
  subjects,
  userProfile,
  timetables,
  currentDate
}: ExportShareHandlerProps) {
  const [rangeType, setRangeType] = useState<'All' | 'CurrentMonth' | 'SelectedWeek'>('All');
  const [selectedDateRange, setSelectedDateRange] = useState({
    start: '2026-05-01',
    end: '2026-06-12'
  });

  const [shareFeedback, setShareFeedback] = useState<string>('');

  const getSimulatedMonthLabel = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const parts = currentDate.split('-');
    if (parts.length === 3) {
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `Current Month (${months[monthIdx]} ${year})`;
      }
    }
    return 'Current Month';
  };

  // 1. Resolve filtered records based on choice
  const getFilteredRecords = () => {
    return records.filter(r => {
      // Ignore future simulation records
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

  // 2. CSV / Excel generator download
  const handleExportCSV = () => {
    const list = getFilteredRecords();
    if (list.length === 0) {
      alert('No record found in selected range to export.');
      return;
    }

    const csvHeaders = ['Date', 'Day', 'Day Type', 'Scheduled Hours', 'Attended Hours', 'Missed Classes/Codes', 'Notes'];
    const csvRows = list.map(r => [
      r.date,
      r.dayOfWeek,
      r.dayType,
      r.scheduledHours,
      r.attendedHours,
      r.missedClasses.join('; '),
      r.notes || ''
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `The_Arc_Attendance_Report_${rangeType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Print friendly layout trigger (standard browser PDF)
  const handleTriggerPrintPDF = () => {
    window.print();
  };

  // 3.5 Direct PDF Gen with beautiful layout branding
  const handleExportPDF = () => {
    const list = getFilteredRecords();
    if (list.length === 0) {
      alert('No records found in the selected range to export.');
      return;
    }

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

    const drawDivider = (yPos: number, height: number = 0.4, color: number[] = [226, 232, 240]) => {
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(height);
      doc.line(margin, yPos, pageWidth - margin, yPos);
    };

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - 20) {
        doc.addPage();
        y = 15;
        // Running Header on subsequent pages
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(`ACADEMIC REGISTRY STATEMENT | Name: ${userProfile.name} | Roll No: ${userProfile.rollNo || 'N/A'}`, margin, y);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, y, { align: 'right' });
        y += 5;
        drawDivider(y, 0.25, [226, 232, 240]);
        y += 10;
      }
    };

    // 1. TOP INSTITUTIONAL BRANDING HEADER
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // slate-900 (Rich Navy)
    const collegeTitle = (userProfile.collegeName || 'K.S.R.M. College of Engineering').toUpperCase();
    doc.text(collegeTitle, margin, y);
    y += 5.5;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('(UGC-AUTONOMOUS) • COLLEGE CODE: KSRM', margin, y);
    y += 4;
    
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Approved by AICTE, New Delhi & Affiliated to JNTUA, Anantapuramu', margin, y);
    y += 6;

    // Double Administrative Lines
    drawDivider(y, 1.0, [15, 23, 42]); // Thick Slate line
    drawDivider(y + 1.2, 0.4, [217, 119, 6]); // Thin Gold line
    y += 8;

    // Document Title Banner
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('ACADEMIC REGISTRY RECORD & ATTENDANCE STATEMENT', margin, y);
    y += 4.5;
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115); // gray-500
    doc.text('OFFICIAL VERIFIED LEDGER OF ATTENDANCE COMPLIANCE', margin, y);
    y += 8;

    // 2. STUDENT IDENTITY PASSPORT MATRIX (Boxed Grid Panel)
    checkPageBreak(50);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text('I. STUDENT REGISTRY PROFILE', margin, y);
    y += 5;

    // Draw shaded background box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.35);
    doc.rect(margin, y, contentWidth, 38, 'FD');

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);

    const colWidth = contentWidth / 2;
    const xCol1 = margin + 5;
    const xCol2 = margin + colWidth + 5;

    const todayLabel = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Col 1 Particulars
    doc.setFont('Helvetica', 'bold'); doc.text('Student Full Name:', xCol1, y + 6); doc.setFont('Helvetica', 'normal'); doc.text(userProfile.name, xCol1 + 28, y + 6);
    doc.setFont('Helvetica', 'bold'); doc.text('Roll / Register No:', xCol1, y + 13); doc.setFont('Helvetica', 'normal'); doc.text(userProfile.rollNo || 'N/A', xCol1 + 28, y + 13);
    doc.setFont('Helvetica', 'bold'); doc.text('Program Degree:', xCol1, y + 20); doc.setFont('Helvetica', 'normal'); doc.text(userProfile.degree, xCol1 + 28, y + 20);
    doc.setFont('Helvetica', 'bold'); doc.text('Academic Branch:', xCol1, y + 27); doc.setFont('Helvetica', 'normal'); doc.text(userProfile.branch || 'N/A', xCol1 + 28, y + 27);
    doc.setFont('Helvetica', 'bold'); doc.text('Active Semester:', xCol1, y + 34); doc.setFont('Helvetica', 'normal'); doc.text(userProfile.semester || 'N/A', xCol1 + 28, y + 34);

    // Col 2 Particulars
    doc.setFont('Helvetica', 'bold'); doc.text('Official Email:', xCol2, y + 6); doc.setFont('Helvetica', 'normal'); doc.text(userProfile.email || 'N/A', xCol2 + 34, y + 6);
    doc.setFont('Helvetica', 'bold'); doc.text('Min Target Required:', xCol2, y + 13); doc.setFont('Helvetica', 'normal'); doc.text(`${userProfile.minAttendance}% minimum attendance`, xCol2 + 34, y + 13);
    doc.setFont('Helvetica', 'bold'); doc.text('Registry System ID:', xCol2, y + 20); doc.setFont('Helvetica', 'normal'); doc.text(`ARC-${userProfile.rollNo || 'REG'}`, xCol2 + 34, y + 20);
    doc.setFont('Helvetica', 'bold'); doc.text('Statement Period:', xCol2, y + 27); doc.setFont('Helvetica', 'normal'); doc.text(`${rangeType === 'All' ? 'Full Session (May-June 2026)' : rangeType === 'CurrentMonth' ? 'June 2026 logs' : 'Custom range period'}`, xCol2 + 34, y + 27);
    doc.setFont('Helvetica', 'bold'); doc.text('Record Timestamp:', xCol2, y + 34); doc.setFont('Helvetica', 'normal'); doc.text(todayLabel, xCol2 + 34, y + 34);

    y += 38 + 10;

    // 3. OVERALL CUMULATIVE REGISTRY ANALYTICS PANEL
    const totalScheduled = list.reduce((sum, r) => sum + r.scheduledHours, 0);
    const totalAttended = list.reduce((sum, r) => sum + r.attendedHours, 0);
    const overallPctVal = totalScheduled > 0 ? (totalAttended / totalScheduled) * 100 : 100;
    const overallPct = overallPctVal.toFixed(1);
    
    const compliancePassed = overallPctVal >= userProfile.minAttendance;
    const statusText = compliancePassed ? `PASSED (>= ${userProfile.minAttendance}%)` : `SHORTAGE (< ${userProfile.minAttendance}%)`;
    const statusColor = compliancePassed ? [5, 150, 105] : [220, 38, 38]; // Emerald vs Red
    const statusBg = compliancePassed ? [236, 253, 245] : [254, 242, 242]; // Green/Red light tint

    checkPageBreak(35);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('II. CUMULATIVE REGISTRY PERFORMANCE REPORT', margin, y);
    y += 5;

    const cardWidth = (contentWidth - 10) / 3;

    // Card 1: Hours ratio
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(margin, y, cardWidth, 20, 'FD');
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text('TOTAL TRACKED RATIO', margin + 4, y + 5);
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(15, 23, 42);
    doc.text(`${totalAttended} / ${totalScheduled} Hrs`, margin + 4, y + 13.5);

    // Card 2: Cumulative Avg Strength
    const c2X = margin + cardWidth + 5;
    doc.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
    doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.rect(c2X, y, cardWidth, 20, 'FD');
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.text('CUMULATIVE STRENGTH', c2X + 4, y + 5);
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(13.5);
    doc.text(`${overallPct}%`, c2X + 4, y + 13.5);

    // Card 3: Compliance indicator & Total Bunk Left info
    const c3X = margin + 2 * cardWidth + 10;
    doc.setFillColor(240, 249, 255); // sky-50 tint
    doc.setDrawColor(2, 132, 199); // sky-600 border
    doc.rect(c3X, y, cardWidth, 20, 'FD');
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(3, 105, 161);
    doc.text('REGISTRY INDICATOR', c3X + 4, y + 5);
    
    // safe bunk limit calculation
    const coef = userProfile.minAttendance / 100;
    let safeBunks = 0;
    if (overallPctVal >= userProfile.minAttendance && totalScheduled > 0) {
      safeBunks = Math.floor(totalAttended / coef - totalScheduled);
      if (safeBunks < 0) safeBunks = 0;
    }

    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.text(statusText, c3X + 4, y + 11.5);
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
    doc.text(overallPctVal >= userProfile.minAttendance ? `Safe Bunk: +${safeBunks} hrs total` : `Needs +${calculateRecoveryRequired(totalAttended, totalScheduled, userProfile.minAttendance)} hrs recovery`, c3X + 4, y + 16.5);

    y += 20 + 10;

    // 4. SUBJECT-WISE AUDIT REPORT MATRIX (gorgeous progress gauges + safe bunk rows)
    if (timetables && timetables.length > 0) {
      const analytics = calculateAnalytics(list, subjects, timetables, userProfile.minAttendance);
      const activeSubjects = Object.values(analytics.subjectWise).filter(s => s.total > 0);

      if (activeSubjects.length > 0) {
        checkPageBreak(activeSubjects.length * 9.5 + 20);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text('III. SUBJECT-LEVEL COMPLIANCE MATRIX', margin, y);
        y += 5;

        // Draw headers background block
        doc.setFillColor(30, 41, 59); // slate-800 Primary Navy
        doc.rect(margin, y, contentWidth, 7.5, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255); // White

        doc.text('CODE', margin + 3, y + 5);
        doc.text('SUBJECT NAME & CLASSIFICATION', margin + 18, y + 5);
        doc.text('TIMING RATIO', margin + 80, y + 5);
        doc.text('STRENGTH', margin + 108, y + 5);
        doc.text('ATTENDANCE PROGRESS GAUGE', margin + 124, y + 5);
        doc.text('ACTION / BUNK INDICATOR', margin + 148, y + 5);
        y += 7.5;

        // Draw subject rows
        activeSubjects.forEach((s, idx) => {
          checkPageBreak(10);

          // alternating background
          if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252); // slate-50
            doc.rect(margin, y, contentWidth, 9, 'F');
          }

          // Subject Code in bold
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42); // slate-900
          doc.text(s.code, margin + 3, y + 5.5);

          // Subject Name Normal
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(51, 65, 85);
          let truncatedName = s.name;
          if (truncatedName.length > 34) {
            truncatedName = truncatedName.substring(0, 31) + '...';
          }
          doc.text(truncatedName, margin + 18, y + 4.2);
          
          doc.setFont('Helvetica', 'italic');
          doc.setFontSize(6.2);
          doc.setTextColor(148, 163, 184); // slate-400
          doc.text(s.isLab ? 'Practical Lab Session' : 'Theory Core Lecture', margin + 18, y + 7.6);

          // Ratio
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(71, 85, 105);
          doc.text(`${s.attended} / ${s.total} Hrs`, margin + 80, y + 5.5);

          // Strength %
          const isPassingSubject = s.percent >= userProfile.minAttendance;
          if (isPassingSubject) {
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(5, 150, 105); // emerald-600
          } else {
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(220, 38, 38); // red-600
          }
          doc.text(`${s.percent.toFixed(1)}%`, margin + 108, y + 5.5);

          // PROGRESS BAR GAUGE
          const xBar = margin + 124;
          const yBar = y + 3.8;
          const bWidth = 20;
          const bHeight = 2.4;
          
          // Outer track
          doc.setFillColor(226, 232, 240); // slate-200
          doc.rect(xBar, yBar, bWidth, bHeight, 'F');

          // Filled gauge section
          const filledRatioW = Math.max(0, Math.min(bWidth, (s.percent / 100) * bWidth));
          if (isPassingSubject) {
            doc.setFillColor(5, 150, 105); // Emerald green
          } else {
            doc.setFillColor(220, 38, 38); // Red
          }
          doc.rect(xBar, yBar, filledRatioW, bHeight, 'F');

          // Action/Bunk Indicators
          let safeBunkText = '';
          let registryColorTuple = [15, 23, 42];
          
          const targetCoefVal = userProfile.minAttendance / 100;
          if (s.percent >= userProfile.minAttendance) {
            const maxSubjectBunk = Math.floor(s.attended / (targetCoefVal || 0.75) - s.total);
            if (maxSubjectBunk > 0) {
              safeBunkText = `✅ Safe (+${maxSubjectBunk}h bunk)`;
              registryColorTuple = [5, 150, 105]; // emerald-600
            } else {
              safeBunkText = `⚠️ Critical (0h bunk)`;
              registryColorTuple = [217, 119, 6]; // amber-600
            }
          } else {
            const denominatorVal = 1 - targetCoefVal;
            const recoverHoursSubject = denominatorVal <= 0 ? (s.total - s.attended) : Math.ceil((targetCoefVal * s.total - s.attended) / denominatorVal);
            safeBunkText = `🚨 Deficit (Attend +${recoverHoursSubject}h)`;
            registryColorTuple = [220, 38, 38]; // red-600
          }

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(registryColorTuple[0], registryColorTuple[1], registryColorTuple[2]);
          doc.text(safeBunkText, margin + 148, y + 5.5);

          // Divider row borderline
          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.18);
          doc.line(margin, y + 9, pageWidth - margin, y + 9);
          y += 9;
        });

        y += 8;
      }
    }

    // 5. HISTORICAL ATTENDANCE LEDGER entries
    checkPageBreak(30);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('IV. HISTORICAL DIARY COMPLIANCE ENTRIES', margin, y);
    y += 5;

    // Table Columns Ledger Headers
    doc.setFillColor(71, 85, 105); // slate-600 middle Slate
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255); // White

    doc.text('DATE RECORD', margin + 3, y + 4.8);
    doc.text('WEEKDAY', margin + 25, y + 4.8);
    doc.text('DAY CLASSIFICATION', margin + 55, y + 4.8);
    doc.text('SCHEDULED', margin + 95, y + 4.8);
    doc.text('ATTENDED', margin + 120, y + 4.8);
    doc.text('COMPLIANCE TRANSCRIPT STATUS', margin + 145, y + 4.8);
    y += 7.5;

    // Ledger rows (Limit to max 30 logs if list is very large to keep document compact and beautiful)
    list.slice(0, 30).forEach((rec) => {
      checkPageBreak(8);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);

      doc.text(rec.date, margin + 3, y + 5);
      doc.text(rec.dayOfWeek, margin + 25, y + 5);
      doc.text(rec.dayType, margin + 55, y + 5);
      doc.text(`${rec.scheduledHours} Hrs`, margin + 95, y + 5);
      doc.text(`${rec.attendedHours} Hrs`, margin + 120, y + 5);

      if (rec.scheduledHours === 0) {
        doc.setTextColor(115, 115, 115);
        doc.text('No scheduled periods', margin + 145, y + 5);
      } else if (rec.attendedHours === rec.scheduledHours) {
        doc.setTextColor(5, 150, 105);
        doc.text('Fully Present (100%)', margin + 145, y + 5);
      } else if (rec.attendedHours === 0) {
        doc.setTextColor(220, 38, 38);
        doc.setFont('Helvetica', 'bold');
        doc.text('Absent / Bunk (0%)', margin + 145, y + 5);
      } else {
        doc.setTextColor(217, 119, 6);
        doc.text(`Partial Presence (${Math.round((rec.attendedHours/rec.scheduledHours)*100)}%)`, margin + 145, y + 5);
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.line(margin, y + 6.8, pageWidth - margin, y + 6.8);
      y += 6.8;
    });

    if (list.length > 30) {
      checkPageBreak(8);
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`* Note: List truncated. Showing latest 30 historical log entries of ${list.length} total recorded logs.`, margin, y + 5);
      y += 6.8;
    }

    // 6. BOTTOM OFFICIAL TRUST FOOTER BLOCK & STAMPS
    checkPageBreak(38);
    y += 6;
    drawDivider(y, 0.4, [203, 213, 225]);
    y += 6;

    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Disclaimer: This statement calculates attendance statistics based strictly on localized log records logged securely in "The Arc" app database.', margin, y);
    y += 3.5;
    doc.text('This is an interim, non-repudiable transcript statement and does not substitute institutional-level physical ledger cards unless verified manually.', margin, y);
    y += 8;

    // Stamp & signature layout
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('ACADEMIC COMPLIANCE OFFICERS SEAL', margin, y);
    doc.text('REGISTERED STUDENT DIRECT SIGNATURE', pageWidth - margin, y, { align: 'right' });
    y += 11;

    // Draw lines for sign margins
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.line(margin, y, margin + 45, y);
    doc.line(pageWidth - margin - 45, y, pageWidth - margin, y);
    
    y += 3.5;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('THE ARC COMPLIANCE DESK ENGINE', margin, y);
    doc.text(`${userProfile.name.toUpperCase()} (VERIFIED ACTIVE)`, pageWidth - margin, y, { align: 'right' });

    const cleanNameStr = userProfile.name.toLowerCase().replace(/\s+/g, '_');
    doc.save(`Academic_Registry_Record_${cleanNameStr}.pdf`);
  };

  // 4. Copy share text helper (for messaging apps)
  const handleShareToChat = async () => {
    const list = getFilteredRecords();
    const totalScheduled = list.reduce((sum, r) => sum + r.scheduledHours, 0);
    const totalAttended = list.reduce((sum, r) => sum + r.attendedHours, 0);
    const percentage = totalScheduled > 0 ? ((totalAttended / totalScheduled) * 100).toFixed(1) : '100';

    const shareText = `📚 *The Arc: Student Attendance Summary* 📚\n\n*Name:* ${userProfile.name}\n*Period:* ${rangeType} Report\n*Tracked Hours:* ${totalAttended} attended of ${totalScheduled} scheduled\n*Overall Average:* ${percentage}%\n\nGenerated via The Arc Rule-Based Attendance Desk. ✅`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'The Arc Attendance Report',
          text: shareText
        });
        setShareFeedback('Shared successfully!');
        setTimeout(() => setShareFeedback(''), 3000);
      } catch (err) {
        // Fallback to copy if user cancelled or API failed
        copyFeedback(shareText);
      }
    } else {
      copyFeedback(shareText);
    }
  };

  const copyFeedback = (text: string) => {
    navigator.clipboard.writeText(text);
    setShareFeedback('Copied to clipboard! Ready to paste or save.');
    setTimeout(() => setShareFeedback(''), 4000);
  };

  const activeRows = getFilteredRecords();

  return (
    <div id="export-share-section" className="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* Scope Filtering Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-slate-50">
          <Calendar className="h-4.5 w-4.5 text-slate-500" />
          <h3 className="font-sans font-bold text-sm text-slate-900 tracking-tight">Scope Options</h3>
        </div>

        <div className="space-y-3 text-xs">
          <div className="space-y-1.5 font-sans">
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">Select Scope Range</span>
            
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setRangeType('All')}
                className={`p-2.5 text-left rounded-lg border text-xs font-semibold transition ${
                  rangeType === 'All' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 hover:bg-slate-100/55 border-slate-200 text-slate-700'
                }`}
              >
                All Historical Logs
              </button>

              <button
                onClick={() => setRangeType('CurrentMonth')}
                className={`p-2.5 text-left rounded-lg border text-xs font-semibold transition ${
                  rangeType === 'CurrentMonth' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 hover:bg-slate-100/55 border-slate-200 text-slate-700'
                }`}
              >
                {getSimulatedMonthLabel()}
              </button>

              <button
                onClick={() => setRangeType('SelectedWeek')}
                className={`p-2.5 text-left rounded-lg border text-xs font-semibold transition ${
                  rangeType === 'SelectedWeek' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 hover:bg-slate-100/55 border-slate-200 text-slate-700'
                }`}
              >
                Custom Boundaries
              </button>
            </div>
          </div>

          {rangeType === 'SelectedWeek' && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono font-semibold text-slate-400">Boundary Start:</span>
                <input
                  type="date"
                  value={selectedDateRange.start}
                  onChange={(e) => setSelectedDateRange(p => ({ ...p, start: e.target.value }))}
                  className="w-full font-mono text-xs border border-slate-200 rounded p-1.5 focus:ring-1 focus:ring-slate-800"
                />
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] font-mono font-semibold text-slate-400">Boundary End:</span>
                <input
                  type="date"
                  value={selectedDateRange.end}
                  onChange={(e) => setSelectedDateRange(p => ({ ...p, end: e.target.value }))}
                  className="w-full font-mono text-xs border border-slate-200 rounded p-1.5 focus:ring-1 focus:ring-slate-800"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export operations buttons (Span 2) */}
      <div id="export-operations-panel" className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-50">
          <div className="space-y-0.5">
            <h3 className="font-sans font-bold text-sm text-slate-900 tracking-tight">Format Export Hub</h3>
            <p className="text-[10px] text-slate-500 font-mono">
              Ready to process {activeRows.length} matches
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
          
          <button
            onClick={handleExportCSV}
            className="flex flex-col items-center justify-center p-5 border border-slate-150 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition space-y-3 text-center cursor-pointer"
          >
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-full">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800">CSV Sheet</p>
              <p className="text-[10px] text-slate-400 mt-1">Compatible with Sheets / Excel</p>
            </div>
          </button>

          <button
            id="download-academic-registry-record-btn"
            onClick={handleExportPDF}
            className="flex flex-col items-center justify-center p-5 border border-blue-100 bg-gradient-to-br from-blue-50/40 via-white to-slate-50 hover:from-blue-50 hover:to-slate-100 hover:border-blue-300 rounded-xl transition space-y-3 text-center cursor-pointer shadow-sm relative group"
            title="Download Academic Registry Record (PDF)"
          >
            <div className="absolute -top-2 right-3 font-mono text-[8px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider select-none">
              High Fidelity
            </div>
            <div className="p-3 bg-blue-50 text-blue-700 group-hover:scale-105 transition-transform duration-200 rounded-full">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">Academic Registry Record</p>
              <p className="text-[10px] text-slate-500 mt-1 leading-normal px-2">Download Attendance Statement with percentage gauges & safe bunk indicators</p>
            </div>
          </button>

          <button
            onClick={handleTriggerPrintPDF}
            className="flex flex-col items-center justify-center p-5 border border-slate-150 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition space-y-3 text-center cursor-pointer"
          >
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-full">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Print Paper</p>
              <p className="text-[10px] text-slate-400 mt-1">Generates clean physical ledger map</p>
            </div>
          </button>

        </div>

        {shareFeedback && (
          <div className="p-3 bg-slate-900 text-white rounded-lg text-xs font-mono flex items-center space-x-2 animate-fade-in">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{shareFeedback}</span>
          </div>
        )}

        {/* Sneak peak of matching table rows */}
        <div className="space-y-2 pt-2">
          <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest font-mono">
            Previewing Selected Rows ({Math.min(3, activeRows.length)} of {activeRows.length})
          </p>
          <div className="border border-slate-100 rounded-lg overflow-hidden text-[11px] font-sans">
            {activeRows.length === 0 ? (
              <p className="p-4 text-center text-slate-400 italic">No attendance records fit current scope boundaries.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/55 text-slate-500 font-semibold font-mono text-[9px] uppercase tracking-wider border-b border-slate-100">
                    <th className="p-2">Date</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Scheduled</th>
                    <th className="p-2">Attended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-mono">
                  {activeRows.slice(0, 3).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/30">
                      <td className="p-2 font-bold text-slate-700">{r.date}</td>
                      <td className="p-2">{r.dayType}</td>
                      <td className="p-2">{r.scheduledHours} hr</td>
                      <td className="p-2 font-semibold text-slate-800">{r.attendedHours} hr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
