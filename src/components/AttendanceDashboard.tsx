/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileCheck, ClipboardList, BookOpen, Layers } from 'lucide-react';
import { AttendanceRecord, Subject, Timetable, UserProfile } from '../types';
import AttendanceRecordsSubTab from './AttendanceRecordsSubTab';
import AttendanceReportsSubTab from './AttendanceReportsSubTab';

interface AttendanceDashboardProps {
  records: AttendanceRecord[];
  subjects: Subject[];
  timetables: Timetable[];
  currentDate: string;
  userProfile: UserProfile;
}

export default function AttendanceDashboard({
  records,
  subjects,
  timetables,
  currentDate,
  userProfile
}: AttendanceDashboardProps) {
  // Sub-tabs: 'records' | 'reports'
  const [subTab, setSubTab] = useState<'records' | 'reports'>('records');

  return (
    <div className="space-y-6">
      
      {/* Sub navigation buttons style like College portal tabs */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-3 print:hidden">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          
          <button
            onClick={() => setSubTab('records')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer border ${
              subTab === 'records'
                ? 'bg-blue-600/10 text-white border-blue-500/30'
                : 'text-slate-400 hover:text-white border-transparent hover:bg-white/[0.02]'
            }`}
          >
            <ClipboardList className={`h-3.5 sm:h-4 w-3.5 sm:w-4 ${subTab === 'records' ? 'text-blue-400' : 'text-slate-500'}`} />
            <span>Attendance Records</span>
          </button>

          <button
            onClick={() => setSubTab('reports')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer border ${
              subTab === 'reports'
                ? 'bg-blue-600/10 text-white border-blue-500/30'
                : 'text-slate-400 hover:text-white border-transparent hover:bg-white/[0.02]'
            }`}
          >
            <BookOpen className={`h-3.5 sm:h-4 w-3.5 sm:w-4 ${subTab === 'reports' ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className="whitespace-nowrap">Reports</span>
          </button>

        </div>

        <div className="text-[9px] sm:text-[10px] w-fit font-mono text-slate-500 bg-slate-900/40 border border-white/[0.02] px-2 py-1 rounded-md self-end sm:self-auto">
          Portal Context: B.Tech Sem VI
        </div>
      </div>

      {/* Render subcomponents based on selection */}
      <div className="transition-all duration-250">
        
        {subTab === 'records' ? (
          <AttendanceRecordsSubTab
            records={records}
            subjects={subjects}
            timetables={timetables}
            currentDate={currentDate}
            userProfile={userProfile}
          />
        ) : (
          <AttendanceReportsSubTab
            records={records}
            subjects={subjects}
            timetables={timetables}
            currentDate={currentDate}
            userProfile={userProfile}
          />
        )}

      </div>
      
    </div>
  );
}
