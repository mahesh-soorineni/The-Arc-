/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { safeLocalStorage as localStorage } from './utils/storage';
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
  Phone,
  Settings,
  Menu,
  MoreHorizontal,
  Upload,
  X
} from 'lucide-react';
import {
  Subject,
  Timetable,
  AcademicCalendarItem,
  SpecialDayOverride,
  AttendanceRecord,
  UserProfile,
  SlotDetail
} from './types';
import {
  INITIAL_SUBJECTS,
  INITIAL_TIMETABLES,
  INITIAL_ACADEMIC_CALENDAR,
  INITIAL_SPECIAL_OVERRIDES,
  INITIAL_USER_PROFILE,
  EMPTY_USER_PROFILE,
  generatePrepopulatedAttendance
} from './utils/mockData';
import { getPendingUnmarkedDays, determineDayType, isAttendanceRequired, getTimetableForDate, formatDateToDDMMYYYY, getTodayDateString, formatDateObjToDDMMYYYY } from './utils/rulesEngine';
import { generateUnifiedBackupPdf } from './utils/pdfGenerator';

// Modular Component imports
import DailyAttendanceCollector from './components/DailyAttendanceCollector';
import AnalyticsPanel from './components/AnalyticsPanel';
import CalendarManager from './components/CalendarManager';
import TimetableManager from './components/TimetableManager';

import AttendanceDashboard from './components/AttendanceDashboard';
import { ImageCropper } from './components/ImageCropper';
import SettingsTab from './components/SettingsTab';
import { SplashScreen, LoginScreen } from './components/SplashAndLogin';

// Firebase authentication and Cloud Synchronization imports
import { User as FirebaseUser } from 'firebase/auth';
import { auth, signInWithGoogle, logout, onAuthStateChanged } from './lib/firebase';
import {
  getUserProfileFromDb,
  saveUserProfileToDb,
  getSubjectsFromDb,
  saveSubjectToDb,
  deleteSubjectFromDb,
  getTimetablesFromDb,
  saveTimetableToDb,
  deleteTimetableFromDb,
  getRecordsFromDb,
  saveRecordToDb,
  deleteRecordFromDb,
  getCalendarFromDb,
  saveCalendarToDb,
  deleteCalendarFromDb,
  getOverridesFromDb,
  saveOverrideToDb,
  deleteOverrideFromDb,
  seedLocalDataToDb
} from './lib/sync';

