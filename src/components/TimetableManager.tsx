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
  AlertCircle,
  Copy,
  Pencil
} from 'lucide-react';
import {
  Subject,
  Timetable,
  TimetableSlot
} from '../types';
import { formatDateToDDMMYYYY } from '../utils/rulesEngine';
import { parseTextHeuristically } from '../utils/offlineParser';
import Tesseract from 'tesseract.js';

const extractTextFromImage = async (file: File, onProgress?: (pct: number) => void): Promise<string> => {
  const result = await Tesseract.recognize(
    file,
    'eng',
    {
      logger: m => {
        if (m.status === 'recognizing' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      }
    }
  );
  return result.data.text;
};

const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load local PDF parser. Please check your network connection.'));
    document.head.appendChild(script);
  });
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => (item as any).str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText;
};

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
  const [scanEngine, setScanEngine] = useState<'local' | 'gemini'>('local');
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

  // Offline Text Importer States
  const [importMode, setImportMode] = useState<'prompt' | 'scan'>('prompt');
  const [promptCopied, setPromptCopied] = useState(false);
  const [rawText, setRawText] = useState(
    `# Define your Subjects first (FORMAT -> CODE: Full Name)\n` +
    `DBMS: Database Management Systems\n` +
    `OS: Operating Systems\n` +
    `DBMS_LAB: DBMS Lab (isLab: true)\n` +
    `OS_LAB: Operating Systems Lab (isLab: true, labHours: 3)\n\n` +
    `# Specify daily class slots (FORMAT -> Day: CODE, CODE, ...)\n` +
    `Monday: DBMS, OS, DBMS_LAB\n` +
    `Tuesday: OS(1h), DBMS(1h)\n` +
    `Wednesday: DBMS, OS_LAB(3h)\n` +
    `Thursday: DBMS(1h), OS(1h)\n` +
    `Friday: OS(1h), DBMS_LAB(3h)`
  );

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

  // Active Timetable Slot editing states
  const [editingSlotKey, setEditingSlotKey] = useState<{ day: string; index: number } | null>(null);
  const [editingSlotForm, setEditingSlotForm] = useState({
    subjectCode: '',
    hours: 1
  });

  const handleStartEditSlot = (day: string, index: number, slot: TimetableSlot) => {
    setEditingSlotKey({ day, index });
    setEditingSlotForm({
      subjectCode: slot.subjectCode,
      hours: slot.hours
    });
  };

  const handleAddSlotToActiveDay = () => {
    if (!latestTimetable) return;
    const updatedSlots = { ...latestTimetable.slots };
    const daySlots = [...(updatedSlots[activeDayTab] || [])];
    
    // Default new slot with first subject code or NEW_SUBJ
    const defaultCode = subjects[0]?.code || 'NEW_SUB';
    const newSlot: TimetableSlot = {
      subjectCode: defaultCode,
      hours: 1
    };
    
    daySlots.push(newSlot);
    updatedSlots[activeDayTab] = daySlots;
    
    onReplaceTimetable({
      ...latestTimetable,
      slots: updatedSlots
    });
    
    // Automatically set to edit mode
    const newIndex = daySlots.length - 1;
    setEditingSlotKey({ day: activeDayTab, index: newIndex });
    setEditingSlotForm({
      subjectCode: newSlot.subjectCode,
      hours: newSlot.hours
    });
  };

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
    
    // Completely offline local file extraction (No API Key required)
    if (scanEngine === 'local') {
      setAiLoading(true);
      if (type === 'application/pdf') {
        setAiLoadingStep('Reading PDF text structure offline in your browser...');
        extractTextFromPdf(selectedFile)
          .then((text) => {
            setAiLoadingStep('Running local heuristics to identify schedule components...');
            const parsed = parseTextHeuristically(text);
            setImportedData(parsed);
          })
          .catch((err) => {
            console.error('Offline PDF parser failed:', err);
            setAiError(err.message || 'Offline PDF extraction failed.');
          })
          .finally(() => {
            setAiLoading(false);
          });
      } else if (type.includes('image/')) {
        setAiLoadingStep('Initializing offline browser OCR engine (0%)...');
        extractTextFromImage(selectedFile, (progress) => {
          setAiLoadingStep(`Extracting text from image locally in browser (${progress}%)...`);
        })
          .then((text) => {
            setAiLoadingStep('Running local heuristics to identify schedule components...');
            const parsed = parseTextHeuristically(text);
            setImportedData(parsed);
          })
          .catch((err) => {
            console.error('Offline Image OCR parser failed:', err);
            setAiError(err.message || 'Offline image OCR extraction failed.');
          })
          .finally(() => {
            setAiLoading(false);
          });
      }
      return;
    }
    
    // Direct offline browser-side PDF text extraction and parsing
    if (type === 'application/pdf' && importMode === 'text') {
      setAiLoading(true);
      setAiLoadingStep('Reading PDF text structure offline in your browser...');
      extractTextFromPdf(selectedFile)
        .then((text) => {
          setAiLoadingStep('Running local heuristics to identify schedule components...');
          const parsed = parseTextHeuristically(text);
          setImportedData(parsed);
        })
        .catch((err) => {
          console.error('Offline PDF parser failed:', err);
          setAiError(err.message || 'Offline PDF extraction failed.');
        })
        .finally(() => {
          setAiLoading(false);
        });
      return;
    }
    
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
          // Automatic Client-Side Fallback if the server fails/has no API Key and the file is a PDF
          if (type === 'application/pdf') {
            console.log('Gemini API key is invalid or missing. Attempting browser-side offline fallback...');
            setAiLoadingStep('API Key inactive. Extracting timetable text offline...');
            try {
              const text = await extractTextFromPdf(selectedFile);
              const parsed = parseTextHeuristically(text);
              setImportedData(parsed);
              clearInterval(statusTimer);
              setAiLoading(false);
              return;
            } catch (fallbackErr: any) {
              console.error('Browser-side fallback also failed:', fallbackErr);
            }
          }

          let errorText = '';
          try {
            const text = await res.text();
            try {
              const err = JSON.parse(text);
              errorText = err.error || 'The server reported parsing issues.';
            } catch {
              if (res.status === 504) {
                errorText = 'The request timed out (Render free tier limits requests to 30 seconds). Please try uploading a smaller file or a clearer image.';
              } else if (res.status === 502 || res.status === 503) {
                errorText = 'The server is temporarily overloaded or restarting. Please try again in a few seconds.';
              } else {
                errorText = `Server error (${res.status}): Please verify that your GEMINI_API_KEY environment variable is set in your Render settings.`;
              }
            }
          } catch {
            errorText = 'Connection error. Server may be offline.';
          }

          // If it's an image and there's no API key, give them clear advice to copy text or use PDF
          if (type.includes('image/') && (errorText.includes('API key') || errorText.includes('key is invalid') || errorText.includes('unauthorized') || errorText.includes('GEMINI_API_KEY'))) {
            errorText = 'Image analysis requires a valid GEMINI_API_KEY. For a completely offline, free, and API-key-free extraction, please upload a PDF copy of your timetable or use our Offline Quick Text tab to copy-paste your schedule details!';
          }

          throw new Error(errorText);
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

  const handleTextImport = () => {
    setAiError(null);
    setImportedData(null);

    try {
      const lines = rawText.split('\n');
      const subjectsMap: Record<string, Subject> = {};
      const timetableSlots: Record<string, TimetableSlot[]> = {
        '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '0': []
      };

      const dayKeywords: Record<string, string> = {
        'monday': '1', 'mon': '1',
        'tuesday': '2', 'tue': '2',
        'wednesday': '3', 'wed': '3',
        'thursday': '4', 'thu': '4',
        'friday': '5', 'fri': '5',
        'saturday': '6', 'sat': '6',
        'sunday': '0', 'sun': '0'
      };

      // PASS 1: Identify all subject definitions to build the complete subjects map
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) {
          continue;
        }

        if (line.includes(':') || line.includes(' - ')) {
          const parts = line.includes(':') ? line.split(':') : line.split(' - ');
          const left = parts[0].trim().toUpperCase();
          const right = parts[1].trim();

          // If the left side is NOT a day keyword, it's a subject definition line!
          if (!dayKeywords[left.toLowerCase()]) {
            const code = left;
            let name = right;
            let isLab = code.toLowerCase().includes('lab') || name.toLowerCase().includes('lab') || name.toLowerCase().includes('practical') || name.toLowerCase().includes('workshop');
            let labHours = isLab ? 3 : undefined;

            const optionMatch = name.match(/\(([^)]+)\)/);
            if (optionMatch) {
              const optStr = optionMatch[1].toLowerCase();
              if (optStr.includes('lab') || optStr.includes('practical') || optStr.includes('true')) {
                isLab = true;
              }
              const hourMatch = optStr.match(/(\d+)\s*(?:h|hr|hours)/);
              if (hourMatch) {
                labHours = parseInt(hourMatch[1]);
              }
              name = name.replace(/\([^)]+\)/, '').trim();
            }

            subjectsMap[code] = {
              code,
              name,
              isLab,
              labHours
            };
          }
        }
      }

      // PASS 2: Parse day slots and map subject codes to timeslots with accurate hour durations
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) {
          continue;
        }

        if (line.includes(':') || line.includes(' - ')) {
          const parts = line.includes(':') ? line.split(':') : line.split(' - ');
          const left = parts[0].trim().toUpperCase();
          const right = parts[1].trim();

          if (dayKeywords[left.toLowerCase()]) {
            const dayIdx = dayKeywords[left.toLowerCase()];
            const tokens = right.split(/[,;\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
            
            const counts: Record<string, number> = {};
            tokens.forEach(token => {
              let code = token;
              let hours = 1;
              const matches = token.match(/^([A-Z0-9_-]+)(?:\((\d+)(?:H|HR|HRS)?\)|-(\d+)(?:H|HR|HRS)?)?$/i);
              if (matches) {
                code = matches[1].toUpperCase();
                if (matches[2]) hours = parseInt(matches[2]);
                else if (matches[3]) hours = parseInt(matches[3]);
              } else {
                // No explicit hour suffix on this token. Let's resolve default duration from subjectsMap.
                const isLab = subjectsMap[code]?.isLab || code.toLowerCase().includes('lab') || code.toLowerCase().includes('pract');
                if (isLab) {
                  hours = subjectsMap[code]?.labHours || 3;
                }
              }
              counts[code] = (counts[code] || 0) + hours;
            });

            Object.entries(counts).forEach(([subCode, hours]) => {
              let finalHours = hours;
              const isLab = subjectsMap[subCode]?.isLab || subCode.toLowerCase().includes('lab') || subCode.toLowerCase().includes('pract');
              
              if (isLab) {
                // If it is a lab and no token had an explicit hour suffix (e.g. they wrote DW_LAB instead of DW_LAB(2)),
                // then default to the defined lab session hours (typically 3) regardless of duplicate references.
                const hasExplicit = tokens.some(token => {
                  const m = token.match(/^([A-Z0-9_-]+)(?:\((\d+)(?:H|HR|HRS)?\)|-(\d+)(?:H|HR|HRS)?)?$/i);
                  return m && m[1].toUpperCase() === subCode && (m[2] || m[3]);
                });
                if (!hasExplicit) {
                  finalHours = subjectsMap[subCode]?.labHours || 3;
                }
              }

              timetableSlots[dayIdx].push({
                subjectCode: subCode,
                hours: finalHours
              });
              
              if (!subjectsMap[subCode]) {
                const isLabCode = subCode.toLowerCase().includes('lab') || subCode.toLowerCase().includes('pract');
                subjectsMap[subCode] = {
                  code: subCode,
                  name: subCode.replace(/_/g, ' '),
                  isLab: isLabCode,
                  labHours: isLabCode ? 3 : undefined
                };
              }
            });
            continue;
          }
        } else {
          // Lines without colon starting with a day name directly
          const words = line.split(/\s+/);
          const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, '');
          if (dayKeywords[firstWord]) {
            const dayIdx = dayKeywords[firstWord];
            const tokens = words.slice(1).map(w => w.trim().toUpperCase().replace(/[,;]/g, '')).filter(Boolean);
            
            const counts: Record<string, number> = {};
            tokens.forEach(token => {
              let code = token;
              let hours = 1;
              const matches = token.match(/^([A-Z0-9_-]+)(?:\((\d+)\)|-(\d+))?$/i);
              if (matches) {
                code = matches[1].toUpperCase();
                if (matches[2]) hours = parseInt(matches[2]);
                else if (matches[3]) hours = parseInt(matches[3]);
              } else {
                const isLab = subjectsMap[code]?.isLab || code.toLowerCase().includes('lab') || code.toLowerCase().includes('pract');
                if (isLab) {
                  hours = subjectsMap[code]?.labHours || 3;
                }
              }
              counts[code] = (counts[code] || 0) + hours;
            });

            Object.entries(counts).forEach(([subCode, hours]) => {
              let finalHours = hours;
              const isLab = subjectsMap[subCode]?.isLab || subCode.toLowerCase().includes('lab') || subCode.toLowerCase().includes('pract');
              
              if (isLab) {
                const hasExplicit = tokens.some(token => {
                  const m = token.match(/^([A-Z0-9_-]+)(?:\((\d+)\)|-(\d+))?$/i);
                  return m && m[1].toUpperCase() === subCode && (m[2] || m[3]);
                });
                if (!hasExplicit) {
                  finalHours = subjectsMap[subCode]?.labHours || 3;
                }
              }

              timetableSlots[dayIdx].push({
                subjectCode: subCode,
                hours: finalHours
              });
              
              if (!subjectsMap[subCode]) {
                const isLabCode = subCode.toLowerCase().includes('lab') || subCode.toLowerCase().includes('pract');
                subjectsMap[subCode] = {
                  code: subCode,
                  name: subCode.replace(/_/g, ' '),
                  isLab: isLabCode,
                  labHours: isLabCode ? 3 : undefined
                };
              }
            });
          }
        }
      }

      const subjectsList = Object.values(subjectsMap);

      if (subjectsList.length === 0) {
        throw new Error('No valid subjects or schedule days detected. Please check the spelling/syntax of your text.');
      }

      const totalSlots = Object.values(timetableSlots).reduce((acc, curr) => acc + curr.length, 0);
      if (totalSlots === 0) {
        throw new Error('No weekly schedule slots were parsed. Please specify periods for days, e.g. "Monday: DBMS, OS"');
      }

      setImportedData({
        collegeName: 'My University / College',
        degree: 'Degree Program',
        branch: 'General',
        semester: 'Current Semester',
        subjects: subjectsList,
        timetableSlots: timetableSlots
      });
    } catch (err: any) {
      setAiError(err.message || 'Failed to parse raw text format. Please check the spelling/syntax.');
    }
  };

  const gptPromptText = `Act as an expert Academic Schedule Analyzer. I am uploading an image or document containing my university class timetable.

Please analyze the timetable and extract the subjects and weekly slots. 

Follow these rules strictly:
1. Identify all unique subjects/modules. Provide a unique uppercase abbreviation/code for each, and its full name.
2. For lab/practical sessions, append \`(isLab: true)\` or \`(isLab: true, labHours: 3)\` depending on their duration (standard labs are 3 hours, but can be customized).
3. Specify class occurrences for each day (Monday through Saturday/Sunday if they have classes). Format classes as \`SubjectCode(hours)\` (e.g. \`OS(1h)\` or \`OS_LAB(3h)\`) to lock the exact hours/periods of that class.
4. Output the results ONLY as plain text matching the EXACT template syntax shown below. Do NOT write any introduction, pleasantries, explanation, or wrap it in a markdown block. Just output the clean text.

EXACT OUTPUT FORMAT TEMPLATE:
Define your Subjects first (FORMAT -> CODE: Full Name)
DBMS: Database Management Systems
OS: Operating Systems
DBMS_LAB: DBMS Lab (isLab: true)
OS_LAB: Operating Systems Lab (isLab: true, labHours: 3)

# Specify daily class slots (FORMAT -> Day: CODE, CODE, ...)
Monday: DBMS, OS, DBMS_LAB
Tuesday: OS(1h), DBMS(1h)
Wednesday: DBMS, OS_LAB(3h)
Thursday: DBMS(1h), OS(1h)
Friday: OS(1h), DBMS_LAB(3h)`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(gptPromptText);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
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
              <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full tracking-wider uppercase shadow-xs animate-pulse">
                Highly Accurate
              </span>
              <Sparkles className="h-4.5 w-4.5 text-blue-400" />
              <h2 className="font-sans font-bold text-base text-white tracking-tight">TT Extractor</h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Unlock perfect timetable extraction by combining ChatGPT/Claude's vision with our high-fidelity schedule scanner. Just copy the prompt, upload your schedule image there, and paste the output here!
            </p>
          </div>
        </div>

        {/* Import Mode Selector Tab Bar */}
        {!importedData && !aiLoading && (
          <div className="flex space-x-1.5 border-b border-white/5 pb-4 mt-3 relative z-10">
            <button
              type="button"
              onClick={() => setImportMode('prompt')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition cursor-pointer ${
                importMode === 'prompt'
                  ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              1. Copy AI Prompt
            </button>
            <button
              type="button"
              onClick={() => setImportMode('scan')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition cursor-pointer ${
                importMode === 'scan'
                  ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              2. Paste & Scan Timetable
            </button>
          </div>
        )}

        {/* Option 1: Copy AI Prompt View */}
        {!importedData && !aiLoading && importMode === 'prompt' && (
          <div className="mt-5 relative z-10 space-y-4 font-sans text-xs">
            <div className="bg-[#121824] border border-blue-900/20 p-4 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-bold">1</span>
                <span>How it works:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1 leading-relaxed">
                <li>Click the <strong className="text-white">Copy Prompt</strong> button below.</li>
                <li>Go to <a href="https://chatgpt.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline font-semibold inline-flex items-center gap-0.5">ChatGPT <ArrowRight className="h-3 w-3" /></a> (or Claude) and upload your timetable image/PDF.</li>
                <li>Paste the copied prompt and send it to get the structured timetable text output.</li>
                <li>Switch to the <strong className="text-white">"2. Paste & Scan Timetable"</strong> tab here, paste GPT's response, and load it instantly!</li>
              </ol>
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded-xl p-4 space-y-3 relative">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Optimized ChatGPT/Claude Prompt</span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                    promptCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/10'
                  }`}
                >
                  {promptCopied ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Copied Prompt!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Prompt
                    </>
                  )}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto pr-1">
                <pre className="font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap select-all selection:bg-blue-500/30">
                  {gptPromptText}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Option 2: Paste & Scan Timetable View */}
        {!importedData && !aiLoading && importMode === 'scan' && (
          <div className="mt-5 relative z-10 space-y-4 font-sans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">Paste GPT Structured Output</label>
                  <span className="text-[10px] text-slate-500 font-mono">Format: Subject_Code: Full Name</span>
                </div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="w-full h-56 bg-[#07090E] border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none selection:bg-blue-500/30"
                  placeholder="Define your Subjects first..."
                />
              </div>

              <div className="space-y-3 bg-[#0c1018]/60 p-4 border border-slate-800/80 rounded-xl flex flex-col justify-between">
                <div className="space-y-2">
                  <span className="block text-xs font-bold text-white flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4 w-4 text-blue-400" />
                    Syntax & Validation Rules
                  </span>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed list-disc list-inside">
                    <li>Use <code className="text-blue-300 font-mono">CODE: Full Name</code> to define.</li>
                    <li>Use <code className="text-indigo-300 font-mono">isLab: true, labHours: 3</code> inside parentheses for practicals.</li>
                    <li>Specify classes like <code className="text-emerald-300 font-mono">Monday: OS(1h), DBMS(1h)</code>.</li>
                    <li>Days are parsed automatically in real-time.</li>
                  </ul>
                </div>

                <div className="text-[10px] text-slate-500 bg-slate-950/40 p-2.5 rounded border border-white/5 font-mono leading-normal">
                  💡 Hint: Adding hours suffix like <code className="text-white">DBMS(1h)</code> locks the class duration.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setRawText(
                    `# Define your Subjects first (FORMAT -> CODE: Full Name)\n` +
                    `DBMS: Database Management Systems\n` +
                    `OS: Operating Systems\n` +
                    `DBMS_LAB: DBMS Lab (isLab: true)\n` +
                    `OS_LAB: Operating Systems Lab (isLab: true, labHours: 3)\n\n` +
                    `# Specify daily class slots (FORMAT -> Day: CODE, CODE, ...)\n` +
                    `Monday: DBMS, OS, DBMS_LAB\n` +
                    `Tuesday: OS(1h), DBMS(1h)\n` +
                    `Wednesday: DBMS, OS_LAB(3h)\n` +
                    `Thursday: DBMS(1h), OS(1h)\n` +
                    `Friday: OS(1h), DBMS_LAB(3h)`
                  );
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold tracking-tight transition cursor-pointer"
              >
                Reset Template
              </button>
              <button
                type="button"
                onClick={handleTextImport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold tracking-tight transition shadow-lg shadow-blue-500/10 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Scan & Load Timetable
              </button>
            </div>

            {aiError && (
              <div className="mt-4 flex items-start space-x-2.5 p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-lg animate-fadeIn">
                <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-300">Parsing failed</p>
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
              <p className="text-xs font-semibold text-slate-200">
                {scanEngine === 'local' ? 'Extracting Timetable Offline...' : 'Processing Timetable via Gemini Intel...'}
              </p>
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
        <div className="space-y-3 min-h-60">
          <div className="flex items-center justify-between text-[10.5px] text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <span>💡 Double-click a card or click the edit icon to modify subjects or hours.</span>
          </div>

          {(!latestTimetable || !latestTimetable.slots[activeDayTab] || latestTimetable.slots[activeDayTab].length === 0) ? (
            <div className="text-center py-10 space-y-2 text-slate-400">
              <Clock className="h-8 w-8 mx-auto" />
              <p className="text-xs italic">No scheduled class slots recorded for {dayNames[activeDayTab]}.</p>
              <p className="text-[10px]">Mark as "Holiday" or adjust timetable properties.</p>
              
              {latestTimetable && (
                <div className="pt-2">
                  <button
                    onClick={handleAddSlotToActiveDay}
                    className="inline-flex items-center space-x-1 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs transition cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Create First Slot</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {latestTimetable.slots[activeDayTab].map((slot, i) => {
                  const sObj = subjects.find(s => s.code === slot.subjectCode);
                  
                  if (editingSlotKey && editingSlotKey.day === activeDayTab && editingSlotKey.index === i) {
                    return (
                      <div key={i} className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/15 shadow-inner space-y-2.5 col-span-1 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-mono font-bold text-blue-600">Editing Slot #{i + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updatedSlots = { ...latestTimetable.slots };
                              const daySlots = [...(updatedSlots[activeDayTab] || [])];
                              daySlots.splice(i, 1);
                              updatedSlots[activeDayTab] = daySlots;
                              onReplaceTimetable({
                                ...latestTimetable,
                                slots: updatedSlots
                              });
                              setEditingSlotKey(null);
                            }}
                            className="text-[10px] font-semibold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                            title="Remove slot"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete Slot</span>
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[9px] uppercase font-mono font-bold text-slate-400">Subject Code</label>
                            <input
                              type="text"
                              list={`subj-opts-${i}`}
                              value={editingSlotForm.subjectCode}
                              onChange={(e) => setEditingSlotForm(prev => ({ ...prev, subjectCode: e.target.value.toUpperCase() }))}
                              className="w-full text-xs font-mono border border-slate-300 rounded p-1.5 bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800"
                              placeholder="e.g. DBMS"
                            />
                            <datalist id={`subj-opts-${i}`}>
                              {subjects.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </datalist>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[9px] uppercase font-mono font-bold text-slate-400">Hours Duration</label>
                            <input
                              type="number"
                              min="1"
                              max="8"
                              value={editingSlotForm.hours}
                              onChange={(e) => setEditingSlotForm(prev => ({ ...prev, hours: parseInt(e.target.value) || 1 }))}
                              className="w-full text-xs font-mono border border-slate-300 rounded p-1.5 bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end space-x-1.5 pt-1.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setEditingSlotKey(null)}
                            className="px-2.5 py-1 border border-slate-200 text-slate-500 rounded bg-white hover:bg-slate-50 cursor-pointer text-[10px] font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updatedSlots = { ...latestTimetable.slots };
                              const daySlots = [...(updatedSlots[activeDayTab] || [])];
                              if (daySlots[i]) {
                                daySlots[i] = {
                                  subjectCode: editingSlotForm.subjectCode.trim().toUpperCase(),
                                  hours: Number(editingSlotForm.hours) || 1
                                };
                              }
                              updatedSlots[activeDayTab] = daySlots;
                              onReplaceTimetable({
                                ...latestTimetable,
                                slots: updatedSlots
                              });
                              setEditingSlotKey(null);
                            }}
                            className="px-3.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer text-[10px] font-bold shadow-xs"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={i} 
                      onDoubleClick={() => handleStartEditSlot(activeDayTab, i, slot)}
                      className="flex justify-between items-center p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-blue-200 transition group relative cursor-pointer"
                      title="Double-click to edit slot"
                    >
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

                      <div className="flex items-center space-x-2 text-right">
                        <span className="text-xs font-mono font-bold text-slate-700 bg-white border px-2 py-0.5 rounded">
                          {slot.hours} Hours
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartEditSlot(activeDayTab, i, slot)}
                          className="p-1 text-slate-300 hover:text-blue-600 hover:bg-slate-100 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Edit this slot"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {latestTimetable && (
                <div className="flex justify-center pt-2 border-t border-slate-100">
                  <button
                    onClick={handleAddSlotToActiveDay}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer shadow-xs"
                  >
                    <Plus className="h-4 w-4 text-slate-500" />
                    <span>Add Class Slot to {dayNames[activeDayTab]}</span>
                  </button>
                </div>
              )}
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
