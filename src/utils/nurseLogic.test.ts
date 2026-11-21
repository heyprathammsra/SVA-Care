import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePermanentId,
  searchStudents,
  formatMedicineDisplay,
  validateVisitInput,
  isDuplicateVisitSubmission,
  getDailyVisitLog,
  getStudentVisitHistory,
  getStudentMeasurements,
  parseStudentImportText,
  normalizeSectionName,
  normalizeSheetSyncPayload,
  normalizeDatetimeString,
  normalizeDateOnlyString,
  normalizeTimeOnlyString,
  extractDatePart,
  formatTimeFromDatetime,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type VisitFormInput,
  type NurseDatabase,
} from './nurseLogic.ts';

const sampleStudents: StudentRecord[] = [
  {
    student_id: 'STU-2026-0001',
    full_name: 'Ajinkya Balu Gurav',
    section: '6 Sparkle',
    roll_number: '01',
    active_status: 'Active',
    created_at: '2026-06-15T08:00:00Z',
    updated_at: '2026-06-15T08:00:00Z',
  },
  {
    student_id: 'STU-2026-0002',
    full_name: 'Ankita Rangnath Ghige',
    section: '6 Sparkle',
    roll_number: '02',
    active_status: 'Active',
    created_at: '2026-06-15T08:00:00Z',
    updated_at: '2026-06-15T08:00:00Z',
  },
  {
    student_id: 'STU-2026-0030',
    full_name: 'Swaraj Ajit Patil',
    section: '6 Sparkle',
    roll_number: '30',
    active_status: 'Active',
    created_at: '2026-06-15T08:00:00Z',
    updated_at: '2026-06-15T08:00:00Z',
  },
];

test('generatePermanentId creates sequential non-row-based IDs', () => {
  const nextStudentId = generatePermanentId('STU', ['STU-2026-0001', 'STU-2026-0030']);
  assert.equal(nextStudentId, 'STU-2026-0031');

  const firstVisitId = generatePermanentId('VIS', []);
  assert.equal(firstVisitId, 'VIS-2026-0001');
});

test('searchStudents finds 6 Sparkle students by name, section, or roll number', () => {
  const byName = searchStudents(sampleStudents, 'ankita');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].student_id, 'STU-2026-0002');

  const bySection = searchStudents(sampleStudents, 'Sparkle');
  assert.equal(bySection.length, 3);

  const byRoll = searchStudents(sampleStudents, '30');
  assert.equal(byRoll.length, 1);
  assert.equal(byRoll[0].full_name, 'Swaraj Ajit Patil');

  const combinedQuery = searchStudents(sampleStudents, 'sparkle 01');
  assert.equal(combinedQuery.length, 1);
  assert.equal(combinedQuery[0].full_name, 'Ajinkya Balu Gurav');

  const singleDigitRoll = searchStudents(sampleStudents, '2');
  assert.equal(singleDigitRoll.length, 1);
  assert.equal(singleDigitRoll[0].roll_number, '02');
});

test('formatMedicineDisplay distinguishes no medicine, not recorded, and given medicine', () => {
  assert.equal(
    formatMedicineDisplay({
      medicine_status: 'none',
      medicine_name: '',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
    }),
    'No medicine given'
  );

  assert.equal(
    formatMedicineDisplay({
      medicine_status: 'not_recorded',
      medicine_name: '',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
    }),
    'Not recorded'
  );

  assert.equal(
    formatMedicineDisplay({
      medicine_status: 'given',
      medicine_name: 'Paracetamol Syrup',
      dosage: '5',
      dosage_unit: 'ml',
      route: 'Oral',
      administration_time: '10:30 AM',
    }),
    'Paracetamol Syrup 5 ml (Oral) at 10:30 AM'
  );
});

test('validateVisitInput enforces required fields and conditional medicine name without outcome', () => {
  const validInput: VisitFormInput = {
    student_id: 'STU-2026-0001',
    visit_datetime: '2026-10-17T09:30',
    reason: 'Mild headache after morning assembly',
    observations: 'Temp 98.4°F, normal pulse',
    action_taken: 'Hydration and 20 minutes rest',
    medicine_status: 'none',
    medicine_name: '',
    dosage: '',
    dosage_unit: 'mg',
    route: 'Oral',
    administration_time: '',
    notes: '',
    recorded_by: 'Sister Kavita Nair, RN',
  };

  assert.equal(validateVisitInput(validInput).valid, true);

  const missingMedicineName: VisitFormInput = {
    ...validInput,
    medicine_status: 'given',
    medicine_name: '   ',
  };
  const validation = validateVisitInput(missingMedicineName);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.medicine_name);
});

test('isDuplicateVisitSubmission blocks rapid accidental duplicates but allows new visits', () => {
  const existing: VisitRecord[] = [
    {
      visit_id: 'VIS-2026-0001',
      student_id: 'STU-2026-0001',
      visit_datetime: '2026-10-17T09:15',
      reason: 'Scraped knee on playground',
      observations: 'Minor abrasion on left knee',
      action_taken: 'Cleaned with antiseptic and applied sterile dressing',
      medicine_status: 'none',
      medicine_name: 'None (No medicine given)',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
      notes: '',
      recorded_by: 'Sister Kavita Nair, RN',
      created_at: '2026-10-17T09:15:10.000Z',
    },
  ];

  const duplicateAttempt: VisitFormInput = {
    student_id: 'STU-2026-0001',
    visit_datetime: '2026-10-17T09:15',
    reason: 'Scraped knee on playground',
    observations: 'Minor abrasion on left knee',
    action_taken: 'Cleaned with antiseptic and applied sterile dressing',
    medicine_status: 'none',
    medicine_name: '',
    dosage: '',
    dosage_unit: '',
    route: '',
    administration_time: '',
    notes: '',
    recorded_by: 'Sister Kavita Nair, RN',
  };

  assert.equal(
    isDuplicateVisitSubmission(existing, duplicateAttempt, '2026-10-17T09:15:30.000Z', 90),
    true
  );

  const secondVisitAttempt: VisitFormInput = {
    ...duplicateAttempt,
    visit_datetime: '2026-10-17T13:20',
    reason: 'Dressing check after lunch',
  };
  assert.equal(
    isDuplicateVisitSubmission(existing, secondVisitAttempt, '2026-10-17T13:20:00.000Z', 90),
    false
  );
});

test('getDailyVisitLog sorts visits chronologically and numbers them sequentially', () => {
  const visits: VisitRecord[] = [
    {
      visit_id: 'VIS-2026-0002',
      student_id: 'STU-2026-0002',
      visit_datetime: '2026-10-17T11:05',
      reason: 'Stomach ache',
      observations: '',
      action_taken: 'Warm water and rest',
      medicine_status: 'none',
      medicine_name: 'None (No medicine given)',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
      notes: '',
      recorded_by: 'Sister Kavita Nair, RN',
      created_at: '2026-10-17T11:05:00Z',
    },
    {
      visit_id: 'VIS-2026-0001',
      student_id: 'STU-2026-0001',
      visit_datetime: '2026-10-17T08:45',
      reason: 'Headache',
      observations: '',
      action_taken: 'Rested 15 mins',
      medicine_status: 'none',
      medicine_name: 'None (No medicine given)',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
      notes: '',
      recorded_by: 'Sister Kavita Nair, RN',
      created_at: '2026-10-17T08:45:00Z',
    },
  ];

  const log = getDailyVisitLog(visits, sampleStudents, '2026-10-17');
  assert.equal(log.length, 2);
  assert.equal(log[0].visitNumber, 1);
  assert.equal(log[0].student.full_name, 'Ajinkya Balu Gurav');
  assert.equal(log[1].visitNumber, 2);
  assert.equal(log[1].student.full_name, 'Ankita Rangnath Ghige');
});

