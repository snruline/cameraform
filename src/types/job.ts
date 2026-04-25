/**
 * Types สำหรับ Job = การออกไปส่งคำคู่ความ 1 ครั้ง
 */

export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface JobTarget {
  id: string;
  caseNumber: string; // เลขคดีดำ
  caseNumberRed?: string; // เลขคดีแดง
  defendantName?: string; // ชื่อจำเลย
  address: string;
  location?: GeoLocation;
  note?: string;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  filePath: string;
  location: GeoLocation;
  capturedAt: string;
  formDataId?: string; // ref → FormSubmission
  thumbnailPath?: string;
}

export interface JobRecord {
  id: string;
  formConfigId: string;
  target: JobTarget;
  photos: JobPhoto[];
  status: JobStatus;
  createdAt: string;
  completedAt?: string;
  submittedAt?: string;
}
