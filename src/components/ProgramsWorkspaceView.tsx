import React, { useState, useMemo, useRef } from 'react';
import {
  Stethoscope,
  Building2,
  HeartPulse,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Camera,
  ExternalLink,
  Eye,
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Calendar,
  Clock,
  FileText,
  Image as ImageIcon,
  ClipboardCheck,
  Lock,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
} from 'lucide-react';
import {
  formatTimeFromDatetime,
  getCurrentAcademicYear,
  computeFrequentVisitors,
  computeCommonIssues,
  getOpdImages,
  type StudentRecord,
  type VisitRecord,
  type ItemInventoryRecord,
  type DoctorVisitSession,
  type DoctorVisitCase,
  type OpdRecord,
  type OpdImageAttachment,
  type OpdStatus,
  type MedicalCampRecord,
  type CampScreeningRecord,
  type AnnualCheckupRecord,
  type MenstrualLogRecord,
  type NurseDatabase,
} from '../utils/nurseLogic';
import {
  downloadSheetPdf,
  type DownloadableExcelTab,
  type DownloadableSheetTab,
} from '../utils/pdfExport';
import { getTodayLocalDateString, getNowLocalDatetimeString } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';
import { ModalDialog } from './ModalDialog';
import { AnnualCheckupTab } from './AnnualCheckupTab';
import { MenstrualHealthTab } from './MenstrualHealthTab';
import { HealthInsightsTab } from './HealthInsightsTab';

export interface ProgramsActionResult {
  ok: boolean;
  message: string;
}

interface ProgramsWorkspaceViewProps {
  students: StudentRecord[];
  classes: string[];
  visits: VisitRecord[];
  items: ItemInventoryRecord[];
  doctorVisits: DoctorVisitSession[];
  doctorVisitCases: DoctorVisitCase[];
  opdRecords: OpdRecord[];
  medicalCamps: MedicalCampRecord[];
  campScreenings: CampScreeningRecord[];
  annualCheckups: AnnualCheckupRecord[];
  menstrualLogs: MenstrualLogRecord[];
  onUpsertDoctorVisit: (session: Partial<DoctorVisitSession>) => Promise<ProgramsActionResult>;
  onDeleteDoctorVisit: (doctorVisitId: string) => Promise<ProgramsActionResult>;
  onUpsertDoctorVisitCase: (caseItem: Partial<DoctorVisitCase>) => Promise<ProgramsActionResult>;
  onDeleteDoctorVisitCase: (caseId: string) => Promise<ProgramsActionResult>;
  onCreateOpd: (opd: Partial<OpdRecord>) => Promise<ProgramsActionResult>;
  onUpdateOpd: (opd: Partial<OpdRecord>) => Promise<ProgramsActionResult>;
  onDeleteOpd: (opdId: string) => Promise<ProgramsActionResult>;
  onUpsertMedicalCamp: (camp: Partial<MedicalCampRecord>) => Promise<ProgramsActionResult>;
  onDeleteMedicalCamp: (campId: string) => Promise<ProgramsActionResult>;
  onUpsertCampScreening: (screening: Partial<CampScreeningRecord>) => Promise<ProgramsActionResult>;
  onDeleteCampScreening: (screeningId: string) => Promise<ProgramsActionResult>;
  onUpsertAnnualCheckup: (record: Partial<AnnualCheckupRecord>) => Promise<ProgramsActionResult>;
  onDeleteAnnualCheckup: (checkupId: string) => Promise<ProgramsActionResult>;
  onUpsertMenstrualLog: (record: Partial<MenstrualLogRecord>) => Promise<ProgramsActionResult>;
  onDeleteMenstrualLog: (menstrualId: string) => Promise<ProgramsActionResult>;
  onDownloadExcelSheet?: (tab: DownloadableExcelTab) => Promise<ProgramsActionResult>;
  onSelectStudent?: (student: StudentRecord) => void;
  initialTab?: ProgramsTab;
  initialTabNonce?: number;
}

export type ProgramsTab = 'hub' | 'doctor' | 'opd' | 'camps' | 'checkups' | 'menstrual' | 'insights';

const CAMP_TYPES = [
  'General Health',
  'Dental',
  'Eye / Vision',
  'Vaccination',
  'ENT',
  'Skin / Hygiene',
  'Nutrition & Growth',
  'Other',
];

const OPD_STATUSES: OpdStatus[] = ['Referred', 'Returned', 'Follow-up'];

function isSafeImageSrc(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/[^\s]+$/i.test(trimmed) || /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed);
}

function isSafeExternalLink(url: string | undefined): boolean {
  if (!url) return false;
  return /^https:\/\/[^\s]+$/i.test(url.trim());
}

/**
 * Compresses an uploaded OPD slip / prescription photo in the browser to a lightweight JPEG data URL
 * (max 1200px longest side, quality 0.78) for fast uploads over school mobile connections.
 */
async function compressOpdImageFile(file: File): Promise<{ dataUrl: string; sizeKb: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = objectUrl;
    });
    const maxDim = 1200;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to prepare image preview.');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    return { dataUrl, sizeKb: Math.max(1, Math.round(approxBytes / 1024)) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatReadableDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface StudentPickerFieldProps {
  students: StudentRecord[];
  classes: string[];
  selectedStudentId: string;
  onSelect: (studentId: string) => void;
  disabled?: boolean;
  label?: string;
}

