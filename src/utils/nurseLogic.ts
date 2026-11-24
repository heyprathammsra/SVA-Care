export interface StudentRecord {
  student_id: string;
  full_name: string;
  section: string;
  roll_number: string;
  active_status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
}

export type MedicineStatus = 'none' | 'given' | 'not_recorded';
export type VisitShiftPeriod = 'school_hours' | 'night';

export interface InfirmarySettings {
  school_hours_start: string; // HH:mm 24-hour (default "07:30")
  school_hours_end: string; // HH:mm 24-hour (default "15:30")
  updated_at?: string;
}

export const DEFAULT_INFIRMARY_SETTINGS: InfirmarySettings = {
  school_hours_start: '07:30',
  school_hours_end: '15:30',
};

export interface MedicineInventoryRecord {
  medicine_id: string;
  name: string;
  category: string;
  form_strength: string;
  unit: string;
  batch_number: string;
  expiry_date: string; // YYYY-MM-DD or ''
  current_stock: number;
  min_stock_alert: number;
  notes?: string;
  updated_at: string;
}

export interface ItemInventoryRecord {
  item_id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  notes?: string;
  updated_at: string;
}

export type StockTransactionReason = 'visit' | 'bill_restock' | 'adjustment' | 'menstrual';

export interface StockTransactionRecord {
  txn_id: string;
  target_type: 'medicine' | 'item';
  target_id: string;
  target_name: string;
  change_qty: number; // positive for additions, negative for deductions
  balance_after?: number;
  reason: StockTransactionReason;
  reference_id?: string;
  notes?: string;
  recorded_by: string;
  created_at: string;
}

export type BillCategory = 'Medicines' | 'Items' | 'Equipment' | 'Camp' | 'Other';
export type BillPaymentStatus = 'Recorded' | 'Paid' | 'Pending' | 'Reimbursed';

export interface BillRecord {
  bill_id: string;
  bill_number: string;
  vendor_name: string;
  bill_date: string; // YYYY-MM-DD
  category: BillCategory;
  total_amount: number;
  payment_status?: BillPaymentStatus;
  notes?: string;
  drive_file_id?: string;
  image_url?: string;
  image_data_url?: string; // Compressed local fallback preview if offline or Drive not yet updated
  recorded_by?: string;
  created_at: string;
}

export interface VisitRecord {
  visit_id: string;
  student_id: string;
  student_name?: string;
  section?: string;
  class?: string;
  roll_number?: string;
  roll_no?: string;
  visit_datetime: string; // YYYY-MM-DDTHH:mm
  shift_period?: VisitShiftPeriod;
  shift_overridden?: boolean;
  reason: string;
  observations: string;
  action_taken: string;
  medicine_status: MedicineStatus;
  medicine_name: string; // Stored in Sheets as "None (No medicine given)", "Not recorded", or actual name
  medicine_id?: string;
  medicine_qty?: number;
  item_id?: string;
  item_name?: string;
  item_qty?: number;
  dosage: string;
  dosage_unit: string;
  route: string;
  administration_time: string;
  notes: string;
  recorded_by: string;
  created_at: string;
}

export interface MeasurementRecord {
  measurement_id: string;
  student_id: string;
  measurement_date: string; // YYYY-MM-DD
  height_cm: number;
  weight_kg: number;
  notes: string;
  updated_at: string;
}

export interface HealthProfileRecord {
  health_record_id: string;
  student_id: string;
  condition_or_note: string;
  status: 'Active' | 'Monitoring' | 'Resolved';
  date_recorded: string; // YYYY-MM-DD
  last_reviewed: string; // YYYY-MM-DD
}

export type DispatchStatus = 'in_transit' | 'arrived' | 'cancelled';

export interface WardenDispatchRecord {
  dispatch_id: string;
  student_id: string;
  student_name: string;
  section: string;
  roll_number: string;
  reason: string;
  notes?: string;
  dispatched_by: string;
  dispatched_at: string; // ISO datetime
  status: DispatchStatus;
  acknowledged_at?: string;
}

export interface AppUserRecord {
  username: string;
  password: string;
  role: 'nurse' | 'admin' | 'warden';
  display_name?: string;
  badge_title?: string;
  active_status?: 'Active' | 'Inactive';
  updated_at?: string;
}

