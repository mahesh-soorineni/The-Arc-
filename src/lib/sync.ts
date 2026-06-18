/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  UserProfile,
  Subject,
  Timetable,
  AttendanceRecord,
  AcademicCalendarItem,
  SpecialDayOverride
} from '../types';

/**
 * Fetch Student User Profile
 */
export async function getUserProfileFromDb(userId: string): Promise<UserProfile | null> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save Student User Profile
 */
export async function saveUserProfileToDb(userId: string, profile: UserProfile): Promise<void> {
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, 'users', userId), profile);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Fetch Subjects List
 */
export async function getSubjectsFromDb(userId: string): Promise<Subject[]> {
  const path = `users/${userId}/subjects`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'subjects'));
    const items: Subject[] = [];
    snap.forEach((docSnap) => {
      items.push(docSnap.data() as Subject);
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save Subject
 */
export async function saveSubjectToDb(userId: string, subject: Subject): Promise<void> {
  // Use code as document ID
  const path = `users/${userId}/subjects/${subject.code}`;
  try {
    await setDoc(doc(db, 'users', userId, 'subjects', subject.code), subject);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete Subject
 */
export async function deleteSubjectFromDb(userId: string, code: string): Promise<void> {
  const path = `users/${userId}/subjects/${code}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'subjects', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetch Timetables
 */
export async function getTimetablesFromDb(userId: string): Promise<Timetable[]> {
  const path = `users/${userId}/timetable`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'timetable'));
    const items: Timetable[] = [];
    snap.forEach((docSnap) => {
      items.push(docSnap.data() as Timetable);
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save Timetable
 */
export async function saveTimetableToDb(userId: string, timetable: Timetable): Promise<void> {
  const path = `users/${userId}/timetable/${timetable.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'timetable', timetable.id), timetable);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete Timetable
 */
export async function deleteTimetableFromDb(userId: string, id: string): Promise<void> {
  const path = `users/${userId}/timetable/${id}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'timetable', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetch Attendance Records
 */
export async function getRecordsFromDb(userId: string): Promise<AttendanceRecord[]> {
  const path = `users/${userId}/records`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'records'));
    const items: AttendanceRecord[] = [];
    snap.forEach((docSnap) => {
      items.push(docSnap.data() as AttendanceRecord);
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save Attendance Record
 */
export async function saveRecordToDb(userId: string, record: AttendanceRecord): Promise<void> {
  const path = `users/${userId}/records/${record.date}`;
  try {
    await setDoc(doc(db, 'users', userId, 'records', record.date), record);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete Attendance Record
 */
export async function deleteRecordFromDb(userId: string, date: string): Promise<void> {
  const path = `users/${userId}/records/${date}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'records', date));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetch Academic Calendar Items
 */
export async function getCalendarFromDb(userId: string): Promise<AcademicCalendarItem[]> {
  const path = `users/${userId}/calendar`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'calendar'));
    const items: AcademicCalendarItem[] = [];
    snap.forEach((docSnap) => {
      items.push(docSnap.data() as AcademicCalendarItem);
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save Academic Calendar Item
 */
export async function saveCalendarToDb(userId: string, item: AcademicCalendarItem): Promise<void> {
  const path = `users/${userId}/calendar/${item.date}`;
  try {
    await setDoc(doc(db, 'users', userId, 'calendar', item.date), item);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete Academic Calendar Item
 */
export async function deleteCalendarFromDb(userId: string, date: string): Promise<void> {
  const path = `users/${userId}/calendar/${date}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'calendar', date));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetch Special Day Overrides
 */
export async function getOverridesFromDb(userId: string): Promise<SpecialDayOverride[]> {
  const path = `users/${userId}/overrides`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'overrides'));
    const items: SpecialDayOverride[] = [];
    snap.forEach((docSnap) => {
      items.push(docSnap.data() as SpecialDayOverride);
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save Special Day Override
 */
export async function saveOverrideToDb(userId: string, override: SpecialDayOverride): Promise<void> {
  const path = `users/${userId}/overrides/${override.date}`;
  try {
    await setDoc(doc(db, 'users', userId, 'overrides', override.date), override);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete Special Day Override
 */
export async function deleteOverrideFromDb(userId: string, date: string): Promise<void> {
  const path = `users/${userId}/overrides/${date}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'overrides', date));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Bulk seed local data to the Cloud Firestore database on first login
 */
export async function seedLocalDataToDb(
  userId: string,
  profile: UserProfile,
  subjects: Subject[],
  timetables: Timetable[],
  records: AttendanceRecord[],
  calendar: AcademicCalendarItem[],
  overrides: SpecialDayOverride[]
): Promise<void> {
  try {
    // 1. Save profile
    await saveUserProfileToDb(userId, profile);

    // Use Batched Writes or split writes to seed collections
    // Simple direct loop is extremely reliable and handles single document rules checking
    for (const sub of subjects) {
      await saveSubjectToDb(userId, sub);
    }
    for (const tt of timetables) {
      await saveTimetableToDb(userId, tt);
    }
    for (const r of records) {
      await saveRecordToDb(userId, r);
    }
    for (const c of calendar) {
      await saveCalendarToDb(userId, c);
    }
    for (const o of overrides) {
      await saveOverrideToDb(userId, o);
    }
  } catch (error) {
    console.error("Failed to seed initial user data to Cloud Firestore:", error);
    throw error;
  }
}
