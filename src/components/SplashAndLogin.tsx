import React from 'react';
import { safeLocalStorage as localStorage } from '../utils/storage';
import { motion } from 'motion/react';
import { BookOpen, ShieldAlert, GraduationCap, ArrowRight } from 'lucide-react';

interface SplashScreenProps {
  tagline: string;
}

export function SplashScreen({ tagline }: SplashScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0A0C10] flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Premium Background Ambiance */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-cyan-500/5 rounded-full blur-[90px] pointer-events-none" />
      
      {/* Decorative Grid Lines - Academic theme */}
      <div className="absolute inset-0 bg-[radial-gradient(#181d28_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />

      {/* Main Core Content with smooth stagger fade in */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center relative z-10 flex flex-col items-center"
      >
        {/* Animated Accent Logo Arc Representation */}
        <motion.div 
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7, ease: "backOut" }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/25 ring-1 ring-white/10 mb-6"
        >
          <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 20A9 9 0 0 1 21 20" />
            <path d="M7 20A5 5 0 0 1 17 20" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" />
          </svg>
        </motion.div>

        {/* Large bold app name */}
        <h1 className="text-4xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 font-sans uppercase">
          THE ARC
        </h1>

        {/* Tagline below app name */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="text-xs xs:text-sm text-slate-400 font-mono tracking-wider mt-4 px-4 py-1.5 bg-white/[0.02] border border-white/5 rounded-full filter backdrop-blur-sm max-w-sm"
        >
          {tagline}
        </motion.p>
      </motion.div>

      {/* Decorative Bottom branding watermark */}
      <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">
          Academic Registry Desk
        </p>
      </div>
    </div>
  );
}

interface LoginScreenProps {
  onOfflineBypass: (customProfile?: any) => void;
  error?: string | null;
}

