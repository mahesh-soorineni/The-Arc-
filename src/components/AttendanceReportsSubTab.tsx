/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { safeLocalStorage as localStorage } from '../utils/storage';
import {
  Printer,
  ChevronDown,
  Download,
  Check,
  FileSpreadsheet,
  RefreshCw,
  HelpCircle,
  FileText,
  Activity,
  Layers,
  Share2,
  CheckCircle,
  Eye,
  ChevronRight
} from 'lucide-react';
import { AttendanceRecord, Subject, Timetable, UserProfile } from '../types';
import {
  isAttendanceRequired,
  getDayOfWeekFromDate,
  getTimetableForDate,
  getTodayDateString,
  calculateAnalytics
} from '../utils/rulesEngine';
import {
  exportRegisterPDF,
  exportRegisterExcel,
  exportRegisterCSV
} from '../utils/exportUtils';

interface AttendanceReportsSubTabProps {
  records: AttendanceRecord[];
  subjects: Subject[];
  timetables: Timetable[];
  currentDate: string;
  userProfile: UserProfile;
  manualOverrides: Record<string, { conducted: number; attended: number; missed: number }>;
  onUpdateManualOverrides: (newOverrides: Record<string, { conducted: number; attended: number; missed: number }>) => void;
  reportMode: 'monthly' | 'custom' | 'till_now';
  setReportMode: React.Dispatch<React.SetStateAction<'monthly' | 'custom' | 'till_now'>>;
  selectedMonth: string;
  setSelectedMonth: React.Dispatch<React.SetStateAction<string>>;
  selectedYear: string;
  setSelectedYear: React.Dispatch<React.SetStateAction<string>>;
  fromDate: string;
  setFromDate: React.Dispatch<React.SetStateAction<string>>;
  toDate: string;
  setToDate: React.Dispatch<React.SetStateAction<string>>;
  excludeInactive: boolean;
  setExcludeInactive: React.Dispatch<React.SetStateAction<boolean>>;
  isPrintLayout: boolean;
  setIsPrintLayout: React.Dispatch<React.SetStateAction<boolean>>;
}