test('getStudentVisitHistory returns newest first and supports date range filtering', () => {
  const visits: VisitRecord[] = [
    {
      visit_id: 'VIS-2026-0001',
      student_id: 'STU-2026-0001',
      visit_datetime: '2026-09-10T10:00',
      reason: 'September visit',
      observations: '',
      action_taken: 'Rest',
      medicine_status: 'none',
      medicine_name: 'None',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
      notes: '',
      recorded_by: 'Staff on Duty',
      created_at: '2026-09-10T10:00:00Z',
    },
    {
      visit_id: 'VIS-2026-0002',
      student_id: 'STU-2026-0001',
      visit_datetime: '2026-10-17T09:15',
      reason: 'October visit',
      observations: '',
      action_taken: 'Rest',
      medicine_status: 'none',
      medicine_name: 'None',
      dosage: '',
      dosage_unit: '',
      route: '',
      administration_time: '',
      notes: '',
      recorded_by: 'Staff on Duty',
      created_at: '2026-10-17T09:15:00Z',
    },
  ];

  const allHistory = getStudentVisitHistory(visits, 'STU-2026-0001');
  assert.equal(allHistory.length, 2);
  assert.equal(allHistory[0].visit_id, 'VIS-2026-0002');

  const octoberOnly = getStudentVisitHistory(visits, 'STU-2026-0001', '2026-10-01', '2026-10-31');
  assert.equal(octoberOnly.length, 1);
  assert.equal(octoberOnly[0].reason, 'October visit');

  const octoberObjRange = getStudentVisitHistory(visits, 'STU-2026-0001', {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  });
  assert.equal(octoberObjRange.length, 1);

  const sameMinuteVisits: VisitRecord[] = [
    {
      ...visits[1],
      visit_id: 'VIS-2026-0003',
      visit_datetime: '2026-10-17T09:15',
      reason: 'Earlier entry in same minute',
      created_at: '2026-10-17T09:15:05Z',
    },
    {
      ...visits[1],
      visit_id: 'VIS-2026-0004',
      visit_datetime: '2026-10-17T09:15',
      reason: 'Newest entry in same minute',
      created_at: '2026-10-17T09:15:45Z',
    },
  ];
  const sortedSameMinute = getStudentVisitHistory(sameMinuteVisits, 'STU-2026-0001');
  assert.equal(sortedSameMinute[0].visit_id, 'VIS-2026-0004');
  assert.equal(sortedSameMinute[1].visit_id, 'VIS-2026-0003');
});

test('getStudentMeasurements retains historical records sorted newest first', () => {
  const measurements: MeasurementRecord[] = [
    {
      measurement_id: 'MSR-2026-0001',
      student_id: 'STU-2026-0001',
      measurement_date: '2026-06-10',
      height_cm: 141.5,
      weight_kg: 33.0,
      notes: 'Term 1 checkup',
      updated_at: '2026-06-10T09:00:00Z',
    },
    {
      measurement_id: 'MSR-2026-0002',
      student_id: 'STU-2026-0001',
      measurement_date: '2026-10-05',
      height_cm: 144.0,
      weight_kg: 34.4,
      notes: 'Term 2 checkup',
      updated_at: '2026-10-05T09:00:00Z',
    },
  ];

  const history = getStudentMeasurements(measurements, 'STU-2026-0001');
  assert.equal(history.length, 2);
  assert.equal(history[0].height_cm, 144.0);
  assert.equal(history[1].height_cm, 141.5);
});

test('parseStudentImportText parses 6 SPARKLE class teacher list format', () => {
  const teacherListCsv = `6 SPARKLE • CLASS TEACHER LIST,
,
Roll No.,Student Name
01,Ajinkya Balu Gurav
03,Anushka Balasaheb Jalhare
,
Note: Please use the Room and Seat columns to direct each student to the assigned examination seat.,`;

  const parsed = parseStudentImportText(teacherListCsv, sampleStudents, [], [], '2026-10-17');
  assert.equal(parsed.newStudents.length, 1); // 01 already exists, 03 is new
  assert.equal(parsed.newStudents[0].full_name, 'Anushka Balasaheb Jalhare');
  assert.equal(parsed.newStudents[0].roll_number, '03');
  assert.equal(parsed.newStudents[0].section, 'Sparkle');
});

test('normalizeSectionName normalizes short, lowercase, and legacy 6-prefixed section names', () => {
  assert.equal(normalizeSectionName('Sparkle'), 'Sparkle');
  assert.equal(normalizeSectionName('emerald'), 'Emerald');
  assert.equal(normalizeSectionName('6 diamond'), 'Diamond');
  assert.equal(normalizeSectionName('6 Sparkle'), 'Sparkle');
  assert.equal(normalizeSectionName(''), 'Sparkle');
});

test('normalizeSheetSyncPayload normalizes pasted students, string measurements, and raw visit medicine_status', () => {
  const currentDb: NurseDatabase = {
    students: sampleStudents,
    visits: [],
    measurements: [],
    healthProfiles: [],
  };

  const synced = normalizeSheetSyncPayload(
    {
      students: [
        // Pasted student with no student_id and short section name
        { full_name: 'Riya Sharma', section: 'Emerald', roll_number: '5' },
      ],
      visits: [
        {
          visit_id: 'VIS-2026-0099',
          student_id: 'STU-2026-0001',
          visit_datetime: '2026-10-18T10:15',
          reason: 'Headache',
          action_taken: 'ORS given',
          medicine_name: 'ORS Electoral Solution',
          dosage: '200',
          dosage_unit: 'ml',
          route: 'Oral',
        },
        {
          visit_id: 'VIS-2026-0100',
          student_id: 'STU-2026-0002',
          visit_datetime: '2026-10-18T11:00',
          reason: 'Scrape',
          action_taken: 'Dressing',
          medicine_name: 'None (No medicine given)',
        },
      ],
      measurements: [
        {
          measurement_id: 'MSR-2026-0050',
          student_id: 'STU-2026-0001',
          measurement_date: '2026-10-18',
          height_cm: '145.5',
          weight_kg: '36.2',
          notes: 'Annual check',
        },
      ],
    },
    currentDb,
    '2026-10-18T12:00:00Z'
  );

  // 1 new remote student + 3 preserved local students = 4
  assert.equal(synced.students.length, 4);
  const riya = synced.students.find((s) => s.full_name === 'Riya Sharma');
  assert.ok(riya);
  assert.equal(riya.student_id, 'STU-2026-0031');
  assert.equal(riya.section, 'Emerald');
  assert.equal(riya.roll_number, '05');

  // Visit medicine_status derived from medicine_name
  assert.equal(synced.visits.length, 2);
  assert.equal(synced.visits[0].medicine_status, 'given');
  assert.equal(synced.visits[1].medicine_status, 'none');

  // Measurement strings converted to numbers
  assert.equal(synced.measurements.length, 1);
  assert.equal(typeof synced.measurements[0].height_cm, 'number');
  assert.equal(synced.measurements[0].height_cm, 145.5);
  assert.equal(synced.measurements[0].weight_kg, 36.2);
});

