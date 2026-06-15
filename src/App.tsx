/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  User,
  Sliders,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  FileCheck2,
  Trash2,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Info,
  Clock,
  RotateCcw,
  BellRing,
  Volume2,
  VolumeX,
  MessageCircle,
  Play,
  Phone
} from 'lucide-react';
import {
  Subject,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  AttendanceRecord,
  UserProfile
} from './types';
import {
  INITIAL_SUBJECTS,
  INITIAL_TIMETABLES,
  INITIAL_ACADEMIC_CALENDAR,
  INITIAL_SPECIAL_OVERRIDES,
  INITIAL_USER_PROFILE,
  generatePrepopulatedAttendance
} from './utils/mockData';
import { getPendingUnmarkedDays, determineDayType, isAttendanceRequired, getTimetableForDate } from './utils/rulesEngine';

// Modular Component imports
import DailyAttendanceCollector from './components/DailyAttendanceCollector';
import AnalyticsPanel from './components/AnalyticsPanel';
import CalendarManager from './components/CalendarManager';
import TimetableManager from './components/TimetableManager';
import ExportShareHandler from './components/ExportShareHandler';
import AttendanceDashboard from './components/AttendanceDashboard';
import { ImageCropper } from './components/ImageCropper';

export default function App() {
  // --- Stateful persistent system ---
  const [currentDate, setCurrentDate] = useState<string>('2026-06-12'); // Simulation date
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [subjects, setSubjects] = useState<Subject[]>(INITIAL_SUBJECTS);
  const [timetables, setTimetables] = useState<Timetable[]>(INITIAL_TIMETABLES);
  const [academicCalendar, setAcademicCalendar] = useState<AcademicCalendarItem[]>(INITIAL_ACADEMIC_CALENDAR);
  const [specialOverrides, setSpecialOverrides] = useState<SpecialDayOverride[]>(INITIAL_SPECIAL_OVERRIDES);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  // Persistent user notification configurations
  const [showProfileEditDialog, setShowProfileEditDialog] = useState(false);
  const [tempImageForCrop, setTempImageForCrop] = useState<string | null>(null);
  const [autoRemindersEnabled, setAutoRemindersEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('the_arc_auto_reminders_enabled');
    return saved === null ? true : saved === 'true';
  });

  const [activeTab, setActiveTab] = useState<'daily' | 'attendance' | 'analytics' | 'calendar' | 'timetable' | 'export'>('daily');
  const [showNotificationToast, setShowNotificationToast] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  // Derive unmarked working days from rules engine
  const pendingDays = getPendingUnmarkedDays(
    currentDate,
    records,
    timetables,
    academicCalendar,
    specialOverrides
  );

  // Check if simulated currentDate represents an unmarked working day
  const isTodayUnmarked = (() => {
    const { dayType } = determineDayType(currentDate, specialOverrides, academicCalendar);
    if (!isAttendanceRequired(dayType)) return false;

    const activeTimetable = getTimetableForDate(currentDate, timetables);
    const d = new Date(currentDate);
    const dayIndexStr = String(d.getDay());
    const scheduledSlots = activeTimetable ? activeTimetable.slots[dayIndexStr] : [];
    const totalScheduledHours = scheduledSlots ? scheduledSlots.reduce((sum, s) => sum + s.hours, 0) : 0;

    if (totalScheduledHours === 0) return false;

    const todayRecord = records.find(r => r.date === currentDate);
    return !todayRecord || !todayRecord.isMarked;
  })();

  // Synchronize daily unmarked status with outstanding toast alert banner
  useEffect(() => {
    const { dayType } = determineDayType(currentDate, specialOverrides, academicCalendar);
    if (!isAttendanceRequired(dayType)) {
      setShowNotificationToast(false);
      return;
    }

    const activeTimetable = getTimetableForDate(currentDate, timetables);
    const d = new Date(currentDate);
    const dayIndexStr = String(d.getDay());
    const scheduledSlots = activeTimetable ? activeTimetable.slots[dayIndexStr] || [] : [];
    const totalScheduledHours = scheduledSlots.reduce((sum, s) => sum + s.hours, 0);

    if (totalScheduledHours === 0) {
      setShowNotificationToast(false);
      return;
    }

    const todayRecord = records.find(r => r.date === currentDate);
    const unmarked = !todayRecord || !todayRecord.isMarked;
    setShowNotificationToast(unmarked);
  }, [currentDate, records, specialOverrides, academicCalendar, timetables]);

  // --- Initial loading lifecycle ---
  useEffect(() => {
    // Read local histories
    try {
      const storedProfile = localStorage.getItem('the_arc_profile');
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile);
        const unified = { ...INITIAL_USER_PROFILE, ...parsed };
        setUserProfile(unified);
      } else {
        setUserProfile(INITIAL_USER_PROFILE);
      }

      const storedSubjects = localStorage.getItem('the_arc_subjects');
      const loadedSubjects: Subject[] = storedSubjects ? JSON.parse(storedSubjects) : INITIAL_SUBJECTS;
      setSubjects(loadedSubjects);

      const storedTimetables = localStorage.getItem('the_arc_timetables');
      let currentTimetables = INITIAL_TIMETABLES;
      let hasV1 = false;
      if (storedTimetables) {
        const parsed = JSON.parse(storedTimetables);
        if (Array.isArray(parsed)) {
          hasV1 = parsed.some((t: any) => t.id === 'tt_v1');
          if (!hasV1) {
            currentTimetables = parsed;
          }
        }
      }

      // Auto-align any lab slot hours to matching subjects' allocated lab hours
      currentTimetables = currentTimetables.map((tt: Timetable) => {
        const updatedSlots = { ...tt.slots };
        let modified = false;
        Object.keys(updatedSlots).forEach((dayKey) => {
          updatedSlots[dayKey] = updatedSlots[dayKey].map((slot) => {
            const matchedSub = loadedSubjects.find((s: Subject) => s.code === slot.subjectCode);
            if (matchedSub && matchedSub.isLab) {
              const expectedHours = matchedSub.labHours || 3;
              if (slot.hours !== expectedHours) {
                modified = true;
                return { ...slot, hours: expectedHours };
              }
            }
            return slot;
          });
        });
        return modified ? { ...tt, slots: updatedSlots } : tt;
      });

      if (hasV1) {
        // Upgrade to new v2 timetable (Friday 7-hour config)
        setTimetables(INITIAL_TIMETABLES);
        localStorage.setItem('the_arc_timetables', JSON.stringify(INITIAL_TIMETABLES));

        const dummyLogs = generatePrepopulatedAttendance();
        setRecords(dummyLogs);
        localStorage.setItem('the_arc_records', JSON.stringify(dummyLogs));
      } else {
        setTimetables(currentTimetables);
        localStorage.setItem('the_arc_timetables', JSON.stringify(currentTimetables));

        const storedRecords = localStorage.getItem('the_arc_records');
        if (storedRecords) {
          setRecords(JSON.parse(storedRecords));
        } else {
          const dummyLogs = generatePrepopulatedAttendance();
          setRecords(dummyLogs);
          localStorage.setItem('the_arc_records', JSON.stringify(dummyLogs));
        }
      }

      const storedCalendar = localStorage.getItem('the_arc_calendar');
      if (storedCalendar) setAcademicCalendar(JSON.parse(storedCalendar));

      const storedOverrides = localStorage.getItem('the_arc_overrides');
      if (storedOverrides) setSpecialOverrides(JSON.parse(storedOverrides));

    } catch (e) {
      console.error("Storage loading failed:", e);
    }
  }, []);

  // Sync state helpers to persistent local storage
  const saveRecordsToStore = (newRecords: AttendanceRecord[]) => {
    setRecords(newRecords);
    localStorage.setItem('the_arc_records', JSON.stringify(newRecords));
  };

  const saveProfileToStore = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    localStorage.setItem('the_arc_profile', JSON.stringify(newProfile));
  };

  const processAndSaveImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // High fidelity resize down to safe max boundary of 400x500
        // Conserves local storage space and works flawlessly on any mobile browser high-res clicks
        const maxDim = 400;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fill white background for transparent formats like PNGs to display correctly as JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          try {
            // Compress image to light weight standard JPEG representation
            const compressedUrl = canvas.toDataURL('image/jpeg', 0.85);
            saveProfileToStore({ ...userProfile, imageUrl: compressedUrl });
          } catch (e) {
            // Canvas security or export error fallback to direct DataURL
            console.warn("Canvas compress was blocked or failed, using raw upload", e);
            saveProfileToStore({ ...userProfile, imageUrl: event.target?.result as string });
          }
        } else {
          saveProfileToStore({ ...userProfile, imageUrl: event.target?.result as string });
        }
      };
      img.onerror = () => {
        saveProfileToStore({ ...userProfile, imageUrl: event.target?.result as string });
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      console.error("FileReader failed reading image file");
    };
    reader.readAsDataURL(file);
  };

  const saveSubjectsToStore = (newSubjects: Subject[]) => {
    setSubjects(newSubjects);
    localStorage.setItem('the_arc_subjects', JSON.stringify(newSubjects));
  };

  const saveTimetablesToStore = (newTimetables: Timetable[]) => {
    setTimetables(newTimetables);
    localStorage.setItem('the_arc_timetables', JSON.stringify(newTimetables));
  };

  const saveCalendarToStore = (newCalendar: AcademicCalendarItem[]) => {
    setAcademicCalendar(newCalendar);
    localStorage.setItem('the_arc_calendar', JSON.stringify(newCalendar));
  };

  const saveOverridesToStore = (newOverrides: SpecialDayOverride[]) => {
    setSpecialOverrides(newOverrides);
    localStorage.setItem('the_arc_overrides', JSON.stringify(newOverrides));
  };

  // --- Application state modifier functions ---

  // Create or Update Attendance Record safely
  const handleSaveAttendanceRecord = (newRecord: AttendanceRecord) => {
    const updated = [...records];
    const matchIdx = updated.findIndex(r => r.date === newRecord.date);
    if (matchIdx >= 0) {
      updated[matchIdx] = newRecord;
    } else {
      updated.push(newRecord);
    }
    saveRecordsToStore(updated);
  };

  // Remove individual attendance record
  const handleDeleteAttendanceRecord = (dateStr: string) => {
    const filtered = records.filter(r => r.date !== dateStr);
    saveRecordsToStore(filtered);
  };

  // Subjects controllers
  const handleAddSubject = (sub: Subject) => {
    const exists = subjects.some(s => s.code === sub.code);
    if (exists) {
      alert(`Subject with code "${sub.code}" already exists.`);
      return;
    }
    const updated = [...subjects, sub];
    saveSubjectsToStore(updated);
  };

  const handleUpdateSubject = (oldCode: string, updatedSub: Subject) => {
    // 1. Update subjects list
    const updatedSubjects = subjects.map(s => s.code === oldCode ? updatedSub : s);
    saveSubjectsToStore(updatedSubjects);

    // 2. Propagate code changes to timetables and records if it changed to keep relationships intact
    if (oldCode !== updatedSub.code) {
      const updatedTimetables = timetables.map(tt => {
        const updatedSlots = { ...tt.slots };
        let modified = false;
        Object.keys(updatedSlots).forEach((dayKey) => {
          updatedSlots[dayKey] = updatedSlots[dayKey].map((slot) => {
            if (slot.subjectCode === oldCode) {
              modified = true;
              return { ...slot, subjectCode: updatedSub.code };
            }
            return slot;
          });
        });
        return modified ? { ...tt, slots: updatedSlots } : tt;
      });
      saveTimetablesToStore(updatedTimetables);

      const updatedRecords = records.map(r => {
        let modified = false;
        let missed = r.missedClasses;
        if (missed.includes(oldCode)) {
          missed = missed.map(m => m === oldCode ? updatedSub.code : m);
          modified = true;
        }
        let labAtt = r.labAttendance;
        if (labAtt && labAtt.subjectCode === oldCode) {
          labAtt = { ...labAtt, subjectCode: updatedSub.code };
          modified = true;
        }
        return modified ? { ...r, missedClasses: missed, labAttendance: labAtt } : r;
      });
      saveRecordsToStore(updatedRecords);
    }
  };

  const handleDeleteSubject = (code: string) => {
    const filtered = subjects.filter(s => s.code !== code);
    saveSubjectsToStore(filtered);
  };

  // Replace active timetable hierarchy
  const handleReplaceTimetable = (newTt: Timetable) => {
    const updated = [...timetables, newTt];
    saveTimetablesToStore(updated);
  };

  const handleImportTimetableAndProfile = (imported: {
    collegeName: string;
    degree: string;
    branch: string;
    semester: string;
    subjects: Subject[];
    timetableSlots: Record<string, any[]>;
  }) => {
    // 1. Update user profile
    const updatedProfile = {
      ...userProfile,
      collegeName: imported.collegeName,
      degree: imported.degree,
      branch: imported.branch,
      semester: imported.semester,
    };
    saveProfileToStore(updatedProfile);

    // 2. Set the subjects
    saveSubjectsToStore(imported.subjects);

    // 3. Set the new timetable
    const newTt: Timetable = {
      id: `tt_imported_${Date.now()}`,
      effectiveFrom: '2026-05-01',
      slots: imported.timetableSlots
    };
    saveTimetablesToStore([newTt]);

    // 4. Generate some representative sample logs for this imported structure
    const start = new Date(2026, 4, 4); // May 4th, 2026 (Monday) in timezone
    const today = new Date(2026, 5, 12); // June 12th, 2026 (Friday)
    const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const newRecords: AttendanceRecord[] = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayIndexStr = String(d.getDay());
      const dayName = dayOfWeekNames[d.getDay()];

      const scheduledSlots = imported.timetableSlots[dayIndexStr] || [];
      const totalScheduledHours = scheduledSlots.reduce((sum, slot) => sum + slot.hours, 0);

      // Simple filter logic for weekends
      const isWeekendOff = dayIndexStr === '0' || dayIndexStr === '6';

      if (totalScheduledHours > 0 && !isWeekendOff) {
        const rand = Math.random();
        let attendedHours = totalScheduledHours;
        let missedClasses: string[] = [];

        if (rand > 0.85) {
          attendedHours = 0;
        } else if (rand > 0.65 && scheduledSlots.length > 1) {
          const missedSlot = scheduledSlots[Math.floor(Math.random() * scheduledSlots.length)];
          missedClasses = [missedSlot.subjectCode];
          attendedHours = totalScheduledHours - missedSlot.hours;
        }

        newRecords.push({
          date: dateStr,
          dayOfWeek: dayName,
          dayType: 'Regular',
          scheduledHours: totalScheduledHours,
          attendedHours,
          missedClasses,
          isMarked: true
        });
      }
    }
    saveRecordsToStore(newRecords);
  };

  // Academic calendar additions
  const handleAddCalendarItem = (item: AcademicCalendarItem) => {
    const updated = [...academicCalendar.filter(c => c.date !== item.date), item];
    saveCalendarToStore(updated);
  };

  const handleAddOverride = (override: SpecialDayOverride) => {
    const updated = [...specialOverrides.filter(o => o.date !== override.date), override];
    saveOverridesToStore(updated);
    
    // Auto purge preprocessed attendance for that date to enforce recalculating hours!
    const filteredRecord = records.filter(r => r.date !== override.date);
    saveRecordsToStore(filteredRecord);
  };

  // Calendar deletions
  const handleDeleteCalendarItem = (dateStr: string) => {
    const filtered = academicCalendar.filter(c => c.date !== dateStr);
    saveCalendarToStore(filtered);
  };

  const handleDeleteOverride = (dateStr: string) => {
    const filtered = specialOverrides.filter(o => o.date !== dateStr);
    saveOverridesToStore(filtered);
  };

  // Export & Share triggers inside calendar details
  const handleTriggerShareDate = (dateStr: string) => {
    const record = records.find(r => r.date === dateStr);
    if (!record) return;
    const text = `The Arc Summary - Date: ${record.date} (${record.dayOfWeek})\nStatus: ${record.dayType}\nScheduled: ${record.scheduledHours} hrs, Attended: ${record.attendedHours} hrs.\nDetails logged via The Arc rule attendance desk.`;
    navigator.clipboard.writeText(text);
    alert(`Copied summary for ${dateStr} into system keyboard sharing buffer ✅`);
  };

  const handleTriggerExportDate = (dateStr: string) => {
    const record = records.find(r => r.date === dateStr);
    if (!record) return;
    const header = "Date,Day,DayType,ScheduledHours,AttendedHours,MissedClasses,Notes\n";
    const row = `"${record.date}","${record.dayOfWeek}","${record.dayType}",${record.scheduledHours},${record.attendedHours},"${record.missedClasses.join(';')}"\n`;
    
    const blob = new Blob([header + row], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `The_Arc_Log_${dateStr}.csv`;
    link.click();
  };

  // Wipe data / restore sample data triggers
  const handleFullReset = () => {
    if (confirm("Are you absolutely sure you want to purge all attendance history and wipe saved class configs? This action cannot be reversed.")) {
      saveRecordsToStore([]);
      saveProfileToStore(INITIAL_USER_PROFILE);
      saveSubjectsToStore(INITIAL_SUBJECTS);
      saveTimetablesToStore(INITIAL_TIMETABLES);
      saveCalendarToStore([]);
      saveOverridesToStore([]);
      alert("All records wiped. Database environment clean.");
    }
  };

  const handleRestoreSampleData = () => {
    const prepopulated = generatePrepopulatedAttendance();
    saveRecordsToStore(prepopulated);
    saveProfileToStore(INITIAL_USER_PROFILE);
    saveSubjectsToStore(INITIAL_SUBJECTS);
    saveTimetablesToStore(INITIAL_TIMETABLES);
    saveCalendarToStore(INITIAL_ACADEMIC_CALENDAR);
    saveOverridesToStore(INITIAL_SPECIAL_OVERRIDES);
    alert("Indian B.Tech engineering semester VI sample records loaded successfully! Charts and safe bunk margins populated.");
  };  return (
    <div className="the-arc-body min-h-screen bg-[#0A0C10] text-[#E2E8F0] font-sans selection:bg-blue-500/30 flex flex-col md:flex-row print:bg-white print:text-black">
      
      {/* Sidebar - Sleek Theme left navigation drawer (desktop-only) */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-b md:border-b-0 md:border-r border-white/5 bg-[#0D1117] px-6 py-8 print:hidden">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white font-sans text-sm">Λ</div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">The Arc</h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Rule Engine Status</p>
          </div>
        </div>
        
        {/* Sidebar Nav Items */}
        <nav className="flex md:flex-col gap-1 md:space-y-1 overflow-x-auto pb-0 md:flex-1 shrink-0">
          <button
            id="sidebar-btn-daily"
            onClick={() => setActiveTab('daily')}
            className={`flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'daily'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-xs'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'daily' ? 'bg-blue-500' : 'bg-transparent'}`} />
              <span>Daily Assistant</span>
            </div>
            {pendingDays.length > 0 && (
              <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0">
                {pendingDays.length}
              </span>
            )}
          </button>

          <button
            id="sidebar-btn-attendance"
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'attendance'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-xs'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'attendance' ? 'bg-blue-500' : 'bg-transparent'}`} />
            <span>Attendance</span>
          </button>

          <button
            id="sidebar-btn-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-xs'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'analytics' ? 'bg-blue-500' : 'bg-transparent'}`} />
            <span>Forecast & Analytics</span>
          </button>

          <button
            id="sidebar-btn-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'calendar'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-xs'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'calendar' ? 'bg-blue-500' : 'bg-transparent'}`} />
            <span>Academic Calendar</span>
          </button>

          <button
            id="sidebar-btn-timetable"
            onClick={() => setActiveTab('timetable')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'timetable'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-xs'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'timetable' ? 'bg-blue-500' : 'bg-transparent'}`} />
            <span>Weekly Timetable</span>
          </button>

          <button
            id="sidebar-btn-export"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'export'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-xs'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'export' ? 'bg-blue-500' : 'bg-transparent'}`} />
            <span>Export & Share</span>
          </button>
        </nav>

        {/* Status widget on sidebar bottom */}
        <div className="hidden md:block mt-auto p-4 rounded-xl bg-slate-900/40 border border-white/5">
          <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-1">Rule Engine Status</div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>v1.0.4 ACTIVE</span>
          </div>
        </div>
      </aside>

      {/* Main Container section */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Mobile Top Header Cockpit (hidden on desktop screens) */}
        <header className="md:hidden border-b border-white/10 bg-[#0D1117]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-40 select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-blue-900/20">Λ</div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white uppercase leading-none">The Arc</h1>
              <span className="text-[8px] font-mono text-emerald-400 flex items-center gap-1 mt-1 font-bold leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                ACTIVE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick date picker */}
            <div className="flex items-center space-x-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px]">
              <span className="text-slate-500 font-mono">Date:</span>
              <input
                id="mobile-simulator-date-picker"
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="font-mono text-[10px] font-bold bg-transparent border-0 text-white outline-none focus:ring-0 cursor-pointer p-0 w-[80px]"
              />
            </div>

            {/* Notification triggers widget */}
            <div className="relative">
              <button
                id="mobile-bell-notifications-trigger"
                onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                className="relative p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center h-8 w-8"
                title="Pending & Unmarked Attendance Days Indicator"
              >
                <BellRing className={`h-4 w-4 ${pendingDays.length > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
                {pendingDays.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-650 bg-red-650 bg-red-600 text-[8px] font-bold text-white ring-2 ring-[#0D1117] animate-bounce">
                    {pendingDays.length}
                  </span>
                )}
              </button>

              {showNotificationsDropdown && (
                <div className="absolute right-0 mt-2.5 w-72 rounded-xl bg-[#0D1117] border border-white/15 shadow-2xl z-50 overflow-hidden text-left">
                  <div className="flex items-center justify-between p-3.5 border-b border-white/5 bg-slate-900/40">
                    <div className="flex items-center space-x-2">
                      <BellRing className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-sans font-bold text-xs text-white">Attendance Alerts</span>
                    </div>
                    {pendingDays.length > 0 ? (
                      <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-mono font-bold uppercase shrink-0">
                        {pendingDays.length} Action Needed
                      </span>
                    ) : (
                      <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-mono font-bold uppercase shrink-0">
                        All Saved
                      </span>
                    )}
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                    {pendingDays.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                        <div className="text-lg">🎉</div>
                        <p className="font-bold text-slate-200">System caught up!</p>
                        <p className="text-[10px] text-slate-500">Every working date is logged correctly.</p>
                      </div>
                    ) : (
                      pendingDays.map((day, ix) => (
                        <div
                          key={ix}
                          onClick={() => {
                            setCurrentDate(day.date);
                            setActiveTab('daily');
                            setShowNotificationsDropdown(false);
                          }}
                          className="p-3 hover:bg-white/5 cursor-pointer text-left transition-colors flex items-center justify-between group"
                        >
                          <div className="space-y-0.5 pr-2">
                            <div className="text-[11px] font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                              {day.dayOfWeek.substring(0,3)}, {day.date}
                            </div>
                            <div className="text-[9px] text-[#64748B] flex items-center space-x-1">
                              <span className="inline-block w-1 h-1 rounded-full bg-slate-500" />
                              <span>{day.scheduledHours}h Scheduled Classes</span>
                            </div>
                          </div>
                          <button className="text-[9px] bg-blue-600/25 text-blue-400 border border-blue-500/25 font-bold px-2 py-1 rounded cursor-pointer leading-none">
                            Log
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Header cockpit (desktop only) */}
        <header className="hidden md:flex border-b border-white/5 flex-col sm:flex-row items-center justify-between px-6 md:px-8 py-4 sm:h-20 bg-[#0D1117]/50 gap-4 shrink-0">
          
          <div className="flex flex-col text-center sm:text-left self-stretch sm:self-auto justify-center">
            <div className="text-xs text-[#64748B] tracking-wider uppercase font-mono font-bold leading-none">Simulation Context</div>
            <div className="text-sm font-semibold text-white mt-1.5 flex items-center gap-2 justify-center sm:justify-start">
              <span>{(() => {
                const parts = currentDate.split('-');
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                const d = parseInt(parts[2], 10);
                return new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
              })()}</span>
              <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-semibold">Live Mode</span>
            </div>
          </div>

          {/* Quick Date Simulator tool */}
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-2 bg-white/5 border border-white/5 rounded-lg p-1 text-xs">
              <span className="text-slate-400 font-mono pl-2">Virtual Date:</span>
              <input
                id="simulator-date-picker"
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="font-mono text-xs font-bold bg-transparent border-0 text-white outline-none focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                id="bell-notifications-trigger"
                onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                className="relative p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center h-8"
                title="Pending & Unmarked Attendance Days Override"
              >
                <BellRing className={`h-4 w-4 ${pendingDays.length > 0 ? 'animate-bounce text-amber-400' : 'text-slate-400'}`} />
                {pendingDays.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-650 bg-red-600 text-[9px] font-bold text-white ring-2 ring-[#0D1117] animate-pulse">
                    {pendingDays.length}
                  </span>
                )}
              </button>

              {showNotificationsDropdown && (
                <div className="absolute right-0 sm:-right-20 md:right-0 mt-2 w-80 rounded-xl bg-[#0D1117] border border-white/10 shadow-2xl z-50 overflow-hidden text-left">
                  <div className="flex items-center justify-between p-3.5 border-b border-white/5 bg-slate-900/40">
                    <div className="flex items-center space-x-2">
                      <BellRing className="h-4 w-4 text-slate-400" />
                      <span className="font-sans font-bold text-xs text-white">Attendance Alerts</span>
                    </div>
                    {pendingDays.length > 0 ? (
                      <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-mono font-bold uppercase">
                        {pendingDays.length} Action Needed
                      </span>
                    ) : (
                      <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-mono font-bold uppercase">
                        All Marked
                      </span>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                    {pendingDays.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                        <div className="text-xl">🎉</div>
                        <p className="font-bold text-slate-200">All caught up!</p>
                        <p className="text-[10px] text-slate-500">Every working date up to today has been registered.</p>
                      </div>
                    ) : (
                      pendingDays.map((day, ix) => (
                        <div
                          key={ix}
                          onClick={() => {
                            setCurrentDate(day.date);
                            setActiveTab('daily');
                            setShowNotificationsDropdown(false);
                          }}
                          className="p-3 hover:bg-white/5 cursor-pointer text-left transition-colors flex items-center justify-between group"
                        >
                          <div className="space-y-0.5 pr-2">
                            <div className="text-xs font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                              {day.dayOfWeek}, {day.date}
                            </div>
                            <div className="text-[10px] text-[#64748B] flex items-center space-x-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500" />
                              <span>{day.scheduledHours} Working Hours Scheduled</span>
                            </div>
                          </div>
                          <button className="text-[9px] bg-[#2563EB] text-white font-bold p-1.5 px-2.5 rounded transition shrink-0 cursor-pointer">
                            Log
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {pendingDays.length > 0 && (
                    <div className="p-2 border-t border-white/5 bg-slate-900/10 text-center">
                      <p className="text-[9px] text-slate-500 font-medium">
                        Click any alert to jump directly to that date and log hours.
                      </p>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>


        </header>

        {/* Global Toast Alert banner if user hasn't marked today's metrics */}
        {showNotificationToast && activeTab !== 'daily' && (
          <div
            id="notification-daily-toast"
            onClick={() => setActiveTab('daily')}
            className="bg-[#0D1117] hover:bg-[#161B22] border-b border-white/5 cursor-pointer px-4 sm:px-6 py-3 text-xs font-medium flex items-center justify-between transition-colors print:hidden"
          >
            <div className="flex items-center space-x-2">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-slate-350 pr-2 truncate">
                Today's attendance has not been registered ({currentDate}).
              </span>
            </div>
            <span className="font-mono bg-blue-500/10 border border-blue-500/25 rounded px-2 py-0.5 text-[9px] text-blue-400 font-bold uppercase tracking-wider shrink-0">
              Log
            </span>
          </div>
        )}

        {/* Workspace core panels */}
        <div className="flex-1 p-2.5 sm:p-4 md:p-8 overflow-y-auto space-y-4 sm:space-y-6">
          
          {/* Print Headers */}
          <div id="print-layout-headers" className="hidden print:block space-y-3 pb-4 border-b border-slate-350">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">The Arc: Semester Attendance Report</h2>
                <p className="text-xs text-slate-500">Student Profile: {userProfile.name} ({userProfile.course}) / Roll: {userProfile.rollNo}</p>
              </div>
              <div className="text-right font-mono text-xs">
                <p>Generated Date: {new Date().toLocaleDateString()}</p>
                <p>Rule Engine Architecture: V1.0</p>
              </div>
            </div>
          </div>

          {/* Student Academic Passport (Official Profile Card - visible on all tabs) */}
          <div className="bg-[#0D1117]/95 border border-blue-900/40 rounded-xl p-1.5 xs:p-2 sm:p-2 shadow-lg relative overflow-hidden transition-all bg-radial-[at_top_right] from-blue-950/20 to-transparent print:hidden max-w-[330px] xs:max-w-[380px] sm:max-w-[430px] mx-auto w-[98%] sm:w-full">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
            
            <div className="flex flex-row items-start justify-between gap-1 xs:gap-2 sm:gap-3.5 relative z-10">
              
              {/* Aligned Student Information Table Block */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-1 border-b border-white/5 pb-0.5 mb-0.5">
                  <h2 className="text-[8px] xs:text-[9px] sm:text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-blue-400 uppercase tracking-tight">
                    STUDENT PROFILE
                  </h2>
                  <span className="px-0.8 py-0.2 text-[6px] sm:text-[6.5px] font-mono font-bold bg-blue-500/10 border border-blue-500/25 text-blue-400 rounded leading-none select-none">
                    ARC
                  </span>
                </div>

                <div className="overflow-x-auto scrollbar-none">
                  <table className="w-full text-slate-300 font-sans border-collapse">
                    <tbody>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">STUDENT NAME</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 text-white font-extrabold uppercase tracking-wide text-left text-[8.5px] xs:text-[9px] sm:text-[9.5px] truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">
                          {userProfile.name || 'MAHESH NAIDU'}
                        </td>
                      </tr>
                      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">ROLL NO</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 font-mono text-blue-400 font-bold tracking-wider text-left text-[8.5px] xs:text-[9px] sm:text-[9.5px] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">
                          {userProfile.rollNo || '249Y1A3958'}
                        </td>
                      </tr>
                      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">DEGREE</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 text-slate-200 font-semibold text-left text-[8px] xs:text-[8.5px] sm:text-[9px] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">{userProfile.degree || 'B.Tech'}</td>
                      </tr>
                      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">BRANCH</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 text-slate-200 font-semibold text-left text-[8px] xs:text-[8.5px] sm:text-[9px ] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">{userProfile.branch || 'AIML'}</td>
                      </tr>
                      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">SEMESTER</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 text-blue-400 font-bold text-left text-[8px] xs:text-[8.5px] sm:text-[9px] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">{userProfile.semester || 'Semester V'}</td>
                      </tr>
                      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">COLLEGE</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 text-slate-200 font-medium text-left text-[8px] xs:text-[8.5px] sm:text-[9px] leading-tight truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none" title={userProfile.collegeName || 'KSRM College Of Engineering'}>
                          🏫 {userProfile.collegeName || 'KSRM College Of Engineering'}
                        </td>
                      </tr>
                      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">EMAIL</td>
                        <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                        <td className="py-[1px] sm:py-[1.5px] pl-1 font-mono text-left text-[8px] xs:text-[8.5px] sm:text-[9px] truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none flex-1">
                          <a href={`mailto:${userProfile.email || '249Y1A3958@gmail.com'}`} className="text-slate-300 hover:text-blue-400 transition-colors underline decoration-blue-500/10 break-all" title={userProfile.email}>
                            {userProfile.email || '249Y1A3958@gmail.com'}
                          </a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ultra-compact Photo & Actions badge - Aligned properly at the TOP right */}
              <div className="flex flex-col items-center justify-start gap-1 shrink-0 border-l border-white/5 pl-1.5 xs:pl-2 sm:pl-2.5 pt-1.5 self-start select-none">
                
                {/* Photo ID Box Layout */}
                <div 
                  onClick={() => setShowProfileEditDialog(true)}
                  className="w-[36px] h-[48px] xs:w-[44px] xs:h-[56px] sm:w-[56px] sm:h-[72px] border border-blue-500/20 rounded-md overflow-hidden bg-gradient-to-b from-[#181D26] to-[#0D1117] relative flex flex-col items-center justify-center p-0.5 text-center text-amber-500 shadow-sm group cursor-pointer hover:border-blue-500/40 transition-all shrink-0"
                  title="Click to edit profile photo"
                >
                  {userProfile.imageUrl ? (
                    <img 
                      key={userProfile.imageUrl}
                      src={userProfile.imageUrl} 
                      alt="Student Portrait" 
                      className="w-full h-full object-cover rounded group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center relative w-full h-full animate-pulse-slow">
                      <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/50 via-transparent to-transparent opacity-80" />
                      <svg className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5 text-blue-500/50 mb-0.5 group-hover:text-blue-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M22.5 12h-4.5m4.5 0a3.375 3.375 0 01-3.375-3.375h-1.5A3.375 3.375 0 019.75 12H5.25m17.25 0a3.375 3.375 0 01-3.375 3.375h-1.5a3.375 3.375 0 01-3.375-3.375M1.5 12h3M1.5 12a3.375 3.375 0 013.375-3.375h1.5A3.375 3.375 0 019.75 12M1.5 12a3.375 3.375 0 003.375 3.375h1.5A3.375 3.375 0 009.75 12M5.25 12h4.5" />
                      </svg>
                      <span className="text-[3.5px] xs:text-[4px] sm:text-[6px] uppercase font-mono font-bold tracking-wider text-slate-500 group-hover:text-amber-500 transition-colors">THE ARC</span>
                    </div>
                  )}
                  <div className="absolute bottom-0.5 right-0.5 text-[3px] xs:text-[3.5px] sm:text-[5px] font-mono text-slate-400 font-extrabold bg-black/60 px-0.5 py-0.1 rounded uppercase tracking-wider">
                    PHOTO ID
                  </div>
                </div>

                <div className="w-full text-center space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setShowProfileEditDialog(true)}
                    className="w-full px-1 py-0.5 text-[5.5px] xs:text-[6.5px] sm:text-[7px] font-bold bg-[#1D4ED8]/10 border border-[#2563EB]/40 hover:border-blue-400 text-blue-400 hover:text-white rounded transition cursor-pointer flex items-center justify-center gap-0.5 shadow-sm active:scale-95 leading-none"
                    title="Edit Profile details"
                  >
                    <span>Edit ⚙️</span>
                  </button>
                  <p className="text-[5px] xs:text-[5.5px] sm:text-[6.5px] text-slate-500 font-mono tracking-wide leading-tight mt-0.5 hover:text-slate-400 transition-colors">
                    Click to upload
                  </p>
                </div>

              </div>
            </div>
          </div>

          {/* Core switches */}
          <div className="min-h-[460px] print:block">
            
            {/* DAILY COLLECTOR VIEW */}
            {activeTab === 'daily' && (
              <div className="max-w-2xl mx-auto space-y-6 print:hidden">
                <div className="space-y-1 text-center py-4">
                  <span className="text-[10px] font-mono font-bold tracking-widest text-blue-400 uppercase">
                    Daily Logging Console
                  </span>
                  <h2 className="font-sans font-extrabold text-2xl text-white tracking-tight">
                    Verify & Log Classes
                  </h2>
                  <p className="text-xs text-slate-400">
                    Select your attended hours based on today's timetable list.
                  </p>
                </div>

                <DailyAttendanceCollector
                  currentDate={currentDate}
                  records={records}
                  subjects={subjects}
                  timetables={timetables}
                  academicCalendar={academicCalendar}
                  specialOverrides={specialOverrides}
                  onSave={handleSaveAttendanceRecord}
                  onDelete={handleDeleteAttendanceRecord}
                />
              </div>
            )}

            {/* ATTENDANCE WORKFLOW VIEW */}
            {activeTab === 'attendance' && (
              <AttendanceDashboard
                records={records}
                subjects={subjects}
                timetables={timetables}
                currentDate={currentDate}
                userProfile={userProfile}
              />
            )}

            {/* ANALYTICS VIEW */}
            {activeTab === 'analytics' && (
              <AnalyticsPanel
                records={records}
                subjects={subjects}
                timetables={timetables}
                minAttendanceSetting={userProfile.minAttendance}
                onUpdateMinAttendance={(val) => saveProfileToStore({ ...userProfile, minAttendance: val })}
                currentDate={currentDate}
              />
            )}

            {/* CALENDAR VIEW */}
            {activeTab === 'calendar' && (
              <CalendarManager
                currentDate={currentDate}
                onSelectDate={setCurrentDate}
                records={records}
                subjects={subjects}
                timetables={timetables}
                academicCalendar={academicCalendar}
                specialOverrides={specialOverrides}
                onAddCalendarItem={handleAddCalendarItem}
                onAddOverride={handleAddOverride}
                onDeleteCalendarItem={handleDeleteCalendarItem}
                onDeleteOverride={handleDeleteOverride}
                onTriggerShare={handleTriggerShareDate}
                onTriggerExport={handleTriggerExportDate}
              />
            )}

            {/* TIMETABLE VIEW */}
            {activeTab === 'timetable' && (
              <TimetableManager
                subjects={subjects}
                timetables={timetables}
                onAddSubject={handleAddSubject}
                onUpdateSubject={handleUpdateSubject}
                onDeleteSubject={handleDeleteSubject}
                onReplaceTimetable={handleReplaceTimetable}
                currentDate={currentDate}
                onImportTimetableAndProfile={handleImportTimetableAndProfile}
              />
            )}

            {/* EXPORT & SHARE VIEW */}
            {activeTab === 'export' && (
              <ExportShareHandler
                records={records}
                subjects={subjects}
                userProfile={userProfile}
                timetables={timetables}
                currentDate={currentDate}
              />
            )}

            {/* Printable Ledger backup */}
            <div className="hidden print:block space-y-4 font-mono text-[11px] text-slate-800">
              <h4 className="font-sans font-bold text-sm text-slate-900 border-b pb-1">Historical Log Ledger Table</h4>
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 uppercase text-[9px] border-b border-slate-300">
                    <th className="p-2 border border-slate-350">Date</th>
                    <th className="p-2 border border-slate-350">Day</th>
                    <th className="p-2 border border-slate-350">Classification</th>
                    <th className="p-2 border border-slate-350 text-center">Scheduled Hour</th>
                    <th className="p-2 border border-slate-350 text-center">Attended Hour</th>
                    <th className="p-2 border border-slate-350">Skipped Courses</th>
                  </tr>
                </thead>
                <tbody>
                  {records.sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="p-2 font-bold border border-slate-300">{r.date}</td>
                      <td className="p-2 border border-slate-300">{r.dayOfWeek}</td>
                      <td className="p-2 border border-slate-300">{r.dayType}</td>
                      <td className="p-2 border border-slate-300 text-center">{r.scheduledHours} hr</td>
                      <td className="p-2 border border-slate-300 text-center font-bold">{r.attendedHours} hr</td>
                      <td className="p-2 border border-slate-300 text-red-700 font-semibold">{r.missedClasses.join(', ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

        </div>

        {/* Flat footer */}
        <footer className="w-full bg-[#0D1117] border-t border-white/5 py-6 px-6 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs mt-12 print:hidden shrink-0">
          <div className="text-slate-500 font-medium text-center md:text-left mx-auto">
            <p>© 2026 The Arc Attendance Assistant. Calculated in local storage bounds. All rules authoritative.</p>
          </div>
        </footer>

        {/* STUDENT PROFILE SETUP & MOBILE REMINDERS DIALOG */}
        {showProfileEditDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in print:hidden">
            <div className="bg-[#0D1117] border border-white/10 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 border-b border-white/5 bg-[#161B22] flex items-center justify-between">
                <div className="flex items-center space-x-2.5 text-blue-400">
                  <User className="h-5 w-5" />
                  <span className="font-sans font-bold text-sm text-white uppercase tracking-tight">Configure Student Profile & Mobile Reminders</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowProfileEditDialog(false)}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer text-sm font-semibold"
                >
                  ✕ Close
                </button>
              </div>

              {/* Form Body */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  setShowProfileEditDialog(false);
                }}
                className="p-6 overflow-y-auto space-y-4 text-xs"
              >
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-[11px] text-slate-300 leading-normal">
                  <p className="font-semibold text-blue-400 mb-1">💡 Complete your Profile Setup</p>
                  Setting up complete details binds your college register particulars with ARC's rule-based scheduler.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* -- Photo ID Configuration -- */}
                  <div className="col-span-2 bg-[#161B22]/60 p-4 border border-white/5 rounded-xl space-y-3">
                    <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-amber-500 block">Photo Identification</span>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-16 h-20 border border-amber-500/20 rounded-lg bg-black/40 relative overflow-hidden flex items-center justify-center text-slate-500">
                        {userProfile.imageUrl ? (
                          <img key={userProfile.imageUrl} src={userProfile.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                        ) : (
                          <span className="text-[9px] text-amber-400 font-mono font-bold uppercase tracking-tighter">No Photo</span>
                        )}
                      </div>
                      <div className="flex-1 space-y-2 w-full text-left">
                        <label className="block font-bold text-slate-300 text-[11px]">Upload Student Passport Photo</label>
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                if (event.target?.result) {
                                  setTempImageForCrop(event.target.result as string);
                                }
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }
                          }}
                          className="block w-full text-[10px] text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/15 cursor-pointer"
                        />
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-500 font-mono text-[9px] shrink-0">OR URL:</span>
                          <input 
                            type="text"
                            value={userProfile.imageUrl || ''}
                            onChange={(e) => saveProfileToStore({ ...userProfile, imageUrl: e.target.value })}
                            placeholder="https://example.com/photo.jpg"
                            className="bg-black/30 border border-white/5 rounded px-2 py-1 flex-1 text-[10px] text-white focus:outline-none focus:border-blue-500 font-mono"
                          />
                        </div>
                        {userProfile.imageUrl && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setTempImageForCrop(userProfile.imageUrl)}
                              className="text-amber-500 hover:text-amber-400 text-[9px] font-mono font-bold uppercase tracking-wider block bg-amber-500/10 hover:bg-amber-500/15 px-2 py-1 rounded border border-amber-500/20 active:scale-95 transition-all cursor-pointer"
                            >
                              ⚙️ Adjust Crop
                            </button>
                            <button
                              type="button"
                              onClick={() => saveProfileToStore({ ...userProfile, imageUrl: '' })}
                              className="text-red-400 hover:text-red-300 text-[9px] font-mono font-bold uppercase tracking-wider block bg-red-400/10 hover:bg-red-400/15 px-2 py-1 rounded border border-red-400/20 active:scale-95 transition-all cursor-pointer"
                            >
                              Remove Custom Photo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Name field */}
                  <div className="col-span-2 space-y-1">
                    <label className="font-semibold text-slate-300">Student Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={userProfile.name}
                      onChange={(e) => saveProfileToStore({ ...userProfile, name: e.target.value })}
                      placeholder="e.g. SOORINENI MAHESH"
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    />
                  </div>

                  {/* College Name */}
                  <div className="col-span-2 space-y-1">
                    <label className="font-semibold text-slate-300">College Name</label>
                    <input 
                      type="text" 
                      required
                      value={userProfile.collegeName}
                      onChange={(e) => saveProfileToStore({ ...userProfile, collegeName: e.target.value })}
                      placeholder="e.g. K.S.R.M. College of Engineering (Autonomous)"
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    />
                  </div>

                  {/* Roll No */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300">Roll/Register No</label>
                    <input 
                      type="text" 
                      required
                      value={userProfile.rollNo || ''}
                      onChange={(e) => saveProfileToStore({ ...userProfile, rollNo: e.target.value })}
                      placeholder="e.g. 219Y1A3950"
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono transition"
                    />
                  </div>

                  {/* Degree */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300">Degree</label>
                    <select 
                      value={["B.Tech", "BTech", "MBA"].includes(userProfile.degree) ? userProfile.degree : "Other"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== "Other") {
                          saveProfileToStore({ ...userProfile, degree: val, course: val });
                        } else {
                          saveProfileToStore({ ...userProfile, degree: "M.Tech", course: "M.Tech" });
                        }
                      }}
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-semibold transition"
                    >
                      <option value="B.Tech">B.Tech</option>
                      <option value="BTech">BTech</option>
                      <option value="MBA">MBA</option>
                      <option value="Other">Etc. (Type Below)</option>
                    </select>
                    {!["B.Tech", "BTech", "MBA"].includes(userProfile.degree) && (
                      <input 
                        type="text" 
                        required
                        value={userProfile.degree}
                        onChange={(e) => saveProfileToStore({ ...userProfile, degree: e.target.value, course: e.target.value })}
                        placeholder="e.g. M.Tech"
                        className="w-full mt-1.5 bg-[#090D13] border border-blue-500/30 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                      />
                    )}
                  </div>

                  {/* Branch Select */}
                  <div className="col-span-2 space-y-1">
                    <label className="font-semibold text-slate-300">Branch Name</label>
                    <select 
                      value={["AIML", "CSE", "CSE AIML", "CSE DS", "ECE", "EEE"].includes(userProfile.branch) ? userProfile.branch : "Other"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== "Other") {
                          saveProfileToStore({ ...userProfile, branch: val });
                        } else {
                          saveProfileToStore({ ...userProfile, branch: "CIVIL" });
                        }
                      }}
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-semibold transition animate-fade-in"
                    >
                      <option value="AIML">AIML</option>
                      <option value="CSE">CSE</option>
                      <option value="CSE AIML">CSE AIML</option>
                      <option value="CSE DS">CSE DS</option>
                      <option value="ECE">ECE</option>
                      <option value="EEE">EEE</option>
                      <option value="Other">More branches available in the college's (Type Below)</option>
                    </select>
                    {!["AIML", "CSE", "CSE AIML", "CSE DS", "ECE", "EEE"].includes(userProfile.branch) && (
                      <input 
                        type="text" 
                        required
                        value={userProfile.branch || ''}
                        onChange={(e) => saveProfileToStore({ ...userProfile, branch: e.target.value })}
                        placeholder="Type branch name (e.g. CIVIL, MECH)"
                        className="w-full mt-1.5 bg-[#090D13] border border-blue-500/30 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                      />
                    )}
                  </div>

                  {/* Academic Semester */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="font-semibold text-slate-300">Academic Semester</label>
                    <input 
                      type="text" 
                      required
                      value={userProfile.semester || ''}
                      onChange={(e) => saveProfileToStore({ ...userProfile, semester: e.target.value })}
                      placeholder="e.g. IV Semester"
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    />
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="font-semibold text-slate-300">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={userProfile.email || ''}
                      onChange={(e) => saveProfileToStore({ ...userProfile, email: e.target.value })}
                      placeholder="e.g. maheshntr9392@gmail.com"
                      className="w-full bg-[#090D13] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    />
                  </div>

                  {/* Target Threshold */}
                  <div className="col-span-2 space-y-1.5 pt-1 font-sans">
                    <label className="font-semibold text-slate-300 block">College Attendance Target Threshold (%)</label>
                    <div className="flex items-center space-x-3">
                      <input 
                        type="range"
                        min="50"
                        max="100"
                        value={userProfile.minAttendance}
                        onChange={(e) => saveProfileToStore({ ...userProfile, minAttendance: parseInt(e.target.value) })}
                        className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded">
                        {userProfile.minAttendance}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex items-center justify-end space-x-3">
                  <button 
                    type="button"
                    onClick={() => setShowProfileEditDialog(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-305 text-slate-300 border border-white/5 rounded-lg transition font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-bold cursor-pointer shadow-lg shadow-blue-500/10 active:scale-[0.98]"
                  >
                    Save Changes & Confirm
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* High Fidelity Mobile Sticky Bottom Tab Bar (hidden on desktop screens) */}
        <div className="md:hidden sticky bottom-0 z-50 bg-[#0D1117]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around py-2.5 px-1 select-none print:hidden shrink-0 shadow-lg shadow-black/80">
          <button
            id="mobile-nav-btn-daily"
            onClick={() => setActiveTab('daily')}
            className={`relative flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'daily' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Daily</span>
            {pendingDays.length > 0 && (
              <span className="absolute top-0 right-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black font-mono">
                {pendingDays.length}
              </span>
            )}
          </button>

          <button
            id="mobile-nav-btn-attendance"
            onClick={() => setActiveTab('attendance')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'attendance' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck2 className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Logs</span>
          </button>

          <button
            id="mobile-nav-btn-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'analytics' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Forecast</span>
          </button>

          <button
            id="mobile-nav-btn-timetable"
            onClick={() => setActiveTab('timetable')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'timetable' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Timetable</span>
          </button>

          <button
            id="mobile-nav-btn-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'calendar' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Calendar</span>
          </button>

          <button
            id="mobile-nav-btn-export"
            onClick={() => setActiveTab('export')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'export' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Export</span>
          </button>
        </div>

        {/* Render Image Cropper overlay when a temp image is loaded */}
        {tempImageForCrop && (
          <ImageCropper
            imageSrc={tempImageForCrop}
            onCropComplete={(croppedUrl) => {
              saveProfileToStore({ ...userProfile, imageUrl: croppedUrl });
              setTempImageForCrop(null);
            }}
            onCancel={() => setTempImageForCrop(null)}
          />
        )}

      </div>

    </div>
  );
}
