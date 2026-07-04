/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Calendar,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Info,
  Clock,
  BookOpen,
  FileSpreadsheet,
  Settings,
  ArrowRight,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  Subject,
  Timetable,
  TimetableSlot
} from '../types';
import { formatDateToDDMMYYYY } from '../utils/rulesEngine';

interface TimetableManagerProps {
  subjects: Subject[];
  timetables: Timetable[];
  onAddSubject: (sub: Subject) => void;
  onUpdateSubject: (oldCode: string, updatedSub: Subject) => void;
  onDeleteSubject: (code: string) => void;
  onReplaceTimetable: (newTt: Timetable) => void;
  currentDate?: string;
  onImportTimetableAndProfile?: (imported: {
    collegeName: string;
    degree: string;
    branch: string;
    semester: string;
    subjects: Subject[];
    timetableSlots: Record<string, TimetableSlot[]>;
    semesterStartDate?: string;
    semesterEndDate?: string;
  }) => void;
}

export default function TimetableManager({
  subjects,
  timetables,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onReplaceTimetable,
  currentDate,
  onImportTimetableAndProfile
}: TimetableManagerProps) {
  const [activeDayTab, setActiveDayTab] = useState<string>('1'); // Monday default
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isReplacingTimetable, setIsReplacingTimetable] = useState(false);

  // AI Auto-Importer States
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingStep, setAiLoadingStep] = useState('Uploading document to low-latency server-side context...');
  const [aiError, setAiError] = useState<string | null>(null);
  const [importedData, setImportedData] = useState<{
    collegeName: string;
    degree: string;
    branch: string;
    semester: string;
    subjects: Subject[];
    timetableSlots: Record<string, TimetableSlot[]>;
  } | null>(null);

  const [confirmSemesterStart, setConfirmSemesterStart] = useState('2026-05-01');
  const [confirmSemesterEnd, setConfirmSemesterEnd] = useState('2026-11-30');

  // Subject editing states
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    code: '',
    name: '',
    isLab: false,
    labHours: 3
  });

  const handleStartEdit = (sub: Subject) => {
    setEditingCode(sub.code);
    setEditForm({
      code: sub.code,
      name: sub.name,
      isLab: sub.isLab,
      labHours: sub.labHours || 3
    });
  };

  const handleSaveEdit = (oldCode: string) => {
    const trimmedCode = editForm.code.trim().toUpperCase();
    const trimmedName = editForm.name.trim();
    if (!trimmedCode || !trimmedName) return;

    const existsOther = subjects.some(s => s.code === trimmedCode && s.code !== oldCode);
    if (existsOther) {
      alert(`Subject with code "${trimmedCode}" already exists.`);
      return;
    }

    onUpdateSubject(oldCode, {
      code: trimmedCode,
      name: trimmedName,
      isLab: editForm.isLab,
      labHours: editForm.isLab ? editForm.labHours : undefined
    });
    setEditingCode(null);
  };

  // Form states for custom subject addition
  const [subjectForm, setSubjectForm] = useState({
    code: 'OS_LAB',
    name: 'Operating Systems Practical Lab',
    isLab: false,
    labHours: 3
  });

  // Form states for replacing timetable
  const [replaceForm, setReplaceForm] = useState<{
    effectiveFrom: string;
    slots: Record<string, TimetableSlot[]>;
  }>({
    effectiveFrom: currentDate || '2026-05-01',
    slots: {
      '1': [], // Monday slots
      '2': [],
      '3': [],
      '4': [],
      '5': [],
      '6': [],
      '0': []
    }
  });

  // Temporary selectors to add new slots into replacing timetable
  const [draftSlot, setDraftSlot] = useState({
    day: '1',
    subjectCode: 'DBMS',
    hours: 1
  });

  const dayNames: Record<string, string> = {
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '0': 'Sunday'
  };

  // Resolve current active/latest timetable configuration for display
  const latestTimetable = timetables[timetables.length - 1];

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.code || !subjectForm.name) return;
    
    onAddSubject({
      code: subjectForm.code.trim().toUpperCase(),
      name: subjectForm.name.trim(),
      isLab: subjectForm.isLab,
      labHours: subjectForm.isLab ? subjectForm.labHours : undefined
    });
    
    setIsAddingSubject(false);
    // Reset defaults
    setSubjectForm({
      code: 'OS_LAB',
      name: 'Operating Systems Practical Lab',
      isLab: false,
      labHours: 3
    });
  };

  const handleStartReplaceFlow = () => {
    // Copy the current active timetable slots to provide a handy base to edit
    const currentSlotsCopy = latestTimetable
      ? JSON.parse(JSON.stringify(latestTimetable.slots))
      : { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '0': [] };

    const firstSubject = subjects[0];
    const initialHours = firstSubject?.isLab ? (firstSubject.labHours || 3) : 1;

    setReplaceForm({
      effectiveFrom: currentDate || '2026-05-01',
      slots: currentSlotsCopy
    });
    setDraftSlot({
      day: '1',
      subjectCode: firstSubject?.code || 'DBMS',
      hours: initialHours
    });
    setIsReplacingTimetable(true);
  };

  const handleAddSlotToDraft = () => {
    const day = draftSlot.day;
    const list = [...replaceForm.slots[day]];
    
    // Check if subject already scheduled on same day to update or merge
    const existingIdx = list.findIndex(s => s.subjectCode === draftSlot.subjectCode);
    if (existingIdx >= 0) {
      list[existingIdx].hours = draftSlot.hours;
    } else {
      list.push({
        subjectCode: draftSlot.subjectCode,
        hours: draftSlot.hours
      });
    }

    setReplaceForm(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [day]: list
      }
    }));
  };

  const handleRemoveSlotFromDraft = (day: string, index: number) => {
    const list = [...replaceForm.slots[day]];
    list.splice(index, 1);
    setReplaceForm(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [day]: list
      }
    }));
  };

  const handleSaveReplacedTimetable = () => {
    onReplaceTimetable({
      id: `tt_${Date.now()}`,
      effectiveFrom: replaceForm.effectiveFrom,
      slots: replaceForm.slots
    });
    setIsReplacingTimetable(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const processFile = (selectedFile: File) => {
    setAiError(null);
    setImportedData(null);
    
    const type = selectedFile.type;
    const size = selectedFile.size;
    if (!type.includes('image/') && type !== 'application/pdf') {
      setAiError('Unsupported format. Please upload a PDF, PNG, JPEG, or JPG file.');
      return;
    }
    
    if (size > 14 * 1024 * 1024) {
      setAiError('File is too large (maximum size is 14MB).');
      return;
    }

    setFile(selectedFile);
    
    const reader = new FileReader();
    reader.onload = async () => {
      const resultStr = reader.result as string;
      const commaIndex = resultStr.indexOf(',');
      const fileData = resultStr.substring(commaIndex + 1);
      
      setAiLoading(true);
      setAiLoadingStep('Uploading file with low-latency server-side context...');

      // Dynamic progress messages to increase perceived speed and provide status transparency
      const messages = [
        'Connecting to Gemini 3.5-Flash (optimized latency mode)...',
        'Extracting document metadata (institutional headers, program details)...',
        'Parsing courses & mapping theoretical lectures vs practical labs...',
        'Compiling weekly timetable slot sequences...',
        'Cross-verifying subject codes & database alignment rules...',
        'Finalizing structural calendar representation...'
      ];
      
      let currentMsgIndex = 0;
      const statusTimer = setInterval(() => {
        if (currentMsgIndex < messages.length - 1) {
          currentMsgIndex++;
          setAiLoadingStep(messages[currentMsgIndex]);
        }
      }, 1300);

      try {
        const res = await fetch('/api/gemini/parse-timetable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData, mimeType: type })
        });
        
        let data;
        if (!res.ok) {
          try {
            const err = await res.json();
            throw new Error(err.error || 'The server reported parsing issues.');
          } catch {
            throw new Error('Connection error. Server may be offline.');
          }
        } else {
          data = await res.json();
        }
        
        setImportedData(data);
      } catch (err: any) {
        console.error('Frontend error parsing timetable:', err);
        setAiError(err.message || 'Timetable analysis failed. Please try again.');
        setImportedData(null);
      } finally {
        clearInterval(statusTimer);
        setAiLoading(false);
      }
    };
    
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleApplyImport = () => {
    if (!importedData || !onImportTimetableAndProfile) return;
    onImportTimetableAndProfile({
      ...importedData,
      semesterStartDate: confirmSemesterStart,
      semesterEndDate: confirmSemesterEnd
    });
    setImportedData(null);
    setFile(null);
  };

  return (
    <div className="space-y-6 w-full">
      {/* AI Timetable & Syllabus Auto-Importer (Sleek Cosmic Card) */}
      <div className="bg-[#0D1117] border border-blue-900/30 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all">
        {/* Abstract subtle glowing background blobs */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-white/5 gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full tracking-wider uppercase shadow-xs">
                AI Agent Enabled
              </span>
              <Sparkles className="h-4.5 w-4.5 text-blue-400 animate-pulse" />
              <h2 className="font-sans font-bold text-base text-white tracking-tight">AI Timetable & Syllabus Auto-Importer</h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Upload your semester schedule screenshot, lecture list PDF, or class calendar image. The built-in Multimodal Gemini model will automatically parse courses, extract lab periods, and configure your entire semester structure.
            </p>
          </div>
        </div>

        {/* Upload Zone */}
        {!importedData && !aiLoading && (
          <div className="mt-5 relative z-10">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-3 ${
                isDragOver
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-800 bg-[#0A0D14]/50 hover:bg-[#0A0D14] hover:border-slate-700'
              }`}
              onClick={() => document.getElementById('timetable-file-input')?.click()}
            >
              <input
                id="timetable-file-input"
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
              />
              <div className="h-11 w-11 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 shadow-inner group-hover:scale-105 transition-transform">
                <Upload className="h-5 w-5" />
              </div>

              <div className="space-y-1 text-center">
                <p className="text-xs font-sans font-semibold text-slate-200">
                  Drag & drop your file here, or <span className="text-blue-400 underline decoration-dotted">browse files</span>
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Supports Images (PNG, JPEG, screenshot) or Syllabus Documents (PDF) up to 14MB
                </p>
              </div>
            </div>

            {aiError && (
              <div className="mt-4 flex items-start space-x-2.5 p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-lg animate-fadeIn">
                <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-300">Analysis aborted</p>
                  <p className="text-red-400/90 leading-relaxed font-sans">{aiError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading Spinner Section */}
        {aiLoading && (
          <div className="mt-5 py-12 flex flex-col items-center justify-center space-y-4 relative z-10 font-sans">
            <div className="relative">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
              <Sparkles className="h-4 w-4 text-indigo-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>
            <div className="space-y-1.5 text-center">
              <p className="text-xs font-semibold text-slate-200">Processing Timetable via Gemini Intel...</p>
              <p className="text-[11px] font-mono text-blue-400 max-w-md animate-pulse leading-normal font-medium bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10">
                {aiLoadingStep}
              </p>
            </div>
          </div>
        )}

        {/* Analysis Results Display */}
        {importedData && (
          <div className="mt-5 space-y-5 animate-fadeIn relative z-10 font-sans text-xs">
            {/* Fallback Banner Alert if Gemini API was offline or busy */}
            {importedData.isFallback && (
              <div className="bg-amber-950/20 border border-amber-500/25 text-amber-400 p-4 rounded-xl flex items-start space-x-3 animate-fadeIn">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500 animate-pulse" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-300 text-xs tracking-tight">Self-Healing Offline Fallback Mode Active</p>
                  <p className="text-[11px] text-amber-300/80 leading-normal font-sans font-medium">
                    {importedData.fallbackMessage}
                  </p>
                </div>
              </div>
            )}

            {/* Detected Academic Profile & Semester Dates Confirmation Card */}
            <div className="bg-[#121824] border border-blue-900/20 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <span className="block text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold">Institution / College</span>
                  <span className="text-xs font-bold text-white block truncate">{importedData.collegeName || 'N/A'}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold">Degree Program</span>
                  <span className="text-xs font-semibold text-slate-200 block truncate">{importedData.degree || 'N/A'} ({importedData.branch || 'General'})</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold">Semester Structure</span>
                  <span className="text-xs font-bold text-blue-400 block">{importedData.semester || 'N/A'}</span>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c1018]/60 p-3 rounded-lg border border-white/5">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-blue-400 block flex items-center gap-1">🗓️ CONFIRM SEMESTER DATE BOUNDARIES</span>
                  <p className="text-[9.5px] text-slate-400 leading-normal">
                    Attendance records and class slots will auto-allocate strictly between these start & end dates.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="space-y-1 shrink-0">
                    <span className="block text-[8px] uppercase font-mono tracking-wider text-slate-500 font-bold">Start Date</span>
                    <input
                      type="date"
                      required
                      value={confirmSemesterStart}
                      onChange={(e) => setConfirmSemesterStart(e.target.value)}
                      className="bg-black/50 border border-white/10 rounded px-2.5 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-blue-500 transition cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1 shrink-0">
                    <span className="block text-[8px] uppercase font-mono tracking-wider text-slate-500 font-bold">End Date</span>
                    <input
                      type="date"
                      required
                      value={confirmSemesterEnd}
                      onChange={(e) => setConfirmSemesterEnd(e.target.value)}
                      className="bg-black/50 border border-white/10 rounded px-2.5 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-blue-500 transition cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Extracted Matrix Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* subjects extracted */}
              <div className="bg-[#0A0D14] border border-slate-800 rounded-xl p-4 space-y-3">
                <p className="font-bold text-[10px] text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800/80 pb-2">
                  🛡️ Extracted Course Modules ({importedData.subjects.length})
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {importedData.subjects.map((sub, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 rounded-lg border border-white/5 bg-[#0F131D]/50 hover:bg-[#0F131D] transition-colors">
                      <div className="min-w-0 flex-1 pr-2">
                        <span className={`inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md mr-1.5 ${
                          sub.isLab ? 'bg-indigo-500/15 text-indigo-400' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {sub.code}
                        </span>
                        <span className="text-xs text-slate-200 font-medium truncate">{sub.name}</span>
                      </div>
                      <div className="shrink-0">
                        {sub.isLab ? (
                          <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
                            Lab ({sub.labHours || 3}h)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400">Theory</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* schedule slots preview */}
              <div className="bg-[#0A0D14] border border-slate-800 rounded-xl p-4 space-y-3">
                <p className="font-bold text-[10px] text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800/80 pb-2">
                  🗓️ Scheduled Weekly Slots Matrix
                </p>
                
                <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {['1', '2', '3', '4', '5', '6', '0'].map(dayIdx => {
                    const daySlots = importedData.timetableSlots[dayIdx] || [];
                    const dNames: Record<string, string> = {
                      '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '0': 'Sun'
                    };
                    if (daySlots.length === 0) return null;
                    return (
                      <div key={dayIdx} className="bg-[#0F131D]/50 border border-white/5 rounded-lg p-2 flex flex-col justify-between">
                        <span className="font-mono text-[9px] font-bold text-slate-400 uppercase tracking-wider block border-b border-white/5 pb-1">
                          {dNames[dayIdx]}
                        </span>
                        <div className="space-y-1 mt-1.5 text-[9.5px]">
                          {daySlots.map((s, i) => (
                            <div key={i} className="flex justify-between text-slate-300">
                              <span className="truncate max-w-[80px] font-mono text-[10px]">{s.subjectCode}</span>
                              <span className="font-mono text-slate-500 font-bold">{s.hours}h</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Action Area */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/5 font-semibold">
              <button
                type="button"
                onClick={() => { setImportedData(null); setFile(null); }}
                className="px-3.5 py-2 text-xs border border-white/10 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Declined / Scan Again
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                className="px-5 py-2 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg transition shadow-md shadow-blue-900/20 flex items-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Initialize Semester & Auto-Apply Settings</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div id="timetable-manager-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* 1. Subjects Directory (Col 1) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <BookOpen className="h-4 w-4 text-slate-500" />
              <h3 className="font-sans font-bold text-sm text-slate-900 tracking-tight">Subjects</h3>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Tap on a subject to edit details</p>
          </div>
          <button
            onClick={() => setIsAddingSubject(true)}
            className="text-[10px] bg-slate-900 hover:bg-slate-800 text-white font-bold p-1 px-2.5 rounded transition cursor-pointer shrink-0"
          >
            Add Course
          </button>
        </div>

        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {subjects.map((sub, idx) => {
            const isEditing = editingCode === sub.code;

            if (isEditing) {
              return (
                <div key={idx} className="p-3 bg-slate-50 border border-blue-200 rounded-lg space-y-3 shadow-inner">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1 space-y-1">
                      <label className="block text-[9px] uppercase font-mono font-bold text-slate-400">Code</label>
                      <input
                        type="text"
                        value={editForm.code}
                        onChange={(e) => setEditForm(f => ({ ...f, code: e.target.value }))}
                        className="w-full font-mono text-xs border border-slate-300 rounded p-1 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="block text-[9px] uppercase font-mono font-bold text-slate-400">Subject Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full text-xs border border-slate-300 rounded p-1 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="checkbox"
                        id={`edit-chk-lab-${idx}`}
                        checked={editForm.isLab}
                        onChange={(e) => setEditForm(f => ({ ...f, isLab: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                      />
                      <label htmlFor={`edit-chk-lab-${idx}`} className="text-slate-600 font-medium cursor-pointer">Lab</label>
                      
                      {editForm.isLab && (
                        <input
                          type="number"
                          min="1"
                          max="4"
                          value={editForm.labHours}
                          onChange={(e) => setEditForm(f => ({ ...f, labHours: parseInt(e.target.value) || 3 }))}
                          className="w-8 font-mono text-[10px] border border-slate-300 rounded px-1 py-0.5 ml-1 text-center text-slate-800"
                        />
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingCode(null)}
                        className="px-2 py-1 border border-slate-200 text-slate-500 rounded bg-white hover:bg-slate-50 cursor-pointer text-[10px] font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(sub.code)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer text-[10px] font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div 
                key={idx} 
                onClick={() => handleStartEdit(sub)}
                className="flex items-center justify-between p-2.5 hover:bg-slate-50/70 rounded-lg border border-slate-100 text-xs cursor-pointer group transition-all"
                title="Tap to edit subject spelling/details"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <span className={`inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded mr-2 ${
                    sub.isLab ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {sub.code}
                  </span>
                  <span className="font-sans font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">{sub.name}</span>
                  {sub.isLab && (
                    <span className="text-[10.5px] italic text-slate-400 block ml-2">
                      ({sub.labHours || 3} Hours allocated)
                    </span>
                  )}
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSubject(sub.code);
                  }}
                  className="text-slate-400 hover:text-red-500 p-1 cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity"
                  title="Remove Course From List"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Active Weekly Timetable (Col 2, Span 2) */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="h-4.5 w-4.5 text-slate-600" />
              <h3 className="font-sans font-bold text-sm text-slate-900 tracking-tight">Hourly Class Schedule</h3>
            </div>
            <p className="text-[10px] font-mono text-slate-400">
              Active version effective from: <span className="font-bold text-slate-600">{formatDateToDDMMYYYY(latestTimetable?.effectiveFrom || '2026-05-01')}</span>
            </p>
          </div>

          <button
            onClick={handleStartReplaceFlow}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded text-xs transition cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5 animate-spin-slow" />
            <span>Replace / Upgrade Timetable</span>
          </button>
        </div>

        {/* Day selection Tabs */}
        <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-lg text-xs font-mono font-medium justify-between">
          {Object.keys(dayNames).map((dayIndex) => {
            const listClasses = latestTimetable?.slots[dayIndex] || [];
            return (
              <button
                key={dayIndex}
                onClick={() => setActiveDayTab(dayIndex)}
                className={`flex-1 py-1 px-1 text-center rounded transition cursor-pointer ${
                  activeDayTab === dayIndex
                    ? 'bg-white text-slate-950 font-bold shadow-xs border border-slate-100'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="block sm:inline">{dayNames[dayIndex].substring(0, 3)}</span>
                <span className="text-[9px] font-mono text-slate-500 block">({listClasses.length})</span>
              </button>
            );
          })}
        </div>

        {/* Current Timetable Slots Display */}
        <div className="space-y-2 min-h-60">
          {(!latestTimetable || !latestTimetable.slots[activeDayTab] || latestTimetable.slots[activeDayTab].length === 0) ? (
            <div className="text-center py-10 space-y-2 text-slate-400">
              <Clock className="h-8 w-8 mx-auto" />
              <p className="text-xs italic">No scheduled class slots recorded for {dayNames[activeDayTab]}.</p>
              <p className="text-[10px]">Mark as "Holiday" or adjust timetable properties.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {latestTimetable.slots[activeDayTab].map((slot, i) => {
                const sObj = subjects.find(s => s.code === slot.subjectCode);
                return (
                  <div key={i} className="flex justify-between items-center p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className={`h-2 w-2 rounded-full ${sObj?.isLab ? 'bg-indigo-500' : 'bg-slate-600'}`} />
                        <span className="font-mono font-bold text-xs text-slate-900 tracking-wide uppercase">
                          {slot.subjectCode}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 font-sans truncate max-w-[200px]">
                        {sObj?.name || 'Academic Class'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-slate-700 bg-white border px-2 py-0.5 rounded">
                        {slot.hours} Hours
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* 3. Popup Modal: Add Subject Form */}
      {isAddingSubject && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full overflow-hidden text-slate-800">
            <div className="bg-slate-900 p-4 text-white">
              <h3 className="font-sans font-semibold text-sm">Add New Lecture Subject</h3>
            </div>

            <form onSubmit={handleCreateSubject} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider font-mono">
                  Subject Identifier Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OS, DBMS, AIML_LAB"
                  value={subjectForm.code}
                  onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value }))}
                  className="w-full font-mono border border-slate-200 rounded p-2 focus:ring-1 focus:ring-slate-800 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider font-mono">
                  Offical Subject Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operating Systems"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded p-2 focus:ring-1 focus:ring-slate-800 text-xs"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-lab"
                  checked={subjectForm.isLab}
                  onChange={(e) => setSubjectForm(f => ({ ...f, isLab: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-800 cursor-pointer"
                />
                <label htmlFor="chk-lab" className="text-slate-600 font-medium cursor-pointer">
                  This course incorporates a Laboratory session
                </label>
              </div>

              {subjectForm.isLab && (
                <div className="space-y-1">
                  <label className="block text-slate-500 font-semibold uppercase tracking-wider font-mono">
                    Lab Slot Duration (Hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={subjectForm.labHours}
                    onChange={(e) => setSubjectForm(f => ({ ...f, labHours: parseInt(e.target.value) }))}
                    className="w-full font-mono border border-slate-200 rounded p-2"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 font-semibold">
                <button
                  type="button"
                  onClick={() => setIsAddingSubject(false)}
                  className="p-2 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded cursor-pointer"
                >
                  Add Subject Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Large Modal: Replace Timetable Wizard */}
      {isReplacingTimetable && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden text-slate-800">
            
            <div className="bg-slate-950 p-4 text-white flex items-center justify-between">
              <h3 className="font-sans font-bold text-sm tracking-tight flex items-center space-x-2">
                <Sparkles className="h-4 w-4" />
                <span>Replace Current Timetable Matrix</span>
              </h3>
              <button onClick={() => setIsReplacingTimetable(false)} className="text-slate-400 hover:text-white text-xs">
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-blue-800 flex items-start space-x-2">
                <Info className="h-4.5 w-4.5 text-blue-600 mt-0.5 shrink-0" />
                <p className="leading-normal">
                  Replacing the timetable creates a new schedule configuration. All marked attendance records prior to the "Effective From Date" will preserve the old schedule context in historical analysis.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-500 font-semibold uppercase tracking-wider font-mono">
                    New Schedule Effective Date
                  </label>
                  <input
                    type="date"
                    required
                    value={replaceForm.effectiveFrom}
                    onChange={(e) => setReplaceForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                    className="w-full font-mono border border-slate-200 rounded p-2 focus:ring-1 focus:ring-slate-800"
                  />
                </div>

                <div className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100">
                  <p className="font-semibold text-slate-700 font-mono">Draft New Day Class:</p>
                  
                  <div className="flex gap-1.5">
                    <select
                      value={draftSlot.day}
                      onChange={(e) => setDraftSlot(f => ({ ...f, day: e.target.value }))}
                      className="flex-1 border border-slate-200 rounded p-1"
                    >
                      {Object.keys(dayNames).map(k => (
                        <option key={k} value={k}>{dayNames[k]}</option>
                      ))}
                    </select>

                    <select
                      value={draftSlot.subjectCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const subObj = subjects.find(s => s.code === code);
                        setDraftSlot(f => ({
                          ...f,
                          subjectCode: code,
                          hours: subObj?.isLab ? (subObj.labHours || 3) : 1
                        }));
                      }}
                      className="flex-1 border border-slate-200 rounded p-1"
                    >
                      {subjects.map(s => (
                        <option key={s.code} value={s.code}>{s.code}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={draftSlot.hours}
                      onChange={(e) => setDraftSlot(f => ({ ...f, hours: parseInt(e.target.value) || 1 }))}
                      className="w-12 text-center font-mono border border-slate-200 rounded p-1"
                    />

                    <button
                      type="button"
                      onClick={handleAddSlotToDraft}
                      className="bg-slate-900 text-white rounded p-1 px-3 hover:bg-slate-800 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Day-by-day preview inside wizard */}
              <div className="space-y-2">
                <p className="font-semibold text-slate-500 uppercase tracking-wider font-mono">Draft Classes Matrix</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-1">
                  {Object.keys(dayNames).map((dayIdx) => {
                    const daySlots = replaceForm.slots[dayIdx] || [];
                    return (
                      <div key={dayIdx} className="border border-slate-100 rounded p-2 bg-slate-50/50">
                        <p className="font-bold text-[10px] text-slate-600 border-b pb-1 font-mono">{dayNames[dayIdx]}</p>
                        
                        {daySlots.length === 0 ? (
                          <p className="text-[10px] italic text-slate-400 pt-2">No periods</p>
                        ) : (
                          <div className="space-y-1 pt-1.5">
                            {daySlots.map((s, index) => (
                              <div key={index} className="flex justify-between items-center bg-white border border-slate-100 p-1 rounded-[3px] text-[9.5px]">
                                <span className="font-mono font-semibold">{s.subjectCode} ({s.hours} hr)</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSlotFromDraft(dayIdx, index)}
                                  className="text-red-500 hover:text-red-700 p-0.5"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 font-semibold">
                <button
                  type="button"
                  onClick={() => setIsReplacingTimetable(false)}
                  className="p-2 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveReplacedTimetable}
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded cursor-pointer"
                >
                  Save & Rollout New Timetable
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  </div>
  );
}
