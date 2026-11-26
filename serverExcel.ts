import ExcelJS from 'exceljs';
import officeCryptoModule from 'officecrypto-tool';
import type {
  NurseDatabase,
  StudentRecord,
  VisitRecord,
  MeasurementRecord,
  HealthProfileRecord,
  MedicineInventoryRecord,
  ItemInventoryRecord,
  StockTransactionRecord,
  BillRecord,
  DoctorVisitSession,
  DoctorVisitCase,
  OpdRecord,
  MedicalCampRecord,
  CampScreeningRecord,
  AnnualCheckupRecord,
  MenstrualLogRecord,
  InfirmarySettings,
} from './src/utils/nurseLogic.ts';
import {
  extractDatePart,
  formatTimeFromDatetime,
  formatMedicineDisplay,
  resolveVisitShiftPeriod,
  formatShiftPeriodLabel,
  getStockStatus,
  calculateBmi,
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
  | 'Medicines'
  | 'Items'
  | 'Bills'
  | 'Stock Ledger'
  | 'Doctor Visits'
  | 'External OPD'
  | 'Medical Camps'
  | 'Annual Checkups'
  | 'Menstrual Log'
  | 'All';

export const ALLOWED_EXCEL_TABS = new Set<ClinicalExcelTab>([
  'Students',
  'Visits',
  'Measurements',
  'Health Profiles',
  'Medicines',
  'Items',
  'Bills',
  'Stock Ledger',
  'Doctor Visits',
  'External OPD',
  'Medical Camps',
  'Annual Checkups',
  'Menstrual Log',
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
    { header: 'GR Number', key: 'gr_number', width: 17, alignment: { horizontal: 'center' as const } },
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
      gr_number: sanitizeExcelText(s.gr_number || ''),
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
  studentMap: Map<string, StudentRecord>,
  settings?: InfirmarySettings
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
    { header: 'Shift', key: 'shift', width: 18, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 28 },
    { header: 'Class', key: 'section', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Reason / Health Concern', key: 'reason', width: 30 },
    { header: 'Observations / Vitals', key: 'observations', width: 28 },
    { header: 'Care / Action Taken', key: 'action_taken', width: 30 },
    { header: 'Medicine & Dosage', key: 'medicine', width: 30 },
    { header: 'Item Used', key: 'item_used', width: 22 },
    { header: 'Notes', key: 'notes', width: 24 },
    { header: 'Recorded By', key: 'recorded_by', width: 20 },
  ];

  const ws = setupStyledSheet(workbook, 'Visits', 'Infirmary Visit Log', sorted.length, columns);
  sorted.forEach((v, idx) => {
    const stu = studentMap.get(v.student_id);
    const shiftLabel = formatShiftPeriodLabel(resolveVisitShiftPeriod(v, settings));
    const itemUsed = v.item_name
      ? `${v.item_name}${v.item_qty ? ` (x${v.item_qty})` : ''}`
      : '-';
    const row = ws.addRow({
      sr: idx + 1,
      visit_id: sanitizeExcelText(v.visit_id),
      date: extractDatePart(v.visit_datetime),
      time: formatTimeFromDatetime(v.visit_datetime),
      shift: sanitizeExcelText(shiftLabel),
      student_name: sanitizeExcelText(v.student_name || stu?.full_name || 'Unknown'),
      section: sanitizeExcelText(v.class || v.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(v.roll_no || v.roll_number || stu?.roll_number || '-'),
      reason: sanitizeExcelText(v.reason),
      observations: sanitizeExcelText(v.observations || '-'),
      action_taken: sanitizeExcelText(v.action_taken),
      medicine: sanitizeExcelText(formatMedicineDisplay(v)),
      item_used: sanitizeExcelText(itemUsed),
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

function addMedicinesWorksheet(
  workbook: ExcelJS.Workbook,
  medicines: MedicineInventoryRecord[]
): void {
  const sorted = [...medicines].sort((a, b) => a.name.localeCompare(b.name));
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Medicine ID', key: 'medicine_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Medicine Name', key: 'name', width: 28 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Form & Strength', key: 'form_strength', width: 20 },
    { header: 'Batch No.', key: 'batch_number', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Expiry Date', key: 'expiry_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Current Stock', key: 'current_stock', width: 14, alignment: { horizontal: 'right' as const } },
    { header: 'Unit', key: 'unit', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Min Alert', key: 'min_stock_alert', width: 12, alignment: { horizontal: 'right' as const } },
    { header: 'Stock Status', key: 'status', width: 14, alignment: { horizontal: 'center' as const } },
  ];

  const ws = setupStyledSheet(workbook, 'Medicines', 'Medicines Inventory', sorted.length, columns);
  sorted.forEach((m, idx) => {
    const st = getStockStatus(m.current_stock, m.min_stock_alert);
    const statusLabel = st === 'out' ? 'Out of Stock' : st === 'low' ? 'Low Stock' : 'In Stock';
    const row = ws.addRow({
      sr: idx + 1,
      medicine_id: sanitizeExcelText(m.medicine_id),
      name: sanitizeExcelText(m.name),
      category: sanitizeExcelText(m.category || 'General'),
      form_strength: sanitizeExcelText(m.form_strength || '-'),
      batch_number: sanitizeExcelText(m.batch_number || '-'),
      expiry_date: m.expiry_date ? extractDatePart(m.expiry_date) : '-',
      current_stock: Number(m.current_stock) || 0,
      unit: sanitizeExcelText(m.unit || 'tablets'),
      min_stock_alert: Number(m.min_stock_alert) || 0,
      status: statusLabel,
    });
    styleDataRow(row, idx, columns);
  });
}

function addItemsWorksheet(
  workbook: ExcelJS.Workbook,
  items: ItemInventoryRecord[]
): void {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Item ID', key: 'item_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Item Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Current Stock', key: 'current_stock', width: 14, alignment: { horizontal: 'right' as const } },
    { header: 'Unit', key: 'unit', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Min Alert', key: 'min_stock_alert', width: 12, alignment: { horizontal: 'right' as const } },
    { header: 'Stock Status', key: 'status', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Notes', key: 'notes', width: 32 },
  ];

  const ws = setupStyledSheet(workbook, 'Items', 'Infirmary Supplies & Items Inventory', sorted.length, columns);
  sorted.forEach((it, idx) => {
    const st = getStockStatus(it.current_stock, it.min_stock_alert);
    const statusLabel = st === 'out' ? 'Out of Stock' : st === 'low' ? 'Low Stock' : 'In Stock';
    const row = ws.addRow({
      sr: idx + 1,
      item_id: sanitizeExcelText(it.item_id),
      name: sanitizeExcelText(it.name),
      category: sanitizeExcelText(it.category || 'First Aid'),
      current_stock: Number(it.current_stock) || 0,
      unit: sanitizeExcelText(it.unit || 'pcs'),
      min_stock_alert: Number(it.min_stock_alert) || 0,
      status: statusLabel,
      notes: sanitizeExcelText(it.notes || '-'),
    });
    styleDataRow(row, idx, columns);
  });
}

function addBillsWorksheet(
  workbook: ExcelJS.Workbook,
  bills: BillRecord[]
): void {
  const sorted = [...bills].sort((a, b) => (b.bill_date || '').localeCompare(a.bill_date || ''));
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Bill ID', key: 'bill_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Bill Date', key: 'bill_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Invoice / Bill No.', key: 'bill_number', width: 18 },
    { header: 'Vendor / Pharmacy', key: 'vendor_name', width: 28 },
    { header: 'Category', key: 'category', width: 15, alignment: { horizontal: 'center' as const } },
    { header: 'Total Amount (INR)', key: 'total_amount', width: 18, alignment: { horizontal: 'right' as const } },
    { header: 'Bill Photo Link', key: 'image_url', width: 34 },
    { header: 'Notes', key: 'notes', width: 28 },
  ];

  const ws = setupStyledSheet(workbook, 'Bills', 'Infirmary Bills & Pharmacy Receipts', sorted.length, columns);
  sorted.forEach((b, idx) => {
    const row = ws.addRow({
      sr: idx + 1,
      bill_id: sanitizeExcelText(b.bill_id),
      bill_date: extractDatePart(b.bill_date),
      bill_number: sanitizeExcelText(b.bill_number || '-'),
      vendor_name: sanitizeExcelText(b.vendor_name),
      category: sanitizeExcelText(b.category),
      total_amount: Number(b.total_amount) || 0,
      image_url: sanitizeExcelText(b.image_url || (b.image_data_url ? 'Attached in App' : '-')),
      notes: sanitizeExcelText(b.notes || '-'),
    });
    styleDataRow(row, idx, columns);
  });
}

function addStockLedgerWorksheet(
  workbook: ExcelJS.Workbook,
  transactions: StockTransactionRecord[]
): void {
  const sorted = [...transactions].sort((a, b) =>
    (b.created_at || '').localeCompare(a.created_at || '')
  );
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Transaction ID', key: 'txn_id', width: 17, alignment: { horizontal: 'center' as const } },
    { header: 'Date & Time', key: 'created_at', width: 19, alignment: { horizontal: 'center' as const } },
    { header: 'Type', key: 'target_type', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Medicine / Item', key: 'target_name', width: 28 },
    { header: 'Change Qty', key: 'change_qty', width: 13, alignment: { horizontal: 'right' as const } },
    { header: 'Balance After', key: 'balance_after', width: 14, alignment: { horizontal: 'right' as const } },
    { header: 'Reason', key: 'reason', width: 18, alignment: { horizontal: 'center' as const } },
    { header: 'Reference ID', key: 'reference_id', width: 17, alignment: { horizontal: 'center' as const } },
    { header: 'Recorded By', key: 'recorded_by', width: 18 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Stock Ledger',
    'Inventory Stock Movement & Audit Ledger',
    sorted.length,
    columns
  );

  sorted.forEach((t, idx) => {
    const reasonLabel =
      t.reason === 'visit'
        ? 'Student Visit'
        : t.reason === 'bill_restock'
          ? 'Bill Restock'
          : t.reason === 'menstrual'
            ? 'Hygiene Support'
            : 'Manual Adjustment';
    const qty = Number(t.change_qty) || 0;
    const row = ws.addRow({
      sr: idx + 1,
      txn_id: sanitizeExcelText(t.txn_id),
      created_at: sanitizeExcelText((t.created_at || '').slice(0, 16).replace('T', ' ')),
      target_type: t.target_type === 'medicine' ? 'Medicine' : 'Item',
      target_name: sanitizeExcelText(t.target_name || t.target_id),
      change_qty: qty > 0 ? `+${qty}` : `${qty}`,
      balance_after: t.balance_after !== undefined ? Number(t.balance_after) : '-',
      reason: sanitizeExcelText(reasonLabel),
      reference_id: sanitizeExcelText(t.reference_id || '-'),
      recorded_by: sanitizeExcelText(t.recorded_by || 'Staff on Duty'),
      notes: sanitizeExcelText(t.notes || '-'),
    });
    styleDataRow(row, idx, columns);
  });
}

function addDoctorVisitsWorksheet(
  workbook: ExcelJS.Workbook,
  sessions: DoctorVisitSession[],
  cases: DoctorVisitCase[],
  studentMap: Map<string, StudentRecord>
): void {
  const sessionById = new Map(sessions.map((s) => [s.doctor_visit_id, s]));
  const sortedCases = [...cases].sort((a, b) => {
    const dA = sessionById.get(a.doctor_visit_id)?.visit_date || a.created_at || '';
    const dB = sessionById.get(b.doctor_visit_id)?.visit_date || b.created_at || '';
    return dB.localeCompare(dA);
  });

  // Include sessions that don't yet have student cases so every doctor visit appears in the workbook
  const sessionsWithCases = new Set(sortedCases.map((c) => c.doctor_visit_id));
  const emptySessions = [...sessions]
    .filter((s) => !sessionsWithCases.has(s.doctor_visit_id))
    .sort((a, b) => (b.visit_date || '').localeCompare(a.visit_date || ''));

  const totalRows = sortedCases.length + emptySessions.length;
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Visit Date', key: 'visit_date', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Session Time', key: 'session_time', width: 18, alignment: { horizontal: 'center' as const } },
    { header: 'Visiting Doctor', key: 'doctor_name', width: 24 },
    { header: 'Specialization', key: 'specialization', width: 18 },
    { header: 'Student Name', key: 'student_name', width: 24 },
    { header: 'Class', key: 'section', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Complaint / Reason', key: 'complaint', width: 26 },
    { header: 'Clinical Findings', key: 'findings', width: 28 },
    { header: 'Prescription / Advice', key: 'prescription_or_advice', width: 32 },
    { header: 'Follow-up', key: 'follow_up', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Notes', key: 'notes', width: 24 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Doctor Visits',
    'Weekly Visiting Doctor Consultations',
    totalRows,
    columns
  );

  let idx = 0;
  sortedCases.forEach((c) => {
    const sess = sessionById.get(c.doctor_visit_id);
    const stu = studentMap.get(c.student_id);
    const row = ws.addRow({
      sr: idx + 1,
      visit_date: extractDatePart(sess?.visit_date || c.created_at),
      session_time: sanitizeExcelText(sess?.session_time || '-'),
      doctor_name: sanitizeExcelText(sess?.doctor_name || '-'),
      specialization: sanitizeExcelText(sess?.specialization || '-'),
      student_name: sanitizeExcelText(c.student_name || stu?.full_name || c.student_id),
      section: sanitizeExcelText(c.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(c.roll_number || stu?.roll_number || '-'),
      complaint: sanitizeExcelText(c.complaint),
      findings: sanitizeExcelText(c.findings || '-'),
      prescription_or_advice: sanitizeExcelText(c.prescription_or_advice || '-'),
      follow_up: c.follow_up_needed ? 'Yes' : 'No',
      notes: sanitizeExcelText(c.notes || sess?.campus_notes || '-'),
    });
    styleDataRow(row, idx, columns, 11);
    idx++;
  });

  emptySessions.forEach((sess) => {
    const row = ws.addRow({
      sr: idx + 1,
      visit_date: extractDatePart(sess.visit_date),
      session_time: sanitizeExcelText(sess.session_time || '-'),
      doctor_name: sanitizeExcelText(sess.doctor_name),
      specialization: sanitizeExcelText(sess.specialization || '-'),
      student_name: '— No cases logged yet —',
      section: '-',
      roll_no: '-',
      complaint: '-',
      findings: '-',
      prescription_or_advice: '-',
      follow_up: 'No',
      notes: sanitizeExcelText(sess.campus_notes || '-'),
    });
    styleDataRow(row, idx, columns);
    idx++;
  });
}

function addOpdWorksheet(
  workbook: ExcelJS.Workbook,
  opdRecords: OpdRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const sorted = [...opdRecords].sort((a, b) =>
    (b.referral_datetime || '').localeCompare(a.referral_datetime || '')
  );
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'OPD ID', key: 'opd_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Date', key: 'date', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Time', key: 'time', width: 11, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 24 },
    { header: 'Class', key: 'section', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Hospital / Clinic', key: 'hospital_or_clinic', width: 26 },
    { header: 'Doctor', key: 'doctor_name', width: 20 },
    { header: 'Reason for Referral', key: 'reason', width: 26 },
    { header: 'Escort / Parent', key: 'escort_or_parent', width: 20 },
    { header: 'Diagnosis & Advice', key: 'diagnosis_and_advice', width: 32 },
    { header: 'Follow-up Date', key: 'follow_up_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Status', key: 'status', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'OPD Slip Photo Link', key: 'image_url', width: 32 },
    { header: 'Notes', key: 'notes', width: 24 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'External OPD',
    'External OPD & Hospital Referral Register',
    sorted.length,
    columns
  );

  sorted.forEach((o, idx) => {
    const stu = studentMap.get(o.student_id);
    const row = ws.addRow({
      sr: idx + 1,
      opd_id: sanitizeExcelText(o.opd_id),
      date: extractDatePart(o.referral_datetime),
      time: formatTimeFromDatetime(o.referral_datetime),
      student_name: sanitizeExcelText(o.student_name || stu?.full_name || o.student_id),
      section: sanitizeExcelText(o.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(o.roll_number || stu?.roll_number || '-'),
      hospital_or_clinic: sanitizeExcelText(o.hospital_or_clinic),
      doctor_name: sanitizeExcelText(o.doctor_name || '-'),
      reason: sanitizeExcelText(o.reason),
      escort_or_parent: sanitizeExcelText(o.escort_or_parent || '-'),
      diagnosis_and_advice: sanitizeExcelText(o.diagnosis_and_advice || '-'),
      follow_up_date: o.follow_up_date ? extractDatePart(o.follow_up_date) : '-',
      status: sanitizeExcelText(o.status || 'Referred'),
      image_url: sanitizeExcelText(o.image_url || (o.image_data_url ? 'Attached in App' : '-')),
      notes: sanitizeExcelText(o.notes || '-'),
    });
    styleDataRow(row, idx, columns, 12);
  });
}

function addMedicalCampsWorksheet(
  workbook: ExcelJS.Workbook,
  camps: MedicalCampRecord[],
  screenings: CampScreeningRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const campById = new Map(camps.map((c) => [c.camp_id, c]));
  const sortedScreenings = [...screenings].sort((a, b) => {
    const dA = campById.get(a.camp_id)?.camp_date || a.created_at || '';
    const dB = campById.get(b.camp_id)?.camp_date || b.created_at || '';
    return dB.localeCompare(dA);
  });

  const campsWithScreenings = new Set(sortedScreenings.map((s) => s.camp_id));
  const emptyCamps = [...camps]
    .filter((c) => !campsWithScreenings.has(c.camp_id))
    .sort((a, b) => (b.camp_date || '').localeCompare(a.camp_date || ''));

  const totalRows = sortedScreenings.length + emptyCamps.length;
  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Camp Date', key: 'camp_date', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Camp Title', key: 'camp_title', width: 28 },
    { header: 'Camp Type', key: 'camp_type', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Organizer / Team', key: 'organizer', width: 24 },
    { header: 'Student Name', key: 'student_name', width: 24 },
    { header: 'Class', key: 'section', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Screening Findings', key: 'findings', width: 34 },
    { header: 'Referral Needed', key: 'referral', width: 15, alignment: { horizontal: 'center' as const } },
    { header: 'Notes', key: 'notes', width: 24 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Medical Camps',
    'School Medical Camps & Student Screenings',
    totalRows,
    columns
  );

  let idx = 0;
  sortedScreenings.forEach((sc) => {
    const camp = campById.get(sc.camp_id);
    const stu = studentMap.get(sc.student_id);
    const orgLabel = [camp?.organizer, camp?.doctor_team].filter(Boolean).join(' · ');
    const row = ws.addRow({
      sr: idx + 1,
      camp_date: extractDatePart(camp?.camp_date || sc.created_at),
      camp_title: sanitizeExcelText(camp?.camp_title || sc.camp_id),
      camp_type: sanitizeExcelText(camp?.camp_type || 'General Health'),
      organizer: sanitizeExcelText(orgLabel || '-'),
      student_name: sanitizeExcelText(sc.student_name || stu?.full_name || sc.student_id),
      section: sanitizeExcelText(sc.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(sc.roll_number || stu?.roll_number || '-'),
      findings: sanitizeExcelText(sc.findings),
      referral: sc.referral_needed ? 'Yes' : 'No',
      notes: sanitizeExcelText(sc.notes || '-'),
    });
    styleDataRow(row, idx, columns, 9);
    idx++;
  });

  emptyCamps.forEach((camp) => {
    const orgLabel = [camp.organizer, camp.doctor_team].filter(Boolean).join(' · ');
    const row = ws.addRow({
      sr: idx + 1,
      camp_date: extractDatePart(camp.camp_date),
      camp_title: sanitizeExcelText(camp.camp_title),
      camp_type: sanitizeExcelText(camp.camp_type || 'General Health'),
      organizer: sanitizeExcelText(orgLabel || '-'),
      student_name: '— No screenings logged yet —',
      section: sanitizeExcelText(camp.target_classes || '-'),
      roll_no: '-',
      findings: sanitizeExcelText(camp.summary || '-'),
      referral: 'No',
      notes: '-',
    });
    styleDataRow(row, idx, columns);
    idx++;
  });
}

function addAnnualCheckupsWorksheet(
  workbook: ExcelJS.Workbook,
  checkups: AnnualCheckupRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const sorted = [...checkups].sort((a, b) => {
    const yrCmp = (b.academic_year || '').localeCompare(a.academic_year || '');
    if (yrCmp !== 0) return yrCmp;
    return (b.checkup_date || '').localeCompare(a.checkup_date || '');
  });

  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Checkup ID', key: 'checkup_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Academic Year', key: 'academic_year', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Checkup Date', key: 'checkup_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 26 },
    { header: 'Class', key: 'section', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Height (cm)', key: 'height_cm', width: 12, alignment: { horizontal: 'right' as const } },
    { header: 'Weight (kg)', key: 'weight_kg', width: 12, alignment: { horizontal: 'right' as const } },
    { header: 'BMI', key: 'bmi', width: 10, alignment: { horizontal: 'right' as const } },
    { header: 'Vision (L / R)', key: 'vision', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Dental Status', key: 'dental_status', width: 18 },
    { header: 'ENT Notes', key: 'ent_notes', width: 20 },
    { header: 'Blood Group', key: 'blood_group', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'Hemoglobin', key: 'hemoglobin', width: 13, alignment: { horizontal: 'center' as const } },
    { header: 'General Fitness', key: 'general_fitness', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Parent Referral', key: 'parent_referral', width: 15, alignment: { horizontal: 'center' as const } },
    { header: 'Doctor Remarks', key: 'doctor_remarks', width: 30 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Annual Checkups',
    'Annual Student Physical Health Checkups',
    sorted.length,
    columns
  );

  sorted.forEach((c, idx) => {
    const stu = studentMap.get(c.student_id);
    const bmi = c.bmi ?? calculateBmi(c.height_cm, c.weight_kg);
    const visionStr =
      c.vision_left || c.vision_right
        ? `${c.vision_left || '-'} / ${c.vision_right || '-'}`
        : '-';
    const row = ws.addRow({
      sr: idx + 1,
      checkup_id: sanitizeExcelText(c.checkup_id),
      academic_year: sanitizeExcelText(c.academic_year),
      checkup_date: extractDatePart(c.checkup_date),
      student_name: sanitizeExcelText(c.student_name || stu?.full_name || c.student_id),
      section: sanitizeExcelText(c.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(c.roll_number || stu?.roll_number || '-'),
      height_cm: c.height_cm ?? '',
      weight_kg: c.weight_kg ?? '',
      bmi: bmi ?? '',
      vision: sanitizeExcelText(visionStr),
      dental_status: sanitizeExcelText(c.dental_status || '-'),
      ent_notes: sanitizeExcelText(c.ent_notes || '-'),
      blood_group: sanitizeExcelText(c.blood_group || '-'),
      hemoglobin: sanitizeExcelText(c.hemoglobin || '-'),
      general_fitness: sanitizeExcelText(c.general_fitness || 'Fit'),
      parent_referral: c.parent_referral ? 'Yes' : 'No',
      doctor_remarks: sanitizeExcelText(c.doctor_remarks || '-'),
    });
    styleDataRow(row, idx, columns, 15);
  });
}

function addMenstrualLogWorksheet(
  workbook: ExcelJS.Workbook,
  logs: MenstrualLogRecord[],
  studentMap: Map<string, StudentRecord>
): void {
  const sorted = [...logs].sort((a, b) =>
    (b.cycle_start_date || '').localeCompare(a.cycle_start_date || '')
  );

  const columns = [
    { header: 'Sr No', key: 'sr', width: 8, alignment: { horizontal: 'center' as const } },
    { header: 'Log ID', key: 'menstrual_id', width: 16, alignment: { horizontal: 'center' as const } },
    { header: 'Cycle Start', key: 'cycle_start_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Cycle End', key: 'cycle_end_date', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Student Name', key: 'student_name', width: 26 },
    { header: 'Class', key: 'section', width: 12, alignment: { horizontal: 'center' as const } },
    { header: 'Roll No', key: 'roll_no', width: 10, alignment: { horizontal: 'center' as const } },
    { header: 'Flow / Pain Notes', key: 'flow_or_pain_notes', width: 28 },
    { header: 'Pads Issued', key: 'pads_issued', width: 13, alignment: { horizontal: 'right' as const } },
    { header: 'Irregular Flag', key: 'irregular_flag', width: 14, alignment: { horizontal: 'center' as const } },
    { header: 'Private Clinical Notes', key: 'private_notes', width: 32 },
    { header: 'Recorded By', key: 'recorded_by', width: 20 },
  ];

  const ws = setupStyledSheet(
    workbook,
    'Menstrual Log',
    'CONFIDENTIAL — Private Menstrual Health Register (Nurse & Admin Only)',
    sorted.length,
    columns
  );

  sorted.forEach((m, idx) => {
    const stu = studentMap.get(m.student_id);
    const row = ws.addRow({
      sr: idx + 1,
      menstrual_id: sanitizeExcelText(m.menstrual_id),
      cycle_start_date: extractDatePart(m.cycle_start_date),
      cycle_end_date: m.cycle_end_date ? extractDatePart(m.cycle_end_date) : '-',
      student_name: sanitizeExcelText(m.student_name || stu?.full_name || m.student_id),
      section: sanitizeExcelText(m.section || stu?.section || '-'),
      roll_no: sanitizeExcelText(m.roll_number || stu?.roll_number || '-'),
      flow_or_pain_notes: sanitizeExcelText(m.flow_or_pain_notes || '-'),
      pads_issued: Number(m.pads_issued) || 0,
      irregular_flag: m.irregular_flag ? 'Yes' : 'No',
      private_notes: sanitizeExcelText(m.private_notes || '-'),
      recorded_by: sanitizeExcelText(m.recorded_by || 'School Nurse'),
    });
    styleDataRow(row, idx, columns, 9);
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
    addVisitsWorksheet(workbook, db.visits || [], studentMap, db.settings);
  }
  if (tab === 'Measurements' || tab === 'All') {
    addMeasurementsWorksheet(workbook, db.measurements || [], studentMap);
  }
  if (tab === 'Health Profiles' || tab === 'All') {
    addHealthProfilesWorksheet(workbook, db.healthProfiles || [], studentMap);
  }
  if (tab === 'Medicines' || tab === 'All') {
    addMedicinesWorksheet(workbook, db.medicines || []);
  }
  if (tab === 'Items' || tab === 'All') {
    addItemsWorksheet(workbook, db.items || []);
  }
  if (tab === 'Bills' || tab === 'All') {
    addBillsWorksheet(workbook, db.bills || []);
  }
  if (tab === 'Stock Ledger' || tab === 'All') {
    addStockLedgerWorksheet(workbook, db.stockTransactions || []);
  }
  if (tab === 'Doctor Visits' || tab === 'All') {
    addDoctorVisitsWorksheet(
      workbook,
      db.doctorVisits || [],
      db.doctorVisitCases || [],
      studentMap
    );
  }
  if (tab === 'External OPD' || tab === 'All') {
    addOpdWorksheet(workbook, db.opdRecords || [], studentMap);
  }
  if (tab === 'Medical Camps' || tab === 'All') {
    addMedicalCampsWorksheet(
      workbook,
      db.medicalCamps || [],
      db.campScreenings || [],
      studentMap
    );
  }
  if (tab === 'Annual Checkups' || tab === 'All') {
    addAnnualCheckupsWorksheet(workbook, db.annualCheckups || [], studentMap);
  }
  // Privacy Safeguard: Menstrual Log is strictly excluded from "All" exports and only generated on explicit opt-in
  if (tab === 'Menstrual Log') {
    addMenstrualLogWorksheet(workbook, db.menstrualLogs || [], studentMap);
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