export interface DoctorVisitSession {
  doctor_visit_id: string;
  visit_date: string; // YYYY-MM-DD
  session_time?: string; // e.g., "10:00 AM – 12:30 PM"
  doctor_name: string;
  specialization?: string;
  campus_notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface DoctorVisitCase {
  case_id: string;
  doctor_visit_id: string;
  student_id: string;
  student_name?: string;
  section?: string;
  roll_number?: string;
  complaint: string;
  findings?: string;
  prescription_or_advice?: string;
  follow_up_needed?: boolean;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export type OpdStatus = 'Referred' | 'Returned' | 'Follow-up';

export interface OpdRecord {
  opd_id: string;
  student_id: string;
  student_name?: string;
  section?: string;
  roll_number?: string;
  referral_datetime: string; // YYYY-MM-DDTHH:mm
  hospital_or_clinic: string;
  doctor_name?: string;
  reason: string;
  escort_or_parent?: string;
  diagnosis_and_advice?: string;
  follow_up_date?: string; // YYYY-MM-DD
  status: OpdStatus;
  drive_file_id?: string;
  image_url?: string;
  image_data_url?: string; // Compressed local fallback preview
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface MedicalCampRecord {
  camp_id: string;
  camp_title: string;
  camp_type: string; // e.g. Dental, Eye, General Health, Vaccination, ENT, Skin
  organizer?: string;
  camp_date: string; // YYYY-MM-DD
  target_classes?: string; // e.g. "All Classes" or "Sparkle, Twinkle"
  doctor_team?: string;
  summary?: string;
  recorded_by?: string;
  created_at: string;
}

export interface CampScreeningRecord {
  screening_id: string;
  camp_id: string;
  student_id: string;
  student_name?: string;
  section?: string;
  roll_number?: string;
  findings: string;
  referral_needed?: boolean;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export type AnnualCheckupFitness = 'Fit' | 'Needs Follow-up' | 'Referred';

export interface AnnualCheckupRecord {
  checkup_id: string;
  academic_year: string; // e.g. "2026-27"
  student_id: string;
  student_name?: string;
  section?: string;
  roll_number?: string;
  checkup_date: string; // YYYY-MM-DD
  height_cm?: number;
  weight_kg?: number;
  bmi?: number;
  vision_left?: string;
  vision_right?: string;
  dental_status?: string;
  ent_notes?: string;
  blood_group?: string;
  hemoglobin?: string;
  general_fitness?: AnnualCheckupFitness;
  parent_referral?: boolean;
  doctor_remarks?: string;
  recorded_by?: string;
  created_at: string;
}

export interface MenstrualLogRecord {
  menstrual_id: string;
  student_id: string;
  student_name?: string;
  section?: string;
  roll_number?: string;
  cycle_start_date: string; // YYYY-MM-DD
  cycle_end_date?: string; // YYYY-MM-DD
  flow_or_pain_notes?: string;
  pads_issued?: number;
  item_id?: string;
  item_name?: string;
  irregular_flag?: boolean;
  private_notes?: string;
  recorded_by?: string;
  created_at: string;
}

export type HealthInsightsTimeframe = '7d' | '30d' | 'term' | 'all';

export interface FrequentVisitorInsight {
  student: StudentRecord;
  totalVisits: number;
  visitCount: number;
  doctorCaseCount: number;
  opdCount: number;
  lastVisitDate: string;
  topReasons: Array<{ label: string; count: number }>;
  recentReasons: string[];
}

export interface CommonIssueAffectedStudent {
  student: StudentRecord;
  count: number;
  lastDate: string;
  sampleReasons: string[];
}

export interface CommonIssueInsight {
  issueKey: string;
  label: string;
  totalCases: number;
  uniqueStudentCount: number;
  recent7dCount: number;
  classBreakdown: Array<{ section: string; count: number }>;
  affectedStudents: CommonIssueAffectedStudent[];
}

export interface NurseDatabase {
  students: StudentRecord[];
  visits: VisitRecord[];
  measurements: MeasurementRecord[];
  healthProfiles: HealthProfileRecord[];
  dispatches?: WardenDispatchRecord[];
  users?: AppUserRecord[];
  classes?: string[];
  medicines?: MedicineInventoryRecord[];
  items?: ItemInventoryRecord[];
  stockTransactions?: StockTransactionRecord[];
  bills?: BillRecord[];
  doctorVisits?: DoctorVisitSession[];
  doctorVisitCases?: DoctorVisitCase[];
  opdRecords?: OpdRecord[];
  medicalCamps?: MedicalCampRecord[];
  campScreenings?: CampScreeningRecord[];
  annualCheckups?: AnnualCheckupRecord[];
  menstrualLogs?: MenstrualLogRecord[];
  settings?: InfirmarySettings;
}

export interface VisitFormInput {
  student_id: string;
  visit_datetime: string;
  shift_period?: VisitShiftPeriod;
  shift_overridden?: boolean;
  reason: string;
  observations: string;
  action_taken: string;
  medicine_status: MedicineStatus;
  medicine_name: string;
  medicine_id?: string;
  medicine_qty?: number;
  item_id?: string;
  item_name?: string;
  item_qty?: number;
  dosage: string;
  dosage_unit: string;
  route: string;
  administration_time: string;
  notes: string;
  recorded_by: string;
}

export interface DailyLogEntry {
  visitNumber: number;
  visit: VisitRecord;
  student: StudentRecord;
  visitTimeFormatted: string;
  medicineSummary: string;
}

/**
 * Normalizes a 24-hour HH:mm string, falling back cleanly if invalid.
 */
export function normalizeHHMM(raw: string | undefined | null, fallback: string): string {
  const clean = String(raw || '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatHHMMTo12h(hhmm: string): string {
  const norm = normalizeHHMM(hhmm, '07:30');
  const [hStr, mStr] = norm.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

/**
 * Classifies a visit timestamp into 'school_hours' or 'night' using configurable school timings.
 * Default school hours: 07:30 to 15:30 (inclusive).
 */
export function classifyVisitShift(
  visitDatetime: string | undefined | null,
  settings?: Partial<InfirmarySettings> | null
): VisitShiftPeriod {
  const startStr = normalizeHHMM(settings?.school_hours_start, DEFAULT_INFIRMARY_SETTINGS.school_hours_start);
  const endStr = normalizeHHMM(settings?.school_hours_end, DEFAULT_INFIRMARY_SETTINGS.school_hours_end);
  const dt = String(visitDatetime || '').trim();
  const timeMatch = dt.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  if (!timeMatch) return 'school_hours';

  const visitMins = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (startMins <= endMins) {
    return visitMins >= startMins && visitMins <= endMins ? 'school_hours' : 'night';
  }
  // Overnight range fallback
  return visitMins >= startMins || visitMins <= endMins ? 'school_hours' : 'night';
}

export function resolveVisitShiftPeriod(
  visit: Pick<VisitRecord, 'visit_datetime' | 'shift_period' | 'shift_overridden'>,
  settings?: Partial<InfirmarySettings> | null
): VisitShiftPeriod {
  if (visit.shift_overridden && (visit.shift_period === 'school_hours' || visit.shift_period === 'night')) {
    return visit.shift_period;
  }
  if (visit.shift_period === 'school_hours' || visit.shift_period === 'night') {
    return visit.shift_period;
  }
  return classifyVisitShift(visit.visit_datetime, settings);
}

export function formatShiftPeriodLabel(shift: VisitShiftPeriod, short = false): string {
  return shift === 'night' ? (short ? 'Night' : 'Night / After-Hours') : 'School Hours';
}

export function getStockStatus(currentStock: number, minStockAlert: number): 'out' | 'low' | 'ok' {
  const cur = Number(currentStock) || 0;
  const min = Math.max(0, Number(minStockAlert) || 0);
  if (cur <= 0) return 'out';
  if (min > 0 && cur <= min) return 'low';
  return 'ok';
}

export function getExpiryStatus(
  expiryDate: string | undefined | null,
  referenceDate: string = new Date().toISOString().slice(0, 10)
): 'expired' | 'expiring_soon' | 'valid' | 'none' {
  const clean = String(expiryDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return 'none';
  const refTime = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const expTime = new Date(`${clean}T00:00:00Z`).getTime();
  if (Number.isNaN(refTime) || Number.isNaN(expTime)) return 'none';
  const diffDays = Math.floor((expTime - refTime) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 45) return 'expiring_soon';
  return 'valid';
}

export function calculateBmi(
  heightCm?: number | string | null,
  weightKg?: number | string | null
): number | undefined {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return undefined;
  const hMeters = h / 100;
  return Number((w / (hMeters * hMeters)).toFixed(1));
}

export function getCurrentAcademicYear(referenceDate: string = new Date().toISOString().slice(0, 10)): string {
  const clean = String(referenceDate || '').slice(0, 10);
  const parts = clean.split('-');
  const year = parseInt(parts[0] || '', 10) || new Date().getFullYear();
  const month = parseInt(parts[1] || '', 10) || new Date().getMonth() + 1;
  // Indian academic session runs April -> March
  const startYear = month >= 4 ? year : year - 1;
  const endTwoDigit = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endTwoDigit}`;
}

/**
 * Generates a permanent internal ID (never using spreadsheet row numbers).
 */
export function generatePermanentId(
  prefix:
    | 'STU'
    | 'VIS'
    | 'MSR'
    | 'HPR'
    | 'DSP'
    | 'MED'
    | 'ITM'
    | 'TXN'
    | 'BIL'
    | 'DOC'
    | 'DC'
    | 'OPD'
    | 'CMP'
    | 'SCR'
    | 'CHK'
    | 'MNS',
  existingIds: string[],
  year: number = 2026
): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let maxSeq = 0;
  for (const id of existingIds) {
    const match = id.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}-${year}-${nextSeq}`;
}

/**
 * Fast, forgiving student search by full name, section, roll number, or permanent ID.
 */
export function searchStudents(
  students: StudentRecord[],
  query: string,
  sectionFilter: string = 'ALL'
): StudentRecord[] {
  const normalizedFilter = sectionFilter.trim();
  const activePool = students.filter((s) =>
    normalizedFilter === 'ALL' || !normalizedFilter
      ? true
      : s.section.toLowerCase() === normalizedFilter.toLowerCase()
  );

  const SECTION_ORDER: Record<string, number> = {
    sparkle: 1,
    twinkle: 2,
    topaz: 3,
    jade: 4,
    garnet: 5,
    emerald: 6,
    ruby: 7,
    diamond: 8,
  };

  const q = query.trim().toLowerCase();
  if (!q) {
    return [...activePool].sort((a, b) => {
      const orderA = SECTION_ORDER[normalizeSectionName(a.section).toLowerCase()] ?? 99;
      const orderB = SECTION_ORDER[normalizeSectionName(b.section).toLowerCase()] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      const secCmp = a.section.localeCompare(b.section);
      if (secCmp !== 0) return secCmp;
      const rollA = parseInt(a.roll_number, 10);
      const rollB = parseInt(b.roll_number, 10);
      if (!Number.isNaN(rollA) && !Number.isNaN(rollB) && rollA !== rollB) {
        return rollA - rollB;
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }

  const tokens = q.split(/\s+/).filter(Boolean);

  return activePool
    .map((student) => {
      const nameLower = student.full_name.toLowerCase();
      const sectionLower = student.section.toLowerCase();
      const rollLower = student.roll_number.toLowerCase();
      const rollNumeric = String(parseInt(student.roll_number, 10));
      const idLower = student.student_id.toLowerCase();
      const textCombined = `${nameLower} ${sectionLower} ${rollLower} ${rollNumeric} ${idLower}`;

      const matchesAll = tokens.every((tok) => {
        if (/^\d{1,2}$/.test(tok)) {
          const tokNum = String(parseInt(tok, 10));
          return (
            rollLower === tok ||
            rollNumeric === tokNum ||
            rollLower.includes(tok)
          );
        }
        return textCombined.includes(tok);
      });
      if (!matchesAll) return null;

      let score = 0;
      const qNum = /^\d{1,2}$/.test(q) ? String(parseInt(q, 10)) : '';
      if (rollLower === q || (qNum && rollNumeric === qNum)) score += 200;
      else if (rollLower.startsWith(q)) score += 100;
      if (nameLower.startsWith(q)) score += 80;
      if (sectionLower === q) score += 70;
      if (nameLower.includes(q)) score += 40;
      if (sectionLower.includes(q)) score += 30;

      return { student, score };
    })
    .filter((item): item is { student: StudentRecord; score: number } => item !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const rollA = parseInt(a.student.roll_number, 10);
      const rollB = parseInt(b.student.roll_number, 10);
      if (!Number.isNaN(rollA) && !Number.isNaN(rollB) && rollA !== rollB) {
        return rollA - rollB;
      }
      return a.student.full_name.localeCompare(b.student.full_name);
    })
    .map((item) => item.student);
}

/**
 * Formats medication summary so "No medicine given" and "Not recorded" are explicitly distinguished.
 */
export function formatMedicineDisplay(
  visit: Pick<
    VisitRecord,
    'medicine_status' | 'medicine_name' | 'dosage' | 'dosage_unit' | 'route' | 'administration_time'
  >
): string {
  const rawName = (visit.medicine_name || '').trim();
  const rawLower = rawName.toLowerCase();

  if (
    visit.medicine_status === 'none' ||
    rawLower === 'none (no medicine given)' ||
    rawLower === 'no medicine given' ||
    rawLower === 'none'
  ) {
    return 'No medicine given';
  }
  if (visit.medicine_status === 'not_recorded' || rawLower === 'not recorded') {
    return 'Not recorded';
  }
  if (!visit.medicine_status && !rawName) {
    return 'No medicine given';
  }
  const baseName = rawName || 'Medicine given';
  const cleanDose = normalizeDosageString(visit.dosage);
  const dosePart = cleanDose
    ? `${cleanDose}${(visit.dosage_unit || '').trim() ? ' ' + visit.dosage_unit.trim() : ''}`
    : '';
  const routePart = (visit.route || '').trim() ? `(${visit.route.trim()})` : '';
  const timePart = (visit.administration_time || '').trim()
    ? `at ${normalizeTimeOnlyString(visit.administration_time)}`
    : '';

  return [baseName, dosePart, routePart, timePart].filter(Boolean).join(' ');
}

/**
 * Validates visit form input before saving.
 */
export function validateVisitInput(input: VisitFormInput): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!input.student_id || !input.student_id.trim()) {
    errors.student_id = 'Please select a student.';
  }
  if (!input.visit_datetime || !input.visit_datetime.trim()) {
    errors.visit_datetime = 'Visit date and time are required.';
  }
  if (!input.reason || !input.reason.trim()) {
    errors.reason = 'Reason for visit or health concern is required.';
  }
  if (!input.action_taken || !input.action_taken.trim()) {
    errors.action_taken = 'Care provided or action taken is required.';
  }
  if (input.medicine_status === 'given' && !input.medicine_name.trim()) {
    errors.medicine_name = 'Please enter the medication name, or select "None Given".';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Detects accidental duplicate visit submissions within a short window (default 90 seconds)
 * for the same student, same reason, and same action taken.
 */
export function isDuplicateVisitSubmission(
  existingVisits: VisitRecord[],
  candidate: VisitFormInput,
  nowIso: string = new Date().toISOString(),
  windowSeconds: number = 90
): boolean {
  const nowMs = new Date(nowIso).getTime();
  return existingVisits.some((v) => {
    if (v.student_id !== candidate.student_id) return false;
    if (v.reason.trim().toLowerCase() !== candidate.reason.trim().toLowerCase()) return false;
    if (v.action_taken.trim().toLowerCase() !== candidate.action_taken.trim().toLowerCase())
      return false;
    if (v.visit_datetime === candidate.visit_datetime) {
      const createdMs = new Date(v.created_at).getTime();
      if (!Number.isNaN(nowMs) && !Number.isNaN(createdMs)) {
        return Math.abs(nowMs - createdMs) <= windowSeconds * 1000;
      }
      return true;
    }
    return false;
  });
}

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Normalizes datetime strings, including Google Sheets Date.toString() outputs
 * like "Sun Oct 18 2026 08:45:00 GMT+0530 (...)" into "YYYY-MM-DDTHH:mm".
 */
export function normalizeDatetimeString(raw: string, fallback: string = ''): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return fallback;

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}T${isoMatch[2]}`;
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}T09:00`;
  }

  const gsMatch = trimmed.match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2})/
  );
  if (gsMatch) {
    const month = MONTH_MAP[gsMatch[1].toLowerCase()];
    if (month) {
      const day = gsMatch[2].padStart(2, '0');
      const year = gsMatch[3];
      return `${year}-${month}-${day}T${gsMatch[4]}:${gsMatch[5]}`;
    }
  }

  return trimmed;
}

/**
 * Normalizes date-only strings, including Google Sheets Date.toString() outputs
 * like "Mon Oct 05 2026 00:00:00 GMT+0530 (...)" into "YYYY-MM-DD".
 */
export function normalizeDateOnlyString(raw: string, fallback: string = ''): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return fallback;

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const gsMatch = trimmed.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if (gsMatch) {
    const month = MONTH_MAP[gsMatch[1].toLowerCase()];
    if (month) {
      const day = gsMatch[2].padStart(2, '0');
      const year = gsMatch[3];
      return `${year}-${month}-${day}`;
    }
  }

  return trimmed;
}

/**
 * Normalizes time-only strings, including Google Sheets 1899 epoch Date.toString() outputs
 * like "Sat Dec 30 1899 09:40:00 GMT+0521 (...)" into "09:40 AM".
 */
export function normalizeTimeOnlyString(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  const gsMatch = trimmed.match(
    /^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4}\s+(\d{2}):(\d{2})/
  );
  if (gsMatch) {
    const h = parseInt(gsMatch[1], 10);
    const mStr = gsMatch[2];
    if (!Number.isNaN(h)) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
    }
  }

  return trimmed;
}

/**
 * Detects undecryptable legacy AES placeholder strings or raw ciphertext prefixes.
 */
export function isUnreadableEncryptedPlaceholder(raw: unknown): boolean {
  const clean = String(raw || '').trim();
  if (!clean) return false;
  return /^(?:\[encrypted\s+(?:record|data)\b|enc:v\d+:)/i.test(clean);
}

/**
 * Detects an orphaned legacy visit whose primary reason was permanently lost due to an old
 * ephemeral container key and carries no readable clinical observations, medicine, or notes.
 */
export function isOrphanedEncryptedVisit(visit: Partial<VisitRecord>): boolean {
  if (!isUnreadableEncryptedPlaceholder(visit.reason)) return false;
  const obs = String(visit.observations || '').trim();
  const notes = String(visit.notes || '').trim();
  const med = String(visit.medicine_name || '').trim().toLowerCase();
  const hasReadableObs = Boolean(obs) && !isUnreadableEncryptedPlaceholder(obs);
  const hasReadableNotes = Boolean(notes) && !isUnreadableEncryptedPlaceholder(notes);
  const hasGivenMed =
    visit.medicine_status === 'given' &&
    Boolean(med) &&
    med !== 'none (no medicine given)' &&
    med !== 'no medicine given' &&
    med !== 'none' &&
    !isUnreadableEncryptedPlaceholder(med);
  return !hasReadableObs && !hasReadableNotes && !hasGivenMed;
}

function extractCorruptedSheetMonthDay(trimmed: string): { month: number; day: number } | null {
  const gsMatch = trimmed.match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+\d{4}\s+00:00:00\s+GMT/i
  );
  if (gsMatch) {
    const mStr = MONTH_MAP[gsMatch[1].toLowerCase()];
    if (mStr) {
      return { month: parseInt(mStr, 10), day: parseInt(gsMatch[2], 10) };
    }
  }
  const isoMatch = trimmed.match(/^\d{4}-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z?$/);
  if (isoMatch) {
    return { month: parseInt(isoMatch[1], 10), day: parseInt(isoMatch[2], 10) };
  }
  return null;
}

/**
 * Recovers dosage strings that Google Sheets accidentally auto-parsed into Date objects
 * (e.g. "1/2" -> "Sun Feb 01 2026 00:00:00 GMT+0530", "1/5" -> "Fri May 01 2026 ...").
 * Also strips leading plain-text escape apostrophes.
 */