export function LoginScreen({ onOfflineBypass, error }: LoginScreenProps) {
  // Check if a saved profile already exists in local storage
  const [existingProfile, setExistingProfile] = React.useState<any>(() => {
    try {
      const stored = localStorage.getItem('the_arc_profile');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only count as valid existing profile if they actually entered custom name
        if (parsed && parsed.name && parsed.name !== 'SOORINENI MAHESH') {
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    }
  });

  // Mode state: 'welcome' (if has profile), 'signup' (new registration)
  const [screenMode, setScreenMode] = React.useState<'welcome' | 'signup'>(
    existingProfile ? 'welcome' : 'signup'
  );

  // Sign up Form states
  const [name, setName] = React.useState('');
  const [collegeName, setCollegeName] = React.useState('');
  const [rollNo, setRollNo] = React.useState('');
  const [degree, setDegree] = React.useState('B.Tech');
  const [branch, setBranch] = React.useState('');
  const [semester, setSemester] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [minAttendance, setMinAttendance] = React.useState(75);
  const [semesterStartDate, setSemesterStartDate] = React.useState('2026-05-01');
  const [semesterEndDate, setSemesterEndDate] = React.useState('2026-11-30');
  const [formError, setFormError] = React.useState('');

  const handlePrefillDemo = () => {
    const isAlreadyFilled = name.trim() !== '' || collegeName.trim() !== '' || rollNo.trim() !== '' || email.trim() !== '';
    if (isAlreadyFilled) {
      setName('');
      setCollegeName('');
      setRollNo('');
      setDegree('B.Tech');
      setBranch('');
      setSemester('');
      setEmail('');
      setMinAttendance(75);
      setSemesterStartDate('2026-05-01');
      setSemesterEndDate('2026-11-30');
    } else {
      setName('SOORINENI MAHESH');
      setCollegeName('K.S.R.M. College of Engineering');
      setRollNo('249Y1A3958');
      setDegree('B.Tech');
      setBranch('AIML');
      setSemester('');
      setEmail('249Y1A3958@gmail.com');
      setMinAttendance(75);
      setSemesterStartDate('2026-05-01');
      setSemesterEndDate('2026-11-30');
    }
    setFormError('');
  };

  const handleLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!collegeName.trim()) {
      setFormError('Please enter your college name.');
      return;
    }
    if (!semesterStartDate) {
      setFormError('Please select a valid semester start date.');
      return;
    }
    if (!semesterEndDate) {
      setFormError('Please select a valid semester end date.');
      return;
    }
    if (new Date(semesterStartDate) > new Date(semesterEndDate)) {
      setFormError('Semester start date cannot be after the end date.');
      return;
    }
    if (minAttendance < 1 || minAttendance > 100) {
      setFormError('Minimum attendance rate must be between 1% and 100%.');
      return;
    }

    const newProfile = {
      name: name.trim(),
      collegeName: collegeName.trim(),
      rollNo: rollNo.trim() || 'N/A',
      course: degree,
      degree: degree,
      branch: branch.trim() || 'General',
      semester: semester || 'I Semester',
      email: email.trim() || 'student@thearc.io',
      minAttendance: Number(minAttendance) || 75,
      semesterStartDate: semesterStartDate,
      semesterEndDate: semesterEndDate
    };

    // Save profile to local storage instantly before launching
    localStorage.setItem('the_arc_profile', JSON.stringify(newProfile));
    
    // Bypass into application using the newly created local student profile
    onOfflineBypass(newProfile);
  };

  return (
    <div className="min-h-screen w-full bg-[#0A0C10] flex flex-col items-center justify-center p-3 sm:p-6 relative overflow-hidden selection:bg-blue-500/30 font-sans">
      {/* Background radial atmosphere */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-blue-600/10 via-indigo-600/5 to-transparent rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-10 w-96 h-96 bg-cyan-500/[0.02] rounded-full blur-[100px] pointer-events-none" />
      
      {/* Subtle academic grid pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#181d28_1.2px,transparent_1.2px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-[450px] bg-[#0D1117]/95 border border-white/5 sm:border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl relative z-10 backdrop-blur-xl"
      >
        {/* Subtle top edge highlighting */}
        <div className="absolute top-0 left-10 right-10 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        {/* Brand Core Identity block */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/15 mb-3 ring-1 ring-white/10 shrink-0">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 20A9 9 0 0 1 21 20" />
              <path d="M7 20A5 5 0 0 1 17 20" />
              <circle cx="12" cy="7" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <h2 className="text-xl font-black tracking-widest text-white uppercase font-sans">
            THE ARC
          </h2>
          <p className="text-[11px] text-slate-400 font-medium tracking-wide mt-1 leading-none">
            Attendance Records Companion
          </p>
        </div>

        {screenMode === 'welcome' && existingProfile ? (
          /* Welcome back returning user */
          <div className="space-y-6">
            <div className="p-4.5 bg-white/[0.02] border border-white/5 rounded-2xl text-center space-y-3 font-sans">
              <div className="flex justify-center">
                {existingProfile.imageUrl || (existingProfile.email && existingProfile.email !== 'offline@phone.local' && existingProfile.email.includes('@')) ? (
                  <img
                    src={existingProfile.imageUrl || `https://unavatar.io/${existingProfile.email}`}
                    alt={existingProfile.name || "Student"}
                    className="w-14 h-14 rounded-full border border-white/10 object-cover shrink-0 shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-md">
                    <GraduationCap className="h-7 w-7 text-blue-400" />
                  </div>
                )}
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                  Local Student Profile Found
                </span>
                <h3 className="text-lg font-black text-white mt-2 tracking-tight uppercase">
                  {existingProfile.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {existingProfile.rollNo} • {existingProfile.branch} • {existingProfile.semester}
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-1">
                  {existingProfile.collegeName}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => onOfflineBypass(existingProfile)}
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/15 border border-blue-400/25 cursor-pointer select-none relative overflow-hidden group"
              >
                <span>Enter Student Dashboard</span>
                <ArrowRight className="h-4 w-4 text-white" />
              </button>

              <button
                onClick={() => setScreenMode('signup')}
                className="w-full h-10 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-slate-400 hover:text-white font-bold text-xs transition-all cursor-pointer select-none"
              >
                Create a Different Student Account
              </button>
            </div>
          </div>
        ) : (
          /* Sign up form for new local profile creation */
          <form onSubmit={handleLocalSubmit} className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Student Sign Up (Offline)
                </h3>
                <p className="text-[10px] text-slate-500">All data persists in local workspace storage</p>
              </div>
              <button
                type="button"
                onClick={handlePrefillDemo}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 py-1 px-2.5 bg-blue-400/10 rounded-md border border-blue-400/20 active:scale-95 transition-all cursor-pointer"
              >
                {name.trim() !== '' || collegeName.trim() !== '' || rollNo.trim() !== '' || email.trim() !== '' 
                  ? 'Clear Profile' 
                  : 'Load Demo Profile'}
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl flex items-start gap-2.5 text-red-400">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <div className="text-[11px] leading-normal font-semibold">
                  {formError}
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                  Full Student Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. SOORINENI MAHESH"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  required
                />
              </div>

              {/* College name */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                  College / University Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. K.S.R.M. College of Engineering"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  required
                />
              </div>

              {/* Two-column inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 249Y1A3958"
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. student@local.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Course & Branch */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Degree / Course
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B.Tech"
                    value={degree}
                    onChange={(e) => setDegree(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Branch / Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AIML"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Semester & Target Attendance rate */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Semester
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. IV Semester"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Goal Attendance %
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={minAttendance}
                    onChange={(e) => setMinAttendance(Number(e.target.value))}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Semester Start & End Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 font-sans">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Semester Start *
                  </label>
                  <input
                    type="date"
                    value={semesterStartDate}
                    onChange={(e) => setSemesterStartDate(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer font-mono"
                    required
                  />
                </div>
                <div className="space-y-1 font-sans">
                  <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                    Semester End *
                  </label>
                  <input
                    type="date"
                    value={semesterEndDate}
                    onChange={(e) => setSemesterEndDate(e.target.value)}
                    className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer font-mono"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98] text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              <span>Register & Enter Companion</span>
              <BookOpen className="h-3.5 w-3.5" />
            </button>

            {existingProfile && (
              <button
                type="button"
                onClick={() => setScreenMode('welcome')}
                className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors pt-1 cursor-pointer"
              >
                Go Back to Welcome Display
              </button>
            )}
          </form>
        )}

        {/* Compliant Footer with Terms, Privacy and Version */}
        <div className="mt-8 pt-4 border-t border-white/5 text-center flex flex-col items-center gap-1.5 select-none text-[10px] text-slate-500">
          <p className="text-[9px] text-[#475569] font-mono leading-none tracking-wider uppercase">
            Build Version 1.2.0 (Local Workspace Only)
          </p>
        </div>
      </motion.div>
    </div>
  );
}