export default function App() {
  // --- Online/Offline Connection State Indicator ---
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Stateful persistent system ---
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('the_arc_theme') as 'dark' | 'light' | 'system') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (t: 'dark' | 'light' | 'system') => {
      let isDark = false;
      if (t === 'dark') {
        isDark = true;
      } else if (t === 'light') {
        isDark = false;
      } else if (t === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      if (isDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme(theme);
    localStorage.setItem('the_arc_theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        if (theme === 'system') {
          if (e.matches) {
            root.classList.add('dark');
            root.style.colorScheme = 'dark';
          } else {
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
          }
        }
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const [currentDate, setCurrentDate] = useState<string>(() => localStorage.getItem('the_arc_current_date') || getTodayDateString()); // Simulation date
  const [userProfile, setUserProfile] = useState<UserProfile>(EMPTY_USER_PROFILE);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [academicCalendar, setAcademicCalendar] = useState<AcademicCalendarItem[]>([]);
  const [specialOverrides, setSpecialOverrides] = useState<SpecialDayOverride[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, { conducted: number; attended: number; missed: number }>>(() => {
    try {
      const saved = localStorage.getItem('the_arc_manual_stats_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const handleUpdateManualOverrides = (newOverrides: Record<string, { conducted: number; attended: number; missed: number }>) => {
    setManualOverrides(newOverrides);
    localStorage.setItem('the_arc_manual_stats_overrides', JSON.stringify(newOverrides));
  };

  // Persistent user notification configurations
  const [showProfileEditDialog, setShowProfileEditDialog] = useState(false);
  const [tempImageForCrop, setTempImageForCrop] = useState<string | null>(null);
  const [autoRemindersEnabled, setAutoRemindersEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('the_arc_auto_reminders_enabled');
    return saved === null ? true : saved === 'true';
  });

  const [notificationTime, setNotificationTime] = useState<string>(() => {
    return localStorage.getItem('the_arc_notification_time') || '17:00';
  });

  const [notificationDays, setNotificationDays] = useState<string[]>(() => {
    const saved = localStorage.getItem('the_arc_notification_days');
    return saved ? JSON.parse(saved) : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  });

  const [notificationChannel, setNotificationChannel] = useState<string>(() => {
    return localStorage.getItem('the_arc_notification_channel') || 'both';
  });

  // Keep auto-reminders sync saved
  useEffect(() => {
    localStorage.setItem('the_arc_auto_reminders_enabled', String(autoRemindersEnabled));
  }, [autoRemindersEnabled]);

  const [activeTab, setActiveTab] = useState<'daily' | 'attendance' | 'analytics' | 'calendar' | 'timetable' | 'settings'>('daily');
  const [showNotificationToast, setShowNotificationToast] = useState(false);
  const [migrationFeedback, setMigrationFeedback] = useState<string | null>(null);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [showQuickSettingsDrawer, setShowQuickSettingsDrawer] = useState<boolean>(false);
  const [confirmResetLocalStorage, setConfirmResetLocalStorage] = useState<boolean>(false);

  // PWA Service Worker auto-update states
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState<boolean>(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleSWRegister = async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          setSwRegistration(reg);

          // Check if there is already a service worker waiting for activation
          if (reg.waiting) {
            setShowUpdatePrompt(true);
          }

          // Listen for a new service worker installing
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (!installingWorker) return;
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // New content is available and ready to activate!
                  setShowUpdatePrompt(true);
                }
              }
            };
          };
        } catch (err) {
          console.error('Service Worker registration failed:', err);
        }
      };

      if (document.readyState === 'complete') {
        handleSWRegister();
      } else {
        window.addEventListener('load', handleSWRegister);
        return () => window.removeEventListener('load', handleSWRegister);
      }
    }
  }, []);

  // Listen for controller changes to reload immediately
  useEffect(() => {
    let refreshing = false;
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    }
  }, []);

  // Set up periodic SW updates checks (every 5 minutes)
  useEffect(() => {
    if (swRegistration) {
      const interval = setInterval(() => {
        swRegistration.update().catch(err => console.log("SW update check failed", err));
      }, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [swRegistration]);

  const handleActivateUpdate = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  // Premium mobile-first Splash and Login states
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [splashTagline, setSplashTagline] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // --- Cloud Sync / Firebase state configuration ---
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>('');
  const [syncError, setSyncError] = useState<string | null>(null);

  // Select tagline randomly on mount, and schedule splash screen for 2 seconds
  useEffect(() => {
    const list = [
      "Attendance Records Companion",
      "Track. Analyze. Stay Ahead.",
      "Never Guess Your Attendance Again."
    ];
    const picked = list[Math.floor(Math.random() * list.length)];
    setSplashTagline(picked);

    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => clearTimeout(splashTimer);
  }, []);

  // Offline bypass mode trigger with custom registered student profile
  const handleOfflineBypass = (registeredProfile?: any) => {
    localStorage.setItem('the_arc_is_guest', 'true');
    
    const profileToUse = registeredProfile || (() => {
      try {
        const stored = localStorage.getItem('the_arc_profile');
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    })();

    const mockUser = {
      uid: 'local_offline_user',
      displayName: profileToUse?.name || 'Offline Scholar',
      email: profileToUse?.email || 'offline@phone.local',
      photoURL: ''
    } as any;
    setFbUser(mockUser);
    
    if (profileToUse) {
      setUserProfile(profileToUse);
      localStorage.setItem('the_arc_profile', JSON.stringify(profileToUse));
    }
    setActiveTab('daily');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFbUser(user);
        setCloudSyncStatus('Offline Device Storage');
        
        // Populate profile with authenticated details if not already set, keeping memory locally
        const storedProfileStr = localStorage.getItem('the_arc_profile');
        const currentProfile = storedProfileStr ? JSON.parse(storedProfileStr) : { ...INITIAL_USER_PROFILE };
        currentProfile.email = user.email || currentProfile.email || 'student@thearc.io';
        currentProfile.name = user.displayName || currentProfile.name || 'Student Naidu';
        setUserProfile(currentProfile);
        localStorage.setItem('the_arc_profile', JSON.stringify(currentProfile));
        localStorage.removeItem('the_arc_is_guest');

        setActiveTab('daily');
        setCloudSyncing(false);
        setAuthLoading(false);
      } else {
        const guestActive = localStorage.getItem('the_arc_is_guest') === 'true';
        if (guestActive) {
          const mockUser = {
            uid: 'local_offline_user',
            displayName: 'Offline Scholar',
            email: 'offline@phone.local',
            photoURL: ''
          } as any;
          setFbUser(mockUser);
          setCloudSyncStatus('Offline Device Storage');
        } else {
          setFbUser(null);
          setCloudSyncStatus('');
        }
        setCloudSyncing(false);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Derive unmarked working days from rules engine
  const pendingDays = getPendingUnmarkedDays(
    currentDate,
    records,
    timetables,
    academicCalendar,
    specialOverrides,
    userProfile.semesterStartDate
  );

  const lastTriggeredTimeRef = useRef<string>("");

  useEffect(() => {
    if (!autoRemindersEnabled) return;

    const interval = setInterval(() => {
      const now = new Date();
      const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDayName = daysMap[now.getDay()];
      
      const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (notificationDays.includes(currentDayName) && currentHourMin === notificationTime) {
        if (lastTriggeredTimeRef.current !== currentHourMin) {
          lastTriggeredTimeRef.current = currentHourMin;
          
          if (pendingDays.length > 0) {
            // Native desktop push
            if (
              typeof window !== 'undefined' && 
              'Notification' in window && 
              Notification.permission === 'granted' && 
              (notificationChannel === 'both' || notificationChannel === 'browser')
            ) {
              try {
                new Notification("Arc Attendance Alarm 📚", {
                  body: `You have ${pendingDays.length} unmarked attendance sessions. Tap to update before bunk limits narrow!`,
                  icon: "/favicon.svg",
                  tag: "arc-scheduled-alert"
                });
              } catch (e) {
                console.warn("Native Notification failed in background, fallback in-app alert:", e);
              }
            }
            
            // In-app alert
            if (notificationChannel === 'both' || notificationChannel === 'in_app') {
              alert(`📚 Attendance Alarm: You have ${pendingDays.length} unmarked attendance day(s) requiring log registration!`);
            }
          }
        }
      } else {
        // Reset when minute passes so we are ready for the next scheduled slot
        if (lastTriggeredTimeRef.current !== "" && currentHourMin !== notificationTime) {
          lastTriggeredTimeRef.current = "";
        }
      }
    }, 20000); // Poll every 20 seconds.

    return () => clearInterval(interval);
  }, [autoRemindersEnabled, notificationTime, notificationDays, notificationChannel, pendingDays.length]);

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
      const SCHEMA_VERSION = '2.6';
      const storedSchemaVersion = localStorage.getItem('the_arc_schema_version');
      let migrated = false;

      const hasAnyData = localStorage.getItem('the_arc_profile') || 
                         localStorage.getItem('the_arc_subjects') || 
                         localStorage.getItem('the_arc_records') || 
                         localStorage.getItem('the_arc_timetables');

      if (hasAnyData && storedSchemaVersion !== SCHEMA_VERSION) {
        // Create pre-migration backup to preserve every existing record
        const migrationBackup: Record<string, string> = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('the_arc_')) {
              migrationBackup[key] = localStorage.getItem(key) || '';
            }
          }
        } catch (e) {
          console.warn("Could not create full pre-migration backup from localStorage:", e);
        }

        try {
          // App updated successfully. Your data has been migrated.
          
          // 1. Profile Migration
          const storedProfile = localStorage.getItem('the_arc_profile');
          if (storedProfile) {
            try {
              const parsed = JSON.parse(storedProfile);
              const migratedProfile = {
                ...EMPTY_USER_PROFILE,
                ...parsed,
                minAttendance: parsed.minAttendance ?? 75,
                degree: parsed.degree || 'B.Tech',
                course: parsed.course || 'B.Tech'
              };
              localStorage.setItem('the_arc_profile', JSON.stringify(migratedProfile));
              migrated = true;
            } catch (err) {
              console.error("Profile migration error:", err);
            }
          }

          // 2. Subjects Migration
          const storedSubjects = localStorage.getItem('the_arc_subjects');
          if (storedSubjects) {
            try {
              const parsed = JSON.parse(storedSubjects);
              if (Array.isArray(parsed)) {
                const migratedSubjects = parsed.map((s: any) => ({
                  ...s,
                  isLab: s.isLab ?? false,
                  minPercentage: s.minPercentage ?? 75
                }));
                localStorage.setItem('the_arc_subjects', JSON.stringify(migratedSubjects));
                migrated = true;
              }
            } catch (err) {
              console.error("Subjects migration error:", err);
            }
          }

          // 3. Records Migration
          const storedRecords = localStorage.getItem('the_arc_records');
          if (storedRecords) {
            try {
              const parsed = JSON.parse(storedRecords);
              if (Array.isArray(parsed)) {
                const migratedRecords = parsed.map((record: any) => {
                  if (!record.slotsDetails && record.scheduledHours > 0) {
                    const slots: SlotDetail[] = [];
                    let remainingAttended = record.attendedHours;
                    let missedIdx = 0;
                    const hoursPerSlot = 1;

                    for (let i = 0; i < record.scheduledHours; i++) {
                      const isAttended = remainingAttended > 0;
                      if (isAttended) {
                        remainingAttended--;
                      }
                      let subjectCode = 'GEN';
                      if (!isAttended && record.missedClasses && record.missedClasses.length > missedIdx) {
                        subjectCode = record.missedClasses[missedIdx];
                        missedIdx++;
                      }
                      slots.push({
                        id: `legacy-${record.date}-${i}-${Date.now()}`,
                        subjectCode,
                        hours: hoursPerSlot,
                        status: 'Conducted',
                        isAttended,
                        isLab: false
                      });
                    }
                    record.slotsDetails = slots;
                  }
                  return {
                    ...record,
                    isMarked: record.isMarked ?? true,
                    slotsDetails: record.slotsDetails || []
                  };
                });
                localStorage.setItem('the_arc_records', JSON.stringify(migratedRecords));
                migrated = true;
              }
            } catch (err) {
              console.error("Records migration error:", err);
            }
          }

          // 4. Timetables Migration
          const storedTimetables = localStorage.getItem('the_arc_timetables');
          if (storedTimetables) {
            try {
              const parsed = JSON.parse(storedTimetables);
              if (Array.isArray(parsed)) {
                const migratedTimetables = parsed.map((t: any) => ({
                  ...t,
                  slots: t.slots || {}
                }));
                localStorage.setItem('the_arc_timetables', JSON.stringify(migratedTimetables));
                migrated = true;
              }
            } catch (err) {
              console.error("Timetable migration error:", err);
            }
          }

          localStorage.setItem('the_arc_schema_version', SCHEMA_VERSION);
          if (migrated) {
            setMigrationFeedback('App updated successfully. Your data has been migrated.');
            setTimeout(() => setMigrationFeedback(null), 5000);
          }
        } catch (migrationError: any) {
          console.error("Critical database migration failed! Restoring from pre-migration backup...", migrationError);
          // Restore the backup if migration fails
          try {
            Object.entries(migrationBackup).forEach(([key, val]) => {
              localStorage.setItem(key, val);
            });
            setMigrationFeedback('Update migration failed. Rolled back safely to previous version.');
            setTimeout(() => setMigrationFeedback(null), 7000);
          } catch (restoreErr) {
            console.error("Failsafe rollback restore failed:", restoreErr);
          }
        }
      } else if (!hasAnyData) {
        localStorage.setItem('the_arc_schema_version', SCHEMA_VERSION);
      }

      const storedProfile = localStorage.getItem('the_arc_profile');
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile);
        const unified = { ...EMPTY_USER_PROFILE, ...parsed };
        setUserProfile(unified);
      } else {
        setUserProfile(EMPTY_USER_PROFILE);
      }

      const storedSubjects = localStorage.getItem('the_arc_subjects');
      const loadedSubjects: Subject[] = storedSubjects ? JSON.parse(storedSubjects) : [];
      setSubjects(loadedSubjects);

      const storedTimetables = localStorage.getItem('the_arc_timetables');
      let currentTimetables: Timetable[] = [];
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
        // Upgrade scenario
        setTimetables([]);
        localStorage.setItem('the_arc_timetables', JSON.stringify([]));

        setRecords([]);
        localStorage.setItem('the_arc_records', JSON.stringify([]));
      } else {
        setTimetables(currentTimetables);
        localStorage.setItem('the_arc_timetables', JSON.stringify(currentTimetables));

        const storedRecords = localStorage.getItem('the_arc_records');
        if (storedRecords) {
          setRecords(JSON.parse(storedRecords));
        } else {
          setRecords([]);
          localStorage.setItem('the_arc_records', JSON.stringify([]));
        }
      }

      const storedCalendar = localStorage.getItem('the_arc_calendar');
      if (storedCalendar) {
        setAcademicCalendar(JSON.parse(storedCalendar));
      } else {
        setAcademicCalendar([]);
      }

      const storedOverrides = localStorage.getItem('the_arc_overrides');
      if (storedOverrides) {
        setSpecialOverrides(JSON.parse(storedOverrides));
      } else {
        setSpecialOverrides([]);
      }

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

  // --- Quick Data Backup/Restore System ---
  const [importingError, setImportingError] = useState<string | null>(null);
  const [importingSuccess, setImportingSuccess] = useState<boolean>(false);

  const getParsedItem = (key: string) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const handleExportData = async () => {
    try {
      const currentProfileState = { ...userProfile };
      const currentSubjectsState = [...subjects];
      const currentTimetablesState = [...timetables];
      const currentRecordsState = [...records];
      const currentCalendarState = [...academicCalendar];
      const currentOverridesState = [...specialOverrides];

      const exportObject = {
        app: "The Arc",
        version: "2.5 PDF-Polyglot",
        generatedAt: new Date().toISOString(),
        data: {
          profile: getParsedItem('the_arc_profile') || currentProfileState,
          subjects: getParsedItem('the_arc_subjects') || currentSubjectsState,
          timetables: getParsedItem('the_arc_timetables') || currentTimetablesState,
          records: getParsedItem('the_arc_records') || currentRecordsState,
          calendar: getParsedItem('the_arc_calendar') || currentCalendarState,
          overrides: getParsedItem('the_arc_overrides') || currentOverridesState,
          manualOverrides: getParsedItem('the_arc_manual_stats_overrides'),
          autoReminders: getParsedItem('the_arc_auto_reminders_enabled') !== null ? getParsedItem('the_arc_auto_reminders_enabled') : autoRemindersEnabled,
          notificationTime: localStorage.getItem('the_arc_notification_time') || notificationTime,
          notificationDays: getParsedItem('the_arc_notification_days') || notificationDays,
          notificationChannel: localStorage.getItem('the_arc_notification_channel') || notificationChannel,
          currentDate: localStorage.getItem('the_arc_current_date') || currentDate
        }
      };

      // 1. Generate beautiful high fidelity document as a PDF Blob containing everything
      const pdfBlob = generateUnifiedBackupPdf({
        userProfile: exportObject.data.profile,
        subjects: exportObject.data.subjects || [],
        timetables: exportObject.data.timetables || [],
        records: exportObject.data.records || [],
        academicCalendar: exportObject.data.calendar || [],
        specialOverrides: exportObject.data.overrides || [],
        manualOverrides: exportObject.data.manualOverrides,
        autoReminders: exportObject.data.autoReminders,
        rangeType: 'All',
        currentDate: currentDate
      });

      // 2. Prepare the machine-readable JSON representation
      const rawJson = JSON.stringify(exportObject);
      // Produce an ASCII-safe Base64 string from the UTF-8 payload to guard binary safe lines
      const b64Payload = btoa(unescape(encodeURIComponent(rawJson)));
      const binaryMarker = `\n%%THE_ARC_BACKUP_START%%\n${b64Payload}\n%%THE_ARC_BACKUP_END%%\n`;

      // 3. Glue the binary marker text to the end of the standard PDF Blob
      const finalPdfBlob = new Blob([pdfBlob, binaryMarker], { type: 'application/pdf' });
      const fileDate = new Date().toISOString().split('T')[0];
      const cleanName = (exportObject.data.profile.name || "scholar").toLowerCase().replace(/\s+/g, '_');
      const filename = `the_arc_semester_backup_${cleanName}_${fileDate}.pdf`;

      const file = new File([finalPdfBlob], filename, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: 'The Arc - Semester Backup Ledger'
        });
      } else {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Str = reader.result as string;
            const a = document.createElement('a');
            a.href = base64Str;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          };
          reader.readAsDataURL(finalPdfBlob);
        } else {
          const downloadUrl = URL.createObjectURL(finalPdfBlob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
        }
      }
    } catch (err: any) {
      console.error("Failed to export unified PDF data backup", err);
      alert("Failed to export data: " + err.message);
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    setImportingError(null);
    setImportingSuccess(false);

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      fileReader.readAsArrayBuffer(file);
      fileReader.onload = (event) => {
        try {
          if (!event.target?.result) {
            throw new Error("Could not read empty file.");
          }
          const arrayBuffer = event.target.result as ArrayBuffer;

          // Decode as Latin-1 (ISO-8859-1) for binary-safe marker lookup
          const latin1Decoder = new TextDecoder('iso-8859-1');
          const rawTextLatin1 = latin1Decoder.decode(arrayBuffer);

          const startMark = "%%THE_ARC_BACKUP_START%%";
          const endMark = "%%THE_ARC_BACKUP_END%%";
          const startIndex = rawTextLatin1.indexOf(startMark);
          const endIndex = rawTextLatin1.indexOf(endMark);

          let parsed: any = null;

          if (startIndex !== -1 && endIndex !== -1) {
            // Found nested PDF backup data segment - extract Base64 ASCII segment safely
            const encodedData = rawTextLatin1.substring(startIndex + startMark.length, endIndex).trim();
            try {
              const decodedJson = decodeURIComponent(escape(atob(encodedData)));
              parsed = JSON.parse(decodedJson);
            } catch (err) {
              throw new Error("Unable to parse the embedded PDF backup stream block. The file might be corrupted.");
            }
          } else {
            // Try standard UTF-8 decoding for direct JSON text file backups
            try {
              const utf8Decoder = new TextDecoder('utf-8');
              const rawTextUtf8 = utf8Decoder.decode(arrayBuffer);
              parsed = JSON.parse(rawTextUtf8);
            } catch {
              throw new Error("No valid database backup sequence was discovered in the uploaded file. Please select a valid .pdf master backup or .json file exported by The Arc.");
            }
          }

          // Apply and validate backups
          const data = parsed.data || parsed;
          const possibleDataKeys = [
            'profile', 'subjects', 'timetables', 'records',
            'calendar', 'overrides', 'manualOverrides', 'autoReminders'
          ];
          const hasKeys = possibleDataKeys.some(key => data && data[key] !== undefined && data[key] !== null);

          if (!hasKeys) {
            throw new Error("Invalid schema structure inside the selected backup file. Active profile or semester records are absent.");
          }

          const setImportValue = (key: string, val: any) => {
            if (val === null || val === undefined) return;
            if (typeof val === 'string') {
              try {
                const innerParsed = JSON.parse(val);
                if (typeof innerParsed === 'object' && innerParsed !== null) {
                  localStorage.setItem(key, val);
                  return;
                }
              } catch {}
              localStorage.setItem(key, val);
            } else {
              localStorage.setItem(key, JSON.stringify(val));
            }
          };

          setImportValue('the_arc_profile', data.profile);
          setImportValue('the_arc_subjects', data.subjects);
          setImportValue('the_arc_timetables', data.timetables);
          setImportValue('the_arc_records', data.records);
          setImportValue('the_arc_calendar', data.calendar);
          setImportValue('the_arc_overrides', data.overrides);
          setImportValue('the_arc_manual_stats_overrides', data.manualOverrides);
          setImportValue('the_arc_auto_reminders_enabled', data.autoReminders);
          
          if (data.notificationTime) {
            localStorage.setItem('the_arc_notification_time', data.notificationTime);
          }
          if (data.notificationDays) {
            localStorage.setItem('the_arc_notification_days', typeof data.notificationDays === 'string' ? data.notificationDays : JSON.stringify(data.notificationDays));
          }
          if (data.notificationChannel) {
            localStorage.setItem('the_arc_notification_channel', data.notificationChannel);
          }
          if (data.currentDate) {
            localStorage.setItem('the_arc_current_date', data.currentDate);
          }

          // Force local guest session active to avoid authentication lockouts
          localStorage.setItem('the_arc_is_guest', 'true');

          setImportingSuccess(true);
          
          setTimeout(() => {
            window.location.reload();
          }, 1250);

        } catch (err: any) {
          console.error("Failed to import database from file container", err);
          setImportingError(err.message || "Invalid file content. Please check file integrity.");
        }
      };
    }
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
    semesterStartDate?: string;
    semesterEndDate?: string;
  }) => {
    // 1. Update user profile safely, avoiding overwriting existing non-placeholder values with generic placeholder strings
    const isPlaceholderCollege = (name?: string) => !name || name.trim() === '' || name === 'My University / College' || name === 'University / College';
    const isPlaceholderDegree = (deg?: string) => !deg || deg.trim() === '' || deg === 'Degree Program';
    const isPlaceholderBranch = (br?: string) => !br || br.trim() === '' || br === 'General' || br === 'Computer Science';
    const isPlaceholderSemester = (sem?: string) => !sem || sem.trim() === '' || sem === 'Current Semester';

    const updatedProfile = {
      ...userProfile,
      collegeName: !isPlaceholderCollege(imported.collegeName) 
        ? imported.collegeName 
        : (userProfile.collegeName && !isPlaceholderCollege(userProfile.collegeName) ? userProfile.collegeName : imported.collegeName),
      degree: !isPlaceholderDegree(imported.degree) 
        ? imported.degree 
        : (userProfile.degree && !isPlaceholderDegree(userProfile.degree) ? userProfile.degree : imported.degree),
      branch: !isPlaceholderBranch(imported.branch) 
        ? imported.branch 
        : (userProfile.branch && !isPlaceholderBranch(userProfile.branch) ? userProfile.branch : imported.branch),
      semester: !isPlaceholderSemester(imported.semester) 
        ? imported.semester 
        : (userProfile.semester && !isPlaceholderSemester(userProfile.semester) ? userProfile.semester : imported.semester),
      semesterStartDate: imported.semesterStartDate || userProfile.semesterStartDate || '2026-05-01',
      semesterEndDate: imported.semesterEndDate || userProfile.semesterEndDate || '2026-11-30',
    };
    saveProfileToStore(updatedProfile);

    // 2. Set the subjects
    saveSubjectsToStore(imported.subjects);

    // 3. Set the new timetable with effective date matching semester start
    const newTt: Timetable = {
      id: `tt_imported_${Date.now()}`,
      effectiveFrom: imported.semesterStartDate || '2026-05-01',
      slots: imported.timetableSlots
    };
    saveTimetablesToStore([newTt]);

    // Do not automatically generate sample records; keep attendance clean and unmarked until the user logs them.
    saveRecordsToStore([]);
  };

  // Academic calendar additions
  const handleAddCalendarItem = (item: AcademicCalendarItem | AcademicCalendarItem[]) => {
    const items = Array.isArray(item) ? item : [item];
    const dates = items.map(i => i.date);
    const updated = [...academicCalendar.filter(c => !dates.includes(c.date)), ...items];
    saveCalendarToStore(updated);
  };

  const handleAddOverride = (override: SpecialDayOverride | SpecialDayOverride[]) => {
    const overrides = Array.isArray(override) ? override : [override];
    const dates = overrides.map(o => o.date);
    const updated = [...specialOverrides.filter(o => !dates.includes(o.date)), ...overrides];
    saveOverridesToStore(updated);
    
    // Auto purge preprocessed attendance for that date to enforce recalculating hours!
    const filteredRecord = records.filter(r => !dates.includes(r.date));
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
      saveProfileToStore(EMPTY_USER_PROFILE);
      saveSubjectsToStore([]);
      saveTimetablesToStore([]);
      saveCalendarToStore([]);
      saveOverridesToStore([]);
      alert("All records and classes wiped. The app is now completely fresh!");
      window.location.reload();
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
  };

  const handleLogout = async () => {
    localStorage.removeItem('the_arc_is_guest');
    setFbUser(null);
    try {
      await logout();
    } catch (e) {
      console.error("Firebase logout error", e);
    }
  };

  if (showSplash) {
    return <SplashScreen tagline={splashTagline} />;
  }

  if (authLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0A0C10] flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin mb-4" />
        <p className="text-xs font-mono tracking-widest text-[#475569] uppercase animate-pulse">
          Securing Workspace...
        </p>
      </div>
    );
  }

  if (!fbUser) {
    return (
      <LoginScreen 
        onOfflineBypass={handleOfflineBypass}
        error={signInError}
      />
    );
  }

  return (
    <div className="the-arc-body min-h-screen bg-[#F8FAFC] dark:bg-[#0A0C10] text-slate-800 dark:text-[#E2E8F0] font-sans selection:bg-blue-500/30 flex flex-col md:flex-row print:bg-white print:text-black">
      
      {/* Sidebar - Sleek Theme left navigation drawer (desktop-only) */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#0D1117] px-6 py-8 print:hidden">
        <div className="flex items-center gap-3 mb-10 shrink-0">
          <img 
            src="/favicon.svg" 
            alt="The Arc Logo" 
            className="w-10 h-10 object-contain rounded-xl shadow-md shadow-blue-500/10 shrink-0" 
          />
          <div className="min-w-0">
            <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white uppercase whitespace-nowrap leading-none">THE ARC</h1>
          </div>
        </div>
        
        {/* Sidebar Nav Items */}
        <nav className="flex md:flex-col gap-1 md:space-y-1 overflow-x-auto pb-0 md:flex-1 shrink-0">
          <button
            id="sidebar-btn-daily"
            onClick={() => setActiveTab('daily')}
            className={`flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'daily'
                ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
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
                ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
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
                ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
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
                ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
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
                ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'timetable' ? 'bg-blue-500' : 'bg-transparent'}`} />
            <span>Weekly Timetable</span>
          </button>




        </nav>

        {/* Local Device Encryption & Security - Sidebar Bottom */}
        <div className="hidden md:block mt-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 space-y-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-black text-blue-400">ARC</span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate leading-none">{userProfile.name || "Offline Scholar"}</h4>
                <p className="text-[9px] text-[#64748B] font-mono truncate mt-1 leading-none">{userProfile.email || "offline@phone.local"}</p>
              </div>
            </div>
            
            <div className="pt-2.5 border-t border-slate-200 dark:border-white/5 space-y-1.5 font-sans">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#64748B] font-semibold">Security Vault:</span>
                <span className="font-mono font-bold text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Local Storage
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#64748B] font-semibold">Network State:</span>
                <span className={`font-mono font-bold text-[9px] uppercase tracking-wider ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isOnline ? 'Online (Synced)' : 'Offline (Cached)'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="w-full mt-2 h-7 rounded bg-red-500/10 hover:bg-red-500/25 text-red-600 dark:text-red-400 hover:text-red-500 font-bold text-[10px] transition-all cursor-pointer text-center flex items-center justify-center font-sans"
              >
                Sign Out / New Profile
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container section */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Mobile Top Header Cockpit (hidden on desktop screens) */}
        <header className="md:hidden border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0D1117]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-40 select-none">
          <div className="flex items-center gap-2.5 min-w-0 mr-2 flex-1">
            <img 
              src="/favicon.svg" 
              alt="The Arc Logo" 
              className="w-8.5 h-8.5 object-contain rounded-lg shadow-md shadow-blue-900/10 shrink-0" 
          />
            <div className="min-w-0">
              <h1 className="text-xs font-black tracking-tight text-slate-900 dark:text-white uppercase leading-none whitespace-nowrap flex items-center gap-1.5">
                <span>THE ARC</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} title={isOnline ? "Online (Database connected)" : "Offline Mode (Local Storage active)"} />
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick date picker */}
            <div className="relative flex items-center space-x-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] min-w-[130px] overflow-hidden">
              <span className="text-slate-500 font-mono">Date:</span>
              <span className="font-mono text-[10px] font-bold text-slate-800 dark:text-white shrink-0">
                {formatDateToDDMMYYYY(currentDate)}
              </span>
              <span className="text-[#64748B] text-[8px] pl-1 pointer-events-none select-none">▼</span>
              <input
                id="mobile-simulator-date-picker"
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
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
                              {day.dayOfWeek.substring(0,3)}, {formatDateToDDMMYYYY(day.date)}
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

            {/* Mobile Settings & Data Vault */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowQuickSettingsDrawer(true)}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center h-8 w-8"
                title="Settings & Backups"
              >
                <Settings className="h-4.5 w-4.5 text-slate-400" />
              </button>
            </div>
          </div>
        </header>

        {/* Header cockpit (desktop only) */}
        <header className="hidden md:flex border-b border-white/5 flex-col sm:flex-row items-center justify-between px-6 md:px-8 py-4 sm:h-20 bg-[#0D1117]/50 gap-4 shrink-0">
          
          <div className="flex flex-col text-center sm:text-left self-stretch sm:self-auto justify-center">
            <div className="text-xs text-[#64748B] tracking-wider uppercase font-mono font-bold leading-none">Simulation Context</div>
            <div className="text-sm font-semibold text-white mt-1.5 flex items-center gap-2 justify-center sm:justify-start">
              <span>{formatDateToDDMMYYYY(currentDate)}</span>
              <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-semibold">Live Mode</span>
              {isOnline ? (
                <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Online</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded uppercase font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Offline</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Date Simulator tool */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center space-x-2 bg-white/5 border border-white/5 rounded-lg p-1.5 text-xs min-w-[170px] overflow-hidden">
              <span className="text-slate-400 font-mono pl-2">Virtual Date:</span>
              <span className="font-mono text-xs font-bold text-white pr-4">
                {formatDateToDDMMYYYY(currentDate)}
              </span>
              <span className="absolute right-2.5 text-[#64748B] pointer-events-none select-none text-[8px]">▼</span>
              <input
                id="simulator-date-picker"
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
              />
            </div>

            {/* Quick Settings & Data Vault Trigger */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQuickSettingsDrawer(true)}
                className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center h-8 w-8"
                title="Settings & Backups"
              >
                <Settings className="h-4 w-4 text-slate-400" />
              </button>
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
                              {day.dayOfWeek}, {formatDateToDDMMYYYY(day.date)}
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
            className="bg-[#0D1117] hover:bg-[#161B22] border-b border-white/5 cursor-pointer px-4 py-1.5 text-[11px] font-medium flex items-center justify-between transition-colors print:hidden"
          >
            <div className="flex items-center space-x-2">
              <span className="flex h-1.5 w-1.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
              </span>
              <span className="text-slate-400 pr-1 truncate">
                Today's attendance unregistered ({formatDateToDDMMYYYY(currentDate)}).
              </span>
            </div>
            <span className="font-mono bg-blue-500/10 border border-blue-500/15 rounded px-1.5 py-0.5 text-[9px] text-blue-400 font-bold uppercase shrink-0">
              Log
            </span>
          </div>
        )}

        {/* Migration Feedback banner */}
        {migrationFeedback && (
          <div
            id="notification-migration-toast"
            className="bg-emerald-950/90 border-b border-emerald-500/25 px-4 py-2.5 text-xs font-semibold text-emerald-300 flex items-center justify-between transition-colors print:hidden animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>{migrationFeedback}</span>
            </div>
            <button
              onClick={() => setMigrationFeedback(null)}
              className="text-emerald-400 hover:text-emerald-200 transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* PWA Update Banner */}
        {showUpdatePrompt && (
          <div
            id="pwa-update-banner"
            className="bg-blue-600 border-b border-blue-500 px-4 py-2.5 text-xs font-semibold text-white flex items-center justify-between transition-all duration-300 print:hidden animate-fade-in"
          >
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-amber-300" />
              <span>A robust new update for THE ARC is available! Tap to instantly activate.</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowUpdatePrompt(false)}
                className="text-white/80 hover:text-white transition-colors text-[10px] font-mono"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleActivateUpdate}
                className="bg-white text-blue-600 hover:bg-slate-100 transition-all font-bold px-3 py-1 rounded-md shadow-sm text-[10px] cursor-pointer"
              >
                Update Now
              </button>
            </div>
          </div>
        )}

        {/* Workspace core panels */}
        <div className="flex-1 p-2.5 sm:p-4 md:p-8 overflow-y-auto space-y-4 sm:space-y-6">
          
          {/* Print Headers */}
          <div id="print-layout-headers" className="hidden print:block space-y-3 pb-4 border-b border-slate-300">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">The Arc: Semester Attendance Report</h2>
                <p className="text-xs text-slate-500">Student Profile: {userProfile.name} ({userProfile.course}) / Roll: {userProfile.rollNo}</p>
              </div>
              <div className="text-right font-mono text-xs">
                <p>Generated Date: {formatDateObjToDDMMYYYY(new Date())}</p>
                <p>Rule Engine Architecture: V1.0</p>
              </div>
            </div>
          </div>

          {/* Student Academic Passport (Official Profile Card - only visible on Daily tab) */}
          {activeTab === 'daily' && (
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
                          <td className="py-[1px] sm:py-[1.5px] pl-1 font-mono text-blue-400 font-bold tracking-wider text-left text-[8.5px] xs:text-[9px] sm:text-[9.5px] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none relative z-20">
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
                          <td className="py-[1px] sm:py-[1.5px] pl-1 text-slate-200 font-semibold text-left text-[8px] xs:text-[8.5px] sm:text-[9px] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">{userProfile.branch || 'AIML'}</td>
                        </tr>
                        <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                          <td className="text-[7px] xs:text-[7.5px] sm:text-[8px] font-mono font-bold text-slate-500 py-[1px] sm:py-[1.5px] w-[52px] xs:w-[58px] sm:w-[70px] text-left uppercase tracking-wider select-none shrink-0 whitespace-nowrap">SEMESTER</td>
                          <td className="py-[1px] sm:py-[1.5px] px-0.5 text-slate-600 font-extrabold w-1.5 text-center select-none">:</td>
                          <td className="py-[1px] sm:py-[1.5px] pl-1 text-blue-400 font-bold text-left text-[8px] xs:text-[8.5px] sm:text-[9px] uppercase truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">{userProfile.semester || 'VI Semester'}</td>
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
                    {userProfile.imageUrl || (userProfile.email && userProfile.email !== 'offline@phone.local' && userProfile.email.includes('@')) ? (
                      <img 
                        key={userProfile.imageUrl || userProfile.email}
                        src={userProfile.imageUrl || `https://unavatar.io/${userProfile.email}`} 
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
          )}

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
                  onDateChange={setCurrentDate}
                  userProfile={userProfile}
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
                manualOverrides={manualOverrides}
                onUpdateManualOverrides={handleUpdateManualOverrides}
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
                academicCalendar={academicCalendar}
                specialOverrides={specialOverrides}
                userProfile={userProfile}
                manualOverrides={manualOverrides}
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
                userProfile={userProfile}
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
                userProfile={userProfile}
              />
            )}





            {/* Printable Ledger backup */}
            <div className="hidden print:block space-y-4 font-mono text-[11px] text-slate-800">
              <h4 className="font-sans font-bold text-sm text-slate-900 border-b pb-1">Historical Log Ledger Table</h4>
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 uppercase text-[9px] border-b border-slate-300">
                    <th className="p-2 border border-slate-300">Date</th>
                    <th className="p-2 border border-slate-300">Day</th>
                    <th className="p-2 border border-slate-300">Classification</th>
                    <th className="p-2 border border-slate-300 text-center">Scheduled Hour</th>
                    <th className="p-2 border border-slate-300 text-center">Attended Hour</th>
                    <th className="p-2 border border-slate-300">Skipped Courses</th>
                  </tr>
                </thead>
                <tbody>
                  {records.sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="p-2 font-bold border border-slate-300">{formatDateToDDMMYYYY(r.date)}</td>
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
                        {userProfile.imageUrl || (userProfile.email && userProfile.email !== 'offline@phone.local' && userProfile.email.includes('@')) ? (
                          <img 
                            key={userProfile.imageUrl || userProfile.email} 
                            src={userProfile.imageUrl || `https://unavatar.io/${userProfile.email}`} 
                            className="w-full h-full object-cover" 
                            alt="Preview" 
                          />
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
                      placeholder="e.g. 249Y1A3958"
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
                      placeholder="e.g. 249Y1A3958@gmail.com"
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

        {/* Mobile secondary menu drawer */}
        {showMobileMoreMenu && (
          <div className="md:hidden fixed inset-0 z-48 bg-black/65 backdrop-blur-xs transition-opacity" onClick={() => setShowMobileMoreMenu(false)}>
            <div 
              className="absolute bottom-16 left-4 right-4 bg-[#0E131F]/95 border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">More Actions</span>
                <button 
                  onClick={() => setShowMobileMoreMenu(false)}
                  className="p-1 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
                <button
                  id="mobile-nav-btn-calendar"
                  onClick={() => {
                    setActiveTab('calendar');
                    setShowMobileMoreMenu(false);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer ${
                    activeTab === 'calendar'
                      ? 'bg-blue-600/20 border-blue-500/30 text-blue-405 text-blue-400 font-extrabold shadow-sm'
                      : 'bg-slate-900/60 border-white/5 hover:border-white/10 text-slate-300'
                  }`}
                >
                  <Calendar className="h-5 w-5 mb-1.5 text-blue-500" />
                  <span className="text-[10px] font-bold text-center leading-tight">Calendar</span>
                </button>


              </div>
            </div>
          </div>
        )}

        {/* High Fidelity Mobile Sticky Bottom Tab Bar (hidden on desktop screens) */}
        <div className="md:hidden sticky bottom-0 z-50 bg-[#0D1117]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around py-2.5 px-1 select-none print:hidden shrink-0 shadow-lg shadow-black/80">
          <button
            id="mobile-nav-btn-daily"
            onClick={() => {
              setActiveTab('daily');
              setShowMobileMoreMenu(false);
            }}
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
            onClick={() => {
              setActiveTab('attendance');
              setShowMobileMoreMenu(false);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'attendance' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck2 className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Logs</span>
          </button>

          <button
            id="mobile-nav-btn-analytics"
            onClick={() => {
              setActiveTab('analytics');
              setShowMobileMoreMenu(false);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'analytics' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Forecast</span>
          </button>

          <button
            id="mobile-nav-btn-timetable"
            onClick={() => {
              setActiveTab('timetable');
              setShowMobileMoreMenu(false);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              activeTab === 'timetable' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">Timetable</span>
          </button>

          <button
            id="mobile-nav-btn-more"
            onClick={() => setShowMobileMoreMenu(!showMobileMoreMenu)}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all cursor-pointer ${
              ['calendar'].includes(activeTab) || showMobileMoreMenu
                ? 'text-blue-400 font-extrabold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MoreHorizontal className="h-4.5 w-4.5" />
            <span className="text-[9px] mt-1 font-medium tracking-tight">
              {activeTab === 'calendar' ? 'Calendar' : 'More'}
            </span>
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

        {/* Quick Settings & Data Vault Drawer Overlay */}
        {showQuickSettingsDrawer && (
          <div className="fixed inset-0 z-50 flex items-center justify-end print:hidden">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
              onClick={() => setShowQuickSettingsDrawer(false)}
            />
            
            {/* Drawer content panel */}
            <div className="relative w-full max-w-2xl h-full bg-[#0D1117] border-l border-white/10 shadow-2xl p-6 flex flex-col justify-between overflow-y-auto z-10 select-text transition-transform duration-300 transform translate-x-0">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 px-2.5 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center">
                      <Settings className="h-4.5 w-4.5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-white tracking-tight uppercase leading-none">ARC SYSTEM CONTROLS</h2>
                      <p className="text-[9px] text-[#64748B] font-semibold mt-1">Configure Student Profile & Offline Settings</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowQuickSettingsDrawer(false)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Embedded Settings Controls Deck */}
                <SettingsTab
                  userProfile={userProfile}
                  onUpdateProfile={saveProfileToStore}
                  currentDate={currentDate}
                  onUpdateCurrentDate={setCurrentDate}
                  autoRemindersEnabled={autoRemindersEnabled}
                  onToggleAutoReminders={setAutoRemindersEnabled}
                  notificationTime={notificationTime}
                  onUpdateNotificationTime={(time) => {
                    setNotificationTime(time);
                    localStorage.setItem('the_arc_notification_time', time);
                  }}
                  notificationDays={notificationDays}
                  onUpdateNotificationDays={(days) => {
                    setNotificationDays(days);
                    localStorage.setItem('the_arc_notification_days', JSON.stringify(days));
                  }}
                  notificationChannel={notificationChannel}
                  onUpdateNotificationChannel={(channel) => {
                    setNotificationChannel(channel);
                    localStorage.setItem('the_arc_notification_channel', channel);
                  }}
                  fbUser={fbUser}
                  signInWithGoogle={signInWithGoogle}
                  logout={handleLogout}
                  cloudSyncStatus={cloudSyncStatus}
                  cloudSyncing={cloudSyncing}
                  syncError={syncError}
                  onFullReset={handleFullReset}
                  onRestoreSampleData={handleRestoreSampleData}
                  onTriggerProfileCrop={(file) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      if (event.target?.result) {
                        setTempImageForCrop(event.target.result as string);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  onExportData={handleExportData}
                  onImportData={handleImportData}
                  importingError={importingError}
                  importingSuccess={importingSuccess}
                  theme={theme}
                  onUpdateTheme={setTheme}
                  subjects={subjects}
                  records={records}
                  timetables={timetables}
                />

                {/* Status Info Card */}
                <div className="p-4 bg-emerald-950/15 border border-emerald-500/15 rounded-xl space-y-2.5 font-sans">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-bold text-emerald-400">Offline Phone Storage Enabled</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    All attendance levels, subjects, schedule timetables, database records, and logs are saved **100% locally on your browser database**. No trackers or networks possess access to your files.
                  </p>
                  <div className="p-2.5 bg-[#0A0C10] border border-white/5 rounded-lg flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-semibold text-slate-500">Active Profile ID:</span>
                    <span className="font-mono text-slate-300 truncate max-w-[170px]" title={userProfile.email || 'offline@phone.local'}>
                      {userProfile.email || 'offline@phone.local'}
                    </span>
                  </div>
                </div>





                
                {/* Reset All Data Safety Mechanism */}
                <div className="p-4 rounded-xl bg-[#1C1917]/25 border border-red-900/20 space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-red-400 flex items-center gap-1.5 leading-none">
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reset Local Storage</span>
                    </h3>
                    <p className="text-[10px] text-slate-550 text-slate-500 leading-normal">
                      Instantly wipe all timetables, subjects, and logs from this device. All active attendance logs and data will be permanently cleared from this device's local sandbox.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmResetLocalStorage(true);
                    }}
                    className="w-full text-red-450 hover:text-white bg-red-950/10 hover:bg-red-650 hover:bg-red-600 border border-red-900/20 hover:border-transparent font-bold text-[10.5px] py-1.5 px-3 rounded-lg transition-all cursor-pointer font-medium"
                  >
                    Wipe Device Storage Container
                  </button>
                </div>

              </div>

              {/* Footer */}
              <div className="border-t border-white/5 pt-4 flex justify-between items-center text-[9px] text-[#64748B] font-mono leading-none">
                <span>THE ARC VAULT V2.0</span>
                <span>100% OFFLINE SECURE</span>
              </div>
            </div>
          </div>
        )}

        {/* Custom Wipe & Reset Warning Dialog */}
        {confirmResetLocalStorage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop with elegant micro-blur effect */}
            <div 
              className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
              onClick={() => setConfirmResetLocalStorage(false)}
            />
            
            {/* Warning Dialog Body */}
            <div className="relative w-full max-w-md bg-[#0F1319] border border-red-500/35 rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in duration-200">
              {/* Icon & Title */}
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 shrink-0 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight leading-none text-red-400">WIPE ALL ATTENDANCE DATA</h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">Delete all saved logs and start fresh</p>
                </div>
              </div>

              {/* Warning Content */}
              <div className="space-y-3 font-sans">
                <p className="text-[11px] font-medium text-slate-300 leading-normal">
                  You are about to delete all your college and university attendance records from this phone or computer. The app will reload and start completely fresh.
                </p>
                
                {/* Visual bullet points list */}
                <div className="p-3 bg-red-950/15 border border-red-500/10 rounded-xl space-y-2 text-[10px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Your daily class attendance sheets and logs will be deleted</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Your subjects list and attendance percentages will be cleared</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Your schedule and Timetables will reset to original settings</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 font-semibold">
                    <span className="text-amber-400 font-bold">⚠️</span>
                    <span>You cannot undo this unless you have a backup file (.json) to import.</span>
                  </div>
                </div>
              </div>

              {/* Responsive Buttons: Yes / No Option */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmResetLocalStorage(false)}
                  className="w-full py-2 px-3.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 font-bold text-xs text-slate-300 hover:text-white transition cursor-pointer text-center"
                >
                  No, Keep My Data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      // 1. Wipe browser stores
                      localStorage.clear();
                      
                      // 2. Purge local React States instantly to prevent stale memory
                      setRecords([]);
                      setSubjects([]);
                      setTimetables([]);
                      setSpecialOverrides([]);
                      setManualOverrides({});
                      
                      // 3. Close dialog
                      setConfirmResetLocalStorage(false);
                      setShowQuickSettingsDrawer(false);
                      
                      // 4. Force trigger full local hard reload
                      window.location.reload();
                    } catch (err) {
                      console.error("Wipe failed", err);
                      // Fail-safe manual trigger
                      window.location.reload();
                    }
                  }}
                  className="w-full py-2 px-3.5 rounded-lg bg-red-650 bg-red-650 bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition cursor-pointer text-center shadow-lg hover:shadow-red-500/10"
                >
                  Yes, Wipe Everything
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