export function normalizeDosageString(raw: unknown): string {
  const trimmed = String(raw ?? '').trim().replace(/^'+/, '').trim();
  if (!trimmed) return '';

  const md = extractCorruptedSheetMonthDay(trimmed);
  if (md) {
    const { month, day } = md;
    if ((month === 1 && day === 2) || (month === 2 && day === 1)) return '1/2';
    if ((month === 1 && day === 4) || (month === 4 && day === 1)) return '1/4';
    if ((month === 3 && day === 4) || (month === 4 && day === 3)) return '3/4';
    if ((month === 1 && day === 3) || (month === 3 && day === 1)) return '1/3';
    if ((month === 2 && day === 3) || (month === 3 && day === 2)) return '2/3';
    // Fallback to day/month fraction (e.g. India DD/MM: May 01 -> 1/5)
    return `${day}/${month}`;
  }

  return trimmed;
}

/**
 * Recovers slash-formatted clinical strings like vision ("6/6", "6/9") that Google Sheets
 * may auto-convert into a Date object, and strips any leading plain-text apostrophe.
 */
export function normalizeSlashTextString(raw: unknown): string {
  const trimmed = String(raw ?? '').trim().replace(/^'+/, '').trim();
  if (!trimmed) return '';

  const md = extractCorruptedSheetMonthDay(trimmed);
  if (md) {
    return `${md.month}/${md.day}`;
  }

  return trimmed;
}

/**
 * Extracts YYYY-MM-DD from an ISO, datetime-local, or Google Sheets Date string.
 */
export function extractDatePart(datetimeStr: string): string {
  if (!datetimeStr) return '';
  const normalized = normalizeDatetimeString(datetimeStr);
  return normalized.slice(0, 10);
}

/**
 * Formats HH:mm from YYYY-MM-DDTHH:mm (or Google Sheets Date string) into readable 12-hour time.
 */
export function formatTimeFromDatetime(datetimeStr: string): string {
  if (!datetimeStr) return '';
  const normalized = normalizeDatetimeString(datetimeStr);
  if (normalized.length < 16) return datetimeStr;
  const timePart = normalized.slice(11, 16);
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return timePart;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
}

/**
 * Builds the chronological Daily Visit Log for a selected YYYY-MM-DD date.
 */
export function getDailyVisitLog(
  visits: VisitRecord[],
  students: StudentRecord[],
  selectedDate: string
): DailyLogEntry[] {
  const studentMap = new Map<string, StudentRecord>();
  for (const s of students) {
    studentMap.set(s.student_id, s);
  }

  const matching = visits
    .filter((v) => extractDatePart(v.visit_datetime) === selectedDate)
    .sort((a, b) => a.visit_datetime.localeCompare(b.visit_datetime));

  return matching.map((visit, index) => {
    const student: StudentRecord = studentMap.get(visit.student_id) ?? {
      student_id: visit.student_id,
      full_name: visit.student_name || 'Student Record Not Found',
      section: visit.section || visit.class || 'Unassigned',
      roll_number: visit.roll_number || visit.roll_no || '-',
      active_status: 'Active',
      created_at: visit.created_at,
      updated_at: visit.created_at,
    };

    return {
      visitNumber: index + 1,
      visit,
      student,
      visitTimeFormatted: formatTimeFromDatetime(visit.visit_datetime),
      medicineSummary: formatMedicineDisplay(visit),
    };
  });
}

/**
 * Retrieves a student's complete visit history, newest first, optionally filtered by date range.
 */
export function getStudentVisitHistory(
  visits: VisitRecord[],
  studentId: string,
  startDateOrRange?: string | { startDate?: string; endDate?: string },
  endDateArg?: string
): VisitRecord[] {
  const startDate =
    typeof startDateOrRange === 'object' && startDateOrRange !== null
      ? startDateOrRange.startDate
      : startDateOrRange;
  const endDate =
    typeof startDateOrRange === 'object' && startDateOrRange !== null
      ? startDateOrRange.endDate
      : endDateArg;

  return visits
    .filter((v) => {
      if (v.student_id !== studentId) return false;
      const d = extractDatePart(v.visit_datetime);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    })
    .sort((a, b) => {
      const dtCmp = b.visit_datetime.localeCompare(a.visit_datetime);
      if (dtCmp !== 0) return dtCmp;
      return b.created_at.localeCompare(a.created_at);
    });
}

/**
 * Retrieves a student's height & weight history sorted newest first without overwriting old measurements.
 */
export function getStudentMeasurements(
  measurements: MeasurementRecord[],
  studentId: string
): MeasurementRecord[] {
  return measurements
    .filter((m) => m.student_id === studentId)
    .sort((a, b) => {
      const dateCmp = b.measurement_date.localeCompare(a.measurement_date);
      if (dateCmp !== 0) return dateCmp;
      return b.updated_at.localeCompare(a.updated_at);
    });
}

/**
 * Parses CSV or TSV student rows pasted from Excel/Google Sheets into normalized database records.
 * Supports both:
 * 1) Class teacher lists ("6 SPARKLE • CLASS TEACHER LIST" + "Roll No.,Student Name")
 * 2) Standard multi-column sheets ("Full Name,Section,Roll Number,Height_cm,Weight_kg,Health_Note")
 */
export function parseStudentImportText(
  rawText: string,
  existingStudents: StudentRecord[],
  existingMeasurements: MeasurementRecord[] = [],
  existingProfiles: HealthProfileRecord[] = [],
  todayDate: string = '2026-10-17',
  defaultSection: string = 'Sparkle'
): {
  newStudents: StudentRecord[];
  newMeasurements: MeasurementRecord[];
  newHealthProfiles: HealthProfileRecord[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { newStudents: [], newMeasurements: [], newHealthProfiles: [] };
  }

  const newStudents: StudentRecord[] = [];
  const newMeasurements: MeasurementRecord[] = [];
  const newHealthProfiles: HealthProfileRecord[] = [];

  const allStudentIds = existingStudents.map((s) => s.student_id);
  const allMeasurementIds = [
    ...existingMeasurements.map((m) => m.measurement_id),
    ...Array.from(PURGED_TEST_MEASUREMENT_IDS),
  ];
  const allProfileIds = [
    ...existingProfiles.map((p) => p.health_record_id),
    ...Array.from(PURGED_TEST_HEALTH_PROFILE_IDS),
  ];

  let detectedSection = normalizeSectionName(defaultSection);
  let rollFirstMode = false;

  for (const line of lines) {
    const cleanLine = line.replace(/,+$/g, '').trim();
    if (!cleanLine) continue;

    // Ignore footer notes
    if (cleanLine.toLowerCase().startsWith('note:')) continue;

    // Detect section banner line like "SPARKLE • CLASS TEACHER LIST" or "6 SPARKLE • CLASS TEACHER LIST"
    if (cleanLine.includes('•') || cleanLine.toLowerCase().includes('class teacher list')) {
      const partBeforeBullet = cleanLine.split('•')[0].trim();
      if (partBeforeBullet) {
        detectedSection = normalizeSectionName(partBeforeBullet);
      }
      continue;
    }

    const delimiter = line.includes('\t') ? '\t' : ',';
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));

    // Check if header line
    const firstColLower = (cols[0] || '').toLowerCase();
    const secondColLower = (cols[1] || '').toLowerCase();
    if (
      firstColLower.includes('roll') &&
      (secondColLower.includes('name') || secondColLower.includes('student'))
    ) {
      rollFirstMode = true;
      continue;
    }
    if (
      firstColLower.includes('name') ||
      secondColLower.includes('section') ||
      firstColLower === 'student_id'
    ) {
      rollFirstMode = false;
      continue;
    }

    if (cols.length < 2) continue;

    let fullName = '';
    let section = detectedSection;
    let rollNumber = '';
    let heightCm = NaN;
    let weightKg = NaN;
    let conditionNote = '';

    // Auto-detect if col[0] is a numeric roll number like "01" and col[1] is a name
    const col0IsRoll = /^\d{1,3}$/.test(cols[0]) && /[a-zA-Z]/.test(cols[1]);

    if (rollFirstMode || col0IsRoll) {
      rollNumber = cols[0].padStart(2, '0');
      fullName = cols[1] || '';
      if (cols[2] && /[a-zA-Z]/.test(cols[2])) {
        section = cols[2];
      }
    } else {
      fullName = cols[0] || '';
      section = cols[1] || detectedSection;
      rollNumber = (cols[2] || String(existingStudents.length + newStudents.length + 1)).padStart(
        2,
        '0'
      );
      heightCm = cols[3] ? parseFloat(cols[3]) : NaN;
      weightKg = cols[4] ? parseFloat(cols[4]) : NaN;
      conditionNote = cols[5] || '';
    }

    section = normalizeSectionName(section);
    if (!fullName) continue;

    const alreadyExists = [...existingStudents, ...newStudents].some(
      (s) =>
        s.full_name.toLowerCase() === fullName.toLowerCase() &&
        normalizeSectionName(s.section).toLowerCase() === section.toLowerCase() &&
        s.roll_number.toLowerCase() === rollNumber.toLowerCase()
    );
    if (alreadyExists) continue;

    const studentId = generatePermanentId('STU', allStudentIds);
    allStudentIds.push(studentId);

    const nowIso = `${todayDate}T09:00:00.000Z`;
    newStudents.push({
      student_id: studentId,
      full_name: fullName,
      section,
      roll_number: rollNumber,
      active_status: 'Active',
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (!Number.isNaN(heightCm) && !Number.isNaN(weightKg) && heightCm > 0 && weightKg > 0) {
      const mId = generatePermanentId('MSR', allMeasurementIds);
      allMeasurementIds.push(mId);
      newMeasurements.push({
        measurement_id: mId,
        student_id: studentId,
        measurement_date: todayDate,
        height_cm: heightCm,
        weight_kg: weightKg,
        notes: 'Initial health check record',
        updated_at: nowIso,
      });
    }

    if (
      conditionNote &&
      conditionNote.toLowerCase() !== 'none' &&
      conditionNote.toLowerCase() !== 'nil'
    ) {
      const hId = generatePermanentId('HPR', allProfileIds);
      allProfileIds.push(hId);
      newHealthProfiles.push({
        health_record_id: hId,
        student_id: studentId,
        condition_or_note: conditionNote,
        status: 'Active',
        date_recorded: todayDate,
        last_reviewed: todayDate,
      });
    }
  }

  return { newStudents, newMeasurements, newHealthProfiles };
}

export const PURGED_TEST_VISIT_IDS = new Set<string>([
  'VIS-2026-0001',
  'VIS-2026-0002',
  'VIS-2026-0003',
  'VIS-2026-0004',
  'VIS-2026-0005',
  'VIS-2026-0006',
  'VIS-2026-0007',
  'VIS-2026-0008',
  'VIS-2026-0009',
  'VIS-2026-0010',
  'VIS-2026-0011',
  'VIS-2026-0012',
  'VIS-2026-0013',
  'VIS-2026-0014',
  'VIS-2026-0015',
  'VIS-2026-0016',
  'VIS-2026-0017',
  'VIS-2026-0018',
  'VIS-2026-0019',
]);

export const PURGED_TEST_MEASUREMENT_IDS = new Set<string>([
  'MSR-2026-0001',
  'MSR-2026-0002',
  'MSR-2026-0003',
  'MSR-2026-0004',
  'MSR-2026-0005',
  'MSR-2026-0006',
]);

export const PURGED_TEST_HEALTH_PROFILE_IDS = new Set<string>([
  'HPR-2026-0001',
  'HPR-2026-0002',
  'HPR-2026-0003',
]);

const KNOWN_SCHOOL_SECTIONS = [
  'sparkle',
  'twinkle',
  'topaz',
  'jade',
  'garnet',
  'emerald',
  'ruby',
  'diamond',
];

/**
 * Normalizes section names (e.g. "sparkle" -> "Sparkle", "6 Sparkle" -> "Sparkle", "6 DIAMOND" -> "Diamond").
 */
export function normalizeSectionName(rawSection: string): string {
  const trimmed = (rawSection || '').trim();
  if (!trimmed) return 'Sparkle';
  // Strip optional leading "class ", "grade ", or "6 " / "6-"
  const stripped = trimmed.replace(/^(?:(?:class|grade|std)\s*)?(?:\d+\s*[-–]?\s*)?/i, '').trim();
  const lower = stripped.toLowerCase();
  if (KNOWN_SCHOOL_SECTIONS.includes(lower)) {
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }
  return stripped || trimmed;
}

/**
 * Sanitizes an admin-entered class section name so grade numbers/prefixes are never used.
 * Returns empty string if no valid section name remains.
 */
export function sanitizeClassSectionName(rawSection: string): string {
  const trimmed = (rawSection || '').trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed
    .replace(/^(?:(?:class|grade|std|standard)\s*)?(?:\d+\s*[-–]?\s*)?/i, '')
    .replace(/\b(?:grade|class|std|standard)\s*\d+\b/gi, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutPrefix) return '';
  const lower = withoutPrefix.toLowerCase();
  if (KNOWN_SCHOOL_SECTIONS.includes(lower)) {
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }
  return withoutPrefix
    .split(' ')
    .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : ''))
    .join(' ');
}

/**
 * Returns deduplicated list of all class section names (no grade numbers), preserving canonical order.
 */
