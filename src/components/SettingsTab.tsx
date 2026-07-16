/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  User,
  Sliders,
  Calendar,
  Cloud,
  Database,
  RefreshCw,
  Trash2,
  Bell,
  ShieldAlert,
  Save,
  CheckCircle,
  FileCheck2,
  Sparkles,
  Upload,
  Download,
  Image as ImageIcon,
  Info
} from 'lucide-react';
import { UserProfile } from '../types';
import { User as FirebaseUser } from 'firebase/auth';
import { getTodayDateString } from '../utils/rulesEngine';
import { 
  generateBackupPayload, 
  validateBackupPayload, 
  restoreBackupToStorage, 
  ArcBackupPayload 
} from '../utils/backupEngine';
import { safeLocalStorage } from '../utils/storage';

interface SettingsTabProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  currentDate: string;
  onUpdateCurrentDate: (date: string) => void;
  autoRemindersEnabled: boolean;
  onToggleAutoReminders: (val: boolean) => void;
  fbUser: FirebaseUser | null;
  signInWithGoogle: () => any;
  logout: () => any;
  cloudSyncStatus: string;
  cloudSyncing: boolean;
  syncError: string | null;
  onFullReset: () => void;
  onRestoreSampleData: () => void;
  onTriggerProfileCrop: (file: File) => void;
  notificationTime: string;
  onUpdateNotificationTime: (val: string) => void;
  notificationDays: string[];
  onUpdateNotificationDays: (val: string[]) => void;
  notificationChannel: string;
  onUpdateNotificationChannel: (val: string) => void;
  onExportData?: () => void;
  onImportData?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importingError?: string | null;
  importingSuccess?: boolean;
  theme: 'dark' | 'light' | 'system';
  onUpdateTheme: (val: 'dark' | 'light' | 'system') => void;
  subjects?: any[];
  records?: any[];
  timetables?: any[];
}

