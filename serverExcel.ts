import ExcelJS from 'exceljs';
import officeCryptoModule from 'officecrypto-tool';
import type {
  NurseDatabase,
  StudentRecord,
  VisitRecord,
  MeasurementRecord,
  HealthProfileRecord,
} from './src/utils/nurseLogic.ts';
import {
  extractDatePart,
  formatTimeFromDatetime,
  formatMedicineDisplay,
} from './src/utils/nurseLogic.ts';

const officeCrypto =
  (officeCryptoModule as unknown as {
    encrypt: (input: Buffer, options: { password: string }) => Promise<Buffer>;
    decrypt: (input: Buffer, options: { password: string }) => Promise<Buffer>;
    isEncrypted: (input: Buffer) => boolean;
  });

export type ClinicalExcelTab =
  | 'Students'
  | 'Visits'
  | 'Measurements'
  | 'Health Profiles'
  | 'All';

export const ALLOWED_EXCEL_TABS = new Set<ClinicalExcelTab>([
  'Students',
  'Visits',
  'Measurements',
  'Health Profiles',
  'All',
]);

// Server-only default password for encrypted Excel workbooks (overridable via EXCEL_EXPORT_PASSWORD env var)
export const DEFAULT_EXCEL_EXPORT_PASSWORD =
  (process.env.EXCEL_EXPORT_PASSWORD || '').trim() || 'SVA@Infirmary2026';

export function getExcelExportPassword(): string {
  return (process.env.EXCEL_EXPORT_PASSWORD || '').trim() || DEFAULT_EXCEL_EXPORT_PASSWORD;
}

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) in text cells.
 */
function sanitizeExcelText(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
};

const HEADER_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF0F4C5C' } },
  left: { style: 'thin', color: { argb: 'FF1D6A62' } },
  bottom: { style: 'medium', color: { argb: 'FF0D3B47' } },
  right: { style: 'thin', color: { argb: 'FF1D6A62' } },
};

function setupStyledSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  recordCount: number,
  columns: Array<{ header: string; key: string; width: number; alignment?: Partial<ExcelJS.Alignment> }>
): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.25,
        footer: 0.25,
      },
    },
  });

  const colCount = columns.length;
  const generatedStr = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Row 1: School Banner
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `SARASWATI VIDYA ACADEMY — SCHOOL INFIRMARY  ·  ${title.toUpperCase()}`;
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C5C' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 30;

  // Row 2: Subtitle & Metadata Bar
  ws.mergeCells(2, 1, 2, colCount);
  const metaCell = ws.getCell(2, 1);
  metaCell.value = `Generated: ${generatedStr}    |    Total Records: ${recordCount}    |    Confidential School Medical Register (AES-256 Password Protected)`;
  metaCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F4F0' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 20;

  // Row 3: Subtle breathing spacer
  ws.getRow(3).height = 7;

  // Set column widths & keys
  ws.columns = columns.map((c) => ({
    key: c.key,
    width: c.width,
  }));

  // Row 4: Styled Column Header Row
  const headerRow = ws.getRow(4);
  headerRow.height = 25;
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.alignment?.horizontal || 'left',
      wrapText: true,
    };
    cell.border = HEADER_BORDER;
  });

  // Enable Excel filter dropdowns on Header Row 4 & repeat rows 1-4 on print pages
  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: colCount },
  };
  ws.pageSetup.printTitlesRow = '1:4';

  return ws;
}

function styleDataRow(
  row: ExcelJS.Row,
  index: number,
  columns: Array<{ alignment?: Partial<ExcelJS.Alignment> }>,
  statusColIndex?: number
): void {
  const isEven = index % 2 === 1;
  row.height = 22;
  columns.forEach((col, idx) => {
    const cell = row.getCell(idx + 1);
    cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF18181B' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF8FAF9' : 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.alignment?.horizontal || 'left',
      wrapText: true,
    };
    cell.border = THIN_BORDER;

    if (statusColIndex !== undefined && idx === statusColIndex) {
      const val = String(cell.value || '').toLowerCase();
      if (val === 'active') {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF047857' } };
      } else if (val === 'inactive' || val === 'resolved') {
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF71717A' } };
      }
    }
  });
}

function buildStudentMap(students: StudentRecord[]): Map<string, StudentRecord> {
  const map = new Map<string, StudentRecord>();
  for (const s of students) {
    map.set(s.student_id, s);
  }
  return map;
}