test('Google Sheets Date.toString() formats normalize cleanly to ISO dates and 12h times', () => {
  const gsDatetime = 'Sun Oct 18 2026 08:45:00 GMT+0530 (インド標準時)';
  assert.equal(normalizeDatetimeString(gsDatetime), '2026-10-18T08:45');
  assert.equal(extractDatePart(gsDatetime), '2026-10-18');
  assert.equal(formatTimeFromDatetime(gsDatetime), '08:45 AM');

  const gsDate = 'Mon Oct 05 2026 00:00:00 GMT+0530 (インド標準時)';
  assert.equal(normalizeDateOnlyString(gsDate), '2026-10-05');

  const gsEpochTime = 'Sat Dec 30 1899 09:40:00 GMT+0521 (インド標準時)';
  assert.equal(normalizeTimeOnlyString(gsEpochTime), '09:40 AM');
});

test('normalizeSheetSyncPayload updates renamed students in-place by section+roll and filters accidental float roll numbers', () => {
  const currentDb: NurseDatabase = {
    students: [
      ...sampleStudents,
      {
        student_id: 'STU-2026-0293',
        full_name: 'abc',
        section: 'Sparkle',
        roll_number: '2.8',
        active_status: 'Active',
        created_at: '2026-10-18T17:38:24Z',
        updated_at: '2026-10-18T17:38:24Z',
      },
    ],
    visits: [],
    measurements: [],
    healthProfiles: [],
  };

  const synced = normalizeSheetSyncPayload(
    {
      students: [
        // Renamed Sparkle Roll 01 in Google Sheet (blank student_id)
        { student_id: '', full_name: 'Student One (Privacy Masked)', section: 'Sparkle', roll_number: '1' },
        // Accidental spreadsheet drag-fill float roll number should be ignored
        { student_id: '', full_name: 'def', section: 'Sparkle', roll_number: '3.02857142857143' },
      ],
    },
    currentDb,
    '2026-10-18T18:00:00Z'
  );

  // Float roll number 2.8 in currentDb and 3.02857142857143 in payload are stripped;
  // Sparkle Roll 01 is updated in-place keeping STU-2026-0001
  assert.equal(synced.students.length, 3);
  const roll01 = synced.students.find((s) => s.roll_number === '01');
  assert.ok(roll01);
  assert.equal(roll01.student_id, 'STU-2026-0001');
  assert.equal(roll01.full_name, 'Student One (Privacy Masked)');
});

test('normalizeSheetSyncPayload strips purged test visits, measurements, and health profiles while preserving students and new records', () => {
  const currentDb: NurseDatabase = {
    students: sampleStudents,
    visits: [],
    measurements: [],
    healthProfiles: [],
  };

  const synced = normalizeSheetSyncPayload(
    {
      students: sampleStudents,
      visits: [
        // Legacy test visits that should be ignored
        {
          visit_id: 'VIS-2026-0001',
          student_id: 'STU-2026-0001',
          visit_datetime: '2026-10-18T08:45',
          reason: 'Test visit',
          action_taken: 'Test',
        },
        {
          visit_id: 'VIS-2026-0019',
          student_id: 'STU-2026-0002',
          visit_datetime: '2026-10-18T20:02',
          reason: 'Test 2',
          action_taken: 'Test 2',
        },
        // New nurse visit tomorrow (VIS-2026-0020+) that should be kept
        {
          visit_id: 'VIS-2026-0020',
          student_id: 'STU-2026-0001',
          visit_datetime: '2026-10-19T09:30',
          reason: 'Real nurse visit tomorrow',
          action_taken: 'First aid given',
        },
      ],
      measurements: [
        // Legacy test measurement that should be ignored
        {
          measurement_id: 'MSR-2026-0001',
          student_id: 'STU-2026-0001',
          measurement_date: '2026-06-20',
          height_cm: '142.0',
          weight_kg: '34.5',
        },
        // New nurse measurement tomorrow (MSR-2026-0007+) that should be kept
        {
          measurement_id: 'MSR-2026-0007',
          student_id: 'STU-2026-0001',
          measurement_date: '2026-10-19',
          height_cm: '145.0',
          weight_kg: '36.0',
        },
      ],
      healthProfiles: [
        // Legacy test health profile that should be ignored
        {
          health_record_id: 'HPR-2026-0002',
          student_id: 'STU-2026-0001',
          condition_or_note: 'Test note',
          status: 'Active',
        },
        // New nurse health profile tomorrow (HPR-2026-0004+) that should be kept
        {
          health_record_id: 'HPR-2026-0004',
          student_id: 'STU-2026-0001',
          condition_or_note: 'Real nurse health note',
          status: 'Active',
        },
      ],
    },
    currentDb,
    '2026-10-19T10:00:00Z'
  );

  assert.equal(synced.students.length, 3);
  assert.equal(synced.visits.length, 1);
  assert.equal(synced.visits[0].visit_id, 'VIS-2026-0020');
  assert.equal(synced.measurements.length, 1);
  assert.equal(synced.measurements[0].measurement_id, 'MSR-2026-0007');
  assert.equal(synced.healthProfiles.length, 1);
  assert.equal(synced.healthProfiles[0].health_record_id, 'HPR-2026-0004');
});

test('normalizeSheetSyncPayload enriches visit records with student_name, class, and roll_no', () => {
  const currentDb: NurseDatabase = {
    students: sampleStudents,
    visits: [],
    measurements: [],
    healthProfiles: [],
  };

  const synced = normalizeSheetSyncPayload(
    {
      students: sampleStudents,
      visits: [
        {
          visit_id: 'VIS-2026-0025',
          student_id: 'STU-2026-0001', // Ajinkya Balu Gurav (Roll 01, Sparkle)
          visit_datetime: '2026-10-18T14:30',
          reason: 'Headache',
          action_taken: 'Rest',
        },
      ],
    },
    currentDb,
    '2026-10-18T15:00:00Z'
  );

  assert.equal(synced.visits.length, 1);
  const v = synced.visits[0];
  assert.equal(v.visit_id, 'VIS-2026-0025');
  assert.equal(v.student_name, 'Ajinkya Balu Gurav');
  assert.equal(v.section, 'Sparkle');
  assert.equal(v.class, 'Sparkle');
  assert.equal(v.roll_number, '01');
  assert.equal(v.roll_no, '01');
});

