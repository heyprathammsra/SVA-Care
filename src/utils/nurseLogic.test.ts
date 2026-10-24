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

test('authenticateUser verifies nurse and admin credentials accurately', async () => {
  const { authenticateUser } = await import('./auth.ts');

  // Test 1: Valid nurse credentials
  const nurseUser = authenticateUser('nurse', 'iloveeating');
  assert.ok(nurseUser);
  assert.equal(nurseUser?.username, 'nurse');
  assert.equal(nurseUser?.role, 'nurse');
  assert.equal(nurseUser?.displayName, 'School Nurse');

  // Test 2: Valid admin credentials
  const adminUser = authenticateUser('admin', 'sva0pass');
  assert.ok(adminUser);
  assert.equal(adminUser?.username, 'admin');
  assert.equal(adminUser?.role, 'admin');
  assert.equal(adminUser?.displayName, 'Infirmary Administrator');

  // Test 3: Case-insensitive username and whitespace trimming
  const mixedCaseNurse = authenticateUser('  NURSE  ', 'iloveeating');
  assert.ok(mixedCaseNurse);
  assert.equal(mixedCaseNurse?.username, 'nurse');

  const mixedCaseAdmin = authenticateUser('Admin ', 'sva0pass');
  assert.ok(mixedCaseAdmin);
  assert.equal(mixedCaseAdmin?.username, 'admin');

  // Test 4: Wrong passwords rejected
  assert.equal(authenticateUser('nurse', 'wrongpass'), null);
  assert.equal(authenticateUser('admin', 'iloveeating'), null);

  // Test 5: Wrong usernames rejected
  assert.equal(authenticateUser('doctor', 'iloveeating'), null);
  assert.equal(authenticateUser('', 'sva0pass'), null);
  assert.equal(authenticateUser('nurse', ''), null);
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
  assert.ok(csv.includes('Sr No,Visit ID,Date,Time,Student Name,Roll No,Class'));
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