// Date Formatter Helper
export function formatRegisterDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export default function AttendanceReportsSubTab({
  records,
  subjects,
  timetables,
  currentDate,
  userProfile,
  manualOverrides,
  onUpdateManualOverrides,
  reportMode,
  setReportMode,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  excludeInactive,
  setExcludeInactive,
  isPrintLayout,
  setIsPrintLayout
}: AttendanceReportsSubTabProps) {
  const overrides = manualOverrides;

  const [feedback, setFeedback] = useState<string>('');

  // Overrides management
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editConducted, setEditConducted] = useState<number>(0);
  const [editAttended, setEditAttended] = useState<number>(0);
  const [editMissed, setEditMissed] = useState<number>(0);

  // Overrides are managed at App.tsx level

  const handleStartEdit = (subjectCode: string, stats: any) => {
    setEditingCode(subjectCode);
    setEditConducted(stats.conducted);
    setEditAttended(stats.attended);
    setEditMissed(stats.missed);
  };

  const handleSaveStats = (subjectCode: string) => {
    const updated = {
      ...overrides,
      [subjectCode]: {
        conducted: editConducted,
        attended: editAttended,
        missed: editMissed
      }
    };
    onUpdateManualOverrides(updated);
    setEditingCode(null);
    setFeedback(`Successfully updated override for ${subjectCode}!`);
    setTimeout(() => setFeedback(''), 3000);
  };

  // Compile active dates sorted in chronological order (up to currentDate to ignore future simulation records)
  const activeDates = Array.from(
    new Set(
      records
        .filter(r => r.isMarked && r.scheduledHours > 0 && r.date <= currentDate)
        .map(r => r.date)
    )
  ).sort((a, b) => a.localeCompare(b));

  // Filter dates based on selecting report modes
  const visibleDates = (() => {
    let dates = activeDates;
    if (reportMode === 'monthly') {
      const targetPrefix = `${selectedYear}-${selectedMonth}`;
      dates = activeDates.filter(d => d.startsWith(targetPrefix));
    } else if (reportMode === 'custom') {
      dates = activeDates.filter(d => d >= fromDate && d <= toDate);
    } else {
      // till_now matches all dates up to currentDate (already covered by activeDates filter)
      dates = activeDates;
    }
    return dates;
  })();

  // Format date header like inside screenshot (e.g. "15-12", "02-01")
  const formatDateHeader = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const month = parts[1];
    const day = parts[2];
    return `${day}-${month}`;
  };

  // Compile map of attendance status for cell: (subjectCode, date) -> string (e.g. "P", "A A", "-")
  const getCellAttendanceStatus = (subjectCode: string, dateStr: string): string => {
    const r = records.find(record => record.date === dateStr);
    if (!r || !r.isMarked) return '-';

    if (r.slotsDetails && r.slotsDetails.length > 0) {
      const matchSlots = r.slotsDetails.filter(s => s.subjectCode === subjectCode);
      if (matchSlots.length === 0) return '-';

      const indicators: string[] = [];
      matchSlots.forEach(s => {
        if (s.status === 'Cancelled') {
          indicators.push('C'); // Cancelled/Dismissed
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
    
    // Find slot match
    const matchSlots = scheduledSlots.filter(s => s.subjectCode === subjectCode);
    if (matchSlots.length === 0) return '-';

    // Total scheduled hours/slots of this subject on this date
    const hours = matchSlots.reduce((sum, s) => sum + s.hours, 0);

    // Calculate status indicator
    if (r.attendedHours === r.scheduledHours) {
      return Array(hours).fill('P').join(' ');
    } else if (r.attendedHours === 0) {
      return Array(hours).fill('A').join(' ');
    } else {
      // Partial attendance log checks
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
  };

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

  const analyticsResult = calculateAnalytics(
    activePeriodRecords,
    subjects,
    timetables,
    userProfile.minAttendance,
    overrides
  );

  // Compile row totals statistics based on active range
  const getSubjectStats = (subjectCode: string) => {
    const subjectStat = analyticsResult.subjectWise[subjectCode] || {
      code: subjectCode,
      name: subjectCode,
      attended: 0,
      total: 0,
      percent: 0,
    };
    return {
      conducted: subjectStat.total,
      attended: subjectStat.attended,
      missed: subjectStat.total - subjectStat.attended,
      percent: parseFloat(subjectStat.percent.toFixed(2))
    };
  };

  // Optional filter applied: hide subjects with zero conducted classes
  const renderedSubjects = subjects.filter(sub => {
    if (!excludeInactive) return true;
    const stats = getSubjectStats(sub.code);
    return stats.conducted > 0;
  });

  // Calculate totals
  const totalConducted = renderedSubjects.reduce((sum, sub) => sum + getSubjectStats(sub.code).conducted, 0);
  const totalAttended = renderedSubjects.reduce((sum, sub) => sum + getSubjectStats(sub.code).attended, 0);
  const totalMissed = renderedSubjects.reduce((sum, sub) => sum + getSubjectStats(sub.code).missed, 0);
  const overallPercentage = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0.00;

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4000);
  };

  const getActivePeriodRecords = () => {
    return records.filter(r => {
      if (!r.isMarked) return false;
      if (!isAttendanceRequired(r.dayType)) return false;
      if (r.date > currentDate) return false;

      let isInRange = false;
      if (reportMode === 'monthly') {
        isInRange = r.date.startsWith(`${selectedYear}-${selectedMonth}`);
      } else if (reportMode === 'custom') {
        isInRange = r.date >= fromDate && r.date <= toDate;
      } else { // till_now
        isInRange = true;
      }
      return isInRange;
    });
  };

  // Export Academic Register Grid & Totals to CSV
  const triggerExportCSV = () => {
    exportRegisterCSV(
      getActivePeriodRecords(),
      subjects,
      timetables,
      userProfile,
      getActiveRangeStr(),
      excludeInactive,
      currentDate,
      visibleDates,
      triggerFeedback
    );
  };

  // Export Academic Register Grid & Totals to Excel
  const triggerExportExcel = () => {
    exportRegisterExcel(
      getActivePeriodRecords(),
      subjects,
      timetables,
      userProfile,
      getActiveRangeStr(),
      excludeInactive,
      currentDate,
      visibleDates,
      triggerFeedback
    );
  };

  // High-fidelity landscape PDF generator for Academic Register
  const handleExportPDF = () => {
    exportRegisterPDF(
      getActivePeriodRecords(),
      subjects,
      timetables,
      userProfile,
      getActiveRangeStr(),
      excludeInactive,
      currentDate,
      visibleDates,
      triggerFeedback
    );
  };

  // Get active range label
  const getActiveRangeStr = () => {
    if (reportMode === 'monthly') {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIdx = parseInt(selectedMonth, 10) - 1;
      return `${monthNames[monthIdx]} ${selectedYear}`;
    } else if (reportMode === 'custom') {
      return `${formatRegisterDate(fromDate)} to ${formatRegisterDate(toDate)}`;
    } else {
      return `Till Now (As of ${formatRegisterDate(currentDate)})`;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ERP Select Form Wrapper */}
      <div className="bg-[#0D1117] border border-white/5 rounded-2xl p-5 md:p-6 shadow-xl space-y-5">
        
        {/* Step 1: Select Mode */}
        <div className="space-y-2">
          <label className="text-[11px] font-mono uppercase text-slate-400 font-bold block">
            Step 1: Select Report Mode (Monthly, Custom or Till Now)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[
              { id: 'monthly', title: 'Monthly Mode', desc: 'Filter selected academic month' },
              { id: 'custom', title: 'Custom Date Range', desc: 'Define custom boundary' },
              { id: 'till_now', title: 'Till Now Mode', desc: 'Whole cumulative log history' }
            ].map(col => (
              <button
                key={col.id}
                onClick={() => setReportMode(col.id as any)}
                className={`p-3 text-left rounded-xl border text-xs transition relative flex flex-col justify-between cursor-pointer ${
                  reportMode === col.id
                    ? 'bg-blue-600/10 border-blue-500 text-white shadow-md shadow-blue-600/5'
                    : 'bg-white/[0.01] hover:bg-white/[0.04] border-white/5 text-slate-400 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold">{col.title}</span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    reportMode === col.id ? 'border-blue-400 bg-blue-500' : 'border-slate-500 dark:border-slate-600'
                  }`}>
                    {reportMode === col.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                  {col.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Filters Config */}
        <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-4">
          <label className="text-[11px] font-mono uppercase text-slate-400 font-semibold block">
            Step 2: Configure Range Filters
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Conditional inputs */}
            {reportMode === 'monthly' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 block">Select Month:</span>
                  <div className="relative">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-[#161B22] border border-white/5 rounded-lg p-2 text-xs text-white appearance-none outline-none focus:border-blue-500 cursor-pointer font-medium"
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
                    <ChevronDown className="absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 block">Select Year:</span>
                  <div className="relative">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full bg-[#161B22] border border-white/5 rounded-lg p-2 text-xs text-white appearance-none outline-none focus:border-blue-500 cursor-pointer font-medium"
                    >
                      {['2025', '2026', '2027'].map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>
            )}

            {reportMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 block">From Date:</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full bg-[#161B22] border border-white/5 rounded-lg p-1.5 text-xs text-white outline-none focus:border-blue-500 cursor-pointer font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 block">To Date:</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full bg-[#161B22] border border-white/5 rounded-lg p-1.5 text-xs text-white outline-none focus:border-blue-500 cursor-pointer font-mono"
                  />
                </div>
              </div>
            )}

            {reportMode === 'till_now' && (
              <div className="flex items-center bg-[#161B22]/50 border border-white/[0.03] rounded-lg p-2.5 text-xs text-slate-400">
                <Activity className="h-4 w-4 text-blue-400 animate-pulse mr-2 shrink-0" />
                <span>
                  Evaluating report cumulative total class records until today: <strong>{formatRegisterDate(currentDate)}</strong>.
                </span>
              </div>
            )}

            {/* Checkbox tool to filter inactive subjects */}
            <div className="flex items-center md:pl-4">
              <label 
                className="flex items-center space-x-3 text-xs text-slate-400 dark:text-slate-300 cursor-pointer select-none group w-full"
                onClick={() => setExcludeInactive(!excludeInactive)}
              >
                <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition shrink-0 ${
                  excludeInactive ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-500 dark:border-slate-600 bg-transparent group-hover:border-slate-400'
                }`}>
                  {excludeInactive && <Check className="h-3 w-3" />}
                </div>
                <div>
                  <span className="font-bold text-slate-200 group-hover:text-blue-400 transition block">
                    Exclude Inactive Subjects
                  </span>
                  <p className="text-[10px] text-slate-500">Hide subjects with 0 conducted classes in the active scope</p>
                </div>
              </label>
            </div>

          </div>
        </div>

      </div>

      {feedback && (
        <div className="p-3 bg-[#161B22] border border-blue-500/20 text-blue-400 rounded-xl text-xs font-mono flex items-center space-x-2 shadow-lg animate-fade-in print:hidden">
          <Activity className="h-4 w-4 shrink-0 animate-ping" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Grid Table Workspace */}
      <div className="bg-[#0D1117] border border-white/5 rounded-2xl shadow-xl overflow-hidden print:-mx-4 print:border-collapse">
        
        {/* Header Title */}
        <div className="p-5 md:p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 bg-blue-600 rounded-sm" />
            <div>
              <span className="font-sans font-black text-sm tracking-tight text-white block">
                ACADAMIC REGISTER
              </span>
              <p className="text-[10px] text-blue-400 font-mono tracking-widest mt-0.5">
                SUBJECT RECORDS GRID | Scope: {getActiveRangeStr().toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 print:hidden">
            {/* Google Docs style Print layout switch */}
            <button
              type="button"
              onClick={() => setIsPrintLayout(!isPrintLayout)}
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
              title="Download Beautiful PDF Register"
            >
              <FileText className="h-3.5 w-3.5 text-blue-400" />
              <span>PDF Register</span>
            </button>

            <button
              onClick={triggerExportExcel}
              className="px-2.5 py-1.5 bg-[#161B22] hover:bg-slate-800 text-slate-300 border border-white/5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
              title="Export Register Excel Sheet"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Excel Register</span>
            </button>

            <button
              onClick={triggerExportCSV}
              className="px-2.5 py-1.5 bg-[#161B22] hover:bg-slate-800 text-slate-300 border border-white/5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
              title="Download CSV register spreadsheet"
            >
              <Download className="h-3.5 w-3.5 text-amber-500" />
              <span>CSV Register</span>
            </button>

            <div className="h-5 w-[1px] bg-white/5 mx-1" />

            <div className="relative group">
              <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer">
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Register</span>
              </button>
              <div className="absolute right-0 top-full mt-1 bg-slate-900 border border-white/10 rounded-xl p-1.5 shadow-2xl hidden group-hover:block z-50 w-44">
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: 'Academic Register',
                        text: `Check out my Academic Register Attendance Grid for ${userProfile.name} (${getActiveRangeStr()})`
                      }).then(() => triggerFeedback('Register shared successfully!'))
                        .catch(() => triggerFeedback('Share cancelled'));
                    } else {
                      navigator.clipboard.writeText(`Academic Register Attendance Grid for ${userProfile.name} (${getActiveRangeStr()})`);
                      triggerFeedback('Copied register share link to clipboard!');
                    }
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-white/5 text-[11px] text-slate-200 font-bold transition rounded-lg"
                >
                  📋 Register Grid Info
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Legend status markers */}
        <div className="flex items-center space-x-4 text-[10px] text-slate-400 font-mono px-5 py-2 border-b border-white/[0.02] bg-[#161B22]/10 scrollbar-none overflow-x-auto">
          <span className="font-bold uppercase text-slate-500 shrink-0">Status Keys:</span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="font-bold text-emerald-405">P</span> = Present Class Slot
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="font-bold text-red-500">A</span> = Absent / Missed Slot
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-slate-600">-</span> = No Scheduled Class
          </span>
        </div>

        {/* Core Spreadsheet table with custom requested statistics headers on the right */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-750">
          <table className="w-full text-left border-collapse text-xs font-mono min-w-[800px]">
            <thead>
              <tr className="bg-[#161B22]/70 text-slate-400 border-b border-white/5 select-none uppercase text-[10px] tracking-wider">
                <th className="p-3.5 w-12 text-center border-r border-white/5 font-bold">Sl.No</th>
                <th className="p-3.5 w-48 font-bold border-r border-white/5">Subject Description</th>
                
                {/* Dynamically compiled date headers based on Month, custom range, or Till Now */}
                {visibleDates.map(date => (
                  <th key={date} className="p-2 text-center min-w-[42px] border-r border-white/[0.03]" title={date}>
                    {formatDateHeader(date)}
                  </th>
                ))}

                <th className="p-3.5 text-center min-w-[90px] border-l border-r border-white/5 font-bold bg-blue-500/5 text-blue-300">
                  Conducted
                </th>
                <th className="p-3.5 text-center min-w-[90px] border-r border-white/5 font-bold bg-emerald-500/[0.03] text-emerald-400">
                  Attended
                </th>
                <th className="p-3.5 text-center min-w-[90px] border-r border-white/5 font-bold bg-red-500/[0.03] text-red-400">
                  Missed
                </th>
                <th className="p-3.5 text-center min-w-[110px] font-bold bg-white/[0.01]">
                  Attendance %
                </th>
                <th className="p-3.5 text-right font-bold bg-white/[0.01] print:hidden w-24">
                  Actions
                </th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-white/5 text-slate-300">
              {renderedSubjects.map((sub, idx) => {
                const stats = getSubjectStats(sub.code);
                const isEditing = editingCode === sub.code;

                return (
                  <tr key={sub.code} className={`transition-colors ${isEditing ? 'bg-blue-600/[0.03] hover:bg-blue-600/[0.04]' : 'hover:bg-white/[0.012]'}`}>
                    
                    {/* Serial index matches screenshot */}
                    <td className="p-3.5 text-center border-r border-white/5 text-slate-500 font-bold bg-slate-900/10">
                      {idx + 1}
                    </td>

                    {/* Subject info */}
                    <td className="p-3.5 border-r border-white/5 whitespace-nowrap text-left">
                      <span className="font-extrabold font-mono text-blue-400 block text-[10px]">
                        {sub.code}
                      </span>
                      <span className="text-slate-200 font-sans font-bold text-xs">
                        {sub.name}
                      </span>
                    </td>

                    {/* Date status indicators cell list */}
                    {visibleDates.map(date => {
                      const value = getCellAttendanceStatus(sub.code, date);
                      
                      // Compute special styling based on content
                      let cellStyle = 'text-slate-400 dark:text-slate-500 font-medium';
                      if (value.includes('P')) {
                        cellStyle = 'text-emerald-500 dark:text-emerald-400 font-black bg-emerald-500/[0.02] border-r border-white/[0.015]';
                      } else if (value.includes('A')) {
                        cellStyle = 'text-red-500 font-black bg-red-500/[0.02] border-r border-white/[0.015]';
                      }

                      return (
                        <td key={date} className={`p-2 text-center border-r border-white/[0.03] ${cellStyle}`} title={`${sub.code} on ${date}`}>
                          {value}
                        </td>
                      );
                    })}

                    {/* Total Conducted Classes Column */}
                    {isEditing ? (
                      <td className="p-2 text-center border-l border-r border-white/5 bg-blue-500/[0.02]">
                        <input
                          type="number"
                          min="0"
                          value={editConducted}
                          onChange={(e) => setEditConducted(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 bg-slate-900 text-white text-center font-mono text-xs font-bold px-1 py-0.5 border border-blue-500/40 rounded focus:border-blue-500 outline-none animate-pulse"
                        />
                      </td>
                    ) : (
                      <td className="p-3.5 text-center border-l border-r border-white/5 font-extrabold text-[#E2E8F0] bg-blue-500/[0.02]">
                        {stats.conducted}
                      </td>
                    )}

                    {/* Total Attended Classes Column */}
                    {isEditing ? (
                      <td className="p-2 text-center border-r border-white/5 bg-emerald-500/[0.01]">
                        <input
                          type="number"
                          min="0"
                          value={editAttended}
                          onChange={(e) => setEditAttended(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 bg-slate-900 text-emerald-400 text-center font-mono text-xs font-bold px-1 py-0.5 border border-blue-500/40 rounded focus:border-blue-500 outline-none animate-pulse"
                        />
                      </td>
                    ) : (
                      <td className="p-3.5 text-center border-r border-white/5 font-extrabold text-emerald-400 bg-emerald-500/[0.01]">
                        {stats.attended}
                      </td>
                    )}

                    {/* Total Missed Classes Column */}
                    {isEditing ? (
                      <td className="p-2 text-center border-r border-white/5 bg-red-500/[0.01]">
                        <input
                          type="number"
                          min="0"
                          value={editMissed}
                          onChange={(e) => setEditMissed(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 bg-slate-900 text-red-500 text-center font-mono text-xs font-bold px-1 py-0.5 border border-blue-500/40 rounded focus:border-blue-500 outline-none animate-pulse"
                        />
                      </td>
                    ) : (
                      <td className="p-3.5 text-center border-r border-white/5 font-extrabold text-red-400 bg-red-500/[0.01]">
                        {stats.missed}
                      </td>
                    )}

                    {/* Attendance percentage indicator */}
                    {isEditing ? (
                      <td className="p-3.5 text-right bg-white/[0.01] border-r border-white/5">
                        <span className="font-extrabold text-amber-400 text-xs text-right block">
                          {(editConducted > 0 ? (editAttended / editConducted) * 100 : 0.00).toFixed(2)}%
                        </span>
                      </td>
                    ) : (
                      <td className="p-3.5 text-right bg-white/[0.01] border-r border-white/5">
                        <div className="flex items-center justify-end space-x-2">
                          <div className="w-12 h-1 rounded bg-white/5 overflow-hidden block">
                            <div 
                              className={`h-full transition-all ${stats.percent >= 75 ? 'bg-emerald-500' : 'bg-red-500'}`} 
                              style={{ width: `${Math.min(stats.percent, 100)}%` }} 
                            />
                          </div>
                          <span className={`font-black tracking-tight ${stats.percent >= 75 ? 'text-emerald-450' : 'text-red-450'}`}>
                            {stats.percent.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                    )}

                    {/* Actions edit column */}
                    <td className="p-3.5 text-right whitespace-nowrap print:hidden">
                      {isEditing ? (
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleSaveStats(sub.code)}
                            className="bg-emerald-700 hover:bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded transition uppercase cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCode(null)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[9px] px-2 py-0.5 rounded transition uppercase cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(sub.code, stats)}
                          className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 font-bold text-[9px] px-2 py-0.5 border border-blue-500/10 rounded transition uppercase cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty records placeholder if activeDateLimit filters out everything */}
        {visibleDates.length === 0 && (
          <div className="py-12 bg-[#161B22]/10 border-t border-white/5 text-center text-slate-500 italic block text-xs">
            No registered dates inside history. Choose other options or check the Calendar tab!
          </div>
        )}

        {/* Academic ERP Totals Row exactly at the bottom of the registry tab */}
        {visibleDates.length > 0 && renderedSubjects.length > 0 && (
          <div className="bg-[#161B22]/65 border-t border-white/10 p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                  Total Conducted Classes
                </span>
                <p className="font-sans font-black text-white text-sm tracking-tight">
                  Conducted: <span className="font-mono text-base text-blue-300 font-bold">{totalConducted}</span>
                </p>
              </div>

              <div className="space-y-0.5 border-l border-white/5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                  Total Attended Classes
                </span>
                <p className="font-sans font-black text-emerald-400 text-sm tracking-tight">
                  Attended: <span className="font-mono text-base font-bold">{totalAttended}</span>
                </p>
              </div>

              <div className="space-y-0.5 border-l border-white/5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                  Total Missed Classes
                </span>
                <p className="font-sans font-black text-red-400 text-sm tracking-tight">
                  Missed: <span className="font-mono text-base font-bold">{totalMissed}</span>
                </p>
              </div>

              <div className="space-y-0.5 border-l border-white/5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                  Overall Attendance %
                </span>
                <p className={`font-sans font-black text-sm tracking-tight ${overallPercentage >= 75 ? 'text-emerald-450' : 'text-red-450'}`}>
                  Overall Attendance: <span className="font-mono text-base font-bold">{overallPercentage.toFixed(2)}%</span>
                </p>
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