test('authenticateServerUser verifies nurse, admin, and warden credentials securely while client auth has no hardcoded secrets', async () => {
  const { authenticateServerUser } = await import('../../serverAuth.ts');
  const { authenticateUser } = await import('./auth.ts');

  // Client-side authenticateUser must never accept hardcoded passwords without dynamicUsers
  assert.equal(authenticateUser('admin', 'sva0pass'), null);
  assert.equal(authenticateUser('nurse', 'iloveeating'), null);
  assert.equal(authenticateUser('agnel', 'ilovesleeping'), null);

  // Test 1: Valid nurse credentials on server
  const nurseUser = authenticateServerUser('nurse', 'iloveeating');
  assert.ok(nurseUser);
  assert.equal(nurseUser?.username, 'nurse');
  assert.equal(nurseUser?.role, 'nurse');
  assert.equal(nurseUser?.displayName, 'School Nurse');

  // Test 2: Valid admin credentials on server
  const adminUser = authenticateServerUser('admin', 'sva0pass');
  assert.ok(adminUser);
  assert.equal(adminUser?.username, 'admin');
  assert.equal(adminUser?.role, 'admin');
  assert.equal(adminUser?.displayName, 'Infirmary Administrator');

  // Test 2b: Valid warden credentials on server (Agnel / ilovesleeping)
  const wardenUser = authenticateServerUser('Agnel', 'ilovesleeping');
  assert.ok(wardenUser);
  assert.equal(wardenUser?.username, 'agnel');
  assert.equal(wardenUser?.role, 'warden');
  assert.equal(wardenUser?.displayName, 'Agnel (Hostel Warden)');

  // Test 3: Case-insensitive username and whitespace trimming
  const mixedCaseNurse = authenticateServerUser('  NURSE  ', 'iloveeating');
  assert.ok(mixedCaseNurse);
  assert.equal(mixedCaseNurse?.username, 'nurse');

  const mixedCaseAdmin = authenticateServerUser('Admin ', 'sva0pass');
  assert.ok(mixedCaseAdmin);
  assert.equal(mixedCaseAdmin?.username, 'admin');

  // Test 4: Wrong passwords rejected
  assert.equal(authenticateServerUser('nurse', 'wrongpass'), null);
  assert.equal(authenticateServerUser('admin', 'iloveeating'), null);

  // Test 5: Wrong usernames rejected
  assert.equal(authenticateServerUser('doctor', 'iloveeating'), null);
  assert.equal(authenticateServerUser('', 'sva0pass'), null);
  assert.equal(authenticateServerUser('nurse', ''), null);
});

test('generateVisitsCSV formats headers, columns, student details, and escaping accurately', async () => {
  const { generateVisitsCSV } = await import('./nurseLogic.ts');

  const testEntries = [
    {
      visitNumber: 1,
      visitTimeFormatted: '10:15 AM',
      medicineSummary: 'ORS Electrolyte 200 ml (Oral)',
      visit: {
        visit_id: 'VIS-2026-0001',
        student_id: 'STU-2026-0001',
        visit_datetime: '2026-10-18T10:15',
        reason: 'Headache, fatigue after sports',
        observations: 'Afebrile, 98.4°F',
        action_taken: 'ORS 200 ml given, rested',
        medicine_status: 'given' as const,
        medicine_name: 'ORS Electrolyte',
        dosage: '200',
        dosage_unit: 'ml',
        route: 'Oral',
        administration_time: '10:15 AM',
        notes: 'Advised hydration',
        recorded_by: 'School Nurse',
        created_at: '2026-10-18T10:15:00Z',
      },
      student: {
        student_id: 'STU-2026-0001',
        full_name: 'Ajinkya Balu Gurav',
        section: 'Sparkle',
        roll_number: '01',
        active_status: 'Active' as const,
        created_at: '2026-06-15T08:00:00Z',
        updated_at: '2026-06-15T08:00:00Z',
      },
    },
  ];

  const csv = generateVisitsCSV(testEntries);
  assert.ok(csv.startsWith('\uFEFF')); // UTF-8 BOM
  assert.ok(csv.includes('Sr No,Visit ID,Date,Time,Shift,Student Name,Roll No,Class'));
  assert.ok(csv.includes('Ajinkya Balu Gurav'));
  assert.ok(csv.includes('01'));
  assert.ok(csv.includes('Sparkle'));
  assert.ok(csv.includes('"Headache, fatigue after sports"')); // Proper RFC 4180 escaping
  assert.ok(csv.includes('ORS Electrolyte'));
});

test('normalizeSheetSyncPayload handles past visits pasted without visit_id or student_id by matching class & roll', async () => {
  const { normalizeSheetSyncPayload } = await import('./nurseLogic.ts');

  const currentDb = {
    students: [
      {
        student_id: 'STU-2026-0002',
        full_name: 'Ankita Rangnath Ghige',
        section: '6 Sparkle',
        roll_number: '02',
        active_status: 'Active' as const,
        created_at: '2026-06-15T08:00:00Z',
        updated_at: '2026-06-15T08:00:00Z',
      },
    ],
    visits: [],
    measurements: [],
    healthProfiles: [],
  };

  // Past visit row as someone might type in Google Sheets:
  // - No student_id (just student_name, class, roll_no)
  // - No visit_id (blank)
  // - Past date (e.g. 2026-08-14)
  const synced = normalizeSheetSyncPayload(
    {
      visits: [
        {
          student_name: 'Ankita Rangnath Ghige',
          class: 'Sparkle',
          roll_no: '2',
          visit_datetime: '2026-08-14T11:20',
          reason: 'Mild stomach cramp',
          action_taken: 'Warm water and rest',
        },
      ],
    },
    currentDb,
    '2026-10-21T10:00:00Z'
  );

  assert.equal(synced.visits.length, 1);
  const v = synced.visits[0];
  assert.ok(v.visit_id.startsWith('VIS-2026-'));
  assert.equal(v.student_id, 'STU-2026-0002');
  assert.equal(v.student_name, 'Ankita Rangnath Ghige');
  assert.equal(v.class, 'Sparkle');
  assert.equal(v.roll_no, '02');
  assert.equal(v.visit_datetime, '2026-08-14T11:20');
  assert.equal(v.reason, 'Mild stomach cramp');
});

test('authenticateServerUser supports dynamic users loaded from Google Sheets Users tab', async () => {
  const { authenticateServerUser, SERVER_DEFAULT_USERS } = await import('../../serverAuth.ts');
  const type_test_records = [
    ...SERVER_DEFAULT_USERS,
    {
      username: 'warden_rahul',
      password: 'password123',
      role: 'warden' as const,
      display_name: 'Mr. Rahul (Senior Warden)',
      badge_title: 'Senior Hostel Warden',
      active_status: 'Active' as const,
      updated_at: '2026-10-21T10:00:00Z',
    },
    {
      username: 'nurse_anita',
      password: 'nursepass789',
      role: 'nurse' as const,
      display_name: 'Nurse Anita Deshmukh',
      badge_title: 'Staff Nurse',
      active_status: 'Active' as const,
      updated_at: '2026-10-21T10:00:00Z',
    },
    {
      username: 'inactive_staff',
      password: 'somepass',
      role: 'warden' as const,
      display_name: 'Ex-Staff Member',
      badge_title: 'Former Warden',
      active_status: 'Inactive' as const,
      updated_at: '2026-10-21T10:00:00Z',
    },
  ];

  // Test dynamic warden login
  const warden = authenticateServerUser('warden_rahul', 'password123', type_test_records);
  assert.ok(warden);
  assert.equal(warden?.username, 'warden_rahul');
  assert.equal(warden?.role, 'warden');
  assert.equal(warden?.displayName, 'Mr. Rahul (Senior Warden)');
  assert.equal(warden?.badgeTitle, 'Senior Hostel Warden');

  // Test dynamic nurse login with case-insensitivity in username
  const nurse = authenticateServerUser('  NURSE_ANITA  ', 'nursepass789', type_test_records);
  assert.ok(nurse);
  assert.equal(nurse?.username, 'nurse_anita');
  assert.equal(nurse?.role, 'nurse');
  assert.equal(nurse?.displayName, 'Nurse Anita Deshmukh');

  // Test inactive user is rejected
  assert.equal(authenticateServerUser('inactive_staff', 'somepass', type_test_records), null);

  // Test wrong password for dynamic user
  assert.equal(authenticateServerUser('warden_rahul', 'wrongpassword', type_test_records), null);

  // Test built-in users merged into server user list
  const builtinAgnel = authenticateServerUser('Agnel', 'ilovesleeping', type_test_records);
  assert.ok(builtinAgnel);
  assert.equal(builtinAgnel?.username, 'agnel');
  assert.equal(builtinAgnel?.role, 'warden');

  const builtinNurse = authenticateServerUser('nurse', 'iloveeating', type_test_records);
  assert.ok(builtinNurse);
  assert.equal(builtinNurse?.username, 'nurse');
});