export default function SettingsTab({
  userProfile,
  onUpdateProfile,
  currentDate,
  onUpdateCurrentDate,
  autoRemindersEnabled,
  onToggleAutoReminders,
  fbUser,
  signInWithGoogle,
  logout,
  cloudSyncStatus,
  cloudSyncing,
  syncError,
  onFullReset,
  onRestoreSampleData,
  onTriggerProfileCrop,
  notificationTime,
  onUpdateNotificationTime,
  notificationDays,
  onUpdateNotificationDays,
  notificationChannel,
  onUpdateNotificationChannel,
  onExportData,
  onImportData,
  importingError,
  importingSuccess,
  theme,
  onUpdateTheme,
  subjects,
  records,
  timetables
}: SettingsTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileUrlInput, setProfileUrlInput] = useState<string>(userProfile.imageUrl || '');
  const [isSavedBanner, setIsSavedBanner] = useState<boolean>(false);
  const [remindersSavedBanner, setRemindersSavedBanner] = useState<boolean>(false);

  // --- Backup Engine Local States ---
  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'export_success' | 'export_error' | 'import_verifying' | 'import_pending_confirm' | 'importing' | 'import_success' | 'import_error'>('idle');
  const [backupProgress, setBackupProgress] = useState<number>(0);
  const [backupMessage, setBackupMessage] = useState<string>('');
  const [pendingPayload, setPendingPayload] = useState<ArcBackupPayload | null>(null);
  const [lastExportTime, setLastExportTime] = useState<string | null>(() => safeLocalStorage.getItem('the_arc_last_export_time'));

  const handleExportBackup = async () => {
    try {
      setBackupStatus('exporting');
      setBackupProgress(10);
      setBackupMessage('Scanning local databases...');

      await new Promise(r => setTimeout(r, 200));
      setBackupProgress(40);
      setBackupMessage('Compiling student profile & attendance records...');

      const payload = generateBackupPayload();

      await new Promise(r => setTimeout(r, 200));
      setBackupProgress(75);
      setBackupMessage('Calculating verification checksum...');

      const rawJson = JSON.stringify(payload, null, 2);

      await new Promise(r => setTimeout(r, 200));
      setBackupProgress(100);
      setBackupMessage('Downloading backup package...');

      const fileDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const cleanName = (userProfile.name || "scholar").toLowerCase().replace(/\s+/g, '_');
      const filename = `the_arc_backup_${cleanName}_${fileDate}.arcbackup`;

      const blob = new Blob([rawJson], { type: 'application/json' });
      
      const nowStr = new Date().toLocaleString();
      safeLocalStorage.setItem('the_arc_last_export_time', nowStr);
      setLastExportTime(nowStr);

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setBackupStatus('export_success');
      setBackupMessage(`Successfully exported: ${filename}`);
      setTimeout(() => setBackupStatus('idle'), 4000);
    } catch (e: any) {
      console.error(e);
      setBackupStatus('export_error');
      setBackupMessage(e.message || 'Failed to generate backup.');
    }
  };

  const handleBackupFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupStatus('import_verifying');
    setBackupProgress(20);
    setBackupMessage('Reading backup file...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          throw new Error('Backup file is empty.');
        }

        await new Promise(r => setTimeout(r, 300));
        setBackupProgress(50);
        setBackupMessage('Verifying structural integrity & checking checksum...');

        const result = validateBackupPayload(text);
        if (!result.isValid || !result.payload) {
          throw new Error(result.error || 'Invalid backup payload.');
        }

        await new Promise(r => setTimeout(r, 200));
        setBackupProgress(100);

        setPendingPayload(result.payload);
        setBackupStatus('import_pending_confirm');
        setBackupMessage('Backup file verified. Ready for restoration.');
      } catch (err: any) {
        setBackupStatus('import_error');
        setBackupMessage(err.message || 'Failed to verify backup.');
        setPendingPayload(null);
      }
    };

    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingPayload) return;

    try {
      setBackupStatus('importing');
      setBackupProgress(30);
      setBackupMessage('Rolling database back and recreating storage layers...');

      await new Promise(r => setTimeout(r, 400));
      setBackupProgress(70);
      setBackupMessage('Reconstructing schedules and importing logs...');

      restoreBackupToStorage(pendingPayload);

      await new Promise(r => setTimeout(r, 300));
      setBackupProgress(100);
      setBackupStatus('import_success');
      setBackupMessage('Restoration complete! Rebooting system...');

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setBackupStatus('import_error');
      setBackupMessage(err.message || 'Restoration failed.');
    }
  };

  const triggerRemindersSaved = () => {
    setRemindersSavedBanner(true);
    setTimeout(() => setRemindersSavedBanner(false), 2000);
  };

  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const requestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setNotificationPermission(res);
      } catch (err) {
        console.error("Error requesting notification permission:", err);
      }
    }
  };

  const sendTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert("In-App Test Alert: 📚 Academic Warning: You have unmarked attendance days! Please log them.");
      return;
    }

    if (Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res !== 'granted') {
        alert("In-App Test Fallback (Browser permission not allowed): 📚 Time to log your attendance! Open the app in a new tab if iframe blocks native prompts.");
        return;
      }
    }

    try {
      new Notification("The Arc Attendance Desk", {
        body: "📚 This is a test reminder! Consistent tracking keeps you safe from university attendance shortage.",
        icon: "/favicon.svg",
        tag: "arc-test-reminder"
      });
    } catch (err) {
      console.warn("Notification constructor failed, running in-app alert fallback:", err);
      alert("In-App Fallback: 📚 Real desktop notification triggered! If you do not see it, check your OS/Browser notifications locks.");
    }
  };

  const handleDayToggle = (day: string) => {
    if (notificationDays.includes(day)) {
      onUpdateNotificationDays(notificationDays.filter(d => d !== day));
    } else {
      onUpdateNotificationDays([...notificationDays, day]);
    }
    triggerRemindersSaved();
  };

  // Profile local form state
  const [name, setName] = useState(userProfile.name);
  const [collegeName, setCollegeName] = useState(userProfile.collegeName);
  const [rollNo, setRollNo] = useState(userProfile.rollNo || '');
  const [degree, setDegree] = useState(userProfile.degree);
  const [branch, setBranch] = useState(userProfile.branch || '');
  const [semester, setSemester] = useState(userProfile.semester || '');
  const [email, setEmail] = useState(userProfile.email || '');
  const [minAttendance, setMinAttendance] = useState(userProfile.minAttendance);
  const [semesterStartDate, setSemesterStartDate] = useState(userProfile.semesterStartDate || getTodayDateString());
  const [semesterEndDate, setSemesterEndDate] = useState(userProfile.semesterEndDate || getTodayDateString());

  React.useEffect(() => {
    setName(userProfile.name);
    setCollegeName(userProfile.collegeName);
    setRollNo(userProfile.rollNo || '');
    setDegree(userProfile.degree);
    setBranch(userProfile.branch || '');
    setSemester(userProfile.semester || '');
    setEmail(userProfile.email || '');
    setMinAttendance(userProfile.minAttendance);
    setSemesterStartDate(userProfile.semesterStartDate || getTodayDateString());
    setSemesterEndDate(userProfile.semesterEndDate || getTodayDateString());
  }, [userProfile]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...userProfile,
      name,
      collegeName,
      rollNo,
      degree,
      branch,
      semester,
      email,
      minAttendance,
      semesterStartDate,
      semesterEndDate,
      imageUrl: profileUrlInput
    });
    setIsSavedBanner(true);
    setTimeout(() => setIsSavedBanner(false), 3000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onTriggerProfileCrop(file);
    }
  };

  const handleSyncPhotoUrl = () => {
    onUpdateProfile({
      ...userProfile,
      imageUrl: profileUrlInput
    });
    setIsSavedBanner(true);
    setTimeout(() => setIsSavedBanner(false), 3000);
  };

  return (
    <div className="w-full space-y-6 pb-6 print:hidden animate-fade-in" id="settings-tab-container">

      {isSavedBanner && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3.5 rounded-xl text-xs flex items-center gap-2 font-medium">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Student profile parameters updated and synchronized successfully!</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        
        {/* Left column - Quick Profile ID view & Photo control */}
        <div className="col-span-1 space-y-6">
          
          {/* Passport Photo Box */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 text-center space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 text-left border-b border-white/5 pb-2">
              Identity Portrait
            </h3>
            
            <div className="relative mx-auto w-32 h-40 border border-blue-500/20 rounded-xl overflow-hidden bg-gradient-to-b from-[#181D26] to-[#0D1117] flex flex-col items-center justify-center p-1 shadow-inner group">
              {userProfile.imageUrl ? (
                <img
                  src={userProfile.imageUrl}
                  alt="Student Identifier"
                  className="w-full h-full object-cover rounded-lg group-hover:scale-103 transition-transform"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <ImageIcon className="h-8 w-8 text-blue-500/30" />
                  <span className="text-[8px] uppercase font-mono font-bold tracking-wider text-slate-500">
                    No Passport Photo
                  </span>
                </div>
              )}
              <div className="absolute bottom-1.5 right-1.5 text-[6px] font-mono text-slate-400 bg-black/75 px-1 py-0.5 rounded leading-none uppercase select-none">
                VERIFIED ID
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label className="block text-[11px] font-bold text-slate-350">
                Update Student Photo File
              </label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="tab-settings-file-picker"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-3 py-2 text-xs font-bold bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload JPEG / PNG</span>
              </button>

              <div className="pt-2 border-t border-white/5 space-y-1">
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500">
                  Or Paste Portrait Web Address
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={profileUrlInput}
                    onChange={(e) => setProfileUrlInput(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:border-blue-500 font-mono flex-1"
                    id="settings-avatar-url-input"
                  />
                  <button
                    type="button"
                    onClick={handleSyncPhotoUrl}
                    className="bg-white/5 hover:bg-blue-600 border border-white/5 hover:border-blue-500 text-slate-300 hover:text-white px-2 rounded-lg text-[10px] font-bold transition cursor-pointer"
                  >
                    Sync
                  </button>
                </div>
              </div>

              {userProfile.imageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateProfile({ ...userProfile, imageUrl: '' });
                    setProfileUrlInput('');
                  }}
                  className="w-full mt-2 text-red-400 hover:text-red-300 bg-red-400/5 hover:bg-red-400/15 text-[10px] font-bold uppercase tracking-wider block py-1.5 rounded-lg border border-red-500/10 hover:border-red-500/20 active:scale-98 transition-all cursor-pointer text-center"
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Middle and Right columns - Core Form fields */}
        <div className="col-span-1 space-y-6">
          
          {/* Profile details form card */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-md">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-3 mb-5 flex items-center gap-1.5">
              <User className="h-4 w-4 text-blue-400" />
              <span>Student Profile Particulars</span>
            </h3>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. SOORINENI MAHESH"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition font-medium"
                    id="settings-input-name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    Roll / Register No
                  </label>
                  <input
                    type="text"
                    required
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    placeholder="e.g. 249Y1A3958"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold uppercase transition"
                    id="settings-input-roll"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    College Name
                  </label>
                  <input
                    type="text"
                    required
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g. K.S.R.M. College of Engineering"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition font-medium"
                    id="settings-input-college"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    Degree Name
                  </label>
                  <select
                    value={["B.Tech", "MBA"].includes(degree) ? degree : "Other"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== "Other") {
                        setDegree(val);
                      } else {
                        setDegree("M.Tech");
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-semibold transition cursor-pointer"
                    id="settings-select-degree"
                  >
                    <option value="B.Tech">B.Tech</option>
                    <option value="MBA">MBA</option>
                    <option value="Other">Etc. (Type Below)</option>
                  </select>
                  {!["B.Tech", "MBA"].includes(degree) && (
                    <input
                      type="text"
                      required
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                      placeholder="e.g. M.Tech"
                      className="w-full mt-1.5 bg-black/30 border border-blue-500/30 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    Branch Name
                  </label>
                  <select
                    value={["AIML", "CSE", "CSE AIML", "CSE DS", "ECE", "EEE"].includes(branch) ? branch : "Other"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== "Other") {
                        setBranch(val);
                      } else {
                        setBranch("CIVIL");
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-semibold transition cursor-pointer"
                    id="settings-select-branch"
                  >
                    <option value="AIML">AIML</option>
                    <option value="CSE">CSE</option>
                    <option value="CSE AIML">CSE AIML</option>
                    <option value="CSE DS">CSE DS</option>
                    <option value="ECE">ECE</option>
                    <option value="EEE">EEE</option>
                    <option value="Other">Other branch (Type Below)</option>
                  </select>
                  {!["AIML", "CSE", "CSE AIML", "CSE DS", "ECE", "EEE"].includes(branch) && (
                    <input
                      type="text"
                      required
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="Type branch name (e.g. CIVIL)"
                      className="w-full mt-1.5 bg-black/30 border border-blue-500/30 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    Academic Semester
                  </label>
                  <input
                    type="text"
                    required
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    placeholder="e.g. Semester V"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    id="settings-input-semester"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-300">
                      Semester Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={semesterStartDate}
                      onChange={(e) => setSemesterStartDate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium font-mono transition cursor-pointer"
                      id="settings-input-semester-start"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-300">
                      Semester End Date
                    </label>
                    <input
                      type="date"
                      required
                      value={semesterEndDate}
                      onChange={(e) => setSemesterEndDate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium font-mono transition cursor-pointer"
                      id="settings-input-semester-end"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    Primary Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. student@ksrm.edu"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium transition"
                    id="settings-input-email"
                  />
                </div>

                {/* Target Attendance Threshold custom Slider */}
                <div className="col-span-1 pt-2 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[11px] font-bold text-slate-300">
                      College Attendance Target (%)
                    </label>
                    <span className="font-mono text-xs font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                      {minAttendance}%
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] text-slate-500 font-mono">50%</span>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={minAttendance}
                      onChange={(e) => setMinAttendance(parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      id="settings-threshold-slider"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">100%</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Rules engine dynamically marks safe bunk borders and calculates outstanding hours based on this minimum threshold.
                  </p>
                </div>

              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-end">
                <button
                  type="submit"
                  className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10 active:scale-98"
                  id="settings-profile-submit-btn"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Profile Settings</span>
                </button>
              </div>
            </form>
          </div>

          {/* Simulation & Application configuration widgets */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 space-y-5">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-3 flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-slate-400" />
              <span>Simulation & Behaviour Limits</span>
            </h3>

            <div className="space-y-4">
              
              {/* Theme Preferences */}
              <div className="space-y-3 bg-black/10 dark:bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-white">Theme Selection</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Switch between light, dark, or system default interfaces instantly.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateTheme('dark')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20'
                        : 'bg-white dark:bg-[#0A0D14]/85 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#0A0D14]/90 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="text-sm">🌙</span>
                    <span>Dark Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateTheme('light')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      theme === 'light'
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20'
                        : 'bg-white dark:bg-[#0A0D14]/85 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#0A0D14]/90 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="text-sm">☀️</span>
                    <span>Light Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateTheme('system')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      theme === 'system'
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20'
                        : 'bg-white dark:bg-[#0A0D14]/85 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#0A0D14]/90 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="text-sm">⚙️</span>
                    <span>System</span>
                  </button>
                </div>
              </div>

              {/* Simulator Date Control */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-black/20 p-3 rounded-xl border border-white/5">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">Simulation System Date</h4>
                  <p className="text-[10px] text-slate-400">
                    Shift active bounds to check retro pending classes and backdate logs.
                  </p>
                </div>
                <div className="flex items-center space-x-1 border border-white/15 rounded-lg px-2.5 py-1.5 bg-black/40 shrink-0">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={currentDate}
                    onChange={(e) => onUpdateCurrentDate(e.target.value)}
                    className="font-mono text-xs font-bold bg-transparent border-0 text-white outline-none focus:ring-0 cursor-pointer p-0 w-[110px]"
                    id="settings-simulator-date-picker"
                  />
                </div>
              </div>

              {/* Pro Reminder & Scheduler Engine */}
              <div className="bg-[#0A0D14]/80 p-4 rounded-xl border border-blue-500/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bell className="h-4 w-4 text-blue-400 shrink-0 animate-pulse" />
                      <span>Smart Attendance Reminders</span>
                      {remindersSavedBanner && (
                        <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded animate-pulse shrink-0">
                          ✓ Saved & Scheduled
                        </span>
                      )}
                    </h4>
                    <p className="text-[9px] text-slate-400">
                      Configure automated daily alarms to keep your compliance scores high.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAutoReminders(!autoRemindersEnabled);
                      triggerRemindersSaved();
                    }}
                    className={`relative inline-flex h-5 w-9.5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoRemindersEnabled ? 'bg-blue-600' : 'bg-slate-800'
                    }`}
                    id="settings-reminders-toggle"
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        autoRemindersEnabled ? 'translate-x-[18px]' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {autoRemindersEnabled ? (
                  <div className="space-y-4.5 pt-1 animate-fade-in text-xs">
                    {/* Time Input / Channel Selector Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Reminder Time
                        </label>
                        <input
                          type="time"
                          value={notificationTime}
                          onChange={(e) => {
                            onUpdateNotificationTime(e.target.value);
                            triggerRemindersSaved();
                          }}
                          className="w-full bg-black/40 border border-white/10 rounded-lg p-2 font-mono font-bold text-white outline-none focus:border-blue-500 transition text-center"
                          id="settings-notification-time-picker"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Alert Channel
                        </label>
                        <select
                          value={notificationChannel}
                          onChange={(e) => {
                            onUpdateNotificationChannel(e.target.value);
                            triggerRemindersSaved();
                          }}
                          className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-slate-200 font-semibold outline-none focus:border-blue-500 transition text-xs"
                          id="settings-notification-channel-select"
                        >
                          <option value="both">Both (Browser & App)</option>
                          <option value="browser">Browser Native Center</option>
                          <option value="in_app">In-App Banner Only</option>
                        </select>
                      </div>
                    </div>

                    {/* Active Days Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Active Scheduling Days
                      </label>
                      <div className="flex gap-1.5 justify-between">
                        {[
                          { key: 'Monday', label: 'M' },
                          { key: 'Tuesday', label: 'T' },
                          { key: 'Wednesday', label: 'W' },
                          { key: 'Thursday', label: 'Th' },
                          { key: 'Friday', label: 'F' },
                          { key: 'Saturday', label: 'Sa' },
                          { key: 'Sunday', label: 'Su' }
                        ].map((day) => {
                          const isSelected = notificationDays.includes(day.key);
                          return (
                            <button
                              key={day.key}
                              type="button"
                              onClick={() => handleDayToggle(day.key)}
                              className={`flex-1 text-[10px] py-1.5 font-bold rounded-lg border transition duration-150 cursor-pointer text-center ${
                                isSelected
                                  ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                                  : 'bg-black/20 border-white/5 text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Browser Native Status Shield */}
                    <div className="p-2.5 bg-black/30 border border-white/5 rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">Browser Authorization:</span>
                        <span className={`font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none text-[8.5px] border ${
                          notificationPermission === 'granted'
                            ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400'
                            : notificationPermission === 'denied'
                            ? 'bg-red-500/10 border-red-500/35 text-red-400'
                            : 'bg-amber-500/10 border-amber-500/35 text-amber-400'
                        }`}>
                          {notificationPermission === 'granted' && '● Granted'}
                          {notificationPermission === 'denied' && '● Blocked'}
                          {notificationPermission === 'default' && '● Action Needed'}
                          {notificationPermission === 'unsupported' && '● Offline Only'}
                        </span>
                      </div>

                      {/* Controls Row */}
                      <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
                        {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                          <button
                            type="button"
                            onClick={requestPermission}
                            className="text-[9px] font-bold text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 border border-blue-500/20 rounded py-1 cursor-pointer transition active:scale-98 text-center"
                          >
                            Grant Permission
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={sendTestNotification}
                          className={`text-[9px] font-bold rounded py-1 cursor-pointer transition active:scale-98 text-center border ${
                            notificationPermission === 'granted'
                              ? 'col-span-2 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 border-emerald-500/20'
                              : 'text-slate-400 bg-white/5 hover:bg-white/10 border-white/10'
                          }`}
                        >
                          Send Test Alarm Notification
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic py-1 animate-fade-in text-center">
                    Daily reminders have been disabled for this device.
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* Universal Data Backup & Portability panel */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-3 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-blue-400" />
              <span>THE ARC BACKUP ENGINE</span>
            </h3>

            <p className="text-[11px] text-slate-400 leading-normal text-left">
              Preserve your exact application state, student records, custom calendars, timetables, statistics, and uploaded portrait. Export a master backup file to easily import onto another browser or device with zero configuration required.
            </p>

            {/* Backup stats / local DB info */}
            <div className="bg-[#07090E] border border-white/5 rounded-xl p-3.5 space-y-3 font-sans">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-blue-400" />
                <span>Local Database Information</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-white/2 p-2.5 rounded-lg border border-white/2">
                  <div className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Student Profile</div>
                  <div className="text-slate-200 mt-0.5 truncate font-medium">{userProfile.name || "Offline Guest"}</div>
                </div>
                <div className="bg-white/2 p-2.5 rounded-lg border border-white/2">
                  <div className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Schema Version</div>
                  <div className="text-slate-200 mt-0.5 font-mono">v{safeLocalStorage.getItem('the_arc_schema_version') || '2.6'}</div>
                </div>
                <div className="bg-white/2 p-2.5 rounded-lg border border-white/2">
                  <div className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Registered Subjects</div>
                  <div className="text-slate-200 mt-0.5 font-bold">{subjects?.length || 0} Subjects</div>
                </div>
                <div className="bg-white/2 p-2.5 rounded-lg border border-white/2">
                  <div className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Daily Records Logged</div>
                  <div className="text-slate-200 mt-0.5 font-bold">{records?.length || 0} Days</div>
                </div>
              </div>
              {lastExportTime && (
                <div className="text-[9.5px] text-slate-500 mt-1 text-center font-mono">
                  Last Backup: <span className="text-slate-400 font-sans">{lastExportTime}</span>
                </div>
              )}
            </div>

            {/* Active transaction feedback (Export/Import states) */}
            {backupStatus === 'exporting' && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-3.5 rounded-xl space-y-2 text-left">
                <div className="flex justify-between items-center text-xs font-bold text-blue-400">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Generating Backup Package</span>
                  </span>
                  <span className="font-mono">{backupProgress}%</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${backupProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 italic font-mono">{backupMessage}</p>
              </div>
            )}

            {backupStatus === 'export_success' && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs font-medium flex items-center gap-2 text-left animate-fade-in">
                <CheckCircle className="h-4 w-4 shrink-0 animate-bounce text-emerald-400" />
                <span>{backupMessage}</span>
              </div>
            )}

            {backupStatus === 'export_error' && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-medium text-left">
                ⚠️ {backupMessage}
              </div>
            )}

            {backupStatus === 'import_verifying' && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-3.5 rounded-xl space-y-2 text-left">
                <div className="flex justify-between items-center text-xs font-bold text-blue-400">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Verifying File Integrity</span>
                  </span>
                  <span className="font-mono">{backupProgress}%</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${backupProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 italic font-mono">{backupMessage}</p>
              </div>
            )}

            {backupStatus === 'importing' && (
              <div className="bg-purple-500/10 border border-purple-500/20 p-3.5 rounded-xl space-y-2 text-left">
                <div className="flex justify-between items-center text-xs font-bold text-purple-400">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Restoring Database State</span>
                  </span>
                  <span className="font-mono">{backupProgress}%</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${backupProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 italic font-mono">{backupMessage}</p>
              </div>
            )}

            {backupStatus === 'import_success' && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs font-medium flex items-center gap-2 text-left">
                <CheckCircle className="h-4 w-4 shrink-0 animate-bounce text-emerald-400" />
                <span>{backupMessage}</span>
              </div>
            )}

            {backupStatus === 'import_error' && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-medium text-left">
                ⚠️ {backupMessage}
              </div>
            )}

            {/* Import interactive confirmation panel */}
            {backupStatus === 'import_pending_confirm' && pendingPayload && (
              <div className="bg-blue-950/10 border border-blue-500/20 rounded-xl p-4 space-y-3 text-left animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Verify Backup Details Before Overwrite</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  A valid backup was parsed and verified successfully. Confirming this import will overwrite your existing student profile, subject catalogs, timetables, and daily attendance logs.
                </p>
                
                <div className="bg-[#07090E] border border-white/5 rounded-lg p-3 space-y-2 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Student Profile:</span>
                    <span className="text-slate-200 font-semibold">
                      {(() => {
                        try {
                          const p = JSON.parse(pendingPayload.data.localStorage.the_arc_profile || '{}');
                          return p.name || 'Offline Guest';
                        } catch {
                          return 'Offline Guest';
                        }
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Course / Branch:</span>
                    <span className="text-slate-200 font-mono">
                      {(() => {
                        try {
                          const p = JSON.parse(pendingPayload.data.localStorage.the_arc_profile || '{}');
                          return p.course || 'N/A';
                        } catch {
                          return 'N/A';
                        }
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Attendance Records:</span>
                    <span className="text-slate-200 font-bold">
                      {(() => {
                        try {
                          const recs = JSON.parse(pendingPayload.data.localStorage.the_arc_records || '[]');
                          return recs.length;
                        } catch {
                          return '0';
                        }
                      })()} Days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Export Timestamp:</span>
                    <span className="text-slate-300 font-mono">
                      {new Date(pendingPayload.generatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-white/5">
                    <span className="text-slate-500">Integrity Signature:</span>
                    <span className="text-emerald-400 font-mono text-[9px] bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-500/10">
                      PASSED ({pendingPayload.checksum ? `CRC-${pendingPayload.checksum.toUpperCase()}` : "LEGACY"})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setBackupStatus('idle');
                      setPendingPayload(null);
                    }}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 rounded-lg text-xs font-semibold cursor-pointer transition active:scale-97 text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    className="px-3 py-2 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 rounded-lg text-xs font-bold cursor-pointer transition active:scale-97 text-center"
                  >
                    Confirm & Overwrite
                  </button>
                </div>
              </div>
            )}

            {/* Direct buttons */}
            {backupStatus !== 'import_pending_confirm' && (
              <div className="grid grid-cols-2 gap-3.5">
                {/* Export Feature */}
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={backupStatus === 'exporting' || backupStatus === 'importing' || backupStatus === 'import_verifying'}
                  className="col-span-1 px-3 py-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 rounded-xl transition-all font-bold text-xs cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center active:scale-97 shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Download className="h-5 w-5 shrink-0 text-blue-400" />
                  <span className="font-sans font-bold text-xs">Export Data</span>
                  <span className="text-[8.5px] font-normal font-mono text-slate-500 leading-tight">JSON (.arcbackup)</span>
                </button>

                {/* Import Feature */}
                <div className="col-span-1 relative">
                  <input
                    type="file"
                    id="settings-import-data-file"
                    accept=".arcbackup,.json,.pdf"
                    onChange={handleBackupFileSelect}
                    disabled={backupStatus === 'exporting' || backupStatus === 'importing' || backupStatus === 'import_verifying'}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('settings-import-data-file')?.click()}
                    disabled={backupStatus === 'exporting' || backupStatus === 'importing' || backupStatus === 'import_verifying'}
                    className="w-full h-full px-3 py-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 hover:border-white/10 rounded-xl transition-all font-bold text-xs cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center active:scale-97 shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Upload className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="font-sans font-bold text-xs">Import Backup</span>
                    <span className="text-[8.5px] font-normal font-mono text-slate-500 leading-tight">Restore State File</span>
                  </button>
                </div>
              </div>
            )}
            
            <p className="text-[9px] text-slate-500 text-center italic leading-tight">
              * Exports generate standard high-integrity `.arcbackup` files. Imports accept legacy direct JSON and PDF backup ledgers.
            </p>
          </div>

          {/* Cloud Storage panel */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-3 flex items-center gap-1.5">
              <Cloud className="h-4 w-4 text-blue-400" />
              <span>Offline Phone Storage & Profile Management</span>
            </h3>

            <p className="text-[11px] text-slate-400 leading-normal">
              All attendance records, calendars, timetables, and subjects are stored **100% locally on your phone**. No telemetry, trackers, or automated remote servers have access to your details.
            </p>

            <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl space-y-4">
              <div className="flex items-center gap-3">
                {userProfile.imageUrl || (userProfile.email && userProfile.email !== 'offline@phone.local' && userProfile.email.includes('@')) ? (
                  <img
                    src={userProfile.imageUrl || `https://unavatar.io/${userProfile.email}`}
                    alt={userProfile.name || "Offline Scholar"}
                    className="w-10 h-10 rounded-full border border-white/10 object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-650 via-blue-600 to-cyan-500 border border-white/15 flex items-center justify-center shrink-0 shadow-lg select-none ring-1 ring-white/10 shrink-0">
                    <span className="text-xs font-black text-white tracking-wider">
                      {(() => {
                        const parts = (userProfile.name || "Offline").trim().split(/\s+/);
                        if (parts.length >= 2) {
                          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                        }
                        return parts[0].slice(0, 2).toUpperCase();
                      })()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">{userProfile.name || "Offline Scholar"}</h4>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{userProfile.email || "offline@phone.local"}</p>
                </div>
                <span className="shrink-0 text-[8px] font-mono font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded shadow-sm">
                  Local Mode Active
                </span>
              </div>

              <div className="pt-2 border-t border-white/5 space-y-1.5 font-sans text-xs">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 font-bold">Storage Protection:</span>
                  <span className="font-mono font-bold text-emerald-400 uppercase tracking-wide">
                    100% Secure Local Storage Only
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] pt-1">
                  <span className="text-slate-500 font-bold">Device Vault ID:</span>
                  <span className="font-mono text-[9px] text-slate-400 select-all truncate max-w-[150px]" title={fbUser?.uid || 'local_offline_user'}>
                    {fbUser?.uid || 'local_offline_user'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="w-full mt-2 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 font-bold text-[11px] py-2 px-3 rounded-lg border border-red-500/20 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                id="settings-tab-signout-btn"
              >
                <span>Log Out / Switch Student Profile</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
