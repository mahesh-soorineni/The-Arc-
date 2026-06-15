/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  AlertOctagon,
  Clock,
  ShieldCheck,
  Calendar,
  Frown,
  BookOpen,
  Sliders,
  Sparkles,
  HelpCircle,
  Plus
} from 'lucide-react';
import {
  AttendanceRecord,
  Subject,
  Timetable
} from '../types';
import {
  calculateAnalytics,
  calculateProjections,
  calculateRecoveryRequired
} from '../utils/rulesEngine';

interface AnalyticsPanelProps {
  records: AttendanceRecord[];
  subjects: Subject[];
  timetables: Timetable[];
  minAttendanceSetting: number;
  onUpdateMinAttendance: (val: number) => void;
  currentDate: string;
}

export default function AnalyticsPanel({
  records,
  subjects,
  timetables,
  minAttendanceSetting,
  onUpdateMinAttendance,
  currentDate
}: AnalyticsPanelProps) {
  // Filter out simulated future days
  const activeRecords = records.filter(r => r.date <= currentDate);
  const analytics = calculateAnalytics(activeRecords, subjects, timetables, minAttendanceSetting);
  const totalAttended = analytics.totalPresentHours;
  const totalScheduled = analytics.totalScheduledHours;

  // Projections
  const forecast = calculateProjections(totalAttended, totalScheduled, 10);
  const recoveryHoursNeeded = calculateRecoveryRequired(totalAttended, totalScheduled, minAttendanceSetting);

  // Filter subjects that have scheduled hours allocated to them
  const activeSubjects = Object.values(analytics.subjectWise).filter(s => s.total > 0);

  // Help Modal or Info toggles
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div id="analytics-panel-section" className="space-y-6">
      
      {/* 1. Header Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Overall Percent Card */}
        <div id="card-overall-pct" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Overall Attendance
            </h4>
            <div className="flex items-baseline space-x-1">
              <span className="text-4xl font-extrabold font-mono text-slate-900 tracking-tight">
                {analytics.overallPercentage}%
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Logged: <span className="font-mono font-bold text-slate-700">{totalAttended}</span> of <span className="font-mono font-bold text-slate-700">{totalScheduled}</span> hours
            </p>
          </div>

          {/* Minimal SVG Dial Indicator */}
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-full w-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={analytics.overallPercentage >= minAttendanceSetting ? 'text-emerald-500' : 'text-rose-500'}
                strokeDasharray={`${analytics.overallPercentage}, 100`}
                strokeWidth="3.8"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-mono font-bold text-slate-500">
                Min {minAttendanceSetting}%
              </span>
            </div>
          </div>
        </div>

        {/* Theory vs Lab Breakdown */}
        <div id="card-theory-lab" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Type Breakdown
          </h4>
          
          <div className="space-y-3">
            {/* Theory */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-medium">Theory Lectures</span>
                <span className="font-mono font-bold text-slate-900">{analytics.theoryPercentage}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-slate-800 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, analytics.theoryPercentage)}%` }}
                />
              </div>
            </div>

            {/* Labs */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-medium">Lab Practicals</span>
                <span className="font-mono font-bold text-slate-900">{analytics.labPercentage}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, analytics.labPercentage)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Safe Bunk Card */}
        <div id="card-safe-bunk" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Bunk Allowance
              </h4>
              <button
                type="button"
                onClick={() => setShowExplanation(!showExplanation)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Bunk Calculation Info"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>

            {analytics.overallPercentage >= minAttendanceSetting ? (
              <div className="space-y-1 pt-1">
                <div className="flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold font-mono text-emerald-600">
                    {analytics.safeBunkHours}
                  </span>
                  <span className="text-sm text-slate-500 font-medium">Hours</span>
                </div>
                <p className="text-xs text-slate-600">
                  You can safely skip <span className="font-bold font-mono">{analytics.safeBunkHours}</span> future hours starting today and still maintain <span className="font-mono font-semibold">{minAttendanceSetting}%</span>.
                </p>
              </div>
            ) : (
              <div className="space-y-1 pt-1">
                <div className="flex items-baseline space-x-1 text-rose-600">
                  <span className="text-3xl font-extrabold font-mono">
                    {recoveryHoursNeeded}
                  </span>
                  <span className="text-sm font-semibold">Hours to Recover</span>
                </div>
                <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-100">
                  You are below target! Attend next <span className="font-bold font-mono">{recoveryHoursNeeded}</span> consecutive classes to recover to <span className="font-semibold">{minAttendanceSetting}%</span>.
                </p>
              </div>
            )}
          </div>

          {/* Quick config handle slider inside */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
            <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">Target limit:</span>
            <div className="flex items-center space-x-2 w-full">
              <input
                id="slider-min-attendance"
                type="range"
                min="50"
                max="90"
                step="5"
                value={minAttendanceSetting}
                onChange={(e) => onUpdateMinAttendance(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
              />
              <span className="text-[11px] font-mono font-bold text-slate-700">{minAttendanceSetting}%</span>
            </div>
          </div>
        </div>
      </div>

      {showExplanation && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-xs text-slate-600 space-y-2">
          <p className="font-semibold text-slate-800">How Bunk Calculations Work:</p>
          <p>
            Bunks are future classes you can miss consecutively. If you are currently at 80% with 100 classes, and your limit is 75%, you can miss 6 future classes without going below 75%:
            <br />
            <code className="bg-white p-1 rounded font-mono text-[10px] border border-slate-100">
              (Attended Hours / (Current Scheduled + Bunk Hours)) &gt;= 0.75
            </code>
          </p>
          <p>
            If you are below 75%, "Hours to Recover" calculates exactly how many future classes you must attend in a row to raise your ratio back above the target limit.
          </p>
        </div>
      )}

      {/* 2. Middle section: Subject-wise Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-4 w-4 text-slate-500" />
            <h3 className="font-sans font-semibold text-sm text-slate-900 tracking-tight">Subject-wise Analytics</h3>
          </div>
          <p className="text-[10px] font-mono text-slate-500">Only includes courses with scheduled class logs</p>
        </div>

        <div className="p-6">
          {activeSubjects.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Frown className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-500">No core subject logs registered yet.</p>
              <p className="text-xs text-slate-400">Please mark attendance on class days to initialize analysis.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeSubjects.map((sub, idx) => {
                const subPct = sub.percent;
                const isSafe = subPct >= minAttendanceSetting;

                return (
                  <div key={idx} className="border border-slate-100 rounded-lg p-4 space-y-3 hover:bg-slate-50/50 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                          {sub.code}
                        </span>
                        <h4 className="font-sans font-medium text-sm text-slate-800 line-clamp-1 mt-1">
                          {sub.name}
                        </h4>
                      </div>

                      <div className="text-right">
                        <p className={`font-mono font-bold text-base ${isSafe ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {subPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {sub.attended} of {sub.total} hr logged
                        </p>
                      </div>
                    </div>

                    {/* Progress Slider */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          isSafe ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, subPct)}%` }}
                      ></div>
                    </div>

                    {/* Meta stats */}
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="text-slate-500">
                        Type: <span className="font-mono text-slate-700 font-semibold">{sub.isLab ? 'Laboratory' : 'Theory Lecture'}</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-mono font-semibold ${
                        isSafe ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                      }`}>
                        {isSafe ? 'Safe ✅' : 'Bunk Caution ⚠️'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Projection and Day stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Projections Matrix forecast */}
        <div id="panel-forecast-projection" className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            <h3 className="font-sans font-semibold text-sm text-slate-900 tracking-tight">Attendance Forecasting</h3>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Rule evaluation assumes you have <span className="font-semibold text-slate-800">10 additional class hours scheduled</span> ahead. How will skips affect your margins?
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center space-y-2">
              <p className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">
                If attended next 10 class hours
              </p>
              <p className="text-2xl font-extrabold font-mono text-emerald-600">
                {forecast.afterAttending}%
              </p>
              <div className="flex justify-center">
                <span className="inline-block text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                  +{parseFloat((forecast.afterAttending - analytics.overallPercentage).toFixed(1))}% Increase
                </span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center space-y-2">
              <p className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">
                If missed next 10 class hours
              </p>
              <p className="text-2xl font-extrabold font-mono text-rose-600">
                {forecast.afterMissing}%
              </p>
              <div className="flex justify-center">
                <span className="inline-block text-[10px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded">
                  -{parseFloat((analytics.overallPercentage - forecast.afterMissing).toFixed(1))}% Decrease
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Day categorization tallies */}
        <div id="panel-category-tallies" className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <h3 className="font-sans font-semibold text-sm text-slate-900 tracking-tight">Semester Days Classification</h3>
          </div>

          <p className="text-xs text-slate-500">
            Current tally of non-scheduled dates classified via academic overrides or calendar rules.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            <div className="bg-slate-50 p-3 rounded-lg text-center">
              <p className="text-xs font-semibold text-slate-700 font-mono">Present</p>
              <p className="text-lg font-bold text-emerald-600 font-mono mt-1">{analytics.presentDaysCount}</p>
              <span className="text-[9px] font-mono text-slate-400">Class days</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-center">
              <p className="text-xs font-semibold text-slate-700 font-mono">Absent</p>
              <p className="text-lg font-bold text-red-500 font-mono mt-1">{analytics.absentDaysCount}</p>
              <span className="text-[9px] font-mono text-slate-400">All missed</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-center">
              <p className="text-xs font-semibold text-slate-700 font-mono">Holidays</p>
              <p className="text-lg font-bold text-slate-500 font-mono mt-1">{analytics.holidayDaysCount}</p>
              <span className="text-[9px] font-mono text-slate-400">No records</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-center">
              <p className="text-xs font-semibold text-slate-700 font-mono">Exams/Event</p>
              <p className="text-lg font-bold text-slate-700 font-mono mt-1">{analytics.examDaysCount}</p>
              <span className="text-[9px] font-mono text-slate-400">Calendar check</span>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}