test('WardenDispatchRecord supports Principal and Vice Principal authority', async () => {
  const { generatePermanentId } = await import('./nurseLogic.ts');

  const existingDispatches = [
    {
      dispatch_id: 'DSP-2026-0001',
      student_id: 'STU-2026-0001',
      student_name: 'Ajinkya Balu Gurav',
      section: 'Sparkle',
      roll_number: '01',
      reason: 'Fever / Chills',
      notes: 'Permitted to visit nurse room during 4th period',
      dispatched_by: "Principal's Office",
      dispatched_at: '2026-10-21T10:30:00Z',
      status: 'in_transit' as const,
    },
    {
      dispatch_id: 'DSP-2026-0002',
      student_id: 'STU-2026-0002',
      student_name: 'Ankita Rangnath Ghige',
      section: 'Sparkle',
      roll_number: '02',
      reason: 'Headache',
      notes: 'Emergency permission granted by Vice Principal',
      dispatched_by: "Vice Principal's Desk",
      dispatched_at: '2026-10-21T11:15:00Z',
      status: 'in_transit' as const,
    },
  ];

  // Verify next dispatch ID generation
  const nextId = generatePermanentId('DSP', existingDispatches.map((d) => d.dispatch_id));
  assert.equal(nextId, 'DSP-2026-0003');

  // Verify both Principal and Vice Principal dispatched records
  assert.equal(existingDispatches[0].dispatched_by, "Principal's Office");
  assert.equal(existingDispatches[1].dispatched_by, "Vice Principal's Desk");
  assert.equal(existingDispatches[0].status, 'in_transit');
});

test('sanitizeStateForRole strips staff passwords and Apps Script URL for nurse and warden', async () => {
  const { sanitizeStateForRole, SERVER_DEFAULT_USERS } = await import('../../serverAuth.ts');

  const fullState = {
    db: {
      students: sampleStudents,
      classes: ['Sparkle'],
      visits: [],
      measurements: [],
      healthProfiles: [],
      dispatches: [],
      users: SERVER_DEFAULT_USERS,
    },
    appsScriptUrl: 'https://script.google.com/macros/s/SECRET_DEPLOYMENT_ID/exec',
    autoSyncEnabled: true,
    updatedAt: '2026-10-21T12:00:00Z',
  };

  const nurseView = sanitizeStateForRole(fullState, 'nurse', fullState.appsScriptUrl);
  assert.equal(nurseView.db.users?.length, 0);
  assert.equal(nurseView.appsScriptUrl, undefined);
  assert.equal(nurseView.db.students.length, 3);

  const wardenView = sanitizeStateForRole(fullState, 'warden', fullState.appsScriptUrl);
  assert.equal(wardenView.db.users?.length, 0);
  assert.equal(wardenView.appsScriptUrl, undefined);

  const adminView = sanitizeStateForRole(fullState, 'admin', fullState.appsScriptUrl);
  assert.equal(adminView.db.users?.length, SERVER_DEFAULT_USERS.length);
  // Even Admin responses MUST redact raw passwords/hashes over HTTP
  assert.ok(adminView.db.users?.every((u) => u.password === ''));
  assert.equal(adminView.appsScriptUrl, fullState.appsScriptUrl);
  assert.equal(adminView.isCustomAppsScriptUrl, false);
});

test('isMutationAllowedForRole strictly enforces server-side RBAC boundaries', async () => {
  const { isMutationAllowedForRole } = await import('../../serverAuth.ts');

  // Warden can send students & update pass status, nothing else
  assert.equal(isMutationAllowedForRole('dispatchStudent', 'warden'), true);
  assert.equal(isMutationAllowedForRole('updateDispatchStatus', 'warden'), true);
  assert.equal(isMutationAllowedForRole('recordVisit', 'warden'), false);
  assert.equal(isMutationAllowedForRole('upsertUser', 'warden'), false);
  assert.equal(isMutationAllowedForRole('deleteClass', 'warden'), false);

  // Nurse can record clinical data, but cannot edit staff, classes, or wipe roster
  assert.equal(isMutationAllowedForRole('recordVisit', 'nurse'), true);
  assert.equal(isMutationAllowedForRole('addMeasurement', 'nurse'), true);
  assert.equal(isMutationAllowedForRole('bulkImportStudents', 'nurse', { replaceAll: false }), true);
  assert.equal(isMutationAllowedForRole('bulkImportStudents', 'nurse', { replaceAll: true }), false);
  assert.equal(isMutationAllowedForRole('upsertUser', 'nurse'), false);
  assert.equal(isMutationAllowedForRole('deleteUser', 'nurse'), false);
  assert.equal(isMutationAllowedForRole('updateStudent', 'nurse'), false);

  // Admin can perform all valid actions, but unknown actions are still denied
  assert.equal(isMutationAllowedForRole('upsertUser', 'admin'), true);
  assert.equal(isMutationAllowedForRole('deleteUser', 'admin'), true);
  assert.equal(isMutationAllowedForRole('bulkImportStudents', 'admin', { replaceAll: true }), true);
  assert.equal(isMutationAllowedForRole('dropDatabase', 'admin'), false);
});

test('login rate limiter locks out after 5 failed attempts and clears on success', async () => {
  const { checkLoginRateLimit, recordFailedLogin, clearLoginFailures } = await import(
    '../../serverAuth.ts'
  );
  const key = 'test-unit-ip:198.51.100.42';
  const baseNow = 1_700_000_000_000;

  clearLoginFailures(key);
  for (let i = 0; i < 4; i++) {
    recordFailedLogin(key, baseNow + i * 1000);
    assert.equal(checkLoginRateLimit(key, baseNow + i * 1000).allowed, true);
  }

  // 5th failure triggers lockout
  recordFailedLogin(key, baseNow + 5000);
  const locked = checkLoginRateLimit(key, baseNow + 6000);
  assert.equal(locked.allowed, false);
  assert.ok(locked.retryAfterSeconds > 0);

  clearLoginFailures(key);
  assert.equal(checkLoginRateLimit(key, baseNow + 7000).allowed, true);
});

