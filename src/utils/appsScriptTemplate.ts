import type { NurseDatabase } from './nurseLogic';

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * SARASWATI VIDYA ACADEMY — SCHOOL INFIRMARY BACKEND (Code.gs)
 * Google Sheets Database + Google Apps Script Backend
 *
 * Spreadsheet Tabs & Exact Columns:
 * 1. Students:
 *    student_id, full_name, section, roll_number, active_status, created_at, updated_at
 * 2. Visits:
 *    visit_id, student_id, visit_datetime, reason, observations, action_taken,
 *    medicine_name, dosage, dosage_unit, route, administration_time,
 *    notes, recorded_by, created_at
 * 3. Measurements:
 *    measurement_id, student_id, measurement_date, height_cm, weight_kg, notes, updated_at
 * 4. Health Profiles:
 *    health_record_id, student_id, condition_or_note, status, date_recorded, last_reviewed
 */

const SHEET_SCHEMAS = {
  'Students': [
    'student_id', 'full_name', 'section', 'roll_number',
    'active_status', 'created_at', 'updated_at'
  ],
  'Visits': [
    'visit_id', 'student_id', 'visit_datetime', 'reason', 'observations',
    'action_taken', 'medicine_name', 'dosage', 'dosage_unit', 'route',
    'administration_time', 'notes', 'recorded_by', 'created_at'
  ],
  'Measurements': [
    'measurement_id', 'student_id', 'measurement_date',
    'height_cm', 'weight_kg', 'notes', 'updated_at'
  ],
  'Health Profiles': [
    'health_record_id', 'student_id', 'condition_or_note',
    'status', 'date_recorded', 'last_reviewed'
  ]
};

/**
 * Run this function once in the Apps Script Editor to create and format all 4 tabs.
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
  return { status: 'ok', message: 'All 4 Infirmary tabs initialized.' };
}

/**
 * GET endpoint: returns all records from the 4 sheets.
 * Automatically assigns permanent student_id values to any newly pasted student rows in the Sheet.
 */
function doGet(e) {
  try {
    setupSpreadsheet();
    ensureStudentIdsInSheet();
    const data = {
      status: 'ok',
      students: readSheetObjects('Students'),
      visits: readSheetObjects('Visits'),
      measurements: readSheetObjects('Measurements'),
      healthProfiles: readSheetObjects('Health Profiles')
    };
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonError(err.message || 'Failed to read spreadsheet');
  }
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
      if (!rawSec) {
        values[r][secIdx] = 'Sparkle';
        modified = true;
      } else if (/^6\s+/i.test(rawSec)) {
        values[r][secIdx] = rawSec.replace(/^6\s+/i, '').trim();
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
 * POST endpoint: handles createVisit, addMeasurement, addHealthProfile, createStudent,
 * syncStudentsBatch, and syncFullDatabase.
 * Uses LockService to safely handle simultaneous submissions without overwriting rows.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    setupSpreadsheet();

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
      appendRowBySchema('Students', s);
      return jsonSuccess({ student_id: s.student_id });
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
      return jsonSuccess({
        addedStudents: addedStudents,
        addedVisits: addedVisits,
        addedMeasurements: addedMeasurements,
        addedProfiles: addedProfiles
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
  const headers = SHEET_SCHEMAS[tabName];
  const existing = readSheetObjects(tabName);
  const existingIds = new Set(existing.map(function(r) { return String(r[idField]); }));
  const newRows = [];
  records.forEach(function(rec) {
    if (rec && rec[idField] && !existingIds.has(String(rec[idField]))) {
      existingIds.add(String(rec[idField]));
      newRows.push(headers.map(function(col) {
        return rec[col] !== undefined && rec[col] !== null ? rec[col] : '';
      }));
    }
  });
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
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
  const headers = SHEET_SCHEMAS[tabName];
  const row = headers.map(function(col) {
    return recordObj[col] !== undefined && recordObj[col] !== null ? recordObj[col] : '';
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
  const str = val === undefined || val === null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
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
      const sheetMedicineName =
        v.medicine_status === 'none'
          ? 'None (No medicine given)'
          : v.medicine_status === 'not_recorded'
            ? 'Not recorded'
            : v.medicine_name;
      return [
        v.visit_id,
        v.student_id,
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
