import type { NurseDatabase } from './nurseLogic';

export const GOOGLE_APPS_SCRIPT_CODE = String.raw`/**
 * SARASWATI VIDYA ACADEMY — SCHOOL INFIRMARY BACKEND (Code.gs)
 * Google Sheets Database + Google Drive Documents + Google Apps Script Backend
 *
 * Spreadsheet Tabs & Exact Columns:
 * 1. Students:
 *    student_id, full_name, section, roll_number, active_status, created_at, updated_at
 * 2. Visits:
 *    visit_id, student_id, student_name, class, roll_no, visit_datetime, shift_period,
 *    shift_overridden, reason, observations, action_taken, medicine_name, dosage,
 *    dosage_unit, route, administration_time, medicine_id, medicine_qty, item_id,
 *    item_name, item_qty, notes, recorded_by, created_at
 * 3. Measurements:
 *    measurement_id, student_id, measurement_date, height_cm, weight_kg, notes, updated_at
 * 4. Health Profiles:
 *    health_record_id, student_id, condition_or_note, status, date_recorded, last_reviewed
 * 5. Users (Staff login accounts — Admin only):
 *    username, password, role, display_name, badge_title, active_status
 * 6. Medicines (Infirmary Medicines Inventory):
 *    medicine_id, name, category, unit, stock_qty, min_stock_threshold, expiry_date,
 *    batch_number, notes, updated_at
 * 7. Items (Infirmary Supplies & Equipment Inventory):
 *    item_id, name, category, unit, stock_qty, min_stock_threshold, location, notes, updated_at
 * 8. Stock Transactions (Inventory Audit Trail):
 *    txn_id, entity_type, entity_id, entity_name, delta, balance_after, reason,
 *    ref_id, recorded_by, created_at
 * 9. Bills (Infirmary Bills & Receipts — links to Google Drive photos):
 *    bill_id, bill_number, vendor_name, bill_date, category, total_amount,
 *    drive_file_id, image_url, notes, recorded_by, created_at
 * 10. Settings (Infirmary Configuration, e.g. School Hours Start & End):
 *    key, value, updated_at
 * 11. Doctor Visits (Weekly Visiting Physician Sessions):
 *    doctor_visit_id, visit_date, session_time, doctor_name, specialization, campus_notes, recorded_by, created_at
 * 12. Doctor Visit Cases (Students Seen During Weekly Doctor Visits):
 *    case_id, doctor_visit_id, student_id, student_name, section, roll_number, complaint, findings,
 *    prescription_or_advice, follow_up_needed, notes, recorded_by, created_at
 * 13. OPD (External Hospital / Clinic Referrals — links to Google Drive OPD slip photos):
 *    opd_id, student_id, student_name, section, roll_number, referral_datetime, hospital_or_clinic,
 *    doctor_name, reason, escort_or_parent, diagnosis_and_advice, follow_up_date, status,
 *    drive_file_id, image_url, notes, recorded_by, created_at
 * 14. Medical Camps (School Health & Screening Camps):
 *    camp_id, camp_title, camp_type, organizer, camp_date, target_classes, doctor_team, summary,
 *    recorded_by, created_at
 * 15. Camp Screenings (Individual Student Screening Findings):
 *    screening_id, camp_id, student_id, student_name, section, roll_number, findings,
 *    referral_needed, notes, recorded_by, created_at
 * 16. Annual Checkups (Yearly Physical Health Checkups per Academic Year):
 *    checkup_id, academic_year, student_id, student_name, section, roll_number, checkup_date,
 *    height_cm, weight_kg, bmi, vision_left, vision_right, dental_status, ent_notes,
 *    blood_group, hemoglobin, general_fitness, parent_referral, doctor_remarks, recorded_by, created_at
 * 17. Menstrual Log (Confidential — Nurse & Admin Only):
 *    menstrual_id, student_id, student_name, section, roll_number, cycle_start_date, cycle_end_date,
 *    flow_or_pain_notes, pads_issued, item_id, item_name, irregular_flag, private_notes, recorded_by, created_at
 *
 * Notes:
 * - Classes use section names ONLY (e.g. Sparkle, Twinkle, Topaz, Sapphire) without grade numbers.
 * - Clinical & operational records are stored in plain readable text.
 * - Bill & OPD slip photos are saved to a Google Drive folder named "SVA Infirmary Documents"
 *   and linked via drive_file_id + image_url in the Bills and OPD tabs.
 */

const DRIVE_DOCS_FOLDER_NAME = 'SVA Infirmary Documents';

const SHEET_SCHEMAS = {
  'Students': [
    'student_id', 'full_name', 'section', 'roll_number',
    'active_status', 'created_at', 'updated_at'
  ],
  'Visits': [
    'visit_id', 'student_id', 'student_name', 'class', 'roll_no',
    'visit_datetime', 'shift_period', 'shift_overridden', 'reason', 'observations',
    'action_taken', 'medicine_name', 'dosage', 'dosage_unit', 'route',
    'administration_time', 'medicine_id', 'medicine_qty', 'item_id', 'item_name',
    'item_qty', 'notes', 'recorded_by', 'created_at'
  ],
  'Measurements': [
    'measurement_id', 'student_id', 'measurement_date',
    'height_cm', 'weight_kg', 'notes', 'updated_at'
  ],
  'Health Profiles': [
    'health_record_id', 'student_id', 'condition_or_note',
    'status', 'date_recorded', 'last_reviewed'
  ],
  'Users': [
    'username', 'password', 'role', 'display_name', 'badge_title', 'active_status'
  ],
  'Medicines': [
    'medicine_id', 'name', 'category', 'form_strength', 'unit',
    'batch_number', 'expiry_date', 'current_stock', 'min_stock_alert', 'notes', 'updated_at'
  ],
  'Items': [
    'item_id', 'name', 'category', 'unit', 'current_stock',
    'min_stock_alert', 'notes', 'updated_at'
  ],
  'Stock Transactions': [
    'txn_id', 'target_type', 'target_id', 'target_name', 'change_qty',
    'balance_after', 'reason', 'reference_id', 'notes', 'recorded_by', 'created_at'
  ],
  'Bills': [
    'bill_id', 'bill_number', 'vendor_name', 'bill_date', 'category',
    'total_amount', 'drive_file_id', 'image_url',
    'notes', 'recorded_by', 'created_at'
  ],
  'Settings': [
    'key', 'value', 'updated_at'
  ],
  'Doctor Visits': [
    'doctor_visit_id', 'visit_date', 'session_time', 'doctor_name',
    'specialization', 'campus_notes', 'recorded_by', 'created_at'
  ],
  'Doctor Visit Cases': [
    'case_id', 'doctor_visit_id', 'student_id', 'student_name', 'section', 'roll_number',
    'complaint', 'findings', 'prescription_or_advice', 'follow_up_needed',
    'notes', 'recorded_by', 'created_at'
  ],
  'OPD': [
    'opd_id', 'student_id', 'student_name', 'section', 'roll_number',
    'referral_datetime', 'hospital_or_clinic', 'doctor_name', 'reason',
    'escort_or_parent', 'diagnosis_and_advice', 'follow_up_date', 'status',
    'drive_file_id', 'image_url', 'notes', 'recorded_by', 'created_at'
  ],
  'Medical Camps': [
    'camp_id', 'camp_title', 'camp_type', 'organizer', 'camp_date',
    'target_classes', 'doctor_team', 'summary', 'recorded_by', 'created_at'
  ],
  'Camp Screenings': [
    'screening_id', 'camp_id', 'student_id', 'student_name', 'section', 'roll_number',
    'findings', 'referral_needed', 'notes', 'recorded_by', 'created_at'
  ],
  'Annual Checkups': [
    'checkup_id', 'academic_year', 'student_id', 'student_name', 'section', 'roll_number',
    'checkup_date', 'height_cm', 'weight_kg', 'bmi', 'vision_left', 'vision_right',
    'dental_status', 'ent_notes', 'blood_group', 'hemoglobin', 'general_fitness',
    'parent_referral', 'doctor_remarks', 'recorded_by', 'created_at'
  ],
  'Menstrual Log': [
    'menstrual_id', 'student_id', 'student_name', 'section', 'roll_number',
    'cycle_start_date', 'cycle_end_date', 'flow_or_pain_notes', 'pads_issued',
    'item_id', 'item_name', 'irregular_flag', 'private_notes', 'recorded_by', 'created_at'
  ]
};

/**
 * Run this function once in the Apps Script Editor to create and format all 17 tabs
 * and authorize Google Drive access for bill & OPD slip photo uploads.
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_SCHEMAS).forEach(function(tabName) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    const headers = SHEET_SCHEMAS[tabName];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
  return { status: 'ok', message: 'All 17 Infirmary tabs initialized.' };
}

/**
 * GET endpoint: returns all records from all Infirmary tabs.
 * Automatically backfills student IDs and ensures Visits columns are up to date.
 */
function doGet(e) {
  try {
    setupSpreadsheet();
    ensureStudentIdsInSheet();
    ensureVisitColumnsInSheet();
    const data = {
      status: 'ok',
      students: readSheetObjects('Students'),
      visits: readSheetObjects('Visits'),
      measurements: readSheetObjects('Measurements'),
      healthProfiles: readSheetObjects('Health Profiles'),
      users: readSheetObjects('Users'),
      medicines: readSheetObjects('Medicines'),
      items: readSheetObjects('Items'),
      stockTransactions: readSheetObjects('Stock Transactions'),
      bills: readSheetObjects('Bills'),
      doctorVisits: readSheetObjects('Doctor Visits'),
      doctorVisitCases: readSheetObjects('Doctor Visit Cases'),
      opdRecords: readSheetObjects('OPD'),
      medicalCamps: readSheetObjects('Medical Camps'),
      campScreenings: readSheetObjects('Camp Screenings'),
      annualCheckups: readSheetObjects('Annual Checkups'),
      menstrualLogs: readSheetObjects('Menstrual Log'),
      settings: readSettingsObject()
    };
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonError(err.message || 'Failed to read spreadsheet');
  }
}

function readSettingsObject() {
  const rows = readSheetObjects('Settings');
  const map = {};
  rows.forEach(function(r) {
    const k = String(r.key || '').trim();
    if (k) {
      map[k] = String(r.value || '').trim();
      if (r.updated_at && (!map.updated_at || String(r.updated_at) > map.updated_at)) {
        map.updated_at = String(r.updated_at);
      }
    }
  });
  return {
    school_hours_start: map.school_hours_start || '07:30',
    school_hours_end: map.school_hours_end || '15:30',
    updated_at: map.updated_at || ''
  };
}

function upsertSettingKey(key, value, updatedAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) return;
  const ts = updatedAt || new Date().toISOString();
  if (sheet.getLastRow() >= 2) {
    const range = sheet.getDataRange();
    const values = range.getValues();
    const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
    const keyIdx = headers.indexOf('key');
    const valIdx = headers.indexOf('value');
    const updIdx = headers.indexOf('updated_at');
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][keyIdx] || '').trim() === key) {
        if (valIdx !== -1) values[r][valIdx] = value;
        if (updIdx !== -1) values[r][updIdx] = ts;
        range.setValues(values);
        return;
      }
    }
  }
  appendRowBySchema('Settings', { key: key, value: value, updated_at: ts });
}

/**
 * Automatically backfills missing student_id, section, roll_number, and active_status
 * when a teacher or staff member pastes student names directly into the Students tab.
 */
function ensureStudentIdsInSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Students');
  if (!sheet || sheet.getLastRow() < 2) return;
  const range = sheet.getDataRange();
  const values = range.getValues();
  const headers = values[0];
  const idIdx = headers.indexOf('student_id');
  const nameIdx = headers.indexOf('full_name');
  const secIdx = headers.indexOf('section');
  const rollIdx = headers.indexOf('roll_number');
  const statusIdx = headers.indexOf('active_status');
  const createdIdx = headers.indexOf('created_at');
  const updatedIdx = headers.indexOf('updated_at');
  if (idIdx === -1 || nameIdx === -1) return;

  let maxSeq = 0;
  for (let r = 1; r < values.length; r++) {
    const rawId = String(values[r][idIdx] || '').trim();
    const m = rawId.match(/^STU-\d{4}-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  let modified = false;
  const nowIso = new Date().toISOString();
  for (let r = 1; r < values.length; r++) {
    const nameVal = String(values[r][nameIdx] || '').trim();
    if (!nameVal) continue;
    if (!String(values[r][idIdx] || '').trim()) {
      maxSeq++;
      const seqStr = ('0000' + maxSeq).slice(-4);
      values[r][idIdx] = 'STU-2026-' + seqStr;
      modified = true;
    }
    if (secIdx !== -1) {
      const rawSec = String(values[r][secIdx] || '').trim();
      const cleanedSec = sanitizeSectionNameOnly(rawSec);
      if (!cleanedSec) {
        values[r][secIdx] = 'Sparkle';
        modified = true;
      } else if (cleanedSec !== rawSec) {
        values[r][secIdx] = cleanedSec;
        modified = true;
      }
    }
    if (rollIdx !== -1 && !String(values[r][rollIdx] || '').trim()) {
      values[r][rollIdx] = ('0' + r).slice(-2);
      modified = true;
    }
    if (statusIdx !== -1 && !String(values[r][statusIdx] || '').trim()) {
      values[r][statusIdx] = 'Active';
      modified = true;
    }
    if (createdIdx !== -1 && !String(values[r][createdIdx] || '').trim()) {
      values[r][createdIdx] = nowIso;
      modified = true;
    }
    if (updatedIdx !== -1 && !String(values[r][updatedIdx] || '').trim()) {
      values[r][updatedIdx] = nowIso;
      modified = true;
    }
  }

  if (modified) {
    range.setValues(values);
  }
}

/**
 * Normalizes class section names so grade numbers are never stored (section name only).
 */
function sanitizeSectionNameOnly(raw) {
  let cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  cleaned = cleaned
    .replace(/\b(?:class|grade|std|standard)\b/gi, ' ')
    .replace(/\b\d+(?:st|nd|rd|th)?\b/gi, ' ')
    .replace(/[•·\-_/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map(function(part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Automatically upgrades existing Visits sheet with student_name/class/roll_no
 * and appends any newly added Phase 1 columns (shift_period, inventory linkage) safely.
 */
function ensureVisitColumnsInSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Visits');
  if (!sheet || sheet.getLastRow() < 1) return;

  let lastCol = Math.max(1, sheet.getLastColumn());
  let headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let headersLower = headerRow.map(function(h) {
    return String(h || '').trim().toLowerCase();
  });

  const hasName = headersLower.indexOf('student_name') !== -1 ||
    headersLower.indexOf('student name') !== -1 ||
    headersLower.indexOf('full_name') !== -1;
  const hasClass = headersLower.indexOf('class') !== -1 ||
    headersLower.indexOf('section') !== -1;
  const hasRoll = headersLower.indexOf('roll_no') !== -1 ||
    headersLower.indexOf('roll no') !== -1 ||
    headersLower.indexOf('roll_number') !== -1 ||
    headersLower.indexOf('roll no.') !== -1;

  if (!hasName || !hasClass || !hasRoll) {
    const stuIdIdx = headersLower.indexOf('student_id');
    const insertAfterCol = stuIdIdx !== -1 ? stuIdIdx + 1 : 2;

    sheet.insertColumnsAfter(insertAfterCol, 3);
    sheet.getRange(1, insertAfterCol + 1, 1, 3).setValues([['student_name', 'class', 'roll_no']]);
    sheet.getRange(1, insertAfterCol + 1, 1, 3).setFontWeight('bold');

    const studentsSheet = ss.getSheetByName('Students');
    if (studentsSheet && studentsSheet.getLastRow() >= 2 && sheet.getLastRow() >= 2) {
      const stuValues = studentsSheet.getDataRange().getValues();
      const sHeaders = stuValues[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
      const sIdIdx = sHeaders.indexOf('student_id');
      const sNameIdx = sHeaders.indexOf('full_name') !== -1 ? sHeaders.indexOf('full_name') : sHeaders.indexOf('student_name');
      const sSecIdx = sHeaders.indexOf('section') !== -1 ? sHeaders.indexOf('section') : sHeaders.indexOf('class');
      const sRollIdx = sHeaders.indexOf('roll_number') !== -1 ? sHeaders.indexOf('roll_number') : sHeaders.indexOf('roll_no');

      const studentMap = {};
      for (let i = 1; i < stuValues.length; i++) {
        const sid = String(stuValues[i][sIdIdx] || '').trim();
        if (sid) {
          studentMap[sid] = {
            name: String(stuValues[i][sNameIdx] || ''),
            sec: String(stuValues[i][sSecIdx] || ''),
            roll: String(stuValues[i][sRollIdx] || '')
          };
        }
      }

      const numRows = sheet.getLastRow() - 1;
      const idColValues = sheet.getRange(2, stuIdIdx + 1, numRows, 1).getValues();
      const backfillData = [];
      for (let r = 0; r < numRows; r++) {
        const sid = String(idColValues[r][0] || '').trim();
        const sInfo = studentMap[sid] || { name: '', sec: '', roll: '' };
        backfillData.push([sInfo.name, sInfo.sec, sInfo.roll]);
      }
      sheet.getRange(2, insertAfterCol + 1, numRows, 3).setValues(backfillData);
    }

    lastCol = Math.max(1, sheet.getLastColumn());
    headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    headersLower = headerRow.map(function(h) {
      return String(h || '').trim().toLowerCase();
    });
  }

  // Safely append any missing Phase 1 optional columns at the right end of Visits
  const extraVisitCols = [
    'shift_period', 'shift_overridden', 'medicine_id', 'medicine_qty',
    'item_id', 'item_name', 'item_qty'
  ];
  const missingCols = extraVisitCols.filter(function(col) {
    return headersLower.indexOf(col) === -1;
  });
  if (missingCols.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missingCols.length).setValues([missingCols]);
    sheet.getRange(1, lastCol + 1, 1, missingCols.length).setFontWeight('bold');
  }
}

/**
 * Looks up student details from the Students sheet by student_id.
 */
function lookupStudentInfo(studentId) {
  if (!studentId) return { name: '', sec: '', roll: '' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Students');
  if (!sheet || sheet.getLastRow() < 2) return { name: '', sec: '', roll: '' };

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  const idIdx = headers.indexOf('student_id');
  const nameIdx = headers.indexOf('full_name') !== -1 ? headers.indexOf('full_name') : headers.indexOf('student_name');
  const secIdx = headers.indexOf('section') !== -1 ? headers.indexOf('section') : headers.indexOf('class');
  const rollIdx = headers.indexOf('roll_number') !== -1 ? headers.indexOf('roll_number') : headers.indexOf('roll_no');

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIdx] || '').trim() === String(studentId).trim()) {
      return {
        name: String(values[r][nameIdx] || ''),
        sec: String(values[r][secIdx] || ''),
        roll: String(values[r][rollIdx] || '')
      };
    }
  }
  return { name: '', sec: '', roll: '' };
}

/**
 * Gets or creates the Google Drive folder used for storing uploaded bill/OPD photos.
 */
function getOrCreateDocumentsFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_DOCS_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(DRIVE_DOCS_FOLDER_NAME);
}

/**
 * Upserts a single record by primary ID column on any sheet tab.
 */
function upsertRowById(tabName, idField, recordObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet || !recordObj || !recordObj[idField]) return false;

  const targetId = String(recordObj[idField]).trim();
  if (sheet.getLastRow() >= 2) {
    const range = sheet.getDataRange();
    const values = range.getValues();
    const headers = values[0];
    const headersLower = headers.map(function(h) {
      return String(h || '').trim().toLowerCase().replace(/[\s._-]+/g, '_');
    });
    const idIdx = headersLower.indexOf(idField);
    if (idIdx !== -1) {
      for (let r = 1; r < values.length; r++) {
        if (String(values[r][idIdx] || '').trim() === targetId) {
          for (let c = 0; c < headers.length; c++) {
            const rawKey = String(headers[c] || '').trim();
            const key = headersLower[c];
            if (recordObj[rawKey] !== undefined && recordObj[rawKey] !== null) {
              values[r][c] = recordObj[rawKey];
            } else if (recordObj[key] !== undefined && recordObj[key] !== null) {
              values[r][c] = recordObj[key];
            }
          }
          range.setValues(values);
          return true;
        }
      }
    }
  }
  appendRowBySchema(tabName, recordObj);
  return false;
}

/**
 * Deletes matching row(s) by primary ID column on any sheet tab.
 */
function deleteRowById(tabName, idField, targetIdVal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  const targetId = String(targetIdVal || '').trim();
  if (!sheet || !targetId || sheet.getLastRow() < 2) return false;
  const values = sheet.getDataRange().getValues();
  const headersLower = values[0].map(function(h) {
    return String(h || '').trim().toLowerCase().replace(/[\s._-]+/g, '_');
  });
  const idIdx = headersLower.indexOf(idField);
  if (idIdx === -1) return false;
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idIdx] || '').trim() === targetId) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

/**
 * Deletes ALL matching rows by a foreign-key or field column (used for cascade deletes).
 */
function deleteRowsByField(tabName, fieldName, targetVal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  const target = String(targetVal || '').trim();
  if (!sheet || !target || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getValues();
  const headersLower = values[0].map(function(h) {
    return String(h || '').trim().toLowerCase().replace(/[\s._-]+/g, '_');
  });
  const colIdx = headersLower.indexOf(fieldName);
  if (colIdx === -1) return 0;
  let removed = 0;
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][colIdx] || '').trim() === target) {
      sheet.deleteRow(r + 1);
      removed++;
    }
  }
  return removed;
}

/**
 * POST endpoint: handles clinical, inventory, bills, settings, Drive upload, and backup sync actions.
 * Uses LockService to safely handle simultaneous submissions without overwriting rows.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    setupSpreadsheet();
    ensureVisitColumnsInSheet();

    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action;

    if (action === 'createVisit') {
      const v = payload.visit;
      if (!v || !v.visit_id || !v.student_id || !v.visit_datetime || !v.reason || !v.action_taken) {
        return jsonError('Missing required visit fields on server validation.');
      }
      const existingVisits = readSheetObjects('Visits');
      const duplicate = existingVisits.some(function(row) {
        return String(row.visit_id) === String(v.visit_id);
      });
      if (duplicate) {
        return jsonSuccess({ visit_id: v.visit_id, deduplicated: true });
      }

      if (!v.student_name || !v.class || !v.roll_no) {
        const sInfo = lookupStudentInfo(v.student_id);
        if (!v.student_name) v.student_name = sInfo.name;
        if (!v.full_name) v.full_name = sInfo.name;
        if (!v.class) v.class = sInfo.sec;
        if (!v.section) v.section = sInfo.sec;
        if (!v.roll_no) v.roll_no = sInfo.roll;
        if (!v.roll_number) v.roll_number = sInfo.roll;
      }

      appendRowBySchema('Visits', v);
      return jsonSuccess({ visit_id: v.visit_id });
    }

    if (action === 'addMeasurement') {
      const m = payload.measurement;
      if (!m || !m.measurement_id || !m.student_id || !m.measurement_date) {
        return jsonError('Missing required measurement fields.');
      }
      appendRowBySchema('Measurements', m);
      return jsonSuccess({ measurement_id: m.measurement_id });
    }

    if (action === 'addHealthProfile') {
      const h = payload.healthProfile;
      if (!h || !h.health_record_id || !h.student_id || !h.condition_or_note) {
        return jsonError('Missing required health profile fields.');
      }
      appendRowBySchema('Health Profiles', h);
      return jsonSuccess({ health_record_id: h.health_record_id });
    }

    if (action === 'createStudent') {
      const s = payload.student;
      if (!s || !s.student_id || !s.full_name || !s.section || !s.roll_number) {
        return jsonError('Missing required student fields.');
      }
      s.section = sanitizeSectionNameOnly(s.section) || String(s.section).trim();
      appendRowBySchema('Students', s);
      return jsonSuccess({ student_id: s.student_id });
    }

    if (action === 'updateStudent') {
      const s = payload.student;
      if (!s || !s.student_id) {
        return jsonError('Missing student_id for update.');
      }
      const cleanSection = sanitizeSectionNameOnly(s.section) || String(s.section || '').trim();
      s.section = cleanSection;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('Students');
      let updatedExisting = false;
      if (sheet && sheet.getLastRow() >= 2) {
        const range = sheet.getDataRange();
        const values = range.getValues();
        const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const idIdx = headers.indexOf('student_id');
        for (let r = 1; r < values.length; r++) {
          if (String(values[r][idIdx] || '').trim() === String(s.student_id).trim()) {
            const setIfExists = function(colName, val) {
              const idx = headers.indexOf(colName);
              if (idx !== -1 && val !== undefined) values[r][idx] = val;
            };
            setIfExists('full_name', s.full_name);
            setIfExists('section', cleanSection);
            setIfExists('roll_number', s.roll_number);
            setIfExists('active_status', s.active_status || 'Active');
            setIfExists('updated_at', s.updated_at || new Date().toISOString());
            range.setValues(values);
            updatedExisting = true;
            break;
          }
        }
      }
      if (!updatedExisting) {
        appendRowBySchema('Students', s);
      }

      const visitsSheet = ss.getSheetByName('Visits');
      if (visitsSheet && visitsSheet.getLastRow() >= 2) {
        const vRange = visitsSheet.getDataRange();
        const vValues = vRange.getValues();
        const vHeaders = vValues[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const vStuIdIdx = vHeaders.indexOf('student_id');
        const vNameIdx = vHeaders.indexOf('student_name') !== -1 ? vHeaders.indexOf('student_name') : vHeaders.indexOf('full_name');
        const vClassIdx = vHeaders.indexOf('class') !== -1 ? vHeaders.indexOf('class') : vHeaders.indexOf('section');
        const vRollIdx = vHeaders.indexOf('roll_no') !== -1 ? vHeaders.indexOf('roll_no') : vHeaders.indexOf('roll_number');
        if (vStuIdIdx !== -1) {
          let visitsModified = false;
          for (let r = 1; r < vValues.length; r++) {
            if (String(vValues[r][vStuIdIdx] || '').trim() === String(s.student_id).trim()) {
              if (vNameIdx !== -1 && s.full_name) { vValues[r][vNameIdx] = s.full_name; visitsModified = true; }
              if (vClassIdx !== -1 && cleanSection) { vValues[r][vClassIdx] = cleanSection; visitsModified = true; }
              if (vRollIdx !== -1 && s.roll_number) { vValues[r][vRollIdx] = s.roll_number; visitsModified = true; }
            }
          }
          if (visitsModified) vRange.setValues(vValues);
        }
      }

      return jsonSuccess({ student_id: s.student_id, updated: updatedExisting, created: !updatedExisting });
    }

    if (action === 'renameClass') {
      const oldName = String(payload.oldName || '').trim().toLowerCase();
      const newName = sanitizeSectionNameOnly(payload.newName) || String(payload.newName || '').trim();
      if (!oldName || !newName) {
        return jsonError('Missing class names for rename.');
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('Students');
      if (sheet && sheet.getLastRow() >= 2) {
        const range = sheet.getDataRange();
        const values = range.getValues();
        const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const secIdx = headers.indexOf('section');
        if (secIdx !== -1) {
          let changed = false;
          for (let r = 1; r < values.length; r++) {
            if (String(values[r][secIdx] || '').trim().toLowerCase() === oldName) {
              values[r][secIdx] = newName;
              changed = true;
            }
          }
          if (changed) range.setValues(values);
        }
      }

      const visitsSheet = ss.getSheetByName('Visits');
      if (visitsSheet && visitsSheet.getLastRow() >= 2) {
        const vRange = visitsSheet.getDataRange();
        const vValues = vRange.getValues();
        const vHeaders = vValues[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const vClassIdx = vHeaders.indexOf('class') !== -1 ? vHeaders.indexOf('class') : vHeaders.indexOf('section');
        if (vClassIdx !== -1) {
          let vChanged = false;
          for (let r = 1; r < vValues.length; r++) {
            if (String(vValues[r][vClassIdx] || '').trim().toLowerCase() === oldName) {
              vValues[r][vClassIdx] = newName;
              vChanged = true;
            }
          }
          if (vChanged) vRange.setValues(vValues);
        }
      }

      return jsonSuccess({ renamed: true, newName: newName });
    }

    if (action === 'upsertUser') {
      const u = payload.user;
      if (!u || !u.username || !u.password) {
        return jsonError('Missing username or password.');
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('Users');
      if (sheet && sheet.getLastRow() >= 2) {
        const range = sheet.getDataRange();
        const values = range.getValues();
        const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const userIdx = headers.indexOf('username');
        for (let r = 1; r < values.length; r++) {
          if (String(values[r][userIdx] || '').trim().toLowerCase() === String(u.username).trim().toLowerCase()) {
            const setIfExists = function(colName, val) {
              const idx = headers.indexOf(colName);
              if (idx !== -1 && val !== undefined) values[r][idx] = val;
            };
            setIfExists('password', u.password);
            setIfExists('role', u.role || 'warden');
            setIfExists('display_name', u.display_name || '');
            setIfExists('badge_title', u.badge_title || '');
            setIfExists('active_status', u.active_status || 'Active');
            range.setValues(values);
            return jsonSuccess({ username: u.username, updated: true });
          }
        }
      }
      appendRowBySchema('Users', u);
      return jsonSuccess({ username: u.username, created: true });
    }

    if (action === 'deleteUser') {
      const targetUsername = String(payload.username || '').trim().toLowerCase();
      if (!targetUsername) {
        return jsonError('Missing username for deletion.');
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('Users');
      if (sheet && sheet.getLastRow() >= 2) {
        const values = sheet.getDataRange().getValues();
        const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const userIdx = headers.indexOf('username');
        for (let r = values.length - 1; r >= 1; r--) {
          if (String(values[r][userIdx] || '').trim().toLowerCase() === targetUsername) {
            sheet.deleteRow(r + 1);
            return jsonSuccess({ username: targetUsername, deleted: true });
          }
        }
      }
      return jsonSuccess({ username: targetUsername, deleted: false });
    }

    // ---- PHASE 1: SETTINGS, INVENTORY & BILLS + GOOGLE DRIVE UPLOAD ----
    if (action === 'updateSettings') {
      const settings = payload.settings || {};
      const ts = settings.updated_at || new Date().toISOString();
      if (settings.school_hours_start) {
        upsertSettingKey('school_hours_start', String(settings.school_hours_start), ts);
      }
      if (settings.school_hours_end) {
        upsertSettingKey('school_hours_end', String(settings.school_hours_end), ts);
      }
      return jsonSuccess({ settings: readSettingsObject() });
    }

    if (action === 'upsertMedicine') {
      const med = payload.medicine;
      if (!med || !med.medicine_id || !med.name) {
        return jsonError('Missing required medicine fields.');
      }
      const updated = upsertRowById('Medicines', 'medicine_id', med);
      return jsonSuccess({ medicine_id: med.medicine_id, updated: updated });
    }

    if (action === 'deleteMedicine') {
      const deleted = deleteRowById('Medicines', 'medicine_id', payload.medicine_id);
      return jsonSuccess({ medicine_id: payload.medicine_id, deleted: deleted });
    }

    if (action === 'upsertItem') {
      const item = payload.item;
      if (!item || !item.item_id || !item.name) {
        return jsonError('Missing required item fields.');
      }
      const updated = upsertRowById('Items', 'item_id', item);
      return jsonSuccess({ item_id: item.item_id, updated: updated });
    }

    if (action === 'deleteItem') {
      const deleted = deleteRowById('Items', 'item_id', payload.item_id);
      return jsonSuccess({ item_id: payload.item_id, deleted: deleted });
    }

    if (action === 'addStockTransaction') {
      const txn = payload.transaction;
      if (!txn || !txn.txn_id || !txn.target_id) {
        return jsonError('Missing required stock transaction fields.');
      }
      appendRowBySchema('Stock Transactions', txn);
      return jsonSuccess({ txn_id: txn.txn_id });
    }

    if (action === 'uploadBillImage') {
      let mimeType = String(payload.mimeType || 'image/jpeg').trim();
      let base64Body = String(payload.base64Data || '').trim();
      if (!base64Body && payload.image_data_url) {
        const rawDataUrl = String(payload.image_data_url || '').trim();
        const match = rawDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Body = match[2];
        } else {
          base64Body = rawDataUrl;
        }
      }
      if (!base64Body) {
        return jsonError('Missing base64Data or image_data_url for upload.');
      }
      const ext = mimeType.indexOf('png') !== -1 ? 'png' : 'jpg';
      const safeName = String(payload.filename || ('bill_' + new Date().getTime() + '.' + ext))
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      const bytes = Utilities.base64Decode(base64Body);
      const blob = Utilities.newBlob(bytes, mimeType, safeName);
      const folder = getOrCreateDocumentsFolder();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      const viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
      return jsonSuccess({
        drive_file_id: fileId,
        image_url: viewUrl,
        web_view_url: file.getUrl()
      });
    }

    if (action === 'upsertBill') {
      const bill = payload.bill;
      if (!bill || !bill.bill_id || !bill.vendor_name) {
        return jsonError('Missing required bill fields.');
      }
      const updated = upsertRowById('Bills', 'bill_id', bill);
      return jsonSuccess({ bill_id: bill.bill_id, updated: updated });
    }

    if (action === 'deleteBill') {
      const deleted = deleteRowById('Bills', 'bill_id', payload.bill_id);
      return jsonSuccess({ bill_id: payload.bill_id, deleted: deleted });
    }

    // ---- PHASE 2: WEEKLY DOCTOR VISITS, EXTERNAL OPD & MEDICAL CAMPS ----
    if (action === 'upsertDoctorVisit') {
      const sess = payload.doctorVisit;
      if (!sess || !sess.doctor_visit_id || !sess.doctor_name) {
        return jsonError('Missing required doctor visit fields.');
      }
      const updated = upsertRowById('Doctor Visits', 'doctor_visit_id', sess);
      return jsonSuccess({ doctor_visit_id: sess.doctor_visit_id, updated: updated });
    }

    if (action === 'deleteDoctorVisit') {
      const deleted = deleteRowById('Doctor Visits', 'doctor_visit_id', payload.doctor_visit_id);
      const removedCases = deleteRowsByField('Doctor Visit Cases', 'doctor_visit_id', payload.doctor_visit_id);
      return jsonSuccess({ doctor_visit_id: payload.doctor_visit_id, deleted: deleted, removedCases: removedCases });
    }

    if (action === 'upsertDoctorVisitCase') {
      const c = payload.doctorVisitCase;
      if (!c || !c.case_id || !c.doctor_visit_id || !c.student_id) {
        return jsonError('Missing required doctor visit case fields.');
      }
      const updated = upsertRowById('Doctor Visit Cases', 'case_id', c);
      return jsonSuccess({ case_id: c.case_id, updated: updated });
    }

    if (action === 'deleteDoctorVisitCase') {
      const deleted = deleteRowById('Doctor Visit Cases', 'case_id', payload.case_id);
      return jsonSuccess({ case_id: payload.case_id, deleted: deleted });
    }

    if (action === 'uploadOpdImage') {
      let mimeType = String(payload.mimeType || 'image/jpeg').trim();
      let base64Body = String(payload.base64Data || '').trim();
      if (!base64Body && payload.image_data_url) {
        const rawDataUrl = String(payload.image_data_url || '').trim();
        const match = rawDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Body = match[2];
        } else {
          base64Body = rawDataUrl;
        }
      }
      if (!base64Body) {
        return jsonError('Missing base64Data or image_data_url for OPD slip upload.');
      }
      const ext = mimeType.indexOf('png') !== -1 ? 'png' : 'jpg';
      const safeName = String(payload.filename || ('opd_slip_' + new Date().getTime() + '.' + ext))
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      const bytes = Utilities.base64Decode(base64Body);
      const blob = Utilities.newBlob(bytes, mimeType, safeName);
      const folder = getOrCreateDocumentsFolder();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      const viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
      return jsonSuccess({
        drive_file_id: fileId,
        image_url: viewUrl,
        web_view_url: file.getUrl()
      });
    }

    if (action === 'upsertOpd') {
      const opd = payload.opd;
      if (!opd || !opd.opd_id || !opd.student_id || !opd.hospital_or_clinic) {
        return jsonError('Missing required OPD fields.');
      }
      const updated = upsertRowById('OPD', 'opd_id', opd);
      return jsonSuccess({ opd_id: opd.opd_id, updated: updated });
    }

    if (action === 'deleteOpd') {
      const deleted = deleteRowById('OPD', 'opd_id', payload.opd_id);
      return jsonSuccess({ opd_id: payload.opd_id, deleted: deleted });
    }

    if (action === 'upsertMedicalCamp') {
      const camp = payload.medicalCamp;
      if (!camp || !camp.camp_id || !camp.camp_title) {
        return jsonError('Missing required medical camp fields.');
      }
      const updated = upsertRowById('Medical Camps', 'camp_id', camp);
      return jsonSuccess({ camp_id: camp.camp_id, updated: updated });
    }

    if (action === 'deleteMedicalCamp') {
      const deleted = deleteRowById('Medical Camps', 'camp_id', payload.camp_id);
      const removedScreenings = deleteRowsByField('Camp Screenings', 'camp_id', payload.camp_id);
      return jsonSuccess({ camp_id: payload.camp_id, deleted: deleted, removedScreenings: removedScreenings });
    }

    if (action === 'upsertCampScreening') {
      const screening = payload.campScreening;
      if (!screening || !screening.screening_id || !screening.camp_id || !screening.student_id) {
        return jsonError('Missing required camp screening fields.');
      }
      const updated = upsertRowById('Camp Screenings', 'screening_id', screening);
      return jsonSuccess({ screening_id: screening.screening_id, updated: updated });
    }

    if (action === 'deleteCampScreening') {
      const deleted = deleteRowById('Camp Screenings', 'screening_id', payload.screening_id);
      return jsonSuccess({ screening_id: payload.screening_id, deleted: deleted });
    }

    // ---- PHASE 3: ANNUAL HEALTH CHECKUPS & PRIVATE MENSTRUAL LOG ----
    if (action === 'upsertAnnualCheckup') {
      const checkup = payload.annualCheckup;
      if (!checkup || !checkup.checkup_id || !checkup.student_id) {
        return jsonError('Missing required annual checkup fields.');
      }
      const updated = upsertRowById('Annual Checkups', 'checkup_id', checkup);
      return jsonSuccess({ checkup_id: checkup.checkup_id, updated: updated });
    }

    if (action === 'deleteAnnualCheckup') {
      const deleted = deleteRowById('Annual Checkups', 'checkup_id', payload.checkup_id);
      return jsonSuccess({ checkup_id: payload.checkup_id, deleted: deleted });
    }

    if (action === 'upsertMenstrualLog') {
      const log = payload.menstrualLog;
      if (!log || !log.menstrual_id || !log.student_id) {
        return jsonError('Missing required menstrual log fields.');
      }
      const updated = upsertRowById('Menstrual Log', 'menstrual_id', log);
      return jsonSuccess({ menstrual_id: log.menstrual_id, updated: updated });
    }

    if (action === 'deleteMenstrualLog') {
      const deleted = deleteRowById('Menstrual Log', 'menstrual_id', payload.menstrual_id);
      return jsonSuccess({ menstrual_id: payload.menstrual_id, deleted: deleted });
    }

    if (action === 'syncStudentsBatch') {
      const students = payload.students;
      if (!Array.isArray(students) || students.length === 0) {
        return jsonError('No students array provided.');
      }
      const addedCount = batchAppendUniqueRows('Students', 'student_id', students);
      return jsonSuccess({ added: addedCount });
    }

    if (action === 'syncFullDatabase') {
      const db = payload.db || {};
      const addedStudents = Array.isArray(db.students)
        ? batchAppendUniqueRows('Students', 'student_id', db.students)
        : 0;
      const addedVisits = Array.isArray(db.visits)
        ? batchAppendUniqueRows('Visits', 'visit_id', db.visits)
        : 0;
      const addedMeasurements = Array.isArray(db.measurements)
        ? batchAppendUniqueRows('Measurements', 'measurement_id', db.measurements)
        : 0;
      const addedProfiles = Array.isArray(db.healthProfiles)
        ? batchAppendUniqueRows('Health Profiles', 'health_record_id', db.healthProfiles)
        : 0;
      const addedUsers = Array.isArray(db.users)
        ? batchAppendUniqueRows('Users', 'username', db.users)
        : 0;
      const addedMedicines = Array.isArray(db.medicines)
        ? batchAppendUniqueRows('Medicines', 'medicine_id', db.medicines)
        : 0;
      const addedItems = Array.isArray(db.items)
        ? batchAppendUniqueRows('Items', 'item_id', db.items)
        : 0;
      const addedStockTransactions = Array.isArray(db.stockTransactions)
        ? batchAppendUniqueRows('Stock Transactions', 'txn_id', db.stockTransactions)
        : 0;
      const addedBills = Array.isArray(db.bills)
        ? batchAppendUniqueRows('Bills', 'bill_id', db.bills)
        : 0;
      const addedDoctorVisits = Array.isArray(db.doctorVisits)
        ? batchAppendUniqueRows('Doctor Visits', 'doctor_visit_id', db.doctorVisits)
        : 0;
      const addedDoctorVisitCases = Array.isArray(db.doctorVisitCases)
        ? batchAppendUniqueRows('Doctor Visit Cases', 'case_id', db.doctorVisitCases)
        : 0;
      const addedOpdRecords = Array.isArray(db.opdRecords)
        ? batchAppendUniqueRows('OPD', 'opd_id', db.opdRecords)
        : 0;
      const addedMedicalCamps = Array.isArray(db.medicalCamps)
        ? batchAppendUniqueRows('Medical Camps', 'camp_id', db.medicalCamps)
        : 0;
      const addedCampScreenings = Array.isArray(db.campScreenings)
        ? batchAppendUniqueRows('Camp Screenings', 'screening_id', db.campScreenings)
        : 0;
      const addedAnnualCheckups = Array.isArray(db.annualCheckups)
        ? batchAppendUniqueRows('Annual Checkups', 'checkup_id', db.annualCheckups)
        : 0;
      const addedMenstrualLogs = Array.isArray(db.menstrualLogs)
        ? batchAppendUniqueRows('Menstrual Log', 'menstrual_id', db.menstrualLogs)
        : 0;
      if (db.settings) {
        const ts = db.settings.updated_at || new Date().toISOString();
        if (db.settings.school_hours_start) {
          upsertSettingKey('school_hours_start', String(db.settings.school_hours_start), ts);
        }
        if (db.settings.school_hours_end) {
          upsertSettingKey('school_hours_end', String(db.settings.school_hours_end), ts);
        }
      }
      return jsonSuccess({
        addedStudents: addedStudents,
        addedVisits: addedVisits,
        addedMeasurements: addedMeasurements,
        addedProfiles: addedProfiles,
        addedUsers: addedUsers,
        addedMedicines: addedMedicines,
        addedItems: addedItems,
        addedStockTransactions: addedStockTransactions,
        addedBills: addedBills,
        addedDoctorVisits: addedDoctorVisits,
        addedDoctorVisitCases: addedDoctorVisitCases,
        addedOpdRecords: addedOpdRecords,
        addedMedicalCamps: addedMedicalCamps,
        addedCampScreenings: addedCampScreenings,
        addedAnnualCheckups: addedAnnualCheckups,
        addedMenstrualLogs: addedMenstrualLogs
      });
    }

    return jsonError('Unsupported action: ' + action);
  } catch (err) {
    return jsonError(err.message || 'Server error while saving to Google Sheets');
  } finally {
    lock.releaseLock();
  }
}

function batchAppendUniqueRows(tabName, idField, records) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return 0;
  const lastCol = Math.max(1, sheet.getLastColumn());
  const actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existing = readSheetObjects(tabName);
  const existingIds = new Set(existing.map(function(r) { return String(r[idField]); }));
  const newRows = [];

  records.forEach(function(rec) {
    if (rec && rec[idField] && !existingIds.has(String(rec[idField]))) {
      existingIds.add(String(rec[idField]));
      const row = actualHeaders.map(function(colHeader) {
        const rawKey = String(colHeader || '').trim();
        const key = rawKey.toLowerCase().replace(/[\s._-]+/g, '_');
        if (rec[rawKey] !== undefined && rec[rawKey] !== null) return rec[rawKey];
        if (rec[key] !== undefined && rec[key] !== null) return rec[key];
        if (key === 'student_name' || key === 'full_name' || key === 'name') {
          return rec.student_name || rec.full_name || rec.name || '';
        }
        if (key === 'class' || key === 'section') {
          return rec.class || rec.section || '';
        }
        if (key === 'roll_no' || key === 'roll_number' || key === 'roll') {
          return rec.roll_no || rec.roll_number || '';
        }
        return '';
      });
      newRows.push(row);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, actualHeaders.length).setValues(newRows);
  }
  return newRows.length;
}

function readSheetObjects(tabName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
    });
    return obj;
  });
}

function appendRowBySchema(tabName, recordObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return;

  const lastCol = Math.max(1, sheet.getLastColumn());
  const actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row = actualHeaders.map(function(colHeader) {
    const rawKey = String(colHeader || '').trim();
    const key = rawKey.toLowerCase().replace(/[\s._-]+/g, '_');
    if (recordObj[rawKey] !== undefined && recordObj[rawKey] !== null) {
      return recordObj[rawKey];
    }
    if (recordObj[key] !== undefined && recordObj[key] !== null) {
      return recordObj[key];
    }
    if (key === 'student_name' || key === 'full_name' || key === 'name') {
      return recordObj.student_name || recordObj.full_name || recordObj.name || '';
    }
    if (key === 'class' || key === 'section') {
      return recordObj.class || recordObj.section || '';
    }
    if (key === 'roll_no' || key === 'roll_number' || key === 'roll') {
      return recordObj.roll_no || recordObj.roll_number || '';
    }
    return '';
  });
  sheet.appendRow(row);
}

function jsonSuccess(extra) {
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({ status: 'ok' }, extra)))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

`;