test('hasForbiddenPrototypeKeys detects prototype pollution payloads', async () => {
  const { hasForbiddenPrototypeKeys } = await import('../../serverAuth.ts');

  assert.equal(hasForbiddenPrototypeKeys({ action: 'recordVisit', payload: { reason: 'Fever' } }), false);
  const malicious = JSON.parse('{"payload":{"__proto__":{"isAdmin":true}}}');
  assert.equal(hasForbiddenPrototypeKeys(malicious), true);
  assert.equal(hasForbiddenPrototypeKeys({ nested: { constructor: {} } }), true);
});

test('CSV exports neutralize Excel/Sheets formula injection payloads', async () => {
  const { generateVisitsCSV } = await import('./nurseLogic.ts');
  const { exportSheetTabToCsv } = await import('./appsScriptTemplate.ts');

  const csv = generateVisitsCSV([
    {
      visitNumber: 1,
      visitTimeFormatted: '09:00 AM',
      medicineSummary: 'No medicine given',
      visit: {
        visit_id: 'VIS-2026-0099',
        student_id: 'STU-2026-0001',
        visit_datetime: '2026-10-21T09:00',
        reason: '=HYPERLINK("http://evil.example","Click")',
        observations: '+cmd|\' /C calc\'!A0',
        action_taken: '@SUM(1+1)',
        medicine_status: 'none',
        medicine_name: '',
        dosage: '',
        dosage_unit: '',
        route: '',
        administration_time: '',
        notes: '',
        recorded_by: '-2+3',
        created_at: '2026-10-21T09:00:00Z',
      },
      student: sampleStudents[0],
    },
  ]);

  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+cmd"));
  assert.ok(csv.includes("'@SUM"));
  assert.ok(csv.includes("'-2+3"));

  const studentsCsv = exportSheetTabToCsv(
    {
      students: [{ ...sampleStudents[0], full_name: '=1+1' }],
      visits: [],
      measurements: [],
      healthProfiles: [],
    },
    'Students'
  );
  assert.ok(studentsCsv.includes("'=1+1"));
});

test('scrypt password hashing uses unique salts, verifies accurately, and flags legacy plaintext for upgrade', async () => {
  const { hashPassword, isPasswordHash, verifyPassword } = await import('../../serverCrypto.ts');

  const h1 = hashPassword('MyStr0ng!SchoolPass');
  const h2 = hashPassword('MyStr0ng!SchoolPass');

  assert.equal(isPasswordHash(h1), true);
  assert.notEqual(h1, h2); // Unique random 128-bit salt every time
  assert.ok(!h1.includes('MyStr0ng!SchoolPass'));

  assert.deepEqual(verifyPassword('MyStr0ng!SchoolPass', h1), { valid: true, needsRehash: false });
  assert.deepEqual(verifyPassword('WrongPassword', h1), { valid: false, needsRehash: false });

  // Legacy plaintext still verifies once and flags needsRehash: true
  assert.deepEqual(verifyPassword('legacy123', 'legacy123'), { valid: true, needsRehash: true });
  assert.deepEqual(verifyPassword('wrong', 'legacy123'), { valid: false, needsRehash: false });
});

test('AES-256-GCM field encryption uses random IVs, authenticates AAD, detects tampering, and keeps legacy plaintext readable', async () => {
  const crypto = await import('crypto');
  const { encryptField, decryptField, isEncryptedField } = await import('../../serverCrypto.ts');

  const testKey = crypto.randomBytes(32);
  const secretNote = 'Severe peanut allergy — carries EpiPen in backpack';

  const c1 = encryptField(secretNote, 'health:HPR-2026-0001', testKey);
  const c2 = encryptField(secretNote, 'health:HPR-2026-0001', testKey);

  assert.equal(isEncryptedField(c1), true);
  assert.notEqual(c1, c2); // Unique random 96-bit IV per encryption
  assert.ok(!c1.includes('peanut'));
  assert.equal(decryptField(c1, 'health:HPR-2026-0001', testKey), secretNote);

  // Copy-pasting an encrypted cell to a different record ID (AAD mismatch) MUST fail authentication
  const swapped = decryptField(c1, 'health:HPR-2026-9999', testKey);
  assert.notEqual(swapped, secretNote);
  assert.ok(swapped.includes('Encrypted record'));

  // Tampering with ciphertext MUST fail GCM tag authentication
  const tampered = c1.slice(0, -2) + (c1.endsWith('AA') ? 'BB' : 'AA');
  assert.notEqual(decryptField(tampered, 'health:HPR-2026-0001', testKey), secretNote);

  // Legacy unencrypted plaintext reads back transparently without data loss
  assert.equal(decryptField('Mild headache', 'visit:VIS-2026-0001', testKey), 'Mild headache');
});

test('clinical records and local disk state envelope round-trip cleanly through AES-256-GCM', async () => {
  const {
    encryptVisitForStorage,
    decryptVisitFromStorage,
    encryptStateFileEnvelope,
    decryptStateFileEnvelope,
    isEncryptedField,
  } = await import('../../serverCrypto.ts');

  const visit: VisitRecord = {
    visit_id: 'VIS-2026-0777',
    student_id: 'STU-2026-0001',
    visit_datetime: '2026-10-21T10:00',
    reason: 'High fever 101.4F',
    observations: 'Flushed, chills',
    action_taken: 'Cold compress and Paracetamol',
    medicine_status: 'given',
    medicine_name: 'Paracetamol 500mg',
    dosage: '1',
    dosage_unit: 'tablet',
    route: 'Oral',
    administration_time: '10:05 AM',
    notes: 'Parent informed by phone',
    recorded_by: 'School Nurse',
    created_at: '2026-10-21T10:00:00Z',
  };

  const encrypted = encryptVisitForStorage(visit);
  assert.equal(isEncryptedField(encrypted.reason), true);
  assert.equal(isEncryptedField(encrypted.observations), true);
  assert.equal(isEncryptedField(encrypted.medicine_name), true);
  assert.ok(!encrypted.reason.includes('fever'));

  const decrypted = decryptVisitFromStorage(encrypted);
  assert.equal(decrypted.reason, visit.reason);
  assert.equal(decrypted.observations, visit.observations);
  assert.equal(decrypted.action_taken, visit.action_taken);
  assert.equal(decrypted.medicine_name, visit.medicine_name);
  assert.equal(decrypted.notes, visit.notes);

  const rawJson = JSON.stringify({ secret: 'top-secret-student-state' });
  const envelope = encryptStateFileEnvelope(rawJson);
  assert.ok(!envelope.includes('top-secret-student-state'));
  assert.equal(decryptStateFileEnvelope(envelope), rawJson);
});

test('session User-Agent binding blocks stolen token replay and control-char guard rejects null bytes', async () => {
  const {
    createSession,
    getSessionByToken,
    revokeSession,
    hasDangerousControlChars,
    isValidStaffUsername,
  } = await import('../../serverAuth.ts');

  const { token } = createSession(
    {
      username: 'admin',
      role: 'admin',
      displayName: 'Admin',
      badgeTitle: 'Admin',
      loginTime: new Date().toISOString(),
    },
    'Mozilla/5.0 SchoolBrowser/1.0'
  );

  assert.ok(getSessionByToken(token, 'Mozilla/5.0 SchoolBrowser/1.0'));
  assert.equal(getSessionByToken(token, 'curl/8.0 AttackerBot'), null);
  revokeSession(token);

  assert.equal(hasDangerousControlChars({ note: 'Normal text\nwith newline' }), false);
  assert.equal(hasDangerousControlChars({ note: 'Injected\x00nullbyte' }), true);
  assert.equal(isValidStaffUsername('warden_rahul-2'), true);
  assert.equal(isValidStaffUsername('<script>alert(1)</script>'), false);
});

