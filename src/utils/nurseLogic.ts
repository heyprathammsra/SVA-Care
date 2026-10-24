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

export interface VisitRecord {
  visit_id: string;
  student_id: string;
  student_name?: string;
  section?: string;
  class?: string;
  roll_number?: string;
  roll_no?: string;
  visit_datetime: string; // YYYY-MM-DDTHH:mm
  reason: string;
  observations: string;
  action_taken: string;
  medicine_status: MedicineStatus;
  medicine_name: string; // Stored in Sheets as "None (No medicine given)", "Not recorded", or actual name
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

export interface NurseDatabase {
  students: StudentRecord[];
  visits: VisitRecord[];
  measurements: MeasurementRecord[];
  healthProfiles: HealthProfileRecord[];
}

export interface VisitFormInput {
  student_id: string;
  visit_datetime: string;
  reason: string;
  observations: string;
  action_taken: string;
  medicine_status: MedicineStatus;
  medicine_name: string;
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
 * Generates a permanent internal ID (never using spreadsheet row numbers).
 */
export function generatePermanentId(
  prefix: 'STU' | 'VIS' | 'MSR' | 'HPR',
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
  const dosePart = (visit.dosage || '').trim()
    ? `${visit.dosage.trim()}${(visit.dosage_unit || '').trim() ? ' ' + visit.dosage_unit.trim() : ''}`
    : '';
  const routePart = (visit.route || '').trim() ? `(${visit.route.trim()})` : '';
  const timePart = (visit.administration_time || '').trim()
    ? `at ${visit.administration_time.trim()}`
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
    errors.reason = 'Reason for visit or reported problem is required.';
  }
  if (!input.action_taken || !input.action_taken.trim()) {
    errors.action_taken = 'Action taken or care resolution is required.';
  }
  if (input.medicine_status === 'given' && !input.medicine_name.trim()) {
    errors.medicine_name = 'Enter the medicine name administered, or select "No medicine given".';
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
      full_name: 'Unknown Student',
      section: 'Unassigned',
      roll_number: '-',
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
 * Normalizes and merges raw JSON arrays returned by the Google Apps Script doGet endpoint
 * with the current local database, ensuring:
 * 1) Pasted student names in Google Sheets without student_id get matched or assigned permanent IDs.
 * 2) Raw string visit records derive accurate medicine_status ('none' | 'given' | 'not_recorded').
 * 3) Raw string measurement records convert height_cm and weight_kg to numbers.
 * 4) Any unsynced local records are preserved rather than overwritten, while purged test records are ignored.
 */
export function normalizeSheetSyncPayload(
  payload: {
    students?: Array<Partial<StudentRecord> & Record<string, any>>;
    visits?: Array<Partial<VisitRecord> & Record<string, any>>;
    measurements?: Array<Partial<Record<keyof MeasurementRecord, string | number>> & Record<string, any>>;
    healthProfiles?: Array<Partial<HealthProfileRecord> & Record<string, any>>;
  },
  currentDb: NurseDatabase,
  nowIso: string = new Date().toISOString()
): NurseDatabase {
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

    normalizedRemoteVisits.push({
      visit_id: visitId,
      student_id: studentId,
      student_name: stuName,
      section: stuSection,
      class: stuSection,
      roll_number: resolvedRoll,
      roll_no: resolvedRoll,
      visit_datetime: normalizeDatetimeString(
        String(row?.visit_datetime || ''),
        nowIso.slice(0, 16)
      ),
      reason: String(row?.reason || '').trim(),
      observations: String(row?.observations || '').trim(),
      action_taken: String(row?.action_taken || '').trim(),
      medicine_status: medStatus,
      medicine_name: medName || (medStatus === 'none' ? 'None (No medicine given)' : ''),
      dosage: String(row?.dosage || '').trim(),
      dosage_unit: String(row?.dosage_unit || '').trim(),
      route: String(row?.route || '').trim(),
      administration_time: normalizeTimeOnlyString(String(row?.administration_time || '')),
      notes: String(row?.notes || '').trim(),
      recorded_by: String(row?.recorded_by || '').trim() || 'Staff In-Charge',
      created_at: String(row?.created_at || '').trim() || nowIso,
    });
  });

  const seenLocalVisitIds = new Set<string>();
  let finalVisits: VisitRecord[] = currentDb.visits
    .filter((v) => {
      if (!v.visit_id || PURGED_TEST_VISIT_IDS.has(v.visit_id) || seenLocalVisitIds.has(v.visit_id)) {
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

  return {
    students: finalStudents,
    visits: finalVisits,
    measurements: finalMeasurements,
    healthProfiles: finalProfiles,
  };
}

/**
 * Generates RFC 4180 compliant CSV string with UTF-8 BOM for Excel/Google Sheets compatibility
 */
export function generateVisitsCSV(entries: DailyLogEntry[]): string {
  const headers = [
    'Sr No',
    'Visit ID',
    'Date',
    'Time',
    'Student Name',
    'Roll No',
    'Class',
    'Reason / Complaint',
    'Clinical Observations',
    'Action Taken',
    'Medicine Status',
    'Medicine Name',
    'Dosage',
    'Route',
    'Administration Time',
    'Recorded By',
  ];

  const escapeCSV = (val: string | number | undefined | null) => {
    const s = String(val ?? '').trim();
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

    return [
      idx + 1,
      v.visit_id,
      datePart,
      timePart,
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
      v.dosage ? `${v.dosage} ${v.dosage_unit || ''}`.trim() : '',
      v.route,
      v.administration_time,
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