function addStudentsWorksheet(workbook: ExcelJS.Workbook, students: StudentRecord[]): void {
  const sorted = [...students].sort((a, b) => {
    const secCmp = a.section.localeCompare(b.section);
    if (secCmp !== 0) return secCmp;
    return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
  });

  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Student ID', key: 'student_id', width: 17, alignment: { horizontal: 'center' as const } },
    { header: 'Student Full Name', key: 'full_name', width: 32 },
    { header: 'Class Section', key: 'section', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_number', width: 11, alignment: { horizontal: 'center' as const } },
    { header: 'Status', key: 'active_status', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Last Updated', key: 'updated_at', width: 16, alignment: { horizontal: 'center' as const } },
  ];

  const ws = setupStyledSheet(workbook, 'Students', 'Student Roster', sorted.length, columns);
  sorted.forEach((s, idx) => {
    const row = ws.addRow({
      sr: idx + 1,
      student_id: sanitizeExcelText(s.student_id),
      full_name: sanitizeExcelText(s.full_name),
      section: sanitizeExcelText(s.section),
      roll_number: sanitizeExcelText(s.roll_number),
      active_status: sanitizeExcelText(s.active_status || 'Active'),
      updated_at: extractDatePart(s.updated_at || s.created_at),
    });
    styleDataRow(row, idx, columns, 5);
  });
}

function addVisitsWorksheet(
  workbook: ExcelJS.Workbook,
  visits: VisitRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const sorted = [...visits].sort((a, b) => {
    const cmp = (b.visit_datetime || '').localeCompare(a.visit_datetime || '');
    if (cmp !== 0) return cmp;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Visit ID', key: 'visit_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Date', key: 'date', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Time', key: 'time', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 28 },
    { header: 'Class', key: 'section', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Reason / Health Concern', key: 'reason', width: 30 },
    { header: 'Observations / Vitals', key: 'observations', width: 28 },
    { header: 'Care / Action Taken', key: 'action_taken', width: 30 },
    { header: 'Medicine & Dosage', key: 'medicine', width: 30 },
    { header: 'Notes', key: 'notes', width: 24 },
    { header: 'Recorded By', key: 'recorded_by', width: 20 },
  ];

  const ws = setupStyledSheet(workbook, 'Visits', 'Infirmary Visit Log', sorted.length, columns);
  sorted.forEach((v, idx) => {
    const stu = studentMap.get(v.student_id);
    const row = ws.addRow({
      sr: idx + 1,
      visit_id: sanitizeExcelText(v.visit_id),
      date: extractDatePart(v.visit_datetime),
      time: formatTimeFromDatetime(v.visit_datetime),
      student_name: sanitizeExcelText(v.student_name || stu?.full_name || 'Unknown'),
      section: sanitizeExcelText(v.class || v.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(v.roll_no || v.roll_number || stu?.roll_number || '-'),
      reason: sanitizeExcelText(v.reason),
      observations: sanitizeExcelText(v.observations || '-'),
      action_taken: sanitizeExcelText(v.action_taken),
      medicine: sanitizeExcelText(formatMedicineDisplay(v)),
      notes: sanitizeExcelText(v.notes || '-'),
      recorded_by: sanitizeExcelText(v.recorded_by || 'Staff on Duty'),
    });
    styleDataRow(row, idx, columns);
    // Give multi-line clinical rows extra breathing room
    const maxLen = Math.max(
      (v.reason || '').length,
      (v.observations || '').length,
      (v.action_taken || '').length,
      (v.notes || '').length
    );
    if (maxLen > 40) {
      row.height = Math.min(64, 22 + Math.ceil(maxLen / 35) * 12);
    }
  });
}

function addMeasurementsWorksheet(
  workbook: ExcelJS.Workbook,
  measurements: MeasurementRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const sorted = [...measurements].sort((a, b) =>
    (b.measurement_date || '').localeCompare(a.measurement_date || '')
  );

  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Record ID', key: 'measurement_id', width: 17, alignment: { horizontal: 'center' as const } },
    { header: 'Date', key: 'measurement_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 28 },
    { header: 'Class', key: 'section', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Height (cm)', key: 'height_cm', width: 14, alignment: { horizontal: 'right' as const } },
    { header: 'Weight (kg)', key: 'weight_kg', width: 14, alignment: { horizontal: 'right' as const } },
    { header: 'BMI', key: 'bmi', width: 11, alignment: { horizontal: 'right' as const } },
    { header: 'Notes', key: 'notes', width: 32 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Measurements',
    'Growth & Anthropometric Measurements',
    sorted.length,
    columns
  );
  sorted.forEach((m, idx) => {
    const stu = studentMap.get(m.student_id);
    const hMeters = Number(m.height_cm) > 0 ? Number(m.height_cm) / 100 : 0;
    const bmi =
      hMeters > 0 && Number(m.weight_kg) > 0
        ? Number((Number(m.weight_kg) / (hMeters * hMeters)).toFixed(1))
        : '';
    const row = ws.addRow({
      sr: idx + 1,
      measurement_id: sanitizeExcelText(m.measurement_id),
      measurement_date: extractDatePart(m.measurement_date),
      student_name: sanitizeExcelText(stu?.full_name || m.student_id),
      section: sanitizeExcelText(stu?.section || '-'),
      roll_no: sanitizeExcelText(stu?.roll_number || '-'),
      height_cm: Number(m.height_cm) || 0,
      weight_kg: Number(m.weight_kg) || 0,
      bmi,
      notes: sanitizeExcelText(m.notes || '-'),
    });
    styleDataRow(row, idx, columns);
  });
}

function addHealthProfilesWorksheet(
  workbook: ExcelJS.Workbook,
  profiles: HealthProfileRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const sorted = [...profiles].sort((a, b) => {
    if (a.status === 'Active' && b.status !== 'Active') return -1;
    if (a.status !== 'Active' && b.status === 'Active') return 1;
    return (b.date_recorded || '').localeCompare(a.date_recorded || '');
  });

  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Profile ID', key: 'health_record_id', width: 17, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 28 },
    { header: 'Class', key: 'section', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Condition / Allergy / Medical Note', key: 'condition_or_note', width: 42 },
    { header: 'Status', key: 'status', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Date Recorded', key: 'date_recorded', width: 15, alignment: { horizontal: 'center' as const } },
    { header: 'Last Reviewed', key: 'last_reviewed', width: 15, alignment: { horizontal: 'center' as const } },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Health Profiles',
    'Student Allergies & Health Profiles',
    sorted.length,
    columns
  );
  sorted.forEach((h, idx) => {
    const stu = studentMap.get(h.student_id);
    const row = ws.addRow({
      sr: idx + 1,
      health_record_id: sanitizeExcelText(h.health_record_id),
      student_name: sanitizeExcelText(stu?.full_name || h.student_id),
      section: sanitizeExcelText(stu?.section || '-'),
      roll_no: sanitizeExcelText(stu?.roll_number || '-'),
      condition_or_note: sanitizeExcelText(h.condition_or_note),
      status: sanitizeExcelText(h.status || 'Active'),
      date_recorded: extractDatePart(h.date_recorded),
      last_reviewed: extractDatePart(h.last_reviewed || h.date_recorded),
    });
    styleDataRow(row, idx, columns, 6);
    if ((h.condition_or_note || '').length > 45) {
      row.height = Math.min(64, 22 + Math.ceil(h.condition_or_note.length / 42) * 12);
    }
  });
}

export async function generateEncryptedExcelWorkbook(
  db: NurseDatabase,
  tab: ClinicalExcelTab,
  passwordOverride?: string
): Promise<{ buffer: Buffer; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Saraswati Vidya Academy — School Infirmary';
  workbook.created = new Date();
  workbook.modified = new Date();

  const studentMap = buildStudentMap(db.students || []);

  if (tab === 'Students' || tab === 'All') {
    addStudentsWorksheet(workbook, db.students || []);
  }
  if (tab === 'Visits' || tab === 'All') {
    addVisitsWorksheet(workbook, db.visits || [], studentMap);
  }
  if (tab === 'Measurements' || tab === 'All') {
    addMeasurementsWorksheet(workbook, db.measurements || [], studentMap);
  }
  if (tab === 'Health Profiles' || tab === 'All') {
    addHealthProfilesWorksheet(workbook, db.healthProfiles || [], studentMap);
  }

  const rawBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const password = (passwordOverride || '').trim() || getExcelExportPassword();
  const encryptedBuffer = await officeCrypto.encrypt(rawBuffer, { password });

  const todayStamp = new Date().toISOString().slice(0, 10);
  const filename =
    tab === 'All'
      ? `SVA_Infirmary_All_Sheets_${todayStamp}.xlsx`
      : `SVA_${tab.replace(/\s+/g, '_')}_${todayStamp}.xlsx`;

  return { buffer: encryptedBuffer, filename };
}
