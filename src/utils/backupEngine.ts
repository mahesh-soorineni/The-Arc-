/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeLocalStorage } from './storage';

export interface ArcBackupPayload {
  app: string;            // "The Arc"
  appVersion: string;     // e.g. "3.0"
  backupVersion: string;  // e.g. "1.0"
  generatedAt: string;    // ISO timestamp
  data: {
    localStorage: Record<string, string>;
    indexedDB: Record<string, any>; // Reserved for future use / compliance
  };
  checksum: string;       // DJB2 verification hash
}

/**
 * Calculates a secure, deterministic DJB2 string checksum
 */
export function calculateChecksum(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Packs all local storage items starting with "the_arc_" into a single .arcbackup JSON payload
 */
export function generateBackupPayload(): ArcBackupPayload {
  const localData: Record<string, string> = {};
  
  for (let i = 0; i < safeLocalStorage.length; i++) {
    const key = safeLocalStorage.key(i);
    if (key && key.startsWith('the_arc_')) {
      const val = safeLocalStorage.getItem(key);
      if (val !== null) {
        localData[key] = val;
      }
    }
  }

  const dataBlock = {
    localStorage: localData,
    indexedDB: {}
  };

  const dataStr = JSON.stringify(dataBlock);
  const checksum = calculateChecksum(dataStr);

  return {
    app: "The Arc",
    appVersion: "3.0",
    backupVersion: "1.0",
    generatedAt: new Date().toISOString(),
    data: dataBlock,
    checksum
  };
}

/**
 * Validates a backup string for integrity and structure, supporting legacy PDF-polyglot and direct JSON backups
 */
export function validateBackupPayload(rawText: string): {
  isValid: boolean;
  error?: string;
  payload?: ArcBackupPayload;
  isLegacy?: boolean;
} {
  try {
    let textToParse = rawText.trim();
    let isLegacy = false;

    // 1. Detect Legacy PDF Polyglot Format
    const startMark = "%%THE_ARC_BACKUP_START%%";
    const endMark = "%%THE_ARC_BACKUP_END%%";
    const startIndex = rawText.indexOf(startMark);
    const endIndex = rawText.indexOf(endMark);

    if (startIndex !== -1 && endIndex !== -1) {
      isLegacy = true;
      const encodedData = rawText.substring(startIndex + startMark.length, endIndex).trim();
      try {
        textToParse = decodeURIComponent(escape(atob(encodedData)));
      } catch (err) {
        return { isValid: false, error: "Unable to parse the legacy embedded PDF backup stream block." };
      }
    }

    const parsed = JSON.parse(textToParse);
    
    if (!parsed || typeof parsed !== 'object') {
      return { isValid: false, error: "Backup file is empty or not a valid JSON object." };
    }

    // 2. Handle New Format (.arcbackup)
    if (parsed.app === "The Arc" && parsed.checksum) {
      // Verify integrity checksum
      const dataStr = JSON.stringify(parsed.data);
      const calculated = calculateChecksum(dataStr);

      if (calculated !== parsed.checksum) {
        return { 
          isValid: false, 
          error: "Checksum validation failed. The backup file appears to be corrupted or tampered with." 
        };
      }

      return { isValid: true, payload: parsed, isLegacy: false };
    }

    // 3. Handle Legacy Formats (direct JSON or extracted PDF-polyglot)
    // Legacy formats have a 'data' block or directly hold fields like 'profile', 'subjects', etc.
    const dataObj = parsed.data || parsed;
    if (dataObj.profile || dataObj.subjects || dataObj.records) {
      // Map legacy fields to standard new structure for uniform UI handling
      const mappedLocalStorage: Record<string, string> = {};
      
      const setMappedValue = (key: string, val: any) => {
        if (val === null || val === undefined) return;
        if (typeof val === 'string') {
          mappedLocalStorage[key] = val;
        } else {
          mappedLocalStorage[key] = JSON.stringify(val);
        }
      };

      setMappedValue('the_arc_profile', dataObj.profile);
      setMappedValue('the_arc_subjects', dataObj.subjects);
      setMappedValue('the_arc_timetables', dataObj.timetables);
      setMappedValue('the_arc_records', dataObj.records);
      setMappedValue('the_arc_calendar', dataObj.calendar);
      setMappedValue('the_arc_overrides', dataObj.overrides);
      setMappedValue('the_arc_manual_stats_overrides', dataObj.manualOverrides);
      setMappedValue('the_arc_auto_reminders_enabled', dataObj.autoReminders);
      
      if (dataObj.notificationTime) setMappedValue('the_arc_notification_time', dataObj.notificationTime);
      if (dataObj.notificationDays) setMappedValue('the_arc_notification_days', dataObj.notificationDays);
      if (dataObj.notificationChannel) setMappedValue('the_arc_notification_channel', dataObj.notificationChannel);
      if (dataObj.currentDate) setMappedValue('the_arc_current_date', dataObj.currentDate);

      const mappedPayload: ArcBackupPayload = {
        app: "The Arc",
        appVersion: "2.5 (Migrated)",
        backupVersion: "1.0",
        generatedAt: parsed.generatedAt || new Date().toISOString(),
        data: {
          localStorage: mappedLocalStorage,
          indexedDB: {}
        },
        checksum: "" // No checksum for legacy
      };

      return { isValid: true, payload: mappedPayload, isLegacy: true };
    }

    return { isValid: false, error: "The uploaded file does not contain recognized database schema fields for The Arc." };
  } catch (e: any) {
    return { isValid: false, error: "Could not parse file. Verify it is a valid .arcbackup, .json, or .pdf backup ledger." };
  }
}

/**
 * Restores all database keys from the backup payload into safeLocalStorage
 */
export function restoreBackupToStorage(payload: ArcBackupPayload): void {
  const localData = payload.data.localStorage;
  
  // Clear existing the_arc_ keys to avoid pollution, but preserve any other keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < safeLocalStorage.length; i++) {
    const key = safeLocalStorage.key(i);
    if (key && key.startsWith('the_arc_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => safeLocalStorage.removeItem(key));

  // Write new keys
  Object.entries(localData).forEach(([key, val]) => {
    safeLocalStorage.setItem(key, val);
  });

  // Force local guest session active to avoid authentication lockouts
  safeLocalStorage.setItem('the_arc_is_guest', 'true');
}
