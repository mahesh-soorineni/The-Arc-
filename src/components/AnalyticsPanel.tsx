/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  Lightbulb
} from 'lucide-react';
import {
  AttendanceRecord,
  Subject,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  UserProfile
} from '../types';
import {
  calculateAnalytics,
  calculateProjections,
  calculateRecoveryRequired,
  getRemainingSemesterHours
} from '../utils/rulesEngine';

interface AnalyticsPanelProps {
  records: AttendanceRecord[];
  subjects: Subject[];
  timetables: Timetable[];
  minAttendanceSetting: number;
  onUpdateMinAttendance: (val: number) => void;
  currentDate: string;
  academicCalendar: AcademicCalendarItem[];
  specialOverrides: SpecialDayOverride[];
  userProfile: UserProfile;
}

export default function AnalyticsPanel({
  records,
  subjects,
  timetables,
  minAttendanceSetting,
  onUpdateMinAttendance,
  currentDate,
  academicCalendar,
  specialOverrides,
  userProfile
}: AnalyticsPanelProps) {
  // Filter out simulated future days
  const activeRecords = records.filter(r => r.date <= currentDate);
  const analytics = calculateAnalytics(activeRecords, subjects, timetables, minAttendanceSetting);
  const totalAttended = analytics.totalPresentHours;
  const totalScheduled = analytics.totalScheduledHours;

  // 1. Dynamic Forecasting Horizon State
  const [selectedHorizon, setSelectedHorizon] = useState<'10' | '30' | 'semester'>('10');

  // Calculate actual remaining hours for the semester using calendar-aware rules engine
  const remainingHoursInfo = getRemainingSemesterHours(
    currentDate,
    userProfile.semesterEndDate || '2026-11-30',
    timetables,
    academicCalendar,
    specialOverrides
  );
  const totalRemainingHours = remainingHoursInfo.totalRemainingHours;

  // Determine addition steps
  const projectionHours = selectedHorizon === '10'
    ? 10
    : selectedHorizon === '30'
    ? 30
    : Math.max(1, totalRemainingHours);

  // General Projections
  const forecast = calculateProjections(totalAttended, totalScheduled, projectionHours);
  const recoveryHoursNeeded = calculateRecoveryRequired(totalAttended, totalScheduled, minAttendanceSetting);

  // Filter subjects that have scheduled hours allocated to them
  const activeSubjects = Object.values(analytics.subjectWise).filter(s => s.total > 0);

  // 2. What-If Scenario Simulator State
  const [simSubject, setSimSubject] = useState<string>('overall');
  const [simAttend, setSimAttend] = useState<number>(0);
  const [simAbsent, setSimAbsent] = useState<number>(0);

  // Sync simulated target selection dynamically when subjects update
  useEffect(() => {
    if (simSubject !== 'overall' && !activeSubjects.some(s => s.code === simSubject)) {
      setSimSubject('overall');
    }
  }, [subjects, simSubject]);

  // Help Modal or Info toggles
  const [showExplanation, setShowExplanation] = useState(false);

  // Calculate simulated parameters
  let currentSimAttended = totalAttended;
  let currentSimScheduled = totalScheduled;
  let currentSimPercent = analytics.overallPercentage;
  let simSubjectName = 'Overall Semester';

  if (simSubject !== 'overall') {
    const selectedSub = activeSubjects.find(s => s.code === simSubject);
    if (selectedSub) {
      currentSimAttended = selectedSub.attended;
      currentSimScheduled = selectedSub.total;
      currentSimPercent = parseFloat(selectedSub.percent.toFixed(1));
      simSubjectName = selectedSub.name;
    }
  }

  const simulatedAttended = currentSimAttended + simAttend;
  const simulatedScheduled = currentSimScheduled + simAttend + simAbsent;
  const simulatedPercent = simulatedScheduled > 0 
    ? parseFloat(((simulatedAttended / simulatedScheduled) * 100).toFixed(1)) 
    : 100;
  const simulatedDiff = parseFloat((simulatedPercent - currentSimPercent).toFixed(1));
  const isSimPctSafe = simulatedPercent >= minAttendanceSetting;

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
                <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-100 animate-pulse">
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

      {/* 2. Middle Section: Attendance Forecasting Dynamic Horizon */}
      <div id="panel-forecast-projection" className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="font-sans font-bold text-base text-slate-900 tracking-tight">Attendance Forecasting</h3>
              <p className="text-xs text-slate-500">Project different future lookahead scenarios to protect your grades.</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-lg self-start">
            <button
              onClick={() => setSelectedHorizon('10')}
              className={`px-3 py-1 text-2xs font-bold rounded-md transition cursor-pointer ${
                selectedHorizon === '10'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Short (+10 hr)
            </button>
            <button
              onClick={() => setSelectedHorizon('30')}
              className={`px-3 py-1 text-2xs font-bold rounded-md transition cursor-pointer ${
                selectedHorizon === '30'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Mid (+30 hr)
            </button>
            <button
              onClick={() => setSelectedHorizon('semester')}
              className={`px-3 py-1 text-2xs font-bold rounded-md transition cursor-pointer ${
                selectedHorizon === 'semester'
                  ? 'bg-white text-slate-900 hover:text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Calculate exact remaining classes in your timetable"
            >
              📅 Rest of Semester (+{totalRemainingHours} hr)
            </button>
          </div>
        </div>

        {selectedHorizon === 'semester' && (
          <div className="bg-blue-50/50 border border-blue-100/30 rounded-xl p-4 flex items-start space-x-3 text-xs text-blue-700">
            <Calendar className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Real-time Timetable Lookup Active:</span> We scanned your academic calendar up to your semester end date (<span className="font-bold">{userProfile.semesterEndDate || 'N/A'}</span>), excluding holidays, midterms, and overrides. You have exactly <span className="font-bold font-mono">{totalRemainingHours} hours</span> of schedules ahead.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-center space-y-3">
            <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              If you ATTEND the next {projectionHours} classes
            </p>
            <div className="flex items-center justify-center space-x-1.5">
              <span className="text-3xl font-extrabold font-mono text-emerald-600">
                {forecast.afterAttending}%
              </span>
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                +{parseFloat((forecast.afterAttending - analytics.overallPercentage).toFixed(1))}%
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Your overall ratio climbs to <span className="font-bold text-slate-800 font-mono">{forecast.afterAttending}%</span>. Perfect to build up raw margins!
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-center space-y-3">
            <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              If you BUNK the next {projectionHours} classes
            </p>
            <div className="flex items-center justify-center space-x-1.5">
              <span className="text-3xl font-extrabold font-mono text-rose-600">
                {forecast.afterMissing}%
              </span>
              <span className="text-xs font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full">
                -{parseFloat((analytics.overallPercentage - forecast.afterMissing).toFixed(1))}%
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Your ratio falls to <span className="font-bold text-slate-800 font-mono">{forecast.afterMissing}%</span>. {forecast.afterMissing >= minAttendanceSetting ? (
                <span className="text-emerald-600 font-semibold">Safe! You remain above minimum index.</span>
              ) : (
                <span className="text-rose-600 font-semibold">Danger! Falls below target threshold.</span>
              )}
            </p>
          </div>

        </div>
      </div>

      {/* 3. Subject-wise Analytics Card with Target Calculations */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-4 w-4 text-slate-500" />
            <h3 className="font-sans font-semibold text-sm text-slate-900 tracking-tight">Course-wise Timetable Lookahead</h3>
          </div>
          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
            Real Semester Limits
          </span>
        </div>

        <div className="p-6">
          {activeSubjects.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Frown className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-500">No subject tracking initialized.</p>
              <p className="text-xs text-slate-400">Mark attendance logs in daily rosters to begin calculations.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeSubjects.map((sub, idx) => {
                const subPct = sub.percent;
                const isSafe = subPct >= minAttendanceSetting;

                // Calcs for the subject
                const subRemaining = remainingHoursInfo.subjectRemainingHours[sub.code] || 0;
                const targetCoef = minAttendanceSetting / 100;
                const totalSemesterSlots = sub.total + subRemaining;
                const maxSafeBunksForSubject = Math.floor(sub.attended + subRemaining - targetCoef * totalSemesterSlots);
                const subjectBunkAllowance = Math.max(0, maxSafeBunksForSubject);
                const targetUnreachable = (sub.attended + subRemaining) < (targetCoef * totalSemesterSlots);

                return (
                  <div key={idx} className="border border-slate-100 rounded-lg p-4 space-y-3.5 hover:bg-slate-50/50 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[9px] font-bold tracking-wider text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded">
                          {sub.code}
                        </span>
                        <h4 className="font-sans font-semibold text-sm text-slate-800 line-clamp-1 mt-1.5">
                          {sub.name}
                        </h4>
                      </div>

                      <div className="text-right">
                        <p className={`font-mono font-bold text-base ${isSafe ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {subPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {sub.attended}/{sub.total} logged
                        </p>
                      </div>
                    </div>

                    {/* Progress slider */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          isSafe ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, subPct)}%` }}
                      ></div>
                    </div>

                    {/* Dynamic Bunk Prediction for this Subject */}
                    <div className="pt-2 border-t border-slate-100/50 flex flex-col space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-450 flex items-center space-x-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>Semester Leftover: <b className="font-mono font-bold text-slate-700">{subRemaining} hr</b></span>
                        </span>
                        {targetUnreachable ? (
                          <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full font-mono text-[10px] animate-pulse">
                            🚨 Deregistered Limit
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">Bunk Index Limit</span>
                        )}
                      </div>

                      <div className="text-[10.5px] mt-1 p-2 rounded bg-slate-50/40 border border-transparent">
                        {targetUnreachable ? (
                          <span className="text-rose-650 flex items-center space-x-1.5 font-medium leading-relaxed">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                            <span>Even with 100% attendance left, maximum is <b className="font-mono font-extrabold">{((sub.attended + subRemaining) * 100 / totalSemesterSlots).toFixed(1)}%</b>. Contact Dean.</span>
                          </span>
                        ) : subjectBunkAllowance > 0 ? (
                          <span className="text-emerald-700 flex items-center space-x-1.5 font-medium leading-relaxed">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span>You can skip <b className="font-mono font-extrabold text-emerald-800">{subjectBunkAllowance} classes</b> of this course without violating {minAttendanceSetting}%.</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 flex items-center space-x-1.5 font-medium leading-relaxed">
                            <AlertOctagon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span>Must attend all <b className="font-mono font-extrabold text-amber-800">{subRemaining} classes</b> left to maintain target. Zero skips permitted!</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Interactive What-If Simulation Sandbox Card */}
      <div id="what-if-sandbox" className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <h3 className="font-sans font-bold text-sm text-slate-900 tracking-tight">🧪 Interactive "What-If" Simulation Sandbox</h3>
          </div>
          <span className="text-3s font-mono text-slate-400 bg-slate-100/50 px-2 py-0.5 rounded">
            Live Simulator Engine
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Select any course or the whole semester. Simulate attendance outcomes based on custom values of upcoming presents and absences.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Controls Panel */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Subject Selector */}
            <div className="space-y-1.5">
              <label htmlFor="sim-subject-select" className="text-xs font-bold text-slate-600 block">
                Target Subject to Simulate
              </label>
              <select
                id="sim-subject-select"
                value={simSubject}
                onChange={(e) => {
                  setSimSubject(e.target.value);
                  setSimAttend(0);
                  setSimAbsent(0);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer"
              >
                <option value="overall">Overall Semester Attendance</option>
                {activeSubjects.map((sub) => (
                  <option key={sub.code} value={sub.code}>
                    {sub.code}: {sub.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Steppers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Classes to Attend */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xs font-bold text-slate-500 font-mono">CLASSES TO ATTEND [+]</span>
                  <span className="text-sm font-mono font-bold text-emerald-600">+{simAttend}</span>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSimAttend(prev => Math.max(0, prev - 1))}
                    className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer text-slate-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-700">Present Shifts</span>
                  <button
                    type="button"
                    onClick={() => setSimAttend(prev => prev + 1)}
                    className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer text-slate-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Classes to Skip */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xs font-bold text-slate-500 font-mono">CLASSES TO BUNK [-]</span>
                  <span className="text-sm font-mono font-bold text-rose-600">-{simAbsent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSimAbsent(prev => Math.max(0, prev - 1))}
                    className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer text-slate-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-700">Absent Shifts</span>
                  <button
                    type="button"
                    onClick={() => setSimAbsent(prev => prev + 1)}
                    className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer text-slate-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSimAttend(0);
                  setSimAbsent(0);
                }}
                className="text-2xs font-mono font-bold text-slate-400 hover:text-slate-600 cursor-pointer bg-slate-100/50 px-3 py-1 rounded"
              >
                Reset Simulation Values
              </button>
            </div>
          </div>

          {/* Results Board Screen */}
          <div className="lg:col-span-5 bg-slate-50/50 border border-slate-100 rounded-xl p-5 flex flex-col justify-between space-y-4">
            
            <div className="space-y-1">
              <h4 className="text-2xs font-bold tracking-wider text-slate-400 uppercase font-mono">SIMULATION TARGET</h4>
              <p className="text-sm font-bold text-slate-800 line-clamp-1">{simSubjectName}</p>
            </div>

            <div className="py-2 flex items-baseline justify-between border-t border-b border-slate-100">
              <div className="space-y-0.5">
                <span className="text-2xs font-mono text-slate-400">Current</span>
                <p className="text-lg font-bold font-mono text-slate-500">{currentSimPercent}%</p>
              </div>

              <div className="text-center">
                <span className="text-[10px] font-mono font-bold text-slate-400">🚨 Projected</span>
                <p className={`text-4xl font-black font-mono tracking-tight ${isSimPctSafe ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {simulatedPercent}%
                </p>
              </div>

              <div className="text-right space-y-0.5">
                <span className="text-2xs font-mono text-slate-400">Shift</span>
                <p className={`text-sm font-bold font-mono ${simulatedDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {simulatedDiff >= 0 ? `+${simulatedDiff}` : simulatedDiff}%
                </p>
              </div>
            </div>

            {/* Simulated Live Assessment Status */}
            <div className={`p-3 rounded-lg border ${
              isSimPctSafe 
                ? 'bg-emerald-50/50 border-emerald-100/40 text-emerald-800' 
                : 'bg-rose-50/50 border-rose-100/40 text-rose-800'
            } flex items-start space-x-2 text-2xs leading-relaxed font-semibold`}>
              {isSimPctSafe ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    SAFE: Under this scenario, your attendance stays above the <span className="font-bold font-mono">{minAttendanceSetting}%</span> requirement. Feel free to proceed.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    DANGER: This combination drops you below the <span className="font-bold font-mono">{minAttendanceSetting}%</span> threshold! You are at risk of being flagged on college portal registers.
                  </span>
                </>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* 5. Bottom classification stats */}
      <div id="panel-category-tallies" className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          <h3 className="font-sans font-semibold text-sm text-slate-900 tracking-tight">Semester Days Classification</h3>
        </div>

        <p className="text-xs text-slate-500">
          Current count of logged days categorized by the rules engine through class history, holidays, and college event tallies.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          <div className="bg-slate-50 p-3 rounded-lg text-center">
            <p className="text-xs font-semibold text-slate-700 font-mono">Present</p>
            <p className="text-lg font-bold text-emerald-600 font-mono mt-1">{analytics.presentDaysCount}</p>
            <span className="text-[9px] font-mono text-slate-400">Class days</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg text-center">
            <p className="text-xs font-semibold text-[#ef4444] font-mono">Absent</p>
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
  );
}