export function getAllClassSections(
  students: StudentRecord[],
  explicitClasses?: string[]
): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];

  const addName = (raw: string) => {
    const clean = normalizeSectionName(raw);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      collected.push(clean);
    }
  };

  if (Array.isArray(explicitClasses)) {
    explicitClasses.forEach(addName);
  }
  students.forEach((s) => {
    if (s.section) addName(s.section);
  });

  if (collected.length === 0) {
    KNOWN_SCHOOL_SECTIONS.forEach((sec) =>
      collected.push(`${sec.charAt(0).toUpperCase()}${sec.slice(1)}`)
    );
  }

  return collected.sort((a, b) => {
    const idxA = KNOWN_SCHOOL_SECTIONS.indexOf(a.toLowerCase());
    const idxB = KNOWN_SCHOOL_SECTIONS.indexOf(b.toLowerCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Normalizes and merges raw JSON arrays returned by the Google Apps Script doGet endpoint
 * with the current local database, ensuring:
 * 1) Pasted student names in Google Sheets without student_id get matched or assigned permanent IDs.
 * 2) Raw string visit records derive accurate medicine_status ('none' | 'given' | 'not_recorded').
 * 3) Raw string measurement records convert height_cm and weight_kg to numbers.
 * 4) Any unsynced local records are preserved rather than overwritten, while purged test records are ignored.
 */
export function isPlaceholderSheetPassword(rawPassword: string | undefined | null): boolean {
  const clean = String(rawPassword || '').trim();
  if (!clean) return true;
  if (/^CHANGE_[A-Z0-9_]*PASSWORD$/i.test(clean)) return true;
  if (/^REDACTED$/i.test(clean) || /^\*+$/.test(clean)) return true;
  return false;
}