function escapeCsvCell(val: string | number | undefined | null): string {
  let str = val === undefined || val === null ? '' : String(val);
  // Neutralize CSV / Excel formula injection (cells starting with =, +, -, @, tab, or CR)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportSheetTabToCsv(
  db: NurseDatabase,
  tabName: 'Students' | 'Visits' | 'Measurements' | 'Health Profiles'
): string {
  if (tabName === 'Students') {
    const headers = [
      'student_id',
      'full_name',
      'section',
      'roll_number',
      'active_status',
      'created_at',
      'updated_at',
    ];
    const rows = db.students.map((s) =>
      [
        s.student_id,
        s.full_name,
        s.section,
        s.roll_number,
        s.active_status,
        s.created_at,
        s.updated_at,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  if (tabName === 'Visits') {
    const headers = [
      'visit_id',
      'student_id',
      'student_name',
      'class',
      'roll_no',
      'visit_datetime',
      'reason',
      'observations',
      'action_taken',
      'medicine_name',
      'dosage',
      'dosage_unit',
      'route',
      'administration_time',
      'notes',
      'recorded_by',
      'created_at',
    ];
    const rows = db.visits.map((v) => {
      const student = db.students.find((s) => s.student_id === v.student_id);
      const studentName = v.student_name || student?.full_name || '';
      const studentClass = v.class || v.section || student?.section || '';
      const studentRoll = v.roll_no || v.roll_number || student?.roll_number || '';
      const sheetMedicineName =
        v.medicine_status === 'none'
          ? 'None (No medicine given)'
          : v.medicine_status === 'not_recorded'
            ? 'Not recorded'
            : v.medicine_name;
      return [
        v.visit_id,
        v.student_id,
        studentName,
        studentClass,
        studentRoll,
        v.visit_datetime,
        v.reason,
        v.observations,
        v.action_taken,
        sheetMedicineName,
        v.dosage,
        v.dosage_unit,
        v.route,
        v.administration_time,
        v.notes,
        v.recorded_by,
        v.created_at,
      ]
        .map(escapeCsvCell)
        .join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  if (tabName === 'Measurements') {
    const headers = [
      'measurement_id',
      'student_id',
      'measurement_date',
      'height_cm',
      'weight_kg',
      'notes',
      'updated_at',
    ];
    const rows = db.measurements.map((m) =>
      [
        m.measurement_id,
        m.student_id,
        m.measurement_date,
        m.height_cm,
        m.weight_kg,
        m.notes,
        m.updated_at,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  const headers = [
    'health_record_id',
    'student_id',
    'condition_or_note',
    'status',
    'date_recorded',
    'last_reviewed',
  ];
  const rows = db.healthProfiles.map((h) =>
    [
      h.health_record_id,
      h.student_id,
      h.condition_or_note,
      h.status,
      h.date_recorded,
      h.last_reviewed,
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