const StudentPickerField: React.FC<StudentPickerFieldProps> = ({
  students,
  classes,
  selectedStudentId,
  onSelect,
  disabled = false,
  label = 'Student *',
}) => {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');

  const selectedStudent = useMemo(
    () => students.find((s) => s.student_id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => s.active_status !== 'Inactive')
      .filter((s) => (classFilter === 'ALL' ? true : s.section === classFilter))
      .filter((s) => {
        if (!q) return true;
        return (
          s.full_name.toLowerCase().includes(q) ||
          s.section.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [students, classFilter, query]);

  if (selectedStudent && !disabled) {
    return (
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
          {label}
        </label>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-zinc-900 truncate">
              {selectedStudent.full_name}
            </div>
            <div className="text-[11.5px] text-teal-800 font-medium">
              {selectedStudent.section} · Roll {selectedStudent.roll_number}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect('');
              setQuery('');
            }}
            className="text-[11.5px] font-semibold text-teal-700 hover:text-teal-900 px-2.5 py-1 rounded-lg bg-white border border-teal-200 shrink-0 cursor-pointer"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
        {label}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <div className="relative sm:col-span-2">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder="Search student name or roll no..."
            className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-stone-200 bg-white text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
          />
        </div>
        <CustomSelect
          value={classFilter}
          onChange={setClassFilter}
          options={[
            { value: 'ALL', label: 'All Classes' },
            ...classes.map((c) => ({ value: c, label: c })),
          ]}
          size="sm"
        />
      </div>
      <div className="max-h-36 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/40 divide-y divide-stone-100">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-zinc-400">
            No matching students found.
          </div>
        ) : (
          filtered.map((stu) => (
            <button
              key={stu.student_id}
              type="button"
              onClick={() => onSelect(stu.student_id)}
              className="w-full text-left px-3 py-2 hover:bg-teal-50/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="text-[13px] font-medium text-zinc-900 truncate">
                {stu.full_name}
              </span>
              <span className="text-[11px] tabular-nums text-zinc-500 shrink-0">
                {stu.section} · #{stu.roll_number}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export const ProgramsWorkspaceView: React.FC<ProgramsWorkspaceViewProps> = ({
  students,
  classes,
  visits,
  items,
  doctorVisits,
  doctorVisitCases,
  opdRecords,
  medicalCamps,
  campScreenings,
  annualCheckups,
  menstrualLogs,
  onUpsertDoctorVisit,
  onDeleteDoctorVisit,
  onUpsertDoctorVisitCase,
  onDeleteDoctorVisitCase,
  onCreateOpd,
  onUpdateOpd,
  onDeleteOpd,
  onUpsertMedicalCamp,
  onDeleteMedicalCamp,
  onUpsertCampScreening,
  onDeleteCampScreening,
  onUpsertAnnualCheckup,
  onDeleteAnnualCheckup,
  onUpsertMenstrualLog,
  onDeleteMenstrualLog,
  onDownloadExcelSheet,
  onSelectStudent,
  initialTab = 'hub',
  initialTabNonce = 0,
}) => {
  const [activeTab, setActiveTab] = useState<ProgramsTab>(initialTab);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingProgramKey, setExportingProgramKey] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialTabNonce > 0) {
      setActiveTab(initialTab);
    }
  }, [initialTab, initialTabNonce]);

  // ---- Search & Filter State ----
  const [docSearch, setDocSearch] = useState('');
  const [expandedDocIds, setExpandedDocIds] = useState<Record<string, boolean>>({});
  const [opdSearch, setOpdSearch] = useState('');
  const [opdStatusFilter, setOpdStatusFilter] = useState<'ALL' | OpdStatus>('ALL');
  const [campSearch, setCampSearch] = useState('');
  const [expandedCampIds, setExpandedCampIds] = useState<Record<string, boolean>>({});
  const [campReferralOnlyMap, setCampReferralOnlyMap] = useState<Record<string, boolean>>({});

  // ---- Doctor Visit Session Modal State ----
  const [docSessionModalOpen, setDocSessionModalOpen] = useState(false);
  const [editingDocSession, setEditingDocSession] = useState<DoctorVisitSession | null>(null);
  const [docVisitDate, setDocVisitDate] = useState(getTodayLocalDateString());
  const [docSessionTime, setDocSessionTime] = useState('10:00 AM – 12:30 PM');
  const [docName, setDocName] = useState('');
  const [docSpec, setDocSpec] = useState('');
  const [docNotes, setDocNotes] = useState('');

  // ---- Doctor Visit Case Modal State ----
  const [docCaseModalOpen, setDocCaseModalOpen] = useState(false);
  const [docCaseSessionId, setDocCaseSessionId] = useState('');
  const [editingDocCase, setEditingDocCase] = useState<DoctorVisitCase | null>(null);
  const [docCaseStudentId, setDocCaseStudentId] = useState('');
  const [docCaseComplaint, setDocCaseComplaint] = useState('');
  const [docCaseFindings, setDocCaseFindings] = useState('');
  const [docCaseAdvice, setDocCaseAdvice] = useState('');
  const [docCaseFollowUp, setDocCaseFollowUp] = useState(false);
  const [docCaseNotes, setDocCaseNotes] = useState('');

  // ---- External OPD Modal & Lightbox State ----
  const [opdModalOpen, setOpdModalOpen] = useState(false);
  const [editingOpd, setEditingOpd] = useState<OpdRecord | null>(null);
  const [opdStudentId, setOpdStudentId] = useState('');
  const [opdDateTime, setOpdDateTime] = useState(getNowLocalDatetimeString());
  const [opdHospital, setOpdHospital] = useState('');
  const [opdDoctor, setOpdDoctor] = useState('');
  const [opdReason, setOpdReason] = useState('');
  const [opdEscort, setOpdEscort] = useState('');
  const [opdDiagnosis, setOpdDiagnosis] = useState('');
  const [opdFollowUpDate, setOpdFollowUpDate] = useState('');
  const [opdStatus, setOpdStatus] = useState<OpdStatus>('Referred');
  const [opdNotes, setOpdNotes] = useState('');
  const [opdImages, setOpdImages] = useState<Array<OpdImageAttachment & { sizeKb?: number }>>([]);
  const [opdImageCompressing, setOpdImageCompressing] = useState(false);
  const opdFileInputRef = useRef<HTMLInputElement | null>(null);
  const opdCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [lightboxOpd, setLightboxOpd] = useState<OpdRecord | null>(null);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);

  // ---- Medical Camp Modal State ----
  const [campModalOpen, setCampModalOpen] = useState(false);
  const [editingCamp, setEditingCamp] = useState<MedicalCampRecord | null>(null);
  const [campTitle, setCampTitle] = useState('');
  const [campType, setCampType] = useState('General Health');
  const [campOrganizer, setCampOrganizer] = useState('');
  const [campDate, setCampDate] = useState(getTodayLocalDateString());
  const [campTargetClasses, setCampTargetClasses] = useState('All Classes');
  const [campDoctorTeam, setCampDoctorTeam] = useState('');
  const [campSummary, setCampSummary] = useState('');

  // ---- Camp Screening Modal State ----
  const [screeningModalOpen, setScreeningModalOpen] = useState(false);
  const [screeningCampId, setScreeningCampId] = useState('');
  const [editingScreening, setEditingScreening] = useState<CampScreeningRecord | null>(null);
  const [screeningStudentId, setScreeningStudentId] = useState('');
  const [screeningFindings, setScreeningFindings] = useState('');
  const [screeningReferral, setScreeningReferral] = useState(false);
  const [screeningNotes, setScreeningNotes] = useState('');
  const [screeningQuickCount, setScreeningQuickCount] = useState(0);

  // ---- Delete Confirmation State ----
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'docSession' | 'docCase' | 'opd' | 'camp' | 'screening';
    id: string;
    label: string;
    detail?: string;
  } | null>(null);

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.student_id, s])),
    [students]
  );

  const showToast = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
  };

  const buildProgramsExportDb = (): NurseDatabase => ({
    students,
    visits,
    measurements: [],
    healthProfiles: [],
    items,
    doctorVisits,
    doctorVisitCases,
    opdRecords,
    medicalCamps,
    campScreenings,
    annualCheckups,
    menstrualLogs,
  });

  const getProgramExportMeta = (
    tab: Exclude<ProgramsTab, 'hub'>
  ): { sheetTab: DownloadableSheetTab; excelTab: DownloadableExcelTab | null } => {
    switch (tab) {
      case 'doctor':
        return { sheetTab: 'Doctor Visits', excelTab: 'Doctor Visits' };
      case 'opd':
        return { sheetTab: 'External OPD', excelTab: 'External OPD' };
      case 'camps':
        return { sheetTab: 'Medical Camps', excelTab: 'Medical Camps' };
      case 'checkups':
        return { sheetTab: 'Annual Checkups', excelTab: 'Annual Checkups' };
      case 'menstrual':
        return { sheetTab: 'Menstrual Log', excelTab: 'Menstrual Log' };
      case 'insights':
        return { sheetTab: 'Health Insights', excelTab: null };
    }
  };

  const handleDownloadProgramPdf = (sheetTab: DownloadableSheetTab) => {
    if (exportingProgramKey) return;
    setExportingProgramKey(`pdf:${sheetTab}`);
    try {
      const res = downloadSheetPdf(sheetTab, buildProgramsExportDb());
      showToast(res.ok ? 'success' : 'error', res.message);
    } finally {
      setExportingProgramKey(null);
    }
  };

  const handleDownloadProgramExcel = async (excelTab: DownloadableExcelTab) => {
    if (!onDownloadExcelSheet || exportingProgramKey) return;
    setExportingProgramKey(`xlsx:${excelTab}`);
    try {
      const res = await onDownloadExcelSheet(excelTab);
      showToast(res.ok ? 'success' : 'error', res.message);
    } finally {
      setExportingProgramKey(null);
    }
  };

  // ---- Derived Data: Weekly Doctor Visits ----
  const sortedDoctorVisits = useMemo(
    () =>
      [...doctorVisits].sort(
        (a, b) =>
          (b.visit_date || '').localeCompare(a.visit_date || '') ||
          (b.created_at || '').localeCompare(a.created_at || '')
      ),
    [doctorVisits]
  );

  const casesBySessionId = useMemo(() => {
    const map = new Map<string, DoctorVisitCase[]>();
    for (const c of doctorVisitCases) {
      const list = map.get(c.doctor_visit_id) || [];
      list.push(c);
      map.set(c.doctor_visit_id, list);
    }
    return map;
  }, [doctorVisitCases]);

  const filteredDoctorVisits = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return sortedDoctorVisits;
    return sortedDoctorVisits.filter((sess) => {
      if (
        sess.doctor_name.toLowerCase().includes(q) ||
        (sess.specialization || '').toLowerCase().includes(q) ||
        (sess.campus_notes || '').toLowerCase().includes(q) ||
        (sess.visit_date || '').includes(q)
      ) {
        return true;
      }
      const sessCases = casesBySessionId.get(sess.doctor_visit_id) || [];
      return sessCases.some((c) => {
        const stu = studentById.get(c.student_id);
        return (
          (c.student_name || stu?.full_name || '').toLowerCase().includes(q) ||
          c.complaint.toLowerCase().includes(q) ||
          (c.prescription_or_advice || '').toLowerCase().includes(q)
        );
      });
    });
  }, [sortedDoctorVisits, docSearch, casesBySessionId, studentById]);

  const doctorFollowUpCount = useMemo(
    () => doctorVisitCases.filter((c) => Boolean(c.follow_up_needed)).length,
    [doctorVisitCases]
  );

  // ---- Derived Data: External OPD ----
  const sortedOpdRecords = useMemo(
    () =>
      [...opdRecords].sort((a, b) =>
        (b.referral_datetime || b.created_at || '').localeCompare(
          a.referral_datetime || a.created_at || ''
        )
      ),
    [opdRecords]
  );

  const filteredOpdRecords = useMemo(() => {
    const q = opdSearch.trim().toLowerCase();
    return sortedOpdRecords.filter((o) => {
      if (opdStatusFilter !== 'ALL' && o.status !== opdStatusFilter) return false;
      if (!q) return true;
      const stu = studentById.get(o.student_id);
      return (
        (o.student_name || stu?.full_name || '').toLowerCase().includes(q) ||
        (o.section || stu?.section || '').toLowerCase().includes(q) ||
        o.hospital_or_clinic.toLowerCase().includes(q) ||
        (o.doctor_name || '').toLowerCase().includes(q) ||
        o.reason.toLowerCase().includes(q) ||
        (o.diagnosis_and_advice || '').toLowerCase().includes(q)
      );
    });
  }, [sortedOpdRecords, opdSearch, opdStatusFilter, studentById]);

  const activeOpdCount = useMemo(
    () => opdRecords.filter((o) => o.status === 'Referred' || o.status === 'Follow-up').length,
    [opdRecords]
  );
  const opdSlipsCount = useMemo(
    () =>
      opdRecords.filter((o) =>
        getOpdImages(o).some((img) => isSafeImageSrc(img.image_data_url || img.image_url))
      ).length,
    [opdRecords]
  );

  // ---- Derived Data: Medical Camps ----
  const sortedCamps = useMemo(
    () =>
      [...medicalCamps].sort(
        (a, b) =>
          (b.camp_date || '').localeCompare(a.camp_date || '') ||
          (b.created_at || '').localeCompare(a.created_at || '')
      ),
    [medicalCamps]
  );

  const screeningsByCampId = useMemo(() => {
    const map = new Map<string, CampScreeningRecord[]>();
    for (const s of campScreenings) {
      const list = map.get(s.camp_id) || [];
      list.push(s);
      map.set(s.camp_id, list);
    }
    return map;
  }, [campScreenings]);

  const filteredCamps = useMemo(() => {
    const q = campSearch.trim().toLowerCase();
    if (!q) return sortedCamps;
    return sortedCamps.filter((camp) => {
      if (
        camp.camp_title.toLowerCase().includes(q) ||
        camp.camp_type.toLowerCase().includes(q) ||
        (camp.organizer || '').toLowerCase().includes(q) ||
        (camp.doctor_team || '').toLowerCase().includes(q) ||
        (camp.camp_date || '').includes(q)
      ) {
        return true;
      }
      const list = screeningsByCampId.get(camp.camp_id) || [];
      return list.some((sc) => {
        const stu = studentById.get(sc.student_id);
        return (
          (sc.student_name || stu?.full_name || '').toLowerCase().includes(q) ||
          sc.findings.toLowerCase().includes(q)
        );
      });
    });
  }, [sortedCamps, campSearch, screeningsByCampId, studentById]);

  const campReferralsCount = useMemo(
    () => campScreenings.filter((s) => Boolean(s.referral_needed)).length,
    [campScreenings]
  );

  // ---- Modal Openers ----
  const openNewDocSession = () => {
    setEditingDocSession(null);
    setDocVisitDate(getTodayLocalDateString());
    setDocSessionTime('10:00 AM – 12:30 PM');
    setDocName('');
    setDocSpec('');
    setDocNotes('');
    setDocSessionModalOpen(true);
  };

  const openEditDocSession = (sess: DoctorVisitSession) => {
    setEditingDocSession(sess);
    setDocVisitDate(sess.visit_date || getTodayLocalDateString());
    setDocSessionTime(sess.session_time || '');
    setDocName(sess.doctor_name);
    setDocSpec(sess.specialization || '');
    setDocNotes(sess.campus_notes || '');
    setDocSessionModalOpen(true);
  };

  const openNewDocCase = (sessionId: string) => {
    setEditingDocCase(null);
    setDocCaseSessionId(sessionId);
    setDocCaseStudentId('');
    setDocCaseComplaint('');
    setDocCaseFindings('');
    setDocCaseAdvice('');
    setDocCaseFollowUp(false);
    setDocCaseNotes('');
    setDocCaseModalOpen(true);
  };

  const openEditDocCase = (c: DoctorVisitCase) => {
    setEditingDocCase(c);
    setDocCaseSessionId(c.doctor_visit_id);
    setDocCaseStudentId(c.student_id);
    setDocCaseComplaint(c.complaint);
    setDocCaseFindings(c.findings || '');
    setDocCaseAdvice(c.prescription_or_advice || '');
    setDocCaseFollowUp(Boolean(c.follow_up_needed));
    setDocCaseNotes(c.notes || '');
    setDocCaseModalOpen(true);
  };

  const openNewOpd = () => {
    setEditingOpd(null);
    setOpdStudentId('');
    setOpdDateTime(getNowLocalDatetimeString());
    setOpdHospital('');
    setOpdDoctor('');
    setOpdReason('');
    setOpdEscort('');
    setOpdDiagnosis('');
    setOpdFollowUpDate('');
    setOpdStatus('Referred');
    setOpdNotes('');
    setOpdImages([]);
    setOpdModalOpen(true);
  };

  const openEditOpd = (o: OpdRecord) => {
    setEditingOpd(o);
    setOpdStudentId(o.student_id);
    setOpdDateTime((o.referral_datetime || getNowLocalDatetimeString()).slice(0, 16));
    setOpdHospital(o.hospital_or_clinic);
    setOpdDoctor(o.doctor_name || '');
    setOpdReason(o.reason);
    setOpdEscort(o.escort_or_parent || '');
    setOpdDiagnosis(o.diagnosis_and_advice || '');
    setOpdFollowUpDate(o.follow_up_date || '');
    setOpdStatus(o.status || 'Referred');
    setOpdNotes(o.notes || '');
    setOpdImages(getOpdImages(o));
    setOpdModalOpen(true);
  };

  const openNewCamp = () => {
    setEditingCamp(null);
    setCampTitle('');
    setCampType('General Health');
    setCampOrganizer('');
    setCampDate(getTodayLocalDateString());
    setCampTargetClasses('All Classes');
    setCampDoctorTeam('');
    setCampSummary('');
    setCampModalOpen(true);
  };

  const openEditCamp = (camp: MedicalCampRecord) => {
    setEditingCamp(camp);
    setCampTitle(camp.camp_title);
    setCampType(camp.camp_type || 'General Health');
    setCampOrganizer(camp.organizer || '');
    setCampDate(camp.camp_date || getTodayLocalDateString());
    setCampTargetClasses(camp.target_classes || '');
    setCampDoctorTeam(camp.doctor_team || '');
    setCampSummary(camp.summary || '');
    setCampModalOpen(true);
  };

  const openNewScreening = (campId: string) => {
    setEditingScreening(null);
    setScreeningCampId(campId);
    setScreeningStudentId('');
    setScreeningFindings('');
    setScreeningReferral(false);
    setScreeningNotes('');
    setScreeningQuickCount(0);
    setScreeningModalOpen(true);
  };

  const openEditScreening = (sc: CampScreeningRecord) => {
    setEditingScreening(sc);
    setScreeningCampId(sc.camp_id);
    setScreeningStudentId(sc.student_id);
    setScreeningFindings(sc.findings);
    setScreeningReferral(Boolean(sc.referral_needed));
    setScreeningNotes(sc.notes || '');
    setScreeningQuickCount(0);
    setScreeningModalOpen(true);
  };

  // ---- Submit Handlers ----
  const handleSaveDocSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) {
      showToast('error', 'Please enter the visiting doctor name.');
      return;
    }
    setSaving(true);
    try {
      const res = await onUpsertDoctorVisit({
        doctor_visit_id: editingDocSession?.doctor_visit_id,
        visit_date: docVisitDate,
        session_time: docSessionTime.trim() || undefined,
        doctor_name: docName.trim(),
        specialization: docSpec.trim() || undefined,
        campus_notes: docNotes.trim() || undefined,
      });
      if (res.ok) {
        setDocSessionModalOpen(false);
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDocCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docCaseStudentId) {
      showToast('error', 'Please select a student.');
      return;
    }
    if (!docCaseComplaint.trim()) {
      showToast('error', 'Please enter the complaint or reason for seeing the doctor.');
      return;
    }
    setSaving(true);
    try {
      const res = await onUpsertDoctorVisitCase({
        case_id: editingDocCase?.case_id,
        doctor_visit_id: docCaseSessionId,
        student_id: docCaseStudentId,
        complaint: docCaseComplaint.trim(),
        findings: docCaseFindings.trim() || undefined,
        prescription_or_advice: docCaseAdvice.trim() || undefined,
        follow_up_needed: docCaseFollowUp,
        notes: docCaseNotes.trim() || undefined,
      });
      if (res.ok) {
        setDocCaseModalOpen(false);
        setExpandedDocIds((prev) => ({ ...prev, [docCaseSessionId]: true }));
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const MAX_OPD_PHOTOS = 15;

  const handleOpdPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_OPD_PHOTOS - opdImages.length);
    if (remainingSlots === 0) {
      showToast('error', `You can attach up to ${MAX_OPD_PHOTOS} photos per OPD record.`);
      e.target.value = '';
      return;
    }

    const validFiles = files.filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      showToast('error', 'Please select valid photo files (JPG, PNG, or WebP).');
      e.target.value = '';
      return;
    }

    const toProcess = validFiles.slice(0, remainingSlots);
    const skippedCount = validFiles.length - toProcess.length;

    setOpdImageCompressing(true);
    try {
      const newlyCompressed: Array<OpdImageAttachment & { sizeKb?: number }> = [];
      for (const file of toProcess) {
        const { dataUrl, sizeKb } = await compressOpdImageFile(file);
        newlyCompressed.push({
          image_data_url: dataUrl,
          sizeKb,
        });
      }
      setOpdImages((prev) => [...prev, ...newlyCompressed].slice(0, MAX_OPD_PHOTOS));
      if (skippedCount > 0) {
        showToast(
          'error',
          `Maximum ${MAX_OPD_PHOTOS} photos allowed per OPD record (${skippedCount} extra skipped).`
        );
      }
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to process the selected OPD photo.'
      );
    } finally {
      setOpdImageCompressing(false);
      if (opdFileInputRef.current) opdFileInputRef.current.value = '';
      if (opdCameraInputRef.current) opdCameraInputRef.current.value = '';
    }
  };

  const handleSaveOpd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opdStudentId) {
      showToast('error', 'Please select a student.');
      return;
    }
    if (!opdHospital.trim() || !opdReason.trim()) {
      showToast('error', 'Hospital/clinic name and reason for referral are required.');
      return;
    }
    setSaving(true);
    try {
      const cleanedImages: OpdImageAttachment[] = opdImages.map(
        ({ drive_file_id, image_url, image_data_url, label }) => ({
          drive_file_id,
          image_url,
          image_data_url,
          label,
        })
      );
      const firstImg = cleanedImages[0];
      const payload: Partial<OpdRecord> = {
        opd_id: editingOpd?.opd_id,
        student_id: opdStudentId,
        referral_datetime: opdDateTime,
        hospital_or_clinic: opdHospital.trim(),
        doctor_name: editingOpd ? opdDoctor.trim() : opdDoctor.trim() || undefined,
        reason: opdReason.trim(),
        escort_or_parent: editingOpd ? opdEscort.trim() : opdEscort.trim() || undefined,
        diagnosis_and_advice: editingOpd ? opdDiagnosis.trim() : opdDiagnosis.trim() || undefined,
        follow_up_date: editingOpd ? opdFollowUpDate.trim() : opdFollowUpDate || undefined,
        status: opdStatus,
        notes: editingOpd ? opdNotes.trim() : opdNotes.trim() || undefined,
        images: cleanedImages,
        drive_file_id: firstImg?.drive_file_id,
        image_url: firstImg?.image_url,
        image_data_url: firstImg?.image_data_url,
      };
      const res = editingOpd ? await onUpdateOpd(payload) : await onCreateOpd(payload);
      if (res.ok) {
        setOpdModalOpen(false);
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campTitle.trim()) {
      showToast('error', 'Please enter a camp title.');
      return;
    }
    setSaving(true);
    try {
      const res = await onUpsertMedicalCamp({
        camp_id: editingCamp?.camp_id,
        camp_title: campTitle.trim(),
        camp_type: campType,
        organizer: campOrganizer.trim() || undefined,
        camp_date: campDate,
        target_classes: campTargetClasses.trim() || undefined,
        doctor_team: campDoctorTeam.trim() || undefined,
        summary: campSummary.trim() || undefined,
      });
      if (res.ok) {
        setCampModalOpen(false);
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const submitScreening = async (keepOpenForNext: boolean) => {
    if (!screeningStudentId) {
      showToast('error', 'Please select a student.');
      return;
    }
    if (!screeningFindings.trim()) {
      showToast('error', 'Please enter the screening findings (e.g. "Normal", "Cavity in molar").');
      return;
    }
    setSaving(true);
    try {
      const res = await onUpsertCampScreening({
        screening_id: editingScreening?.screening_id,
        camp_id: screeningCampId,
        student_id: screeningStudentId,
        findings: screeningFindings.trim(),
        referral_needed: screeningReferral,
        notes: screeningNotes.trim() || undefined,
      });
      if (res.ok) {
        setExpandedCampIds((prev) => ({ ...prev, [screeningCampId]: true }));
        if (keepOpenForNext && !editingScreening) {
          setScreeningStudentId('');
          setScreeningFindings('');
          setScreeningReferral(false);
          setScreeningNotes('');
          setScreeningQuickCount((c) => c + 1);
          showToast('success', 'Saved screening. Ready for next student.');
        } else {
          setScreeningModalOpen(false);
          showToast('success', res.message);
        }
      } else {
        showToast('error', res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      let res: ProgramsActionResult;
      if (confirmDelete.kind === 'docSession') {
        res = await onDeleteDoctorVisit(confirmDelete.id);
      } else if (confirmDelete.kind === 'docCase') {
        res = await onDeleteDoctorVisitCase(confirmDelete.id);
      } else if (confirmDelete.kind === 'opd') {
        res = await onDeleteOpd(confirmDelete.id);
      } else if (confirmDelete.kind === 'camp') {
        res = await onDeleteMedicalCamp(confirmDelete.id);
      } else {
        res = await onDeleteCampScreening(confirmDelete.id);
      }
      setConfirmDelete(null);
      showToast(res.ok ? 'success' : 'error', res.message);
    } finally {
      setSaving(false);
    }
  };

  const activeStudentCount = useMemo(
    () => students.filter((s) => s.active_status !== 'Inactive').length,
    [students]
  );

  const currentAcademicYear = useMemo(
    () => getCurrentAcademicYear(getTodayLocalDateString()),
    []
  );

  const annualScreenedCount = useMemo(() => {
    const ids = new Set(
      annualCheckups
        .filter((c) => c.academic_year === currentAcademicYear)
        .map((c) => c.student_id)
    );
    return ids.size;
  }, [annualCheckups, currentAcademicYear]);

  const insightsPreview = useMemo(() => {
    const refDate = getTodayLocalDateString();
    const repeatVisitors = computeFrequentVisitors({
      students,
      visits,
      doctorVisits,
      doctorVisitCases,
      opdRecords,
      timeframe: '30d',
      includePrograms: true,
      minVisits: 2,
      referenceDate: refDate,
    });
    const issues = computeCommonIssues({
      students,
      visits,
      doctorVisits,
      doctorVisitCases,
      opdRecords,
      timeframe: '30d',
      includePrograms: true,
      referenceDate: refDate,
    });
    return {
      repeatCount: repeatVisitors.length,
      topIssue: issues[0]?.label.split(' / ')[0] || null,
    };
  }, [students, visits, doctorVisits, doctorVisitCases, opdRecords]);

  const showTopPrimaryAction =
    activeTab === 'doctor' || activeTab === 'opd' || activeTab === 'camps';

  const primaryActionLabel =
    activeTab === 'doctor'
      ? 'Add Session'
      : activeTab === 'opd'
        ? 'Record OPD'
        : 'Add Camp';

  const handlePrimaryAction = () => {
    if (activeTab === 'doctor') openNewDocSession();
    else if (activeTab === 'opd') openNewOpd();
    else if (activeTab === 'camps') openNewCamp();
  };

  const isSessionExpanded = (sessionId: string, idx: number) =>
    expandedDocIds[sessionId] !== undefined ? expandedDocIds[sessionId] : idx === 0;

  const isCampExpanded = (campId: string, idx: number) =>
    expandedCampIds[campId] !== undefined ? expandedCampIds[campId] : idx === 0;

  const MODULE_META: Record<
    Exclude<ProgramsTab, 'hub'>,
    { title: string; subtitle: string }
  > = {
    insights: {
      title: 'Health Insights',
      subtitle: 'Frequent student visitors and common illnesses across campus',
    },
    doctor: {
      title: 'Weekly Doctor Visits',
      subtitle: 'Campus physician sessions and student consultations',
    },
    opd: {
      title: 'External OPD Register',
      subtitle: 'Hospital referrals, prescriptions, and follow-up tracking',
    },
    camps: {
      title: 'Medical Camps',
      subtitle: 'Dental, eye, and periodic campus screening camps',
    },
    checkups: {
      title: 'Annual Health Checkups',
      subtitle: `Academic year ${currentAcademicYear} class-wise physical exam tracker`,
    },
    menstrual: {
      title: 'Menstrual Health Care',
      subtitle: 'Confidential cycle log restricted to Nurse & Admin',
    },
  };

  return (
    <div className="space-y-5 sm:space-y-6 pb-8">
      {/* Header: Clean Hub Title OR Focused Breadcrumb + Module Switcher */}
      {activeTab === 'hub' ? (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 font-display tracking-tight">
              Clinical Programs
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Choose a module below to view campus health trends, log doctor rounds, manage referrals, or run annual checkups.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-zinc-200/80">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('hub')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-950 transition-colors cursor-pointer mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Programs</span>
            </button>
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 font-display tracking-tight truncate">
              {MODULE_META[activeTab].title}
            </h1>
            <p className="hidden sm:block text-xs text-zinc-500 mt-0.5">
              {MODULE_META[activeTab].subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="w-44 sm:w-48">
              <CustomSelect
                ariaLabel="Switch clinical program"
                value={activeTab}
                onChange={(val) => setActiveTab(val as ProgramsTab)}
                size="sm"
                options={[
                  { value: 'insights', label: 'Health Insights' },
                  { value: 'doctor', label: `Doctor Visits (${doctorVisits.length})` },
                  { value: 'opd', label: `External OPD (${opdRecords.length})` },
                  { value: 'camps', label: `Medical Camps (${medicalCamps.length})` },
                  { value: 'checkups', label: `Annual Checkups (${annualScreenedCount})` },
                  { value: 'menstrual', label: `Menstrual Health (${menstrualLogs.length})` },
                ]}
              />
            </div>

            {(() => {
              const meta = getProgramExportMeta(activeTab);
              const isBusyPdf = exportingProgramKey === `pdf:${meta.sheetTab}`;
              const isBusyExcel = meta.excelTab
                ? exportingProgramKey === `xlsx:${meta.excelTab}`
                : false;
              return (
                <>
                  <button
                    type="button"
                    disabled={exportingProgramKey !== null}
                    onClick={() => handleDownloadProgramPdf(meta.sheetTab)}
                    title={`Download ${meta.sheetTab} as PDF`}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200/90 text-zinc-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                  >
                    {isBusyPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span>PDF</span>
                  </button>

                  {meta.excelTab && onDownloadExcelSheet && (
                    <button
                      type="button"
                      disabled={exportingProgramKey !== null}
                      onClick={() => void handleDownloadProgramExcel(meta.excelTab!)}
                      title={`Download password-protected ${meta.excelTab} Excel (.xlsx)`}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200/90 text-zinc-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                    >
                      {isBusyExcel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span>Excel</span>
                    </button>
                  )}
                </>
              );
            })()}

            {showTopPrimaryAction && (
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{primaryActionLabel}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inline Feedback Banner */}
      {banner && (
        <div
          className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="truncate">{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* HUB OVERVIEW: 6 CALM, SCANNABLE PROGRAM CARDS                     */}
      {/* ================================================================= */}
      {activeTab === 'hub' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                id: 'insights' as const,
                title: 'Health Insights',
                description: 'Spot students visiting frequently and common illnesses spreading by class.',
                icon: TrendingUp,
                statPrimary: `${insightsPreview.repeatCount} repeat visitor${insightsPreview.repeatCount === 1 ? '' : 's'} (30d)`,
                statSecondary: insightsPreview.topIssue
                  ? `Top: ${insightsPreview.topIssue}`
                  : 'Live from visits & OPD',
                accent: false,
              },
              {
                id: 'doctor' as const,
                title: 'Weekly Doctor Visits',
                description: 'Log visiting physician sessions, student findings, prescriptions, and follow-ups.',
                icon: Stethoscope,
                statPrimary: `${doctorVisits.length} session${doctorVisits.length === 1 ? '' : 's'}`,
                statSecondary: `${doctorVisitCases.length} seen${doctorFollowUpCount > 0 ? ` · ${doctorFollowUpCount} follow-up` : ''}`,
                accent: false,
              },
              {
                id: 'opd' as const,
                title: 'External OPD Register',
                description: 'Track outside hospital referrals, prescription slip photos, and return status.',
                icon: Building2,
                statPrimary: `${opdRecords.length} referral${opdRecords.length === 1 ? '' : 's'}`,
                statSecondary: activeOpdCount > 0 ? `${activeOpdCount} open / follow-up` : 'All settled',
                accent: activeOpdCount > 0,
              },
              {
                id: 'camps' as const,
                title: 'Medical Camps',
                description: 'Manage dental, eye, or general camps with rapid student-by-student screening.',
                icon: HeartPulse,
                statPrimary: `${medicalCamps.length} camp${medicalCamps.length === 1 ? '' : 's'}`,
                statSecondary: `${campScreenings.length} screened${campReferralsCount > 0 ? ` · ${campReferralsCount} referred` : ''}`,
                accent: false,
              },
              {
                id: 'checkups' as const,
                title: 'Annual Health Checkups',
                description: 'Class-wise annual physical exams with auto-BMI, vision, dental, and fitness status.',
                icon: ClipboardCheck,
                statPrimary: `${annualScreenedCount} / ${activeStudentCount} screened`,
                statSecondary: `Academic year ${currentAcademicYear}`,
                accent: false,
              },
              {
                id: 'menstrual' as const,
                title: 'Menstrual Health Care',
                description: 'Discreet, nurse-only cycle care log with optional sanitary pad stock deduction.',
                icon: Lock,
                statPrimary: `${menstrualLogs.length} entr${menstrualLogs.length === 1 ? 'y' : 'ies'}`,
                statSecondary: 'Nurse & Admin only · Private',
                accent: false,
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setActiveTab(card.id)}
                  className="group text-left bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-2xl p-5 transition-all flex flex-col justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-700 group-hover:bg-zinc-900 group-hover:text-white flex items-center justify-center transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-zinc-950 font-display">
                        {card.title}
                      </h2>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`tabular-nums font-medium ${
                        card.accent ? 'text-amber-700' : 'text-zinc-900'
                      }`}
                    >
                      {card.statPrimary}
                    </span>
                    <span className="text-zinc-400 truncate">{card.statSecondary}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Direct Program Sheets Download Strip */}
          <section className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 font-display">
                  Download Program Registers
                </h2>
                <p className="text-xs text-zinc-500">
                  Export any clinical program register directly as a printable PDF or password-protected Excel sheet.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(
                [
                  { label: 'Doctor Visits', sheetTab: 'Doctor Visits' as const, excelTab: 'Doctor Visits' as const },
                  { label: 'External OPD', sheetTab: 'External OPD' as const, excelTab: 'External OPD' as const },
                  { label: 'Medical Camps', sheetTab: 'Medical Camps' as const, excelTab: 'Medical Camps' as const },
                  { label: 'Annual Checkups', sheetTab: 'Annual Checkups' as const, excelTab: 'Annual Checkups' as const },
                  { label: 'Health Insights', sheetTab: 'Health Insights' as const, excelTab: null },
                  { label: 'Menstrual Log (Private)', sheetTab: 'Menstrual Log' as const, excelTab: 'Menstrual Log' as const },
                ]
              ).map((item) => {
                const isBusyPdf = exportingProgramKey === `pdf:${item.sheetTab}`;
                const isBusyExcel = item.excelTab
                  ? exportingProgramKey === `xlsx:${item.excelTab}`
                  : false;
                return (
                  <div
                    key={item.sheetTab}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-stone-50/80 border border-stone-200/70"
                  >
                    <span className="text-xs font-semibold text-zinc-800 truncate">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={exportingProgramKey !== null}
                        onClick={() => handleDownloadProgramPdf(item.sheetTab)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg inline-flex items-center gap-1 transition-colors disabled:opacity-60 cursor-pointer"
                      >
                        {isBusyPdf ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span>PDF</span>
                      </button>
                      {item.excelTab && onDownloadExcelSheet && (
                        <button
                          type="button"
                          disabled={exportingProgramKey !== null}
                          onClick={() => void handleDownloadProgramExcel(item.excelTab!)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-zinc-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg inline-flex items-center gap-1 transition-colors disabled:opacity-60 cursor-pointer"
                        >
                          {isBusyExcel ? (
                            <Loader2 className="w-3 h-3 animate-spin text-teal-700" />
                          ) : (
                            <Download className="w-3 h-3 text-teal-700" />
                          )}
                          <span>Excel</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: WEEKLY DOCTOR VISITS                                       */}
      {/* ================================================================= */}
      {activeTab === 'doctor' && (
        <div className="space-y-3.5">
          {/* Unified 3-Column Metric Strip */}
          <div className="grid grid-cols-3 bg-white rounded-xl border border-stone-200/90 divide-x divide-stone-100 shadow-2xs">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                Sessions
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-zinc-900 mt-0.5">
                {doctorVisits.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                <span className="sm:hidden">Seen</span>
                <span className="hidden sm:inline">Students Seen</span>
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-teal-800 mt-0.5">
                {doctorVisitCases.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                Follow-ups
              </div>
              <div
                className={`text-[18px] sm:text-[22px] font-bold tabular-nums mt-0.5 ${
                  doctorFollowUpCount > 0 ? 'text-amber-700' : 'text-zinc-900'
                }`}
              >
                {doctorFollowUpCount}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search doctor, specialization, student, complaint, or advice..."
              className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
            />
          </div>

          {/* Session Cards */}
          {filteredDoctorVisits.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/90 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
                <Stethoscope className="w-5 h-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-zinc-900">
                {docSearch ? 'No matching doctor visits' : 'No weekly doctor visits logged yet'}
              </h3>
              <p className="text-[13px] text-zinc-500 mt-1 max-w-sm mx-auto">
                Log each visiting physician session and attach every student seen with findings and advice.
              </p>
              {!docSearch && (
                <button
                  type="button"
                  onClick={openNewDocSession}
                  className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add First Doctor Session
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDoctorVisits.map((sess, idx) => {
                const cases = casesBySessionId.get(sess.doctor_visit_id) || [];
                const followUps = cases.filter((c) => Boolean(c.follow_up_needed)).length;
                const expanded = isSessionExpanded(sess.doctor_visit_id, idx);

                return (
                  <div
                    key={sess.doctor_visit_id}
                    className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden"
                  >
                    {/* Session Header */}
                    <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDocIds((prev) => ({
                            ...prev,
                            [sess.doctor_visit_id]: !expanded,
                          }))
                        }
                        className="flex-1 text-left flex items-start gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                          <Stethoscope className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <h3 className="text-[15px] font-bold text-zinc-900 truncate">
                              {sess.doctor_name}
                            </h3>
                            {sess.specialization && (
                              <span className="text-[11.5px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-zinc-700">
                                {sess.specialization}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500 mt-1">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {formatReadableDate(sess.visit_date)}
                            </span>
                            {sess.session_time && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                                {sess.session_time}
                              </span>
                            )}
                            <span className="font-semibold text-teal-800 tabular-nums">
                              {cases.length} {cases.length === 1 ? 'student' : 'students'}
                            </span>
                            {followUps > 0 && (
                              <span className="font-semibold text-amber-700 tabular-nums">
                                {followUps} follow-up
                              </span>
                            )}
                          </div>
                          {sess.campus_notes && (
                            <p className="text-[12.5px] text-zinc-600 mt-1.5 line-clamp-2">
                              {sess.campus_notes}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                        <button
                          type="button"
                          onClick={() => openNewDocCase(sess.doctor_visit_id)}
                          className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add Student</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditDocSession(sess)}
                          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-stone-100 cursor-pointer"
                          title="Edit session"
                          aria-label="Edit doctor session"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              kind: 'docSession',
                              id: sess.doctor_visit_id,
                              label: `${sess.doctor_name} (${formatReadableDate(sess.visit_date)})`,
                              detail:
                                cases.length > 0
                                  ? `This will also remove ${cases.length} linked student consultation record(s).`
                                  : undefined,
                            })
                          }
                          className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete session"
                          aria-label="Delete doctor session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDocIds((prev) => ({
                              ...prev,
                              [sess.doctor_visit_id]: !expanded,
                            }))
                          }
                          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-stone-100 cursor-pointer"
                          aria-label={expanded ? 'Collapse session' : 'Expand session'}
                        >
                          {expanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Linked Student Consultations */}
                    {expanded && (
                      <div className="border-t border-stone-100 bg-stone-50/50 px-3.5 py-3 sm:px-4">
                        {cases.length === 0 ? (
                          <div className="py-4 text-center text-[12.5px] text-zinc-500">
                            No students logged under this session yet. Tap{' '}
                            <button
                              type="button"
                              onClick={() => openNewDocCase(sess.doctor_visit_id)}
                              className="font-semibold text-teal-700 underline cursor-pointer"
                            >
                              Add Student
                            </button>{' '}
                            to record a consultation.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {cases.map((c) => {
                              const stu = studentById.get(c.student_id);
                              const name = c.student_name || stu?.full_name || c.student_id;
                              const sec = c.section || stu?.section || '—';
                              const roll = c.roll_number || stu?.roll_number || '—';
                              return (
                                <div
                                  key={c.case_id}
                                  className="bg-white rounded-xl border border-stone-200/80 p-3 flex items-start justify-between gap-2.5"
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[13.5px] font-semibold text-zinc-900">
                                        {name}
                                      </span>
                                      <span className="text-[11px] tabular-nums text-zinc-500">
                                        {sec} · #{roll}
                                      </span>
                                      {c.follow_up_needed && (
                                        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                          Follow-up Needed
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[12.5px] text-zinc-800">
                                      <span className="font-semibold text-zinc-600">Complaint: </span>
                                      {c.complaint}
                                    </div>
                                    {c.findings && (
                                      <div className="text-[12.5px] text-zinc-700">
                                        <span className="font-semibold text-zinc-600">Findings: </span>
                                        {c.findings}
                                      </div>
                                    )}
                                    {c.prescription_or_advice && (
                                      <div className="text-[12.5px] text-teal-900 bg-teal-50/60 border border-teal-100 rounded-lg px-2.5 py-1.5 mt-1">
                                        <span className="font-semibold">Advice / Rx: </span>
                                        {c.prescription_or_advice}
                                      </div>
                                    )}
                                    {c.notes && (
                                      <div className="text-[11.5px] text-zinc-500">Note: {c.notes}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditDocCase(c)}
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-stone-100 cursor-pointer"
                                      aria-label="Edit consultation"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDelete({
                                          kind: 'docCase',
                                          id: c.case_id,
                                          label: `${name} — ${c.complaint}`,
                                        })
                                      }
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      aria-label="Delete consultation"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: EXTERNAL OPD REGISTER                                      */}
      {/* ================================================================= */}
      {activeTab === 'opd' && (
        <div className="space-y-3.5">
          {/* Unified 3-Column Metric Strip */}
          <div className="grid grid-cols-3 bg-white rounded-xl border border-stone-200/90 divide-x divide-stone-100 shadow-2xs">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Total OPD
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-zinc-900 mt-0.5">
                {opdRecords.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Active / F-Up
              </div>
              <div
                className={`text-[18px] sm:text-[22px] font-bold tabular-nums mt-0.5 ${
                  activeOpdCount > 0 ? 'text-amber-700' : 'text-zinc-900'
                }`}
              >
                {activeOpdCount}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                OPD Slips
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-teal-800 mt-0.5">
                {opdSlipsCount}
              </div>
            </div>
          </div>

          {/* Search & Status Filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={opdSearch}
                onChange={(e) => setOpdSearch(e.target.value)}
                placeholder="Search student, hospital, doctor, reason, or diagnosis..."
                className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
              />
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-stone-100 border border-stone-200/80 sm:w-[320px] shrink-0">
              {(['ALL', 'Referred', 'Returned', 'Follow-up'] as const).map((st) => {
                const active = opdStatusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setOpdStatusFilter(st)}
                    className={`h-8 px-1.5 rounded-lg text-[11.5px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white text-teal-800 shadow-2xs border border-stone-200/80'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* OPD List */}
          {filteredOpdRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/90 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-zinc-900">
                {opdSearch || opdStatusFilter !== 'ALL'
                  ? 'No matching OPD referrals'
                  : 'No external OPD referrals logged yet'}
              </h3>
              <p className="text-[13px] text-zinc-500 mt-1 max-w-sm mx-auto">
                Record outside clinic or hospital visits along with escort details, follow-up date, and OPD slip photo.
              </p>
              {!opdSearch && opdStatusFilter === 'ALL' && (
                <button
                  type="button"
                  onClick={openNewOpd}
                  className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Record First OPD Referral
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredOpdRecords.map((o) => {
                const stu = studentById.get(o.student_id);
                const name = o.student_name || stu?.full_name || o.student_id;
                const sec = o.section || stu?.section || '—';
                const roll = o.roll_number || stu?.roll_number || '—';
                const opdPhotos = getOpdImages(o).filter((img) =>
                  isSafeImageSrc(img.image_data_url || img.image_url)
                );
                const photoCount = opdPhotos.length;
                const driveHref = isSafeExternalLink(opdPhotos[0]?.image_url || o.image_url)
                  ? opdPhotos[0]?.image_url || o.image_url
                  : undefined;

                const statusStyles =
                  o.status === 'Returned'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : o.status === 'Follow-up'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';

                return (
                  <div
                    key={o.opd_id}
                    className="bg-white rounded-2xl border border-stone-200/90 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      {/* Top Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="text-[15px] font-bold text-zinc-900 truncate">{name}</h3>
                            <span className="text-[11px] tabular-nums text-zinc-500">
                              {sec} · #{roll}
                            </span>
                          </div>
                          <div className="text-[12.5px] font-semibold text-teal-800 mt-0.5">
                            {o.hospital_or_clinic}
                            {o.doctor_name ? ` · ${o.doctor_name}` : ''}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ${statusStyles}`}
                        >
                          {o.status}
                        </span>
                      </div>

                      {/* Metadata Line */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-zinc-500 tabular-nums">
                        <span>
                          {formatReadableDate(o.referral_datetime)} ·{' '}
                          {formatTimeFromDatetime(o.referral_datetime)}
                        </span>
                        {o.escort_or_parent && (
                          <span className="font-sans text-zinc-600">
                            Escort: <strong className="font-medium">{o.escort_or_parent}</strong>
                          </span>
                        )}
                      </div>

                      {/* Clinical Details */}
                      <div className="space-y-1 text-[12.5px] pt-1">
                        <div className="text-zinc-800">
                          <span className="font-semibold text-zinc-500">Reason: </span>
                          {o.reason}
                        </div>
                        {o.diagnosis_and_advice && (
                          <div className="text-zinc-700 bg-stone-50 border border-stone-100 rounded-lg px-2.5 py-1.5">
                            <span className="font-semibold text-zinc-600">Diagnosis / Advice: </span>
                            {o.diagnosis_and_advice}
                          </div>
                        )}
                        {o.follow_up_date && (
                          <div className="text-[12px] font-medium text-blue-800">
                            Follow-up Date:{' '}
                            <span className="tabular-nums">
                              {formatReadableDate(o.follow_up_date)}
                            </span>
                          </div>
                        )}
                        {o.notes && <div className="text-[11.5px] text-zinc-500">Note: {o.notes}</div>}
                      </div>
                    </div>

                    {/* Footer: Slip Preview + Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-stone-100">
                      <div className="flex items-center gap-2 min-w-0">
                        {photoCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLightboxImageIndex(0);
                              setLightboxOpd(o);
                            }}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-zinc-800 text-[12px] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-700" />
                            <span>
                              {photoCount === 1
                                ? 'View OPD Slip'
                                : `View Photos (${photoCount})`}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-zinc-400 inline-flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            No slip photo
                          </span>
                        )}
                        {driveHref && (
                          <a
                            href={driveHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Drive</span>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditOpd(o)}
                          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-stone-100 cursor-pointer"
                          title="Edit OPD record"
                          aria-label="Edit OPD record"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              kind: 'opd',
                              id: o.opd_id,
                              label: `${name} — ${o.hospital_or_clinic}`,
                            })
                          }
                          className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete OPD record"
                          aria-label="Delete OPD record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: SCHOOL MEDICAL CAMPS                                       */}
      {/* ================================================================= */}
      {activeTab === 'camps' && (
        <div className="space-y-3.5">
          {/* Unified 3-Column Metric Strip */}
          <div className="grid grid-cols-3 bg-white rounded-xl border border-stone-200/90 divide-x divide-stone-100 shadow-2xs">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Camps
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-zinc-900 mt-0.5">
                {medicalCamps.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Screened
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-teal-800 mt-0.5">
                {campScreenings.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Referrals
              </div>
              <div
                className={`text-[18px] sm:text-[22px] font-bold tabular-nums mt-0.5 ${
                  campReferralsCount > 0 ? 'text-rose-700' : 'text-zinc-900'
                }`}
              >
                {campReferralsCount}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={campSearch}
              onChange={(e) => setCampSearch(e.target.value)}
              placeholder="Search camp title, type, organizer, student, or screening findings..."
              className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
            />
          </div>

          {/* Camp Cards */}
          {filteredCamps.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/90 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
                <HeartPulse className="w-5 h-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-zinc-900">
                {campSearch ? 'No matching medical camps' : 'No medical camps recorded yet'}
              </h3>
              <p className="text-[13px] text-zinc-500 mt-1 max-w-sm mx-auto">
                Track dental, eye, vaccination, or annual health camps and rapidly log student screenings and referrals.
              </p>
              {!campSearch && (
                <button
                  type="button"
                  onClick={openNewCamp}
                  className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add First Medical Camp
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCamps.map((camp, idx) => {
                const allScreenings = screeningsByCampId.get(camp.camp_id) || [];
                const referralCount = allScreenings.filter((s) => Boolean(s.referral_needed)).length;
                const referralOnly = Boolean(campReferralOnlyMap[camp.camp_id]);
                const visibleScreenings = referralOnly
                  ? allScreenings.filter((s) => Boolean(s.referral_needed))
                  : allScreenings;
                const expanded = isCampExpanded(camp.camp_id, idx);

                return (
                  <div
                    key={camp.camp_id}
                    className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden"
                  >
                    <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCampIds((prev) => ({ ...prev, [camp.camp_id]: !expanded }))
                        }
                        className="flex-1 text-left flex items-start gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                          <HeartPulse className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[15px] font-bold text-zinc-900 truncate">
                              {camp.camp_title}
                            </h3>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                              {camp.camp_type}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500 mt-1">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {formatReadableDate(camp.camp_date)}
                            </span>
                            {camp.organizer && <span>{camp.organizer}</span>}
                            {camp.target_classes && (
                              <span className="text-zinc-600">Classes: {camp.target_classes}</span>
                            )}
                            <span className="font-semibold text-teal-800 tabular-nums">
                              {allScreenings.length} screened
                            </span>
                            {referralCount > 0 && (
                              <span className="font-semibold text-rose-700 tabular-nums">
                                {referralCount} referral{referralCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                          {camp.doctor_team && (
                            <div className="text-[12px] text-zinc-600 mt-1">
                              Team: {camp.doctor_team}
                            </div>
                          )}
                          {camp.summary && (
                            <p className="text-[12.5px] text-zinc-600 mt-1 line-clamp-2">
                              {camp.summary}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                        <button
                          type="button"
                          onClick={() => openNewScreening(camp.camp_id)}
                          className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Screen Student</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditCamp(camp)}
                          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-stone-100 cursor-pointer"
                          title="Edit camp"
                          aria-label="Edit medical camp"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              kind: 'camp',
                              id: camp.camp_id,
                              label: camp.camp_title,
                              detail:
                                allScreenings.length > 0
                                  ? `This will also delete ${allScreenings.length} linked student screening record(s).`
                                  : undefined,
                            })
                          }
                          className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete camp"
                          aria-label="Delete medical camp"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCampIds((prev) => ({ ...prev, [camp.camp_id]: !expanded }))
                          }
                          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-stone-100 cursor-pointer"
                          aria-label={expanded ? 'Collapse camp' : 'Expand camp'}
                        >
                          {expanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-stone-100 bg-stone-50/50 px-3.5 py-3 sm:px-4 space-y-2.5">
                        {allScreenings.length > 0 && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">
                              Student Screenings ({visibleScreenings.length})
                            </span>
                            <div className="inline-flex p-0.5 rounded-lg bg-stone-200/70">
                              <button
                                type="button"
                                onClick={() =>
                                  setCampReferralOnlyMap((p) => ({ ...p, [camp.camp_id]: false }))
                                }
                                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold cursor-pointer ${
                                  !referralOnly
                                    ? 'bg-white text-zinc-900 shadow-2xs'
                                    : 'text-zinc-600'
                                }`}
                              >
                                All ({allScreenings.length})
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCampReferralOnlyMap((p) => ({ ...p, [camp.camp_id]: true }))
                                }
                                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold cursor-pointer ${
                                  referralOnly
                                    ? 'bg-white text-rose-700 shadow-2xs'
                                    : 'text-zinc-600'
                                }`}
                              >
                                Referrals ({referralCount})
                              </button>
                            </div>
                          </div>
                        )}

                        {visibleScreenings.length === 0 ? (
                          <div className="py-4 text-center text-[12.5px] text-zinc-500">
                            {allScreenings.length === 0 ? (
                              <>
                                No student screenings logged for this camp yet. Tap{' '}
                                <button
                                  type="button"
                                  onClick={() => openNewScreening(camp.camp_id)}
                                  className="font-semibold text-teal-700 underline cursor-pointer"
                                >
                                  Screen Student
                                </button>{' '}
                                to start fast camp entry.
                              </>
                            ) : (
                              'No students flagged for referral in this camp.'
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {visibleScreenings.map((sc) => {
                              const stu = studentById.get(sc.student_id);
                              const name = sc.student_name || stu?.full_name || sc.student_id;
                              const sec = sc.section || stu?.section || '—';
                              const roll = sc.roll_number || stu?.roll_number || '—';
                              return (
                                <div
                                  key={sc.screening_id}
                                  className="bg-white rounded-xl border border-stone-200/80 p-3 flex items-start justify-between gap-2.5"
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[13.5px] font-semibold text-zinc-900">
                                        {name}
                                      </span>
                                      <span className="text-[11px] tabular-nums text-zinc-500">
                                        {sec} · #{roll}
                                      </span>
                                      {sc.referral_needed ? (
                                        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                          Referral Needed
                                        </span>
                                      ) : (
                                        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          Cleared
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[12.5px] text-zinc-800">{sc.findings}</div>
                                    {sc.notes && (
                                      <div className="text-[11.5px] text-zinc-500">Note: {sc.notes}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditScreening(sc)}
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-stone-100 cursor-pointer"
                                      aria-label="Edit screening"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDelete({
                                          kind: 'screening',
                                          id: sc.screening_id,
                                          label: `${name} — ${sc.findings}`,
                                        })
                                      }
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      aria-label="Delete screening"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: ANNUAL HEALTH CHECKUP TRACKER (PHASE 3)                    */}
      {/* ================================================================= */}
      {activeTab === 'checkups' && (
        <AnnualCheckupTab
          students={students}
          classes={classes}
          annualCheckups={annualCheckups}
          onUpsertAnnualCheckup={onUpsertAnnualCheckup}
          onDeleteAnnualCheckup={onDeleteAnnualCheckup}
          onSelectStudent={onSelectStudent}
        />
      )}

      {/* ================================================================= */}
      {/* TAB 5: PRIVATE MENSTRUAL HEALTH LOG (PHASE 3 — NURSE & ADMIN)     */}
      {/* ================================================================= */}
      {activeTab === 'menstrual' && (
        <MenstrualHealthTab
          students={students}
          classes={classes}
          menstrualLogs={menstrualLogs}
          items={items}
          onUpsertMenstrualLog={onUpsertMenstrualLog}
          onDeleteMenstrualLog={onDeleteMenstrualLog}
        />
      )}

      {/* ================================================================= */}
      {/* TAB 6: HEALTH TRENDS & INSIGHTS (FREQUENT VISITORS + ISSUES)      */}
      {/* ================================================================= */}
      {activeTab === 'insights' && (
        <HealthInsightsTab
          students={students}
          classes={classes}
          visits={visits}
          doctorVisits={doctorVisits}
          doctorVisitCases={doctorVisitCases}
          opdRecords={opdRecords}
          onSelectStudent={onSelectStudent}
        />
      )}

      {/* ================================================================= */}
      {/* MODAL 1: ADD / EDIT DOCTOR VISIT SESSION                          */}
      {/* ================================================================= */}
      <ModalDialog
        open={docSessionModalOpen}
        onClose={() => setDocSessionModalOpen(false)}
        title={editingDocSession ? 'Edit Doctor Visit Session' : 'Log Weekly Doctor Visit'}
        subtitle="Record the visiting physician, date, time, and campus round summary."
      >
        <form onSubmit={handleSaveDocSession} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Visit Date *
              </label>
              <input
                type="date"
                value={docVisitDate}
                onChange={(e) => setDocVisitDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] font-mono text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Session Time
              </label>
              <input
                type="text"
                value={docSessionTime}
                onChange={(e) => setDocSessionTime(e.target.value)}
                placeholder="e.g. 10:00 AM – 12:30 PM"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Doctor Name *
              </label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                required
                placeholder="e.g. Dr. Rajesh Sharma"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Specialization
              </label>
              <input
                type="text"
                value={docSpec}
                onChange={(e) => setDocSpec(e.target.value)}
                placeholder="e.g. Pediatrician / General Physician"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Campus / Session Notes
            </label>
            <textarea
              rows={2}
              value={docNotes}
              onChange={(e) => setDocNotes(e.target.value)}
              placeholder="Optional summary of the doctor's weekly visit..."
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setDocSessionModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-stone-200 text-[13px] font-semibold text-zinc-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : editingDocSession ? 'Update Session' : 'Save Session'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================================================================= */}
      {/* MODAL 2: ADD / EDIT DOCTOR CONSULTATION CASE                      */}
      {/* ================================================================= */}
      <ModalDialog
        open={docCaseModalOpen}
        onClose={() => setDocCaseModalOpen(false)}
        title={editingDocCase ? 'Edit Student Consultation' : 'Add Student Seen by Doctor'}
        subtitle="Record the student's complaint, findings, and doctor's prescription or advice."
      >
        <form onSubmit={handleSaveDocCase} className="space-y-3.5">
          <StudentPickerField
            students={students}
            classes={classes}
            selectedStudentId={docCaseStudentId}
            onSelect={setDocCaseStudentId}
          />

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Complaint / Reason *
            </label>
            <input
              type="text"
              value={docCaseComplaint}
              onChange={(e) => setDocCaseComplaint(e.target.value)}
              required
              placeholder="e.g. Persistent dry cough for 4 days"
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Doctor Findings
            </label>
            <input
              type="text"
              value={docCaseFindings}
              onChange={(e) => setDocCaseFindings(e.target.value)}
              placeholder="e.g. Clear chest, mild throat congestion, afebrile"
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Prescription / Advice
            </label>
            <textarea
              rows={2}
              value={docCaseAdvice}
              onChange={(e) => setDocCaseAdvice(e.target.value)}
              placeholder="e.g. Warm saline gargles twice daily; syrup 5ml BD for 3 days"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={docCaseFollowUp}
              onChange={(e) => setDocCaseFollowUp(e.target.checked)}
              className="w-4 h-4 rounded accent-teal-700"
            />
            <span className="text-[13px] font-medium text-amber-950">
              Flag for follow-up review during next doctor visit
            </span>
          </label>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Additional Notes
            </label>
            <input
              type="text"
              value={docCaseNotes}
              onChange={(e) => setDocCaseNotes(e.target.value)}
              placeholder="Optional nurse notes..."
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setDocCaseModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-stone-200 text-[13px] font-semibold text-zinc-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : editingDocCase ? 'Update Case' : 'Save Case'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================================================================= */}
      {/* MODAL 3: RECORD / EDIT EXTERNAL OPD REFERRAL + SLIP PHOTO         */}
      {/* ================================================================= */}
      <ModalDialog
        open={opdModalOpen}
        onClose={() => setOpdModalOpen(false)}
        title={editingOpd ? 'Edit External OPD Record' : 'Record External OPD Referral'}
        subtitle="Log hospital or clinic visit details and attach the OPD slip photo to Google Drive."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveOpd} className="space-y-3.5">
          <StudentPickerField
            students={students}
            classes={classes}
            selectedStudentId={opdStudentId}
            onSelect={setOpdStudentId}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Hospital / Clinic *
              </label>
              <input
                type="text"
                value={opdHospital}
                onChange={(e) => setOpdHospital(e.target.value)}
                required
                placeholder="e.g. District Civil Hospital"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Referral Date & Time *
              </label>
              <input
                type="datetime-local"
                value={opdDateTime}
                onChange={(e) => setOpdDateTime(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13px] font-mono text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Reason for Referral *
              </label>
              <input
                type="text"
                value={opdReason}
                onChange={(e) => setOpdReason(e.target.value)}
                required
                placeholder="e.g. Ankle X-ray after sports injury"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                External Doctor
              </label>
              <input
                type="text"
                value={opdDoctor}
                onChange={(e) => setOpdDoctor(e.target.value)}
                placeholder="e.g. Dr. Mehta (Orthopedics)"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Escort / Parent
              </label>
              <input
                type="text"
                value={opdEscort}
                onChange={(e) => setOpdEscort(e.target.value)}
                placeholder="e.g. Hostel Warden"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Status
              </label>
              <CustomSelect
                value={opdStatus}
                onChange={(val) => setOpdStatus(val as OpdStatus)}
                options={OPD_STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Follow-up Date
              </label>
              <input
                type="date"
                value={opdFollowUpDate}
                onChange={(e) => setOpdFollowUpDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13px] font-mono text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Diagnosis & Advice
            </label>
            <textarea
              rows={2}
              value={opdDiagnosis}
              onChange={(e) => setOpdDiagnosis(e.target.value)}
              placeholder="Hospital findings, X-ray result, prescribed medicines, or rest days..."
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          {/* OPD Slip / Prescription / Report Photos (Multi-Upload up to 15) */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                OPD Slips / Prescriptions / Reports (Saved to Google Drive)
              </label>
              <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
                {opdImages.length} / {MAX_OPD_PHOTOS}
              </span>
            </div>

            {/* Camera input (single capture on mobile) */}
            <input
              ref={opdCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleOpdPhotoChange}
              className="hidden"
            />
            {/* Gallery / Multi-file input */}
            <input
              ref={opdFileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleOpdPhotoChange}
              className="hidden"
            />

            {opdImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2.5 max-h-64 overflow-y-auto pr-0.5">
                {opdImages.map((img, idx) => {
                  const thumbSrc = img.image_data_url || img.image_url;
                  return (
                    <div
                      key={`${img.drive_file_id || img.image_url || 'local'}-${idx}`}
                      className="relative group rounded-xl border border-stone-200 bg-stone-50 overflow-hidden"
                    >
                      {isSafeImageSrc(thumbSrc) ? (
                        <img
                          src={thumbSrc}
                          alt={`OPD photo ${idx + 1}`}
                          className="w-full h-24 object-cover bg-white"
                        />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center text-zinc-400">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div className="px-2 py-1 flex items-center justify-between gap-1 bg-white/95 border-t border-stone-100">
                        <span className="text-[10.5px] font-semibold text-zinc-700 truncate">
                          Photo {idx + 1}
                          {img.sizeKb ? ` · ${img.sizeKb} KB` : img.image_url ? ' · Drive' : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setOpdImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`Remove OPD photo ${idx + 1}`}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-zinc-900/80 hover:bg-rose-600 text-white flex items-center justify-center shadow-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {opdImages.length < MAX_OPD_PHOTOS && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => opdCameraInputRef.current?.click()}
                  disabled={opdImageCompressing}
                  className="py-2.5 px-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 hover:bg-teal-50/40 hover:border-teal-400 transition-colors flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-zinc-700 cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>{opdImageCompressing ? 'Processing...' : 'Take Photo'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => opdFileInputRef.current?.click()}
                  disabled={opdImageCompressing}
                  className="py-2.5 px-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 hover:bg-teal-50/40 hover:border-teal-400 transition-colors flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-zinc-700 cursor-pointer disabled:opacity-50"
                >
                  <ImageIcon className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>
                    {opdImageCompressing
                      ? 'Processing...'
                      : opdImages.length > 0
                        ? 'Add More Photos'
                        : 'Upload Photos'}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Notes
            </label>
            <input
              type="text"
              value={opdNotes}
              onChange={(e) => setOpdNotes(e.target.value)}
              placeholder="Optional transport or parent communication notes..."
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setOpdModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-stone-200 text-[13px] font-semibold text-zinc-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || opdImageCompressing}
              className="h-10 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : editingOpd ? 'Update OPD' : 'Save OPD Record'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================================================================= */}
      {/* MODAL 4: OPD SLIP MULTI-PHOTO LIGHTBOX PREVIEW                    */}
      {/* ================================================================= */}
      <ModalDialog
        open={Boolean(lightboxOpd)}
        onClose={() => {
          setLightboxOpd(null);
          setLightboxImageIndex(0);
        }}
        title={
          lightboxOpd
            ? `OPD Photos — ${lightboxOpd.student_name || lightboxOpd.student_id}`
            : 'OPD Photos'
        }
        subtitle={
          lightboxOpd
            ? `${lightboxOpd.hospital_or_clinic} · ${formatReadableDate(lightboxOpd.referral_datetime)}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {lightboxOpd && (() => {
          const allImgs = getOpdImages(lightboxOpd).filter((img) =>
            isSafeImageSrc(img.image_data_url || img.image_url)
          );
          const safeIdx = Math.min(lightboxImageIndex, Math.max(0, allImgs.length - 1));
          const activeImg = allImgs[safeIdx];
          const activeSrc = activeImg?.image_data_url || activeImg?.image_url;
          const activeDriveLink = isSafeExternalLink(activeImg?.image_url)
            ? activeImg?.image_url
            : undefined;

          return (
            <div className="space-y-3">
              {allImgs.length > 1 && (
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-600">
                  <span>
                    Photo {safeIdx + 1} of {allImgs.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImageIndex((prev) =>
                          prev <= 0 ? allImgs.length - 1 : prev - 1
                        )
                      }
                      className="h-8 px-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-zinc-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImageIndex((prev) =>
                          prev >= allImgs.length - 1 ? 0 : prev + 1
                        )
                      }
                      className="h-8 px-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-zinc-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-900/5 flex items-center justify-center max-h-[58vh]">
                {isSafeImageSrc(activeSrc) ? (
                  <img
                    src={activeSrc}
                    alt={`OPD photo ${safeIdx + 1}`}
                    className="max-h-[56vh] w-auto object-contain"
                  />
                ) : (
                  <div className="py-12 text-center text-zinc-400 text-[13px] flex flex-col items-center gap-2">
                    <ImageIcon className="w-8 h-8" />
                    <span>Preview unavailable</span>
                  </div>
                )}
              </div>

              {allImgs.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {allImgs.map((img, idx) => {
                    const thumb = img.image_data_url || img.image_url;
                    const isCurrent = idx === safeIdx;
                    return (
                      <button
                        key={`${img.drive_file_id || img.image_url || 'thumb'}-${idx}`}
                        type="button"
                        onClick={() => setLightboxImageIndex(idx)}
                        className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                          isCurrent
                            ? 'border-teal-700 ring-2 ring-teal-500/20'
                            : 'border-stone-200 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={thumb}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover bg-white"
                        />
                        <span className="absolute bottom-0.5 right-0.5 px-1 text-[9px] font-bold bg-zinc-900/75 text-white rounded">
                          {idx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {activeDriveLink ? (
                  <a
                    href={activeDriveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-teal-50 text-teal-800 hover:bg-teal-100 text-[13px] font-semibold"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in Google Drive</span>
                  </a>
                ) : (
                  <span className="text-[12px] text-zinc-500">
                    Saved locally (syncs to Drive when updated Apps Script is deployed)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLightboxOpd(null);
                    setLightboxImageIndex(0);
                  }}
                  className="h-9 px-4 rounded-xl bg-stone-900 text-white text-[13px] font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </ModalDialog>

      {/* ================================================================= */}
      {/* MODAL 5: ADD / EDIT SCHOOL MEDICAL CAMP                           */}
      {/* ================================================================= */}
      <ModalDialog
        open={campModalOpen}
        onClose={() => setCampModalOpen(false)}
        title={editingCamp ? 'Edit Medical Camp' : 'Add School Medical Camp'}
        subtitle="Record dental, eye, vaccination, or general campus health checkup camps."
      >
        <form onSubmit={handleSaveCamp} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Camp Title *
            </label>
            <input
              type="text"
              value={campTitle}
              onChange={(e) => setCampTitle(e.target.value)}
              required
              placeholder="e.g. Annual Dental & Eye Checkup Camp"
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Camp Type
              </label>
              <CustomSelect
                value={campType}
                onChange={setCampType}
                options={CAMP_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Camp Date *
              </label>
              <input
                type="date"
                value={campDate}
                onChange={(e) => setCampDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] font-mono text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Organizer / Hospital Partner
              </label>
              <input
                type="text"
                value={campOrganizer}
                onChange={(e) => setCampOrganizer(e.target.value)}
                placeholder="e.g. Lions Club / Civil Health Team"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Target Classes
              </label>
              <input
                type="text"
                value={campTargetClasses}
                onChange={(e) => setCampTargetClasses(e.target.value)}
                placeholder="e.g. All Classes or Sparkle, Twinkle"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Visiting Doctor Team
            </label>
            <input
              type="text"
              value={campDoctorTeam}
              onChange={(e) => setCampDoctorTeam(e.target.value)}
              placeholder="e.g. Dr. Patel (Dentist), Dr. Verma (Optometrist)"
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Camp Summary
            </label>
            <textarea
              rows={2}
              value={campSummary}
              onChange={(e) => setCampSummary(e.target.value)}
              placeholder="Overview, key observations, or follow-up plan..."
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setCampModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-stone-200 text-[13px] font-semibold text-zinc-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : editingCamp ? 'Update Camp' : 'Save Camp'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================================================================= */}
      {/* MODAL 6: FAST SCREEN STUDENT ENTRY (WITH SAVE & ADD NEXT)         */}
      {/* ================================================================= */}
      <ModalDialog
        open={screeningModalOpen}
        onClose={() => setScreeningModalOpen(false)}
        title={editingScreening ? 'Edit Camp Screening' : 'Screen Student'}
        subtitle={
          screeningQuickCount > 0
            ? `${screeningQuickCount} student${screeningQuickCount === 1 ? '' : 's'} logged in this batch — select the next student below.`
            : 'Enter screening findings and flag if an external referral is required.'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitScreening(false);
          }}
          className="space-y-3.5"
        >
          <StudentPickerField
            students={students}
            classes={classes}
            selectedStudentId={screeningStudentId}
            onSelect={setScreeningStudentId}
          />

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Screening Findings *
            </label>
            <textarea
              rows={2}
              value={screeningFindings}
              onChange={(e) => setScreeningFindings(e.target.value)}
              required
              placeholder="e.g. Vision 6/6 normal, or Mild myopia — advise optometrist check"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={screeningReferral}
              onChange={(e) => setScreeningReferral(e.target.checked)}
              className="w-4 h-4 rounded accent-rose-600"
            />
            <span className="text-[13px] font-medium text-rose-950">
              Referral needed (flag for parent / outside specialist follow-up)
            </span>
          </label>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Notes
            </label>
            <input
              type="text"
              value={screeningNotes}
              onChange={(e) => setScreeningNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-full h-10 px-3 rounded-xl border border-stone-200 bg-white text-[13.5px] text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setScreeningModalOpen(false)}
              className="h-10 px-3.5 rounded-xl border border-stone-200 text-[13px] font-semibold text-zinc-600 hover:bg-stone-50 cursor-pointer"
            >
              Close
            </button>
            {!editingScreening && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitScreening(true)}
                className="h-10 px-4 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 disabled:opacity-50 text-[13px] font-semibold cursor-pointer whitespace-nowrap"
              >
                {saving ? 'Saving...' : 'Save & Add Next'}
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer whitespace-nowrap"
            >
              {saving ? 'Saving...' : editingScreening ? 'Update' : 'Save & Done'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================================================================= */}
      {/* MODAL 7: DELETE CONFIRMATION                                      */}
      {/* ================================================================= */}
      <ModalDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Confirm Deletion"
        subtitle="This action removes the record from the infirmary register."
        maxWidthClass="max-w-sm"
      >
        {confirmDelete && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-950">
              <div className="font-semibold">{confirmDelete.label}</div>
              {confirmDelete.detail && (
                <div className="text-[12px] text-rose-800 mt-1">{confirmDelete.detail}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="h-9 px-4 rounded-xl border border-stone-200 text-[13px] font-semibold text-zinc-600 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirmDelete()}
                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