test('generateEncryptedExcelWorkbook produces AES password-protected formatted workbooks without Users tab', async () => {
  const { generateEncryptedExcelWorkbook, ALLOWED_EXCEL_TABS, getExcelExportPassword } =
    await import('../../serverExcel.ts');
  const ExcelJS = (await import('exceljs')).default;
  const officeCryptoMod = await import('officecrypto-tool');
  const officeCrypto = (officeCryptoMod.default || officeCryptoMod) as unknown as {
    isEncrypted: (buf: Buffer) => boolean;
    decrypt: (buf: Buffer, opts: { password: string }) => Promise<Buffer>;
  };

  // Users tab must never be allowed
  assert.equal(ALLOWED_EXCEL_TABS.has('Users' as never), false);

  const testDb: NurseDatabase = {
    students: [
      ...sampleStudents,
      {
        student_id: 'STU-2026-0099',
        full_name: '=HYPERLINK("http://evil.example","Bad")',
        section: 'Sparkle',
        roll_number: '99',
        active_status: 'Active',
        created_at: '2026-10-21T08:00:00Z',
        updated_at: '2026-10-21T08:00:00Z',
      },
    ],
    visits: [
      {
        visit_id: 'VIS-2026-0101',
        student_id: 'STU-2026-0001',
        visit_datetime: '2026-10-21T09:30',
        reason: 'Mild headache',
        observations: 'Temp 98.4F',
        action_taken: 'Hydration & rest',
        medicine_status: 'none',
        medicine_name: 'None (No medicine given)',
        dosage: '',
        dosage_unit: '',
        route: '',
        administration_time: '',
        notes: 'Returned to class',
        recorded_by: 'School Nurse',
        created_at: '2026-10-21T09:30:00Z',
      },
    ],
    measurements: [
      {
        measurement_id: 'MSR-2026-0010',
        student_id: 'STU-2026-0001',
        measurement_date: '2026-10-20',
        height_cm: 150,
        weight_kg: 45,
        notes: 'Normal growth',
        updated_at: '2026-10-20T09:00:00Z',
      },
    ],
    healthProfiles: [
      {
        health_record_id: 'HPR-2026-0010',
        student_id: 'STU-2026-0001',
        condition_or_note: 'Dust allergy',
        status: 'Active',
        date_recorded: '2026-07-01',
        last_reviewed: '2026-10-20',
      },
    ],
  };

  const { buffer, filename } = await generateEncryptedExcelWorkbook(testDb, 'All');
  assert.ok(filename.endsWith('.xlsx'));
  assert.equal(officeCrypto.isEncrypted(buffer), true);

  // Wrong password must fail
  let wrongFailed = false;
  try {
    await officeCrypto.decrypt(buffer, { password: 'WrongPassword123' });
  } catch {
    wrongFailed = true;
  }
  assert.equal(wrongFailed, true);

  // Correct password decrypts cleanly to all 4 neatly formatted sheets (never Users)
  const decrypted = await officeCrypto.decrypt(buffer, { password: getExcelExportPassword() });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(decrypted as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const sheetNames = wb.worksheets.map((ws) => ws.name);
  assert.deepEqual(sheetNames, [
    'Students',
    'Visits',
    'Measurements',
    'Health Profiles',
    'Medicines',
    'Items',
    'Bills',
  ]);
  assert.ok(!sheetNames.includes('Users'));

  // Verify formula neutralization in Students sheet
  const studentsSheet = wb.getWorksheet('Students')!;
  const cellValues: string[] = [];
  studentsSheet.eachRow((row) => {
    row.eachCell((cell) => cellValues.push(String(cell.value ?? '')));
  });
  assert.ok(cellValues.some((v) => v.startsWith("'=HYPERLINK")));
});

test('normalizeSheetSyncPayload ignores CHANGE_*_PASSWORD placeholder rows in Users tab and preserves real staff logins', () => {
  const existingDb: NurseDatabase = {
    students: sampleStudents,
    visits: [],
    measurements: [],
    healthProfiles: [],
    users: [
      {
        username: 'admin',
        password: 'scrypt$existingAdminHash',
        role: 'admin',
        display_name: 'Infirmary Administrator',
        badge_title: 'System Admin',
        active_status: 'Active',
      },
      {
        username: 'nurse',
        password: 'scrypt$existingNurseHash',
        role: 'nurse',
        display_name: 'School Nurse',
        badge_title: 'Infirmary Nurse',
        active_status: 'Active',
      },
      {
        username: 'agnel',
        password: 'scrypt$existingAgnelHash',
        role: 'warden',
        display_name: 'Agnel (Hostel Warden)',
        badge_title: 'Hostel Warden',
        active_status: 'Active',
      },
    ],
  };

  const synced = normalizeSheetSyncPayload(
    {
      students: [],
      visits: [],
      measurements: [],
      healthProfiles: [],
      users: [
        { username: 'admin', password: 'CHANGE_ADMIN_PASSWORD', role: 'admin', active_status: 'Active' },
        { username: 'nurse', password: 'CHANGE_NURSE_PASSWORD', role: 'nurse', active_status: 'Active' },
        { username: 'warden', password: 'CHANGE_WARDEN_PASSWORD', role: 'warden', active_status: 'Active' },
      ],
    },
    existingDb
  );

  assert.equal(synced.users?.length, 3);
  assert.equal(synced.users?.find((u) => u.username === 'admin')?.password, 'scrypt$existingAdminHash');
  assert.equal(synced.users?.find((u) => u.username === 'nurse')?.password, 'scrypt$existingNurseHash');
  assert.equal(synced.users?.find((u) => u.username === 'agnel')?.password, 'scrypt$existingAgnelHash');
  assert.equal(synced.users?.some((u) => u.username === 'warden'), false);
});

test('GOOGLE_APPS_SCRIPT_CODE has no secret-key gating or placeholder Users seeding and supports all sync actions', async () => {
  const { GOOGLE_APPS_SCRIPT_CODE } = await import('./appsScriptTemplate.ts');
  assert.equal(GOOGLE_APPS_SCRIPT_CODE.includes('API_SECRET'), false);
  assert.equal(GOOGLE_APPS_SCRIPT_CODE.includes('isAuthorizedRequest'), false);
  assert.equal(GOOGLE_APPS_SCRIPT_CODE.includes('CHANGE_ADMIN_PASSWORD'), false);
  assert.equal(GOOGLE_APPS_SCRIPT_CODE.includes('CHANGE_NURSE_PASSWORD'), false);
  assert.equal(GOOGLE_APPS_SCRIPT_CODE.includes('CHANGE_WARDEN_PASSWORD'), false);
  for (const action of [
    'createVisit',
    'addMeasurement',
    'addHealthProfile',
    'createStudent',
    'updateStudent',
    'renameClass',
    'upsertUser',
    'deleteUser',
    'updateSettings',
    'upsertMedicine',
    'deleteMedicine',
    'upsertItem',
    'deleteItem',
    'addStockTransaction',
    'uploadBillImage',
    'upsertBill',
    'deleteBill',
    'syncStudentsBatch',
    'syncFullDatabase',
  ]) {
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes(`action === '${action}'`), `Missing action ${action}`);
  }
});

