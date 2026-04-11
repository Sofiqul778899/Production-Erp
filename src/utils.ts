import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from './firebase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAutoShift(): 'Day' | 'Night' {
  const hour = new Date().getHours();
  // Assuming Day shift is 8 AM to 8 PM, Night shift is 8 PM to 8 AM
  if (hour >= 8 && hour < 20) {
    return 'Day';
  }
  return 'Night';
}

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatDate(dateString: string | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

export function formatTime(timestamp: any): string {
  if (!timestamp) return '-';
  
  let date: Date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return '-';
  }
  
  if (isNaN(date.getTime())) return '-';
  
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatNumber(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '-';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  if (num % 1 === 0) return num.toString();
  return num.toFixed(2);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxClsuQ0x0V7E6pshmJu5PPQf58X5Z11aVcdvvD5ITmSghE7iIS_JMc6h2M5IZtYK1j/exec';

export async function syncToGoogleSheet(data: any) {
  console.log("Syncing to Google Sheets:", data);
  try {
    const response = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script requires no-cors for simple POSTs
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    console.log("Google Sheet sync sent (no-cors mode)");
  } catch (error) {
    console.error('Failed to sync to Google Sheets:', error);
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid || 'not-authenticated',
      email: auth.currentUser?.email || 'no-email',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || '',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    },
    operationType,
    path
  };

  console.error('Firestore Error:', JSON.stringify(errInfo));
  
  // If it's a permission error, throw it so the ErrorBoundary can catch it
  if (errMessage.toLowerCase().includes('permission') || errMessage.toLowerCase().includes('insufficient')) {
    throw new Error(JSON.stringify(errInfo));
  }
}