export function normalizeSheetSyncPayload(
  payload: {
    students?: Array<Partial<StudentRecord> & Record<string, any>>;
    visits?: Array<Partial<VisitRecord> & Record<string, any>>;
    measurements?: Array<Partial<Record<keyof MeasurementRecord, string | number>> & Record<string, any>>;
    healthProfiles?: Array<Partial<HealthProfileRecord> & Record<string, any>>;
    users?: Array<Partial<AppUserRecord> & Record<string, any>>;
    classes?: string[];
    medicines?: Array<Partial<MedicineInventoryRecord> & Record<string, any>>;
    items?: Array<Partial<ItemInventoryRecord> & Record<string, any>>;
    stockTransactions?: Array<Partial<StockTransactionRecord> & Record<string, any>>;
    bills?: Array<Partial<BillRecord> & Record<string, any>>;
    doctorVisits?: Array<Partial<DoctorVisitSession> & Record<string, any>>;
    doctorVisitCases?: Array<Partial<DoctorVisitCase> & Record<string, any>>;
    opdRecords?: Array<Partial<OpdRecord> & Record<string, any>>;
    medicalCamps?: Array<Partial<MedicalCampRecord> & Record<string, any>>;
    campScreenings?: Array<Partial<CampScreeningRecord> & Record<string, any>>;
    annualCheckups?: Array<Partial<AnnualCheckupRecord> & Record<string, any>>;
    menstrualLogs?: Array<Partial<MenstrualLogRecord> & Record<string, any>>;
    settings?: Partial<InfirmarySettings> | Array<{ setting_key?: string; setting_value?: string; key?: string; value?: string }>;
  },
  currentDb: NurseDatabase,
  nowIso: string = new Date().toISOString()
): NurseDatabase {
  // Normalize Settings first so visits can derive shift_period accurately
  let resolvedSettings: InfirmarySettings = {
    school_hours_start: normalizeHHMM(
      currentDb.settings?.school_hours_start,
      DEFAULT_INFIRMARY_SETTINGS.school_hours_start
    ),
    school_hours_end: normalizeHHMM(
      currentDb.settings?.school_hours_end,
      DEFAULT_INFIRMARY_SETTINGS.school_hours_end
    ),
    updated_at: currentDb.settings?.updated_at,
  };
  if (Array.isArray(payload.settings)) {
    for (const row of payload.settings) {
      const k = String(row?.setting_key || row?.key || '').trim().toLowerCase();
      const v = String(row?.setting_value || row?.value || '').trim();
      if (k === 'school_hours_start' && v) {
        resolvedSettings.school_hours_start = normalizeHHMM(v, resolvedSettings.school_hours_start);
      } else if (k === 'school_hours_end' && v) {
        resolvedSettings.school_hours_end = normalizeHHMM(v, resolvedSettings.school_hours_end);
      }
    }
  } else if (payload.settings && typeof payload.settings === 'object') {
    if (payload.settings.school_hours_start) {
      resolvedSettings.school_hours_start = normalizeHHMM(
        payload.settings.school_hours_start,
        resolvedSettings.school_hours_start
      );
    }
    if (payload.settings.school_hours_end) {
      resolvedSettings.school_hours_end = normalizeHHMM(
        payload.settings.school_hours_end,
        resolvedSettings.school_hours_end
      );
    }
  }
  const existingByIdentity = new Map<string, StudentRecord>();
  const existingBySectionRoll = new Map<string, StudentRecord>();
  const existingIds = new Set<string>();

  for (const s of currentDb.students) {
    const rawRoll = String(s.roll_number || '').trim();
    if (/^\d+\.\d+$/.test(rawRoll)) continue;
    const normSec = normalizeSectionName(s.section);
    const normRoll = /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll;
    existingIds.add(s.student_id);
    const idKey = `${s.full_name.trim().toLowerCase()}|${normSec.toLowerCase()}|${normRoll.toLowerCase()}`;
    const slotKey = `${normSec.toLowerCase()}|${normRoll.toLowerCase()}`;
    existingByIdentity.set(idKey, s);
    if (!existingBySectionRoll.has(slotKey)) {
      existingBySectionRoll.set(slotKey, s);
    }
  }

  const rawStudents = Array.isArray(payload.students) ? payload.students : [];
  const normalizedRemoteStudents: StudentRecord[] = [];
  const assignedIds = new Set<string>(existingIds);
  const usedRemoteIds = new Set<string>();
  const seenSectionRolls = new Set<string>();

  rawStudents.forEach((row, idx) => {
    const fullName = String(row?.full_name || '').trim();
    if (!fullName) return;

    const rawRoll = String(row?.roll_number || idx + 1).trim();
    // Ignore accidental spreadsheet autofill decimal roll numbers like "2.8" or "3.02857142857143"
    if (/^\d+\.\d+$/.test(rawRoll)) return;

    const section = normalizeSectionName(String(row?.section || 'Sparkle'));
    const rollNum = /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll;

    const sectionRollKey = `${section.toLowerCase()}|${rollNum.toLowerCase()}`;
    if (seenSectionRolls.has(sectionRollKey)) return;
    seenSectionRolls.add(sectionRollKey);

    const identityKey = `${fullName.toLowerCase()}|${sectionRollKey}`;
    const matchedExact = existingByIdentity.get(identityKey);
    const matchedSlot = existingBySectionRoll.get(sectionRollKey);
    const matchedLocal = matchedExact || matchedSlot;

    let studentId = String(row?.student_id || '').trim();
    if (!studentId || usedRemoteIds.has(studentId)) {
      if (matchedLocal && !usedRemoteIds.has(matchedLocal.student_id)) {
        studentId = matchedLocal.student_id;
      } else {
        studentId = generatePermanentId('STU', Array.from(assignedIds));
      }
    }
    assignedIds.add(studentId);
    usedRemoteIds.add(studentId);

    normalizedRemoteStudents.push({
      student_id: studentId,
      full_name: fullName,
      section,
      roll_number: rollNum,
      active_status: row?.active_status === 'Inactive' ? 'Inactive' : 'Active',
      created_at: String(row?.created_at || '').trim() || matchedLocal?.created_at || nowIso,
      updated_at: String(row?.updated_at || '').trim() || nowIso,
    });
  });

  // If the Google Sheet has a full roster (>= 20 students), treat the Sheet as the authoritative roster
  // so deleted or undone rows in Google Sheets never stay stuck as ghost duplicates.
  // For smaller partial payloads, preserve local students whose (section, roll_number) slot wasn't replaced.
  let finalStudents = currentDb.students.filter(
    (s) => !/^\d+\.\d+$/.test(String(s.roll_number || '').trim())
  );
  if (normalizedRemoteStudents.length >= 20) {
    finalStudents = normalizedRemoteStudents;
  } else if (normalizedRemoteStudents.length > 0) {
    const remoteIds = new Set(normalizedRemoteStudents.map((s) => s.student_id));
    const remoteSlots = new Set(
      normalizedRemoteStudents.map(
        (s) => `${s.section.toLowerCase()}|${s.roll_number.toLowerCase()}`
      )
    );
    const localOnly = finalStudents.filter((s) => {
      const slotKey = `${normalizeSectionName(s.section).toLowerCase()}|${s.roll_number.trim().padStart(2, '0').toLowerCase()}`;
      return !remoteIds.has(s.student_id) && !remoteSlots.has(slotKey);
    });
    finalStudents = [...normalizedRemoteStudents, ...localOnly];
  }

  // Normalize & deduplicate Visits (filtering out purged test visit IDs)
  const rawVisits = Array.isArray(payload.visits) ? payload.visits : [];
  const normalizedRemoteVisits: VisitRecord[] = [];
  const seenRemoteVisitIds = new Set<string>();
  rawVisits.forEach((row) => {
    let studentId = String(row?.student_id || '').trim();
    const rawStuName = String(row?.student_name || row?.full_name || row?.name || '').trim();
    const rawSection = normalizeSectionName(String(row?.section || row?.class || ''));
    const rawRoll = String(row?.roll_no || row?.roll_number || '').trim();
    const stuRoll = /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll;

    // If student_id is omitted (e.g. past visits pasted in Google Sheets), look up by section + roll or name
    if (!studentId && (rawSection || rawStuName)) {
      const match = finalStudents.find((s) => {
        if (rawSection && stuRoll) {
          return (
            normalizeSectionName(s.section).toLowerCase() === rawSection.toLowerCase() &&
            s.roll_number.trim().padStart(2, '0') === stuRoll
          );
        }
        if (rawStuName) {
          return s.full_name.trim().toLowerCase() === rawStuName.toLowerCase();
        }
        return false;
      });
      if (match) {
        studentId = match.student_id;
      }
    }

    let visitId = String(row?.visit_id || '').trim();
    if (!visitId && studentId) {
      visitId = generatePermanentId('VIS', [
        ...seenRemoteVisitIds,
        ...PURGED_TEST_VISIT_IDS,
        ...currentDb.visits.map((v) => v.visit_id),
      ]);
    }

    if (
      !visitId ||
      !studentId ||
      PURGED_TEST_VISIT_IDS.has(visitId) ||
      seenRemoteVisitIds.has(visitId)
    ) {
      return;
    }
    seenRemoteVisitIds.add(visitId);

    const medName = String(row?.medicine_name || '').trim();
    const medNameLower = medName.toLowerCase();
    let medStatus: MedicineStatus = 'none';
    if (
      row?.medicine_status === 'none' ||
      row?.medicine_status === 'given' ||
      row?.medicine_status === 'not_recorded'
    ) {
      medStatus = row.medicine_status;
    } else if (medNameLower === 'not recorded') {
      medStatus = 'not_recorded';
    } else if (
      !medName ||
      medNameLower === 'none (no medicine given)' ||
      medNameLower === 'no medicine given' ||
      medNameLower === 'none'
    ) {
      medStatus = 'none';
    } else {
      medStatus = 'given';
    }

    const matchedStudent = finalStudents.find((s) => s.student_id === studentId);
    const stuName = String(
      row?.student_name || row?.full_name || row?.name || matchedStudent?.full_name || ''
    ).trim();
    const stuSection = normalizeSectionName(
      String(row?.section || row?.class || matchedStudent?.section || '')
    );
    const resolvedRoll = stuRoll || (matchedStudent?.roll_number ? matchedStudent.roll_number.padStart(2, '0') : '');

    const normalizedVisitDt = normalizeDatetimeString(
      String(row?.visit_datetime || ''),
      nowIso.slice(0, 16)
    );
    const rawShift = String(row?.shift_period || '').trim().toLowerCase();
    const rawShiftOverridden =
      row?.shift_overridden === true ||
      String(row?.shift_overridden || '').trim().toLowerCase() === 'true';
    const shiftPeriod: VisitShiftPeriod =
      rawShift === 'night' || rawShift === 'school_hours'
        ? rawShift
        : classifyVisitShift(normalizedVisitDt, resolvedSettings);

    const medQtyNum = Number(row?.medicine_qty);
    const itemQtyNum = Number(row?.item_qty);

    const cleanReason = String(row?.reason || '').trim();
    const cleanObs = String(row?.observations || '').trim();
    const cleanAction = String(row?.action_taken || '').trim();
    const cleanNotes = String(row?.notes || '').trim();

    if (
      isOrphanedEncryptedVisit({
        reason: cleanReason,
        observations: cleanObs,
        action_taken: cleanAction,
        medicine_status: medStatus,
        medicine_name: medName,
        notes: cleanNotes,
      })
    ) {
      return;
    }

    normalizedRemoteVisits.push({
      visit_id: visitId,
      student_id: studentId,
      student_name: stuName,
      section: stuSection,
      class: stuSection,
      roll_number: resolvedRoll,
      roll_no: resolvedRoll,
      visit_datetime: normalizedVisitDt,
      shift_period: shiftPeriod,
      shift_overridden: rawShiftOverridden,
      reason: isUnreadableEncryptedPlaceholder(cleanReason) ? 'Archived entry' : cleanReason,
      observations: isUnreadableEncryptedPlaceholder(cleanObs) ? '' : cleanObs,
      action_taken: isUnreadableEncryptedPlaceholder(cleanAction) ? '' : cleanAction,
      medicine_status: medStatus,
      medicine_name: isUnreadableEncryptedPlaceholder(medName)
        ? ''
        : medName || (medStatus === 'none' ? 'None (No medicine given)' : ''),
      medicine_id: String(row?.medicine_id || '').trim() || undefined,
      medicine_qty: !Number.isNaN(medQtyNum) && medQtyNum > 0 ? medQtyNum : undefined,
      item_id: String(row?.item_id || '').trim() || undefined,
      item_name: String(row?.item_name || '').trim() || undefined,
      item_qty: !Number.isNaN(itemQtyNum) && itemQtyNum > 0 ? itemQtyNum : undefined,
      dosage: isUnreadableEncryptedPlaceholder(row?.dosage) ? '' : normalizeDosageString(row?.dosage),
      dosage_unit: String(row?.dosage_unit || '').trim(),
      route: String(row?.route || '').trim(),
      administration_time: normalizeTimeOnlyString(String(row?.administration_time || '')),
      notes: isUnreadableEncryptedPlaceholder(cleanNotes) ? '' : cleanNotes,
      recorded_by: String(row?.recorded_by || '').trim() || 'Staff In-Charge',
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });

  const seenLocalVisitIds = new Set<string>();
  let finalVisits: VisitRecord[] = currentDb.visits
    .filter((v) => {
      if (
        !v.visit_id ||
        PURGED_TEST_VISIT_IDS.has(v.visit_id) ||
        seenLocalVisitIds.has(v.visit_id) ||
        isOrphanedEncryptedVisit(v)
      ) {
        return false;
      }
      seenLocalVisitIds.add(v.visit_id);
      return true;
    })
    .map((v) => {
      const matched = finalStudents.find((s) => s.student_id === v.student_id);
      const stuName = v.student_name || matched?.full_name || '';
      const stuSec = normalizeSectionName(v.section || v.class || matched?.section || '');
      const rawR = String(v.roll_no || v.roll_number || matched?.roll_number || '').trim();
      const stuR = /^\d+$/.test(rawR) ? rawR.padStart(2, '0') : rawR;
      return {
        ...v,
        student_name: stuName,
        section: stuSec,
        class: stuSec,
        roll_number: stuR,
        roll_no: stuR,
        visit_datetime: normalizeDatetimeString(v.visit_datetime, nowIso.slice(0, 16)),
        dosage: isUnreadableEncryptedPlaceholder(v.dosage) ? '' : normalizeDosageString(v.dosage),
        administration_time: normalizeTimeOnlyString(v.administration_time),
      };
    });
  if (normalizedRemoteVisits.length > 0) {
    const remoteVisitIds = new Set(normalizedRemoteVisits.map((v) => v.visit_id));
    const localUnsyncedVisits = finalVisits.filter((v) => !remoteVisitIds.has(v.visit_id));
    finalVisits = [...localUnsyncedVisits, ...normalizedRemoteVisits];
  }

  // Normalize & deduplicate Measurements (filtering out purged test measurement IDs)
  const rawMeasurements = Array.isArray(payload.measurements) ? payload.measurements : [];
  const normalizedRemoteMeasurements: MeasurementRecord[] = [];
  const seenRemoteMIds = new Set<string>();
  rawMeasurements.forEach((row) => {
    const mId = String(row?.measurement_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    const h = parseFloat(String(row?.height_cm ?? ''));
    const w = parseFloat(String(row?.weight_kg ?? ''));
    if (
      !mId ||
      !stuId ||
      PURGED_TEST_MEASUREMENT_IDS.has(mId) ||
      Number.isNaN(h) ||
      Number.isNaN(w) ||
      seenRemoteMIds.has(mId)
    ) {
      return;
    }
    seenRemoteMIds.add(mId);

    normalizedRemoteMeasurements.push({
      measurement_id: mId,
      student_id: stuId,
      measurement_date: normalizeDateOnlyString(
        String(row?.measurement_date || ''),
        nowIso.slice(0, 10)
      ),
      height_cm: h,
      weight_kg: w,
      notes: String(row?.notes || '').trim(),
      updated_at: String(row?.updated_at || '').trim() || nowIso,
    });
  });

  const seenLocalMIds = new Set<string>();
  let finalMeasurements = currentDb.measurements
    .filter((m) => {
      if (
        !m.measurement_id ||
        PURGED_TEST_MEASUREMENT_IDS.has(m.measurement_id) ||
        seenLocalMIds.has(m.measurement_id)
      ) {
        return false;
      }
      seenLocalMIds.add(m.measurement_id);
      return true;
    })
    .map((m) => ({
      ...m,
      measurement_date: normalizeDateOnlyString(m.measurement_date, nowIso.slice(0, 10)),
    }));
  if (normalizedRemoteMeasurements.length > 0) {
    const remoteMIds = new Set(normalizedRemoteMeasurements.map((m) => m.measurement_id));
    const localOnlyM = finalMeasurements.filter((m) => !remoteMIds.has(m.measurement_id));
    finalMeasurements = [...localOnlyM, ...normalizedRemoteMeasurements];
  }

  // Normalize & deduplicate Health Profiles (filtering out purged test health profile IDs)
  const rawProfiles = Array.isArray(payload.healthProfiles) ? payload.healthProfiles : [];
  const normalizedRemoteProfiles: HealthProfileRecord[] = [];
  const seenRemoteHIds = new Set<string>();
  rawProfiles.forEach((row) => {
    const hId = String(row?.health_record_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    const note = String(row?.condition_or_note || '').trim();
    if (
      !hId ||
      !stuId ||
      !note ||
      PURGED_TEST_HEALTH_PROFILE_IDS.has(hId) ||
      seenRemoteHIds.has(hId)
    ) {
      return;
    }
    seenRemoteHIds.add(hId);

    const rawStatus = String(row?.status || 'Active').trim();
    const status: 'Active' | 'Monitoring' | 'Resolved' =
      rawStatus === 'Monitoring' || rawStatus === 'Resolved' ? rawStatus : 'Active';

    normalizedRemoteProfiles.push({
      health_record_id: hId,
      student_id: stuId,
      condition_or_note: note,
      status,
      date_recorded: normalizeDateOnlyString(
        String(row?.date_recorded || ''),
        nowIso.slice(0, 10)
      ),
      last_reviewed: normalizeDateOnlyString(
        String(row?.last_reviewed || ''),
        nowIso.slice(0, 10)
      ),
    });
  });

  const seenLocalHIds = new Set<string>();
  let finalProfiles = currentDb.healthProfiles
    .filter((h) => {
      if (
        !h.health_record_id ||
        PURGED_TEST_HEALTH_PROFILE_IDS.has(h.health_record_id) ||
        seenLocalHIds.has(h.health_record_id)
      ) {
        return false;
      }
      seenLocalHIds.add(h.health_record_id);
      return true;
    })
    .map((h) => ({
      ...h,
      date_recorded: normalizeDateOnlyString(h.date_recorded, nowIso.slice(0, 10)),
      last_reviewed: normalizeDateOnlyString(h.last_reviewed, nowIso.slice(0, 10)),
    }));
  if (normalizedRemoteProfiles.length > 0) {
    const remoteHIds = new Set(normalizedRemoteProfiles.map((h) => h.health_record_id));
    const localOnlyH = finalProfiles.filter((h) => !remoteHIds.has(h.health_record_id));
    finalProfiles = [...localOnlyH, ...normalizedRemoteProfiles];
  }

  // Normalize & deduplicate Users from Google Sheets (Users tab)
  const rawUsers = Array.isArray(payload.users) ? payload.users : [];
  const normalizedRemoteUsers: AppUserRecord[] = [];
  const seenUsernames = new Set<string>();

  rawUsers.forEach((row: any) => {
    const rawUsername = String(row?.username || '').trim();
    const rawPass = String(row?.password || '').trim();
    if (!rawUsername || isPlaceholderSheetPassword(rawPass)) return;
    const lowerUser = rawUsername.toLowerCase();
    if (seenUsernames.has(lowerUser)) return;
    seenUsernames.add(lowerUser);

    const rawRole = String(row?.role || row?.account_type || row?.type || 'warden').trim().toLowerCase();
    const role: 'nurse' | 'admin' | 'warden' =
      rawRole === 'admin' ? 'admin' : rawRole === 'nurse' ? 'nurse' : 'warden';

    const displayName = String(row?.display_name || row?.full_name || row?.name || '').trim() ||
      (role === 'admin' ? 'Infirmary Administrator' : role === 'nurse' ? 'School Nurse' : `${rawUsername} (Hostel Warden)`);

    const badgeTitle = String(row?.badge_title || row?.title || '').trim() ||
      (role === 'admin' ? 'System Admin' : role === 'nurse' ? 'Infirmary Nurse' : 'Hostel Warden');

    normalizedRemoteUsers.push({
      username: lowerUser,
      password: rawPass,
      role,
      display_name: displayName,
      badge_title: badgeTitle,
      active_status: String(row?.active_status || 'Active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
    });
  });

  const existingValidUsers = (currentDb.users || []).filter(
    (u) => !isPlaceholderSheetPassword(u.password)
  );
  let finalUsers: AppUserRecord[] = existingValidUsers;
  if (normalizedRemoteUsers.length > 0) {
    const remoteUserMap = new Map(
      normalizedRemoteUsers.map((u) => [u.username.toLowerCase(), u])
    );
    const preservedExisting = existingValidUsers.filter(
      (u) => !remoteUserMap.has(u.username.toLowerCase())
    );
    finalUsers = [...normalizedRemoteUsers, ...preservedExisting];
  }
  const mergedClasses = getAllClassSections(finalStudents, [
    ...(Array.isArray(currentDb.classes) ? currentDb.classes : []),
    ...(Array.isArray(payload.classes) ? payload.classes : []),
  ]);

  // Normalize & merge Medicines Inventory
  const rawMedicines = Array.isArray(payload.medicines) ? payload.medicines : [];
  const normalizedRemoteMedicines: MedicineInventoryRecord[] = [];
  const seenRemoteMedIds = new Set<string>();
  rawMedicines.forEach((row) => {
    const id = String(row?.medicine_id || '').trim();
    const name = String(row?.name || '').trim();
    if (!id || !name || seenRemoteMedIds.has(id)) return;
    seenRemoteMedIds.add(id);
    normalizedRemoteMedicines.push({
      medicine_id: id,
      name,
      category: String(row?.category || 'General').trim() || 'General',
      form_strength: String(row?.form_strength || '').trim(),
      unit: String(row?.unit || 'tablets').trim() || 'tablets',
      batch_number: String(row?.batch_number || '').trim(),
      expiry_date: row?.expiry_date ? normalizeDateOnlyString(String(row.expiry_date), '') : '',
      current_stock: Math.max(0, Number(row?.current_stock) || 0),
      min_stock_alert: Math.max(0, Number(row?.min_stock_alert) || 0),
      notes: String(row?.notes || '').trim() || undefined,
      updated_at: String(row?.updated_at || '').trim() || nowIso,
    });
  });
  let finalMedicines: MedicineInventoryRecord[] = Array.isArray(currentDb.medicines)
    ? currentDb.medicines
    : [];
  if (normalizedRemoteMedicines.length > 0) {
    const remoteMap = new Map(normalizedRemoteMedicines.map((m) => [m.medicine_id, m]));
    const localOnly = finalMedicines.filter((m) => !remoteMap.has(m.medicine_id));
    finalMedicines = [...normalizedRemoteMedicines, ...localOnly];
  }

  // Normalize & merge Items Inventory
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const normalizedRemoteItems: ItemInventoryRecord[] = [];
  const seenRemoteItemIds = new Set<string>();
  rawItems.forEach((row) => {
    const id = String(row?.item_id || '').trim();
    const name = String(row?.name || '').trim();
    if (!id || !name || seenRemoteItemIds.has(id)) return;
    seenRemoteItemIds.add(id);
    normalizedRemoteItems.push({
      item_id: id,
      name,
      category: String(row?.category || 'First Aid').trim() || 'First Aid',
      unit: String(row?.unit || 'pcs').trim() || 'pcs',
      current_stock: Math.max(0, Number(row?.current_stock) || 0),
      min_stock_alert: Math.max(0, Number(row?.min_stock_alert) || 0),
      notes: String(row?.notes || '').trim() || undefined,
      updated_at: String(row?.updated_at || '').trim() || nowIso,
    });
  });
  let finalItems: ItemInventoryRecord[] = Array.isArray(currentDb.items) ? currentDb.items : [];
  if (normalizedRemoteItems.length > 0) {
    const remoteMap = new Map(normalizedRemoteItems.map((it) => [it.item_id, it]));
    const localOnly = finalItems.filter((it) => !remoteMap.has(it.item_id));
    finalItems = [...normalizedRemoteItems, ...localOnly];
  }

  // Normalize & merge Stock Transactions
  const rawTxns = Array.isArray(payload.stockTransactions) ? payload.stockTransactions : [];
  const normalizedRemoteTxns: StockTransactionRecord[] = [];
  const seenRemoteTxnIds = new Set<string>();
  rawTxns.forEach((row) => {
    const id = String(row?.txn_id || '').trim();
    const targetId = String(row?.target_id || '').trim();
    if (!id || !targetId || seenRemoteTxnIds.has(id)) return;
    seenRemoteTxnIds.add(id);
    const rawReason = String(row?.reason || 'adjustment').trim().toLowerCase();
    const reason: StockTransactionReason =
      rawReason === 'visit' || rawReason === 'bill_restock' || rawReason === 'menstrual'
        ? rawReason
        : 'adjustment';
    const balNum = Number(row?.balance_after);
    normalizedRemoteTxns.push({
      txn_id: id,
      target_type: String(row?.target_type || '').toLowerCase() === 'item' ? 'item' : 'medicine',
      target_id: targetId,
      target_name: String(row?.target_name || targetId).trim(),
      change_qty: Number(row?.change_qty) || 0,
      balance_after: !Number.isNaN(balNum) ? balNum : undefined,
      reason,
      reference_id: String(row?.reference_id || '').trim() || undefined,
      notes: String(row?.notes || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || 'Staff').trim(),
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalTxns: StockTransactionRecord[] = Array.isArray(currentDb.stockTransactions)
    ? currentDb.stockTransactions
    : [];
  if (normalizedRemoteTxns.length > 0) {
    const remoteIds = new Set(normalizedRemoteTxns.map((t) => t.txn_id));
    const localOnly = finalTxns.filter((t) => !remoteIds.has(t.txn_id));
    finalTxns = [...localOnly, ...normalizedRemoteTxns];
  }

  // Normalize & merge Bills (preserving local fallback image_data_url when remote has none)
  const rawBills = Array.isArray(payload.bills) ? payload.bills : [];
  const localBillById = new Map((currentDb.bills || []).map((b) => [b.bill_id, b]));
  const normalizedRemoteBills: BillRecord[] = [];
  const seenRemoteBillIds = new Set<string>();
  rawBills.forEach((row) => {
    const id = String(row?.bill_id || '').trim();
    const vendor = String(row?.vendor_name || '').trim();
    if (!id || !vendor || seenRemoteBillIds.has(id)) return;
    seenRemoteBillIds.add(id);
    const rawCat = String(row?.category || 'Medicines').trim();
    const category: BillCategory =
      rawCat === 'Items' || rawCat === 'Equipment' || rawCat === 'Camp' || rawCat === 'Other'
        ? rawCat
        : 'Medicines';
    const rawPay = String(row?.payment_status || 'Recorded').trim();
    const paymentStatus: BillPaymentStatus =
      rawPay === 'Paid' || rawPay === 'Pending' || rawPay === 'Reimbursed' ? rawPay : 'Recorded';
    const prevLocal = localBillById.get(id);
    normalizedRemoteBills.push({
      bill_id: id,
      bill_number: String(row?.bill_number || '').trim(),
      vendor_name: vendor,
      bill_date: normalizeDateOnlyString(String(row?.bill_date || ''), nowIso.slice(0, 10)),
      category,
      total_amount: Math.max(0, Number(row?.total_amount) || 0),
      payment_status: paymentStatus,
      notes: String(row?.notes || '').trim() || undefined,
      drive_file_id: String(row?.drive_file_id || '').trim() || prevLocal?.drive_file_id || undefined,
      image_url:
        (/^https:\/\/[^\s]+$/i.test(String(row?.image_url || '').trim())
          ? String(row?.image_url || '').trim()
          : undefined) ||
        prevLocal?.image_url ||
        undefined,
      image_data_url: prevLocal?.image_data_url,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalBills: BillRecord[] = Array.isArray(currentDb.bills) ? currentDb.bills : [];
  if (normalizedRemoteBills.length > 0) {
    const remoteIds = new Set(normalizedRemoteBills.map((b) => b.bill_id));
    const localOnly = finalBills.filter((b) => !remoteIds.has(b.bill_id));
    finalBills = [...localOnly, ...normalizedRemoteBills];
  }

  const studentByIdMap = new Map(finalStudents.map((s) => [s.student_id, s]));
  const parseTruthyFlag = (val: unknown): boolean => {
    if (typeof val === 'boolean') return val;
    const s = String(val ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === '1';
  };

  // Normalize & merge Weekly Doctor Visits
  const rawDoctorVisits = Array.isArray(payload.doctorVisits) ? payload.doctorVisits : [];
  const normalizedRemoteDoctorVisits: DoctorVisitSession[] = [];
  const seenRemoteDocVisitIds = new Set<string>();
  rawDoctorVisits.forEach((row) => {
    const id = String(row?.doctor_visit_id || '').trim();
    const docName = String(row?.doctor_name || '').trim();
    if (!id || !docName || seenRemoteDocVisitIds.has(id)) return;
    seenRemoteDocVisitIds.add(id);
    normalizedRemoteDoctorVisits.push({
      doctor_visit_id: id,
      visit_date: normalizeDateOnlyString(String(row?.visit_date || ''), nowIso.slice(0, 10)),
      session_time: String(row?.session_time || '').trim() || undefined,
      doctor_name: docName,
      specialization: String(row?.specialization || '').trim() || undefined,
      campus_notes: String(row?.campus_notes || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalDoctorVisits: DoctorVisitSession[] = Array.isArray(currentDb.doctorVisits)
    ? currentDb.doctorVisits
    : [];
  if (normalizedRemoteDoctorVisits.length > 0) {
    const remoteIds = new Set(normalizedRemoteDoctorVisits.map((d) => d.doctor_visit_id));
    const localOnly = finalDoctorVisits.filter((d) => !remoteIds.has(d.doctor_visit_id));
    finalDoctorVisits = [...localOnly, ...normalizedRemoteDoctorVisits];
  }

  // Normalize & merge Doctor Visit Cases
  const rawDoctorVisitCases = Array.isArray(payload.doctorVisitCases) ? payload.doctorVisitCases : [];
  const normalizedRemoteDocCases: DoctorVisitCase[] = [];
  const seenRemoteDocCaseIds = new Set<string>();
  rawDoctorVisitCases.forEach((row) => {
    const id = String(row?.case_id || '').trim();
    const visitId = String(row?.doctor_visit_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    const complaint = String(row?.complaint || '').trim();
    if (!id || !visitId || !stuId || !complaint || seenRemoteDocCaseIds.has(id)) return;
    seenRemoteDocCaseIds.add(id);
    const stu = studentByIdMap.get(stuId);
    normalizedRemoteDocCases.push({
      case_id: id,
      doctor_visit_id: visitId,
      student_id: stuId,
      student_name: String(row?.student_name || stu?.full_name || '').trim() || undefined,
      section: String(row?.section || row?.class || stu?.section || '').trim() || undefined,
      roll_number: String(row?.roll_number || row?.roll_no || stu?.roll_number || '').trim() || undefined,
      complaint,
      findings: String(row?.findings || '').trim() || undefined,
      prescription_or_advice: String(row?.prescription_or_advice || '').trim() || undefined,
      follow_up_needed: parseTruthyFlag(row?.follow_up_needed),
      notes: String(row?.notes || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalDoctorVisitCases: DoctorVisitCase[] = Array.isArray(currentDb.doctorVisitCases)
    ? currentDb.doctorVisitCases
    : [];
  if (normalizedRemoteDocCases.length > 0) {
    const remoteIds = new Set(normalizedRemoteDocCases.map((c) => c.case_id));
    const localOnly = finalDoctorVisitCases.filter((c) => !remoteIds.has(c.case_id));
    finalDoctorVisitCases = [...localOnly, ...normalizedRemoteDocCases];
  }

  // Normalize & merge External OPD Records (preserving local image_data_url fallback)
  const rawOpd = Array.isArray(payload.opdRecords) ? payload.opdRecords : [];
  const localOpdById = new Map((currentDb.opdRecords || []).map((o) => [o.opd_id, o]));
  const normalizedRemoteOpd: OpdRecord[] = [];
  const seenRemoteOpdIds = new Set<string>();
  rawOpd.forEach((row) => {
    const id = String(row?.opd_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    const hospital = String(row?.hospital_or_clinic || '').trim();
    if (!id || !stuId || !hospital || seenRemoteOpdIds.has(id)) return;
    seenRemoteOpdIds.add(id);
    const stu = studentByIdMap.get(stuId);
    const rawStatus = String(row?.status || 'Referred').trim();
    const status: OpdStatus =
      rawStatus === 'Returned' || rawStatus === 'Follow-up' ? rawStatus : 'Referred';
    const prevLocal = localOpdById.get(id);
    const rawFollowUp = String(row?.follow_up_date || '').trim();
    normalizedRemoteOpd.push({
      opd_id: id,
      student_id: stuId,
      student_name: String(row?.student_name || stu?.full_name || '').trim() || undefined,
      section: String(row?.section || row?.class || stu?.section || '').trim() || undefined,
      roll_number: String(row?.roll_number || row?.roll_no || stu?.roll_number || '').trim() || undefined,
      referral_datetime: normalizeDatetimeString(
        String(row?.referral_datetime || ''),
        nowIso.slice(0, 16)
      ),
      hospital_or_clinic: hospital,
      doctor_name: String(row?.doctor_name || '').trim() || undefined,
      reason: String(row?.reason || '').trim() || 'External consultation',
      escort_or_parent: String(row?.escort_or_parent || '').trim() || undefined,
      diagnosis_and_advice: String(row?.diagnosis_and_advice || '').trim() || undefined,
      follow_up_date: rawFollowUp ? normalizeDateOnlyString(rawFollowUp, '') : undefined,
      status,
      drive_file_id: String(row?.drive_file_id || '').trim() || prevLocal?.drive_file_id || undefined,
      image_url:
        (/^https:\/\/[^\s]+$/i.test(String(row?.image_url || '').trim())
          ? String(row?.image_url || '').trim()
          : undefined) ||
        prevLocal?.image_url ||
        undefined,
      image_data_url: prevLocal?.image_data_url,
      notes: String(row?.notes || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalOpdRecords: OpdRecord[] = Array.isArray(currentDb.opdRecords)
    ? currentDb.opdRecords
    : [];
  if (normalizedRemoteOpd.length > 0) {
    const remoteIds = new Set(normalizedRemoteOpd.map((o) => o.opd_id));
    const localOnly = finalOpdRecords.filter((o) => !remoteIds.has(o.opd_id));
    finalOpdRecords = [...localOnly, ...normalizedRemoteOpd];
  }

  // Normalize & merge Medical Camps
  const rawCamps = Array.isArray(payload.medicalCamps) ? payload.medicalCamps : [];
  const normalizedRemoteCamps: MedicalCampRecord[] = [];
  const seenRemoteCampIds = new Set<string>();
  rawCamps.forEach((row) => {
    const id = String(row?.camp_id || '').trim();
    const title = String(row?.camp_title || '').trim();
    if (!id || !title || seenRemoteCampIds.has(id)) return;
    seenRemoteCampIds.add(id);
    normalizedRemoteCamps.push({
      camp_id: id,
      camp_title: title,
      camp_type: String(row?.camp_type || 'General Health').trim(),
      organizer: String(row?.organizer || '').trim() || undefined,
      camp_date: normalizeDateOnlyString(String(row?.camp_date || ''), nowIso.slice(0, 10)),
      target_classes: String(row?.target_classes || '').trim() || undefined,
      doctor_team: String(row?.doctor_team || '').trim() || undefined,
      summary: String(row?.summary || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalMedicalCamps: MedicalCampRecord[] = Array.isArray(currentDb.medicalCamps)
    ? currentDb.medicalCamps
    : [];
  if (normalizedRemoteCamps.length > 0) {
    const remoteIds = new Set(normalizedRemoteCamps.map((c) => c.camp_id));
    const localOnly = finalMedicalCamps.filter((c) => !remoteIds.has(c.camp_id));
    finalMedicalCamps = [...localOnly, ...normalizedRemoteCamps];
  }

  // Normalize & merge Camp Screenings
  const rawScreenings = Array.isArray(payload.campScreenings) ? payload.campScreenings : [];
  const normalizedRemoteScreenings: CampScreeningRecord[] = [];
  const seenRemoteScreeningIds = new Set<string>();
  rawScreenings.forEach((row) => {
    const id = String(row?.screening_id || '').trim();
    const campId = String(row?.camp_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    const findings = String(row?.findings || '').trim();
    if (!id || !campId || !stuId || !findings || seenRemoteScreeningIds.has(id)) return;
    seenRemoteScreeningIds.add(id);
    const stu = studentByIdMap.get(stuId);
    normalizedRemoteScreenings.push({
      screening_id: id,
      camp_id: campId,
      student_id: stuId,
      student_name: String(row?.student_name || stu?.full_name || '').trim() || undefined,
      section: String(row?.section || row?.class || stu?.section || '').trim() || undefined,
      roll_number: String(row?.roll_number || row?.roll_no || stu?.roll_number || '').trim() || undefined,
      findings,
      referral_needed: parseTruthyFlag(row?.referral_needed),
      notes: String(row?.notes || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalCampScreenings: CampScreeningRecord[] = Array.isArray(currentDb.campScreenings)
    ? currentDb.campScreenings
    : [];
  if (normalizedRemoteScreenings.length > 0) {
    const remoteIds = new Set(normalizedRemoteScreenings.map((s) => s.screening_id));
    const localOnly = finalCampScreenings.filter((s) => !remoteIds.has(s.screening_id));
    finalCampScreenings = [...localOnly, ...normalizedRemoteScreenings];
  }

  // Normalize & merge Annual Health Checkups (Phase 3)
  const rawCheckups = Array.isArray(payload.annualCheckups) ? payload.annualCheckups : [];
  const normalizedRemoteCheckups: AnnualCheckupRecord[] = [];
  const seenRemoteCheckupIds = new Set<string>();
  rawCheckups.forEach((row) => {
    const id = String(row?.checkup_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    if (!id || !stuId || seenRemoteCheckupIds.has(id)) return;
    seenRemoteCheckupIds.add(id);
    const stu = studentByIdMap.get(stuId);
    const hVal = Number(row?.height_cm);
    const wVal = Number(row?.weight_kg);
    const heightCm = Number.isFinite(hVal) && hVal > 0 ? hVal : undefined;
    const weightKg = Number.isFinite(wVal) && wVal > 0 ? wVal : undefined;
    const rawBmi = Number(row?.bmi);
    const bmi =
      Number.isFinite(rawBmi) && rawBmi > 0
        ? Number(rawBmi.toFixed(1))
        : calculateBmi(heightCm, weightKg);
    const rawFitness = String(row?.general_fitness || 'Fit').trim();
    const generalFitness: AnnualCheckupFitness =
      rawFitness === 'Needs Follow-up' || rawFitness === 'Referred' ? rawFitness : 'Fit';
    const checkupDate = normalizeDateOnlyString(String(row?.checkup_date || ''), nowIso.slice(0, 10));
    normalizedRemoteCheckups.push({
      checkup_id: id,
      academic_year: String(row?.academic_year || '').trim() || getCurrentAcademicYear(checkupDate),
      student_id: stuId,
      student_name: String(row?.student_name || stu?.full_name || '').trim() || undefined,
      section: String(row?.section || row?.class || stu?.section || '').trim() || undefined,
      roll_number: String(row?.roll_number || row?.roll_no || stu?.roll_number || '').trim() || undefined,
      checkup_date: checkupDate,
      height_cm: heightCm,
      weight_kg: weightKg,
      bmi,
      vision_left: normalizeSlashTextString(row?.vision_left) || undefined,
      vision_right: normalizeSlashTextString(row?.vision_right) || undefined,
      dental_status: String(row?.dental_status || '').trim() || undefined,
      ent_notes: String(row?.ent_notes || '').trim() || undefined,
      blood_group: String(row?.blood_group || '').trim() || undefined,
      hemoglobin: String(row?.hemoglobin || '').trim() || undefined,
      general_fitness: generalFitness,
      parent_referral: parseTruthyFlag(row?.parent_referral),
      doctor_remarks: String(row?.doctor_remarks || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalAnnualCheckups: AnnualCheckupRecord[] = Array.isArray(currentDb.annualCheckups)
    ? currentDb.annualCheckups
    : [];
  if (normalizedRemoteCheckups.length > 0) {
    const remoteIds = new Set(normalizedRemoteCheckups.map((c) => c.checkup_id));
    const localOnly = finalAnnualCheckups.filter((c) => !remoteIds.has(c.checkup_id));
    finalAnnualCheckups = [...localOnly, ...normalizedRemoteCheckups];
  }

  // Normalize & merge Private Menstrual Log (Phase 3 — Nurse & Admin only)
  const rawMenstrual = Array.isArray(payload.menstrualLogs) ? payload.menstrualLogs : [];
  const normalizedRemoteMenstrual: MenstrualLogRecord[] = [];
  const seenRemoteMenstrualIds = new Set<string>();
  rawMenstrual.forEach((row) => {
    const id = String(row?.menstrual_id || '').trim();
    const stuId = String(row?.student_id || '').trim();
    if (!id || !stuId || seenRemoteMenstrualIds.has(id)) return;
    seenRemoteMenstrualIds.add(id);
    const stu = studentByIdMap.get(stuId);
    const rawEnd = String(row?.cycle_end_date || '').trim();
    const padsNum = Number(row?.pads_issued);
    normalizedRemoteMenstrual.push({
      menstrual_id: id,
      student_id: stuId,
      student_name: String(row?.student_name || stu?.full_name || '').trim() || undefined,
      section: String(row?.section || row?.class || stu?.section || '').trim() || undefined,
      roll_number: String(row?.roll_number || row?.roll_no || stu?.roll_number || '').trim() || undefined,
      cycle_start_date: normalizeDateOnlyString(
        String(row?.cycle_start_date || ''),
        nowIso.slice(0, 10)
      ),
      cycle_end_date: rawEnd ? normalizeDateOnlyString(rawEnd, '') : undefined,
      flow_or_pain_notes: String(row?.flow_or_pain_notes || '').trim() || undefined,
      pads_issued: Number.isFinite(padsNum) && padsNum > 0 ? Math.floor(padsNum) : undefined,
      item_id: String(row?.item_id || '').trim() || undefined,
      item_name: String(row?.item_name || '').trim() || undefined,
      irregular_flag: parseTruthyFlag(row?.irregular_flag),
      private_notes: String(row?.private_notes || '').trim() || undefined,
      recorded_by: String(row?.recorded_by || '').trim() || undefined,
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });
  let finalMenstrualLogs: MenstrualLogRecord[] = Array.isArray(currentDb.menstrualLogs)
    ? currentDb.menstrualLogs
    : [];
  if (normalizedRemoteMenstrual.length > 0) {
    const remoteIds = new Set(normalizedRemoteMenstrual.map((m) => m.menstrual_id));
    const localOnly = finalMenstrualLogs.filter((m) => !remoteIds.has(m.menstrual_id));
    finalMenstrualLogs = [...localOnly, ...normalizedRemoteMenstrual];
  }

  return {
    students: finalStudents,
    visits: finalVisits,
    measurements: finalMeasurements,
    healthProfiles: finalProfiles,
    dispatches: currentDb.dispatches,
    users: finalUsers,
    classes: mergedClasses,
    medicines: finalMedicines,
    items: finalItems,
    stockTransactions: finalTxns,
    bills: finalBills,
    doctorVisits: finalDoctorVisits,
    doctorVisitCases: finalDoctorVisitCases,
    opdRecords: finalOpdRecords,
    medicalCamps: finalMedicalCamps,
    campScreenings: finalCampScreenings,
    annualCheckups: finalAnnualCheckups,
    menstrualLogs: finalMenstrualLogs,
    settings: resolvedSettings,
  };
}

/**
 * Generates RFC 4180 compliant CSV string with UTF-8 BOM for Excel/Google Sheets compatibility
 */
export function generateVisitsCSV(
  entries: DailyLogEntry[],
  settings?: Partial<InfirmarySettings> | null
): string {
  const headers = [
    'Sr No',
    'Visit ID',
    'Date',
    'Time',
    'Shift',
    'Student Name',
    'Roll No',
    'Class',
    'Reason / Health Concern',
    'Observations',
    'Care Provided',
    'Medicine Status',
    'Medicine Name',
    'Dosage',
    'Route',
    'Administration Time',
    'Item Used',
    'Recorded By',
  ];

  const escapeCSV = (val: string | number | undefined | null) => {
    let s = String(val ?? '').trim();
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = entries.map((entry, idx) => {
    const v = entry.visit;
    const stu = entry.student;
    const dt = v.visit_datetime || '';
    const datePart = dt.length >= 10 ? dt.slice(0, 10) : '';
    const timePart = formatTimeFromDatetime(dt);
    const shiftLabel = formatShiftPeriodLabel(resolveVisitShiftPeriod(v, settings));
    const itemUsed = v.item_name
      ? `${v.item_name}${v.item_qty ? ` (x${v.item_qty})` : ''}`
      : '';

    return [
      idx + 1,
      v.visit_id,
      datePart,
      timePart,
      shiftLabel,
      stu.full_name,
      stu.roll_number,
      stu.section,
      v.reason,
      v.observations,
      v.action_taken,
      v.medicine_status === 'given'
        ? 'Medicine Given'
        : v.medicine_status === 'none'
          ? 'No Medicine'
          : 'Not Recorded',
      v.medicine_name,
      normalizeDosageString(v.dosage) ? `${normalizeDosageString(v.dosage)} ${v.dosage_unit || ''}`.trim() : '',
      v.route,
      v.administration_time,
      itemUsed,
      v.recorded_by,
    ].map(escapeCSV).join(',');
  });

  // Prepend UTF-8 Byte Order Mark (\uFEFF) so Microsoft Excel opens accented Indian names & punctuation cleanly
  return '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
}

export function downloadCSVFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---- PHASE 3: HEALTH TRENDS & INSIGHTS (FREQUENT VISITORS + COMMON ISSUES/ILLNESSES) ----

const ISSUE_CATEGORY_RULES: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'fever', label: 'Fever / High Temperature', pattern: /\b(fevers?|pyrexia|temp|temperature|chills?|viral)\b/i },
  { key: 'headache', label: 'Headache / Migraine', pattern: /\b(headaches?|head\s*aches?|migraines?|head\s*pain)\b/i },
  { key: 'stomach', label: 'Stomach Ache / Gastric', pattern: /\b(stomach|abdomen|abdominal|tummy|gastric|acidity|indigestion|diarrhea|diarrhoea|loose\s*motions?|constipation|cramps?\s*stomach)\b/i },
  { key: 'cold_cough', label: 'Cold / Cough / Sore Throat', pattern: /\b(colds?|coughs?|coughing|sore\s*throat|throat|flu|runny\s*nose|sneez\w*|nasal|congestion|sinus\w*|tonsillitis)\b/i },
  { key: 'injury', label: 'Injury / Wound / Sprain', pattern: /\b(injur\w*|cuts?|wounds?|bruis\w*|sprain\w*|scrap\w*|abrasions?|bleed\w*|fall\w*|fell|fractur\w*|burns?|burned|blisters?|twist\w*|bandage\w*|dressing|sports?\s*injur\w*)\b/i },
  { key: 'vomiting', label: 'Vomiting / Nausea', pattern: /\b(vomit\w*|nausea\w*|throwing\s*up|motion\s*sickness)\b/i },
  { key: 'dizziness', label: 'Dizziness / Weakness / Fainting', pattern: /\b(dizz\w*|faint\w*|weakness|fatigue|tired\w*|giddiness|dehydrat\w*|heat\s*exhaustion|low\s*bp)\b/i },
  { key: 'skin', label: 'Skin Rash / Allergy / Itching', pattern: /\b(rash\w*|allerg\w*|itch\w*|skin|hives?|insect\s*bites?|mosquito\s*bites?|fungal|boils?|eczema|redness)\b/i },
  { key: 'eye_ear_dental', label: 'Eye / Ear / Toothache', pattern: /\b(eyes?|conjunctivitis|ear\s*aches?|ear\s*pain|earaches?|tooth\w*|teeth|dental|gums?|jaw)\b/i },
  { key: 'body_pain', label: 'Body / Joint / Back Pain', pattern: /\b(body\s*aches?|body\s*pain|back\s*pain|neck\s*pain|leg\s*pain|knee\s*pain|joint\s*pain|muscles?|cramps?)\b/i },
  { key: 'breathing', label: 'Breathing / Asthma / Wheezing', pattern: /\b(asthma\w*|wheez\w*|breath\w*|inhaler|chest\s*tight\w*|shortness\s*of\s*breath)\b/i },
  { key: 'menstrual', label: 'Menstrual Discomfort / Cramps', pattern: /\b(periods?|menstrual|dysmenorrhea|menstruation)\b/i },
];

export function normalizeIssueCategory(rawReason: string): { key: string; label: string } {
  const clean = String(rawReason || '').trim();
  if (!clean || /^(?:\[encrypted\s+record\b|enc:v\d+:)/i.test(clean)) {
    return { key: 'other', label: 'General / Unspecified' };
  }
  for (const rule of ISSUE_CATEGORY_RULES) {
    if (rule.pattern.test(clean)) {
      return { key: rule.key, label: rule.label };
    }
  }
  const normalizedTitle = clean
    .replace(/\s+/g, ' ')
    .slice(0, 42)
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const slug = normalizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return {
    key: slug || 'other',
    label: normalizedTitle,
  };
}

function getTimeframeStartDate(
  timeframe: HealthInsightsTimeframe,
  referenceDate: string
): string | null {
  if (timeframe === 'all') return null;
  const cleanRef = String(referenceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const parts = cleanRef.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const refDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (timeframe === '7d') {
    refDate.setUTCDate(refDate.getUTCDate() - 6);
    return refDate.toISOString().slice(0, 10);
  }
  if (timeframe === '30d') {
    refDate.setUTCDate(refDate.getUTCDate() - 29);
    return refDate.toISOString().slice(0, 10);
  }
  // 'term' -> Last 120 days (approx 1 school term)
  refDate.setUTCDate(refDate.getUTCDate() - 119);
  return refDate.toISOString().slice(0, 10);
}

interface UnifiedClinicalEvent {
  source: 'visit' | 'doctor' | 'opd';
  studentId: string;
  studentName?: string;
  section?: string;
  rollNumber?: string;
  date: string;
  reason: string;
}

function collectUnifiedClinicalEvents(params: {
  visits: VisitRecord[];
  doctorVisits?: DoctorVisitSession[];
  doctorVisitCases?: DoctorVisitCase[];
  opdRecords?: OpdRecord[];
  includePrograms?: boolean;
  timeframe: HealthInsightsTimeframe;
  referenceDate: string;
}): UnifiedClinicalEvent[] {
  const startDate = getTimeframeStartDate(params.timeframe, params.referenceDate);
  const inRange = (dateStr: string) => {
    if (!dateStr) return false;
    if (!startDate) return true;
    return dateStr >= startDate;
  };

  const events: UnifiedClinicalEvent[] = [];
  for (const v of params.visits) {
    const d = extractDatePart(v.visit_datetime);
    if (!inRange(d)) continue;
    events.push({
      source: 'visit',
      studentId: v.student_id,
      studentName: v.student_name,
      section: v.section || v.class,
      rollNumber: v.roll_number || v.roll_no,
      date: d,
      reason: v.reason || '',
    });
  }

  if (params.includePrograms) {
    const sessDateById = new Map(
      (params.doctorVisits || []).map((s) => [s.doctor_visit_id, extractDatePart(s.visit_date)])
    );
    for (const c of params.doctorVisitCases || []) {
      const d = sessDateById.get(c.doctor_visit_id) || extractDatePart(c.created_at);
      if (!inRange(d)) continue;
      events.push({
        source: 'doctor',
        studentId: c.student_id,
        studentName: c.student_name,
        section: c.section,
        rollNumber: c.roll_number,
        date: d,
        reason: c.complaint || '',
      });
    }

    for (const o of params.opdRecords || []) {
      const d = extractDatePart(o.referral_datetime);
      if (!inRange(d)) continue;
      events.push({
        source: 'opd',
        studentId: o.student_id,
        studentName: o.student_name,
        section: o.section,
        rollNumber: o.roll_number,
        date: d,
        reason: o.reason || '',
      });
    }
  }

  return events;
}

export function computeFrequentVisitors(params: {
  students: StudentRecord[];
  visits: VisitRecord[];
  doctorVisits?: DoctorVisitSession[];
  doctorVisitCases?: DoctorVisitCase[];
  opdRecords?: OpdRecord[];
  timeframe?: HealthInsightsTimeframe;
  sectionFilter?: string;
  includePrograms?: boolean;
  minVisits?: number;
  referenceDate?: string;
}): FrequentVisitorInsight[] {
  const timeframe = params.timeframe || '30d';
  const refDate = params.referenceDate || new Date().toISOString().slice(0, 10);
  const secFilter = (params.sectionFilter || 'ALL').trim().toLowerCase();
  const minVisits = Math.max(1, params.minVisits ?? 1);

  const studentMap = new Map(params.students.map((s) => [s.student_id, s]));
  const events = collectUnifiedClinicalEvents({
    visits: params.visits,
    doctorVisits: params.doctorVisits,
    doctorVisitCases: params.doctorVisitCases,
    opdRecords: params.opdRecords,
    includePrograms: params.includePrograms ?? true,
    timeframe,
    referenceDate: refDate,
  });

  const buckets = new Map<
    string,
    {
      student: StudentRecord;
      visitCount: number;
      doctorCaseCount: number;
      opdCount: number;
      lastVisitDate: string;
      reasonCounts: Map<string, number>;
      recentReasons: Array<{ date: string; reason: string }>;
    }
  >();

  for (const ev of events) {
    const stu: StudentRecord = studentMap.get(ev.studentId) ?? {
      student_id: ev.studentId,
      full_name: ev.studentName || 'Unknown Student',
      section: normalizeSectionName(ev.section || 'Unassigned'),
      roll_number: ev.rollNumber || '-',
      active_status: 'Active',
      created_at: ev.date,
      updated_at: ev.date,
    };

    if (secFilter !== 'all' && stu.section.toLowerCase() !== secFilter) {
      continue;
    }

    let bucket = buckets.get(stu.student_id);
    if (!bucket) {
      bucket = {
        student: stu,
        visitCount: 0,
        doctorCaseCount: 0,
        opdCount: 0,
        lastVisitDate: ev.date,
        reasonCounts: new Map(),
        recentReasons: [],
      };
      buckets.set(stu.student_id, bucket);
    }

    if (ev.source === 'visit') bucket.visitCount++;
    else if (ev.source === 'doctor') bucket.doctorCaseCount++;
    else if (ev.source === 'opd') bucket.opdCount++;

    if (ev.date > bucket.lastVisitDate) {
      bucket.lastVisitDate = ev.date;
    }
    const cat = normalizeIssueCategory(ev.reason);
    bucket.reasonCounts.set(cat.label, (bucket.reasonCounts.get(cat.label) || 0) + 1);
    if (ev.reason.trim()) {
      bucket.recentReasons.push({ date: ev.date, reason: ev.reason.trim() });
    }
  }

  return Array.from(buckets.values())
    .map((b) => {
      const totalVisits = b.visitCount + b.doctorCaseCount + b.opdCount;
      const topReasons = Array.from(b.reasonCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, c) => c.count - a.count || a.label.localeCompare(c.label))
        .slice(0, 3);
      const recentReasons = b.recentReasons
        .sort((a, c) => c.date.localeCompare(a.date))
        .map((r) => r.reason)
        .filter((r, i, arr) => arr.indexOf(r) === i)
        .slice(0, 4);

      return {
        student: b.student,
        totalVisits,
        visitCount: b.visitCount,
        doctorCaseCount: b.doctorCaseCount,
        opdCount: b.opdCount,
        lastVisitDate: b.lastVisitDate,
        topReasons,
        recentReasons,
      };
    })
    .filter((item) => item.totalVisits >= minVisits)
    .sort((a, b) => {
      if (b.totalVisits !== a.totalVisits) return b.totalVisits - a.totalVisits;
      if (b.lastVisitDate !== a.lastVisitDate) return b.lastVisitDate.localeCompare(a.lastVisitDate);
      return a.student.full_name.localeCompare(b.student.full_name);
    });
}

export function computeCommonIssues(params: {
  students: StudentRecord[];
  visits: VisitRecord[];
  doctorVisits?: DoctorVisitSession[];
  doctorVisitCases?: DoctorVisitCase[];
  opdRecords?: OpdRecord[];
  timeframe?: HealthInsightsTimeframe;
  sectionFilter?: string;
  includePrograms?: boolean;
  referenceDate?: string;
}): CommonIssueInsight[] {
  const timeframe = params.timeframe || '30d';
  const refDate = params.referenceDate || new Date().toISOString().slice(0, 10);
  const recent7dCutoff = getTimeframeStartDate('7d', refDate) || '';
  const secFilter = (params.sectionFilter || 'ALL').trim().toLowerCase();

  const studentMap = new Map(params.students.map((s) => [s.student_id, s]));
  const events = collectUnifiedClinicalEvents({
    visits: params.visits,
    doctorVisits: params.doctorVisits,
    doctorVisitCases: params.doctorVisitCases,
    opdRecords: params.opdRecords,
    includePrograms: params.includePrograms ?? true,
    timeframe,
    referenceDate: refDate,
  });

  const issueBuckets = new Map<
    string,
    {
      issueKey: string;
      label: string;
      totalCases: number;
      recent7dCount: number;
      classCounts: Map<string, number>;
      studentsMap: Map<
        string,
        {
          student: StudentRecord;
          count: number;
          lastDate: string;
          sampleReasons: string[];
        }
      >;
    }
  >();

  for (const ev of events) {
    const stu: StudentRecord = studentMap.get(ev.studentId) ?? {
      student_id: ev.studentId,
      full_name: ev.studentName || 'Unknown Student',
      section: normalizeSectionName(ev.section || 'Unassigned'),
      roll_number: ev.rollNumber || '-',
      active_status: 'Active',
      created_at: ev.date,
      updated_at: ev.date,
    };

    if (secFilter !== 'all' && stu.section.toLowerCase() !== secFilter) {
      continue;
    }

    const cat = normalizeIssueCategory(ev.reason);
    let bucket = issueBuckets.get(cat.key);
    if (!bucket) {
      bucket = {
        issueKey: cat.key,
        label: cat.label,
        totalCases: 0,
        recent7dCount: 0,
        classCounts: new Map(),
        studentsMap: new Map(),
      };
      issueBuckets.set(cat.key, bucket);
    }

    bucket.totalCases++;
    if (recent7dCutoff && ev.date >= recent7dCutoff) {
      bucket.recent7dCount++;
    }
    const secName = stu.section || 'Unassigned';
    bucket.classCounts.set(secName, (bucket.classCounts.get(secName) || 0) + 1);

    let stuEntry = bucket.studentsMap.get(stu.student_id);
    if (!stuEntry) {
      stuEntry = {
        student: stu,
        count: 0,
        lastDate: ev.date,
        sampleReasons: [],
      };
      bucket.studentsMap.set(stu.student_id, stuEntry);
    }
    stuEntry.count++;
    if (ev.date > stuEntry.lastDate) stuEntry.lastDate = ev.date;
    const trimmedReason = ev.reason.trim();
    if (trimmedReason && !stuEntry.sampleReasons.includes(trimmedReason) && stuEntry.sampleReasons.length < 3) {
      stuEntry.sampleReasons.push(trimmedReason);
    }
  }

  return Array.from(issueBuckets.values())
    .map((b) => ({
      issueKey: b.issueKey,
      label: b.label,
      totalCases: b.totalCases,
      uniqueStudentCount: b.studentsMap.size,
      recent7dCount: b.recent7dCount,
      classBreakdown: Array.from(b.classCounts.entries())
        .map(([section, count]) => ({ section, count }))
        .sort((a, c) => c.count - a.count || a.section.localeCompare(c.section)),
      affectedStudents: Array.from(b.studentsMap.values()).sort(
        (a, c) =>
          c.count - a.count ||
          c.lastDate.localeCompare(a.lastDate) ||
          a.student.full_name.localeCompare(c.student.full_name)
      ),
    }))
    .sort((a, b) => {
      if (b.totalCases !== a.totalCases) return b.totalCases - a.totalCases;
      if (b.uniqueStudentCount !== a.uniqueStudentCount) return b.uniqueStudentCount - a.uniqueStudentCount;
      return a.label.localeCompare(b.label);
    });
}