test('Phase 1 shift classification auto-tags School Hours vs Night and respects custom timings and manual overrides', async () => {
  const {
    classifyVisitShift,
    resolveVisitShiftPeriod,
    formatShiftPeriodLabel,
    DEFAULT_INFIRMARY_SETTINGS,
  } = await import('./nurseLogic.ts');

  // Default 07:30 – 15:30
  assert.equal(classifyVisitShift('2026-10-17T07:30', DEFAULT_INFIRMARY_SETTINGS), 'school_hours');
  assert.equal(classifyVisitShift('2026-10-17T12:15', DEFAULT_INFIRMARY_SETTINGS), 'school_hours');
  assert.equal(classifyVisitShift('2026-10-17T15:30', DEFAULT_INFIRMARY_SETTINGS), 'school_hours');
  assert.equal(classifyVisitShift('2026-10-17T07:29', DEFAULT_INFIRMARY_SETTINGS), 'night');
  assert.equal(classifyVisitShift('2026-10-17T21:45', DEFAULT_INFIRMARY_SETTINGS), 'night');

  // Custom Admin school hours (08:00 – 14:00)
  const customHours = { school_hours_start: '08:00', school_hours_end: '14:00' };
  assert.equal(classifyVisitShift('2026-10-17T07:45', customHours), 'night');
  assert.equal(classifyVisitShift('2026-10-17T14:30', customHours), 'night');
  assert.equal(classifyVisitShift('2026-10-17T10:00', customHours), 'school_hours');

  // Manual override takes priority over timestamp
  assert.equal(
    resolveVisitShiftPeriod(
      { visit_datetime: '2026-10-17T10:00', shift_period: 'night', shift_overridden: true },
      DEFAULT_INFIRMARY_SETTINGS
    ),
    'night'
  );
  assert.equal(formatShiftPeriodLabel('school_hours'), 'School Hours');
  assert.equal(formatShiftPeriodLabel('night'), 'Night / After-Hours');
});

test('Phase 1 normalizeSheetSyncPayload merges medicines, items, bills, stock transactions, and settings cleanly', () => {
  const existingDb: NurseDatabase = {
    students: sampleStudents,
    visits: [],
    measurements: [],
    healthProfiles: [],
    bills: [
      {
        bill_id: 'BIL-2026-0001',
        bill_number: 'INV-101',
        vendor_name: 'Apollo Pharmacy',
        bill_date: '2026-10-17',
        category: 'Medicines',
        total_amount: 1450,
        payment_status: 'Paid',
        image_data_url: 'data:image/jpeg;base64,LOCALPREVIEW',
        created_at: '2026-10-17T10:00:00Z',
      },
    ],
  };

  const synced = normalizeSheetSyncPayload(
    {
      students: [],
      visits: [],
      measurements: [],
      healthProfiles: [],
      medicines: [
        {
          medicine_id: 'MED-2026-0001',
          name: 'Paracetamol Syrup',
          category: 'Fever & Pain',
          form_strength: '60ml',
          unit: 'bottles',
          current_stock: '12',
          min_stock_alert: '4',
        },
      ],
      items: [
        {
          item_id: 'ITM-2026-0001',
          name: 'Crepe Bandage',
          category: 'Dressing & Bandages',
          unit: 'rolls',
          current_stock: '8',
          min_stock_alert: '3',
        },
      ],
      bills: [
        {
          bill_id: 'BIL-2026-0001',
          bill_number: 'INV-101',
          vendor_name: 'Apollo Pharmacy',
          bill_date: '2026-10-17',
          category: 'Medicines',
          total_amount: '1450',
          payment_status: 'Paid',
          drive_file_id: 'drive123',
          image_url: 'https://drive.google.com/uc?export=view&id=drive123',
        },
      ],
      settings: {
        school_hours_start: '08:00',
        school_hours_end: '15:00',
      },
    } as any,
    existingDb
  );

  assert.equal(synced.medicines?.length, 1);
  assert.equal(synced.medicines?.[0].current_stock, 12);
  assert.equal(synced.items?.length, 1);
  assert.equal(synced.items?.[0].current_stock, 8);
  assert.equal(synced.bills?.length, 1);
  assert.equal(synced.bills?.[0].image_url, 'https://drive.google.com/uc?export=view&id=drive123');
  assert.equal(synced.bills?.[0].image_data_url, 'data:image/jpeg;base64,LOCALPREVIEW');
  assert.equal(synced.settings?.school_hours_start, '08:00');
  assert.equal(synced.settings?.school_hours_end, '15:00');
});

test('Phase 1 RBAC blocks Warden from inventory, bills, and school hours while authorizing Nurse & Admin appropriately', async () => {
  const { sanitizeDbForRole, isMutationAllowedForRole } = await import('../../serverAuth.ts');
  const dbWithPhase1: NurseDatabase = {
    students: sampleStudents,
    visits: [],
    measurements: [],
    healthProfiles: [],
    medicines: [
      {
        medicine_id: 'MED-2026-0001',
        name: 'ORS',
        category: 'Hydration / ORS',
        form_strength: '21g',
        unit: 'sachets',
        batch_number: 'B1',
        expiry_date: '2027-01-01',
        current_stock: 20,
        min_stock_alert: 5,
        updated_at: '2026-10-17T08:00:00Z',
      },
    ],
    items: [
      {
        item_id: 'ITM-2026-0001',
        name: 'Bandage',
        category: 'First Aid',
        unit: 'rolls',
        current_stock: 15,
        min_stock_alert: 5,
        updated_at: '2026-10-17T08:00:00Z',
      },
    ],
    stockTransactions: [],
    bills: [
      {
        bill_id: 'BIL-2026-0001',
        bill_number: 'INV-1',
        vendor_name: 'MedPlus',
        bill_date: '2026-10-17',
        category: 'Medicines',
        total_amount: 500,
        payment_status: 'Paid',
        created_at: '2026-10-17T08:00:00Z',
      },
    ],
  };

  const wardenDb = sanitizeDbForRole(dbWithPhase1, 'warden');
  assert.equal(wardenDb.medicines?.length, 0);
  assert.equal(wardenDb.items?.length, 0);
  assert.equal(wardenDb.bills?.length, 0);

  const nurseDb = sanitizeDbForRole(dbWithPhase1, 'nurse');
  assert.equal(nurseDb.medicines?.length, 1);
  assert.equal(nurseDb.items?.length, 1);
  assert.equal(nurseDb.bills?.length, 1);

  assert.equal(isMutationAllowedForRole('upsertMedicine', 'warden'), false);
  assert.equal(isMutationAllowedForRole('createBill', 'warden'), false);
  assert.equal(isMutationAllowedForRole('updateSchoolHours', 'warden'), false);
  assert.equal(isMutationAllowedForRole('upsertMedicine', 'nurse'), true);
  assert.equal(isMutationAllowedForRole('createBill', 'nurse'), true);
  assert.equal(isMutationAllowedForRole('updateSchoolHours', 'nurse'), false);
  assert.equal(isMutationAllowedForRole('updateSchoolHours', 'admin'), true);
});


