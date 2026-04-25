import {JobTarget} from '../types';

/**
 * Stub: คืนรายการเป้าหมายที่ยังค้างส่ง
 * ใน production จะดึงจาก SQLite หรือ backend API
 * ตอนนี้คืนตัวอย่างไว้ให้หน้า Map แสดงผลได้เลย
 */
export async function listPendingTargets(): Promise<JobTarget[]> {
  return [
    {
      id: 'demo-1',
      caseNumber: 'พ.1234/2567',
      caseNumberRed: 'ค.56/2568',
      defendantName: 'นายสมชาย ใจดี',
      address: 'บ้านเลขที่ 99/1 ถ.พระราม 4 คลองเตย กรุงเทพฯ',
      location: {
        latitude: 13.7244,
        longitude: 100.5579,
        timestamp: Date.now(),
      },
    },
    {
      id: 'demo-2',
      caseNumber: 'พ.5678/2567',
      defendantName: 'นางสาวมาลี สุขสันต์',
      address: 'อาคาร ABC ชั้น 12 ถ.สีลม บางรัก กรุงเทพฯ',
      location: {
        latitude: 13.7248,
        longitude: 100.5305,
        timestamp: Date.now(),
      },
    },
  ];
}
