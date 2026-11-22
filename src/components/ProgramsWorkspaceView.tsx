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
} from 'lucide-react';
import {
  formatTimeFromDatetime,
  type StudentRecord,
  type VisitRecord,
  type ItemInventoryRecord,
  type DoctorVisitSession,
  type DoctorVisitCase,
  type OpdRecord,
  type OpdStatus,
  type MedicalCampRecord,
  type CampScreeningRecord,
  type AnnualCheckupRecord,
  type MenstrualLogRecord,
} from '../utils/nurseLogic';
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
  onSelectStudent?: (student: StudentRecord) => void;
}

type ProgramsTab = 'doctor' | 'opd' | 'camps' | 'checkups' | 'menstrual' | 'insights';

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
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          {label}
        </label>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-slate-900 truncate">
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
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <div className="relative sm:col-span-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder="Search student name or roll no..."
            className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
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
      <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-slate-400">
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
              <span className="text-[13px] font-medium text-slate-900 truncate">
                {stu.full_name}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
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
  onSelectStudent,
}) => {
  const [activeTab, setActiveTab] = useState<ProgramsTab>('doctor');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

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
  const [opdImageDataUrl, setOpdImageDataUrl] = useState<string | undefined>(undefined);
  const [opdImageSizeKb, setOpdImageSizeKb] = useState<number | null>(null);
  const [opdImageCompressing, setOpdImageCompressing] = useState(false);
  const opdFileInputRef = useRef<HTMLInputElement | null>(null);
  const [lightboxOpd, setLightboxOpd] = useState<OpdRecord | null>(null);

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
    () => opdRecords.filter((o) => isSafeImageSrc(o.image_url || o.image_data_url)).length,
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
    setOpdImageDataUrl(undefined);
    setOpdImageSizeKb(null);
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
    setOpdImageDataUrl(o.image_data_url);
    setOpdImageSizeKb(null);
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

  const handleOpdPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Please select a valid photo file (JPG, PNG, or WebP).');
      return;
    }
    setOpdImageCompressing(true);
    try {
      const { dataUrl, sizeKb } = await compressOpdImageFile(file);
      setOpdImageDataUrl(dataUrl);
      setOpdImageSizeKb(sizeKb);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to process the selected OPD slip photo.'
      );
    } finally {
      setOpdImageCompressing(false);
      if (opdFileInputRef.current) opdFileInputRef.current.value = '';
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
        image_data_url: opdImageDataUrl,
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

  return (
    <div className="space-y-4 pb-8">
      {/* Compact Header Row with Inline Primary CTA */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-slate-900 truncate">
            Clinical Programs
          </h1>
          <p className="hidden sm:block text-[12.5px] text-slate-500 mt-0.5">
            Doctor rounds, external OPD, screening camps, annual checkups, menstrual care, and campus health insights.
          </p>
        </div>
        {showTopPrimaryAction && (
          <button
            type="button"
            onClick={handlePrimaryAction}
            className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{primaryActionLabel}</span>
          </button>
        )}
      </div>

      {/* Inline Feedback Banner */}
      {banner && (
        <div
          className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13px] ${
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

      {/* Responsive Single-Line Tab Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/80 overflow-x-auto">
        {(
          [
            { id: 'doctor', short: 'Doctor', full: 'Doctor Visits', icon: Stethoscope, count: doctorVisits.length },
            { id: 'opd', short: 'OPD', full: 'External OPD', icon: Building2, count: opdRecords.length },
            { id: 'camps', short: 'Camps', full: 'Medical Camps', icon: HeartPulse, count: medicalCamps.length },
            { id: 'checkups', short: 'Checkups', full: 'Annual Checkup', icon: ClipboardCheck, count: annualCheckups.length },
            { id: 'menstrual', short: 'Menstrual', full: 'Menstrual Health', icon: Lock, count: menstrualLogs.length },
            { id: 'insights', short: 'Insights', full: 'Health Insights', icon: TrendingUp, count: null },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-lg flex items-center justify-center gap-1.5 text-[12.5px] sm:text-[13px] font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer lg:flex-1 ${
                active
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.full}</span>
              {tab.count !== null && (
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    active ? 'text-teal-700' : 'text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ================================================================= */}
      {/* TAB 1: WEEKLY DOCTOR VISITS                                       */}
      {/* ================================================================= */}
      {activeTab === 'doctor' && (
        <div className="space-y-3.5">
          {/* Unified 3-Column Metric Strip */}
          <div className="grid grid-cols-3 bg-white rounded-xl border border-slate-200/90 divide-x divide-slate-100 shadow-2xs">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Sessions
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {doctorVisits.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <span className="sm:hidden">Seen</span>
                <span className="hidden sm:inline">Students Seen</span>
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold font-mono tabular-nums text-teal-800 mt-0.5">
                {doctorVisitCases.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Follow-ups
              </div>
              <div
                className={`text-[18px] sm:text-[22px] font-bold font-mono tabular-nums mt-0.5 ${
                  doctorFollowUpCount > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {doctorFollowUpCount}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search doctor, specialization, student, complaint, or advice..."
              className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
            />
          </div>

          {/* Session Cards */}
          {filteredDoctorVisits.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
                <Stethoscope className="w-5 h-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                {docSearch ? 'No matching doctor visits' : 'No weekly doctor visits logged yet'}
              </h3>
              <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
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
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
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
                            <h3 className="text-[15px] font-bold text-slate-900 truncate">
                              {sess.doctor_name}
                            </h3>
                            {sess.specialization && (
                              <span className="text-[11.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                {sess.specialization}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 mt-1">
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {formatReadableDate(sess.visit_date)}
                            </span>
                            {sess.session_time && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {sess.session_time}
                              </span>
                            )}
                            <span className="font-semibold text-teal-800 font-mono tabular-nums">
                              {cases.length} {cases.length === 1 ? 'student' : 'students'}
                            </span>
                            {followUps > 0 && (
                              <span className="font-semibold text-amber-700 font-mono tabular-nums">
                                {followUps} follow-up
                              </span>
                            )}
                          </div>
                          {sess.campus_notes && (
                            <p className="text-[12.5px] text-slate-600 mt-1.5 line-clamp-2">
                              {sess.campus_notes}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
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
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
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
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
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
                      <div className="border-t border-slate-100 bg-slate-50/50 px-3.5 py-3 sm:px-4">
                        {cases.length === 0 ? (
                          <div className="py-4 text-center text-[12.5px] text-slate-500">
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
                                  className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-start justify-between gap-2.5"
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[13.5px] font-semibold text-slate-900">
                                        {name}
                                      </span>
                                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                                        {sec} · #{roll}
                                      </span>
                                      {c.follow_up_needed && (
                                        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                          Follow-up Needed
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[12.5px] text-slate-800">
                                      <span className="font-semibold text-slate-600">Complaint: </span>
                                      {c.complaint}
                                    </div>
                                    {c.findings && (
                                      <div className="text-[12.5px] text-slate-700">
                                        <span className="font-semibold text-slate-600">Findings: </span>
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
                                      <div className="text-[11.5px] text-slate-500">Note: {c.notes}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditDocCase(c)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
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
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
          <div className="grid grid-cols-3 bg-white rounded-xl border border-slate-200/90 divide-x divide-slate-100 shadow-2xs">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total OPD
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {opdRecords.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Active / F-Up
              </div>
              <div
                className={`text-[18px] sm:text-[22px] font-bold font-mono tabular-nums mt-0.5 ${
                  activeOpdCount > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {activeOpdCount}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                OPD Slips
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold font-mono tabular-nums text-teal-800 mt-0.5">
                {opdSlipsCount}
              </div>
            </div>
          </div>

          {/* Search & Status Filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={opdSearch}
                onChange={(e) => setOpdSearch(e.target.value)}
                placeholder="Search student, hospital, doctor, reason, or diagnosis..."
                className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
              />
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/80 sm:w-[320px] shrink-0">
              {(['ALL', 'Referred', 'Returned', 'Follow-up'] as const).map((st) => {
                const active = opdStatusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setOpdStatusFilter(st)}
                    className={`h-8 px-1.5 rounded-lg text-[11.5px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white text-teal-800 shadow-2xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
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
            <div className="bg-white rounded-2xl border border-slate-200/90 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                {opdSearch || opdStatusFilter !== 'ALL'
                  ? 'No matching OPD referrals'
                  : 'No external OPD referrals logged yet'}
              </h3>
              <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
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
                const previewSrc = isSafeImageSrc(o.image_data_url)
                  ? o.image_data_url
                  : isSafeImageSrc(o.image_url)
                    ? o.image_url
                    : undefined;
                const driveHref = isSafeExternalLink(o.image_url) ? o.image_url : undefined;

                const statusStyles =
                  o.status === 'Returned'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : o.status === 'Follow-up'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';

                return (
                  <div
                    key={o.opd_id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      {/* Top Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="text-[15px] font-bold text-slate-900 truncate">{name}</h3>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500">
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
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500 font-mono tabular-nums">
                        <span>
                          {formatReadableDate(o.referral_datetime)} ·{' '}
                          {formatTimeFromDatetime(o.referral_datetime)}
                        </span>
                        {o.escort_or_parent && (
                          <span className="font-sans text-slate-600">
                            Escort: <strong className="font-medium">{o.escort_or_parent}</strong>
                          </span>
                        )}
                      </div>

                      {/* Clinical Details */}
                      <div className="space-y-1 text-[12.5px] pt-1">
                        <div className="text-slate-800">
                          <span className="font-semibold text-slate-500">Reason: </span>
                          {o.reason}
                        </div>
                        {o.diagnosis_and_advice && (
                          <div className="text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="font-semibold text-slate-600">Diagnosis / Advice: </span>
                            {o.diagnosis_and_advice}
                          </div>
                        )}
                        {o.follow_up_date && (
                          <div className="text-[12px] font-medium text-blue-800">
                            Follow-up Date:{' '}
                            <span className="font-mono tabular-nums">
                              {formatReadableDate(o.follow_up_date)}
                            </span>
                          </div>
                        )}
                        {o.notes && <div className="text-[11.5px] text-slate-500">Note: {o.notes}</div>}
                      </div>
                    </div>

                    {/* Footer: Slip Preview + Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center gap-2 min-w-0">
                        {previewSrc ? (
                          <button
                            type="button"
                            onClick={() => setLightboxOpd(o)}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-[12px] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-700" />
                            <span>View OPD Slip</span>
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-slate-400 inline-flex items-center gap-1">
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
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
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
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
          <div className="grid grid-cols-3 bg-white rounded-xl border border-slate-200/90 divide-x divide-slate-100 shadow-2xs">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Camps
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {medicalCamps.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Screened
              </div>
              <div className="text-[18px] sm:text-[22px] font-bold font-mono tabular-nums text-teal-800 mt-0.5">
                {campScreenings.length}
              </div>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Referrals
              </div>
              <div
                className={`text-[18px] sm:text-[22px] font-bold font-mono tabular-nums mt-0.5 ${
                  campReferralsCount > 0 ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                {campReferralsCount}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={campSearch}
              onChange={(e) => setCampSearch(e.target.value)}
              placeholder="Search camp title, type, organizer, student, or screening findings..."
              className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
            />
          </div>

          {/* Camp Cards */}
          {filteredCamps.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
                <HeartPulse className="w-5 h-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                {campSearch ? 'No matching medical camps' : 'No medical camps recorded yet'}
              </h3>
              <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
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
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
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
                            <h3 className="text-[15px] font-bold text-slate-900 truncate">
                              {camp.camp_title}
                            </h3>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                              {camp.camp_type}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 mt-1">
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {formatReadableDate(camp.camp_date)}
                            </span>
                            {camp.organizer && <span>{camp.organizer}</span>}
                            {camp.target_classes && (
                              <span className="text-slate-600">Classes: {camp.target_classes}</span>
                            )}
                            <span className="font-semibold text-teal-800 font-mono tabular-nums">
                              {allScreenings.length} screened
                            </span>
                            {referralCount > 0 && (
                              <span className="font-semibold text-rose-700 font-mono tabular-nums">
                                {referralCount} referral{referralCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                          {camp.doctor_team && (
                            <div className="text-[12px] text-slate-600 mt-1">
                              Team: {camp.doctor_team}
                            </div>
                          )}
                          {camp.summary && (
                            <p className="text-[12.5px] text-slate-600 mt-1 line-clamp-2">
                              {camp.summary}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
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
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
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
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
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
                      <div className="border-t border-slate-100 bg-slate-50/50 px-3.5 py-3 sm:px-4 space-y-2.5">
                        {allScreenings.length > 0 && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">
                              Student Screenings ({visibleScreenings.length})
                            </span>
                            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70">
                              <button
                                type="button"
                                onClick={() =>
                                  setCampReferralOnlyMap((p) => ({ ...p, [camp.camp_id]: false }))
                                }
                                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold cursor-pointer ${
                                  !referralOnly
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600'
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
                                    : 'text-slate-600'
                                }`}
                              >
                                Referrals ({referralCount})
                              </button>
                            </div>
                          </div>
                        )}

                        {visibleScreenings.length === 0 ? (
                          <div className="py-4 text-center text-[12.5px] text-slate-500">
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
                                  className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-start justify-between gap-2.5"
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[13.5px] font-semibold text-slate-900">
                                        {name}
                                      </span>
                                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
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
                                    <div className="text-[12.5px] text-slate-800">{sc.findings}</div>
                                    {sc.notes && (
                                      <div className="text-[11.5px] text-slate-500">Note: {sc.notes}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditScreening(sc)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
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
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Visit Date *
              </label>
              <input
                type="date"
                value={docVisitDate}
                onChange={(e) => setDocVisitDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] font-mono text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Session Time
              </label>
              <input
                type="text"
                value={docSessionTime}
                onChange={(e) => setDocSessionTime(e.target.value)}
                placeholder="e.g. 10:00 AM – 12:30 PM"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Doctor Name *
              </label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                required
                placeholder="e.g. Dr. Rajesh Sharma"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Specialization
              </label>
              <input
                type="text"
                value={docSpec}
                onChange={(e) => setDocSpec(e.target.value)}
                placeholder="e.g. Pediatrician / General Physician"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Campus / Session Notes
            </label>
            <textarea
              rows={2}
              value={docNotes}
              onChange={(e) => setDocNotes(e.target.value)}
              placeholder="Optional summary of the doctor's weekly visit..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setDocSessionModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Complaint / Reason *
            </label>
            <input
              type="text"
              value={docCaseComplaint}
              onChange={(e) => setDocCaseComplaint(e.target.value)}
              required
              placeholder="e.g. Persistent dry cough for 4 days"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Doctor Findings
            </label>
            <input
              type="text"
              value={docCaseFindings}
              onChange={(e) => setDocCaseFindings(e.target.value)}
              placeholder="e.g. Clear chest, mild throat congestion, afebrile"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Prescription / Advice
            </label>
            <textarea
              rows={2}
              value={docCaseAdvice}
              onChange={(e) => setDocCaseAdvice(e.target.value)}
              placeholder="e.g. Warm saline gargles twice daily; syrup 5ml BD for 3 days"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600 resize-none"
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Additional Notes
            </label>
            <input
              type="text"
              value={docCaseNotes}
              onChange={(e) => setDocCaseNotes(e.target.value)}
              placeholder="Optional nurse notes..."
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setDocCaseModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Hospital / Clinic *
              </label>
              <input
                type="text"
                value={opdHospital}
                onChange={(e) => setOpdHospital(e.target.value)}
                required
                placeholder="e.g. District Civil Hospital"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Referral Date & Time *
              </label>
              <input
                type="datetime-local"
                value={opdDateTime}
                onChange={(e) => setOpdDateTime(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-mono text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Reason for Referral *
              </label>
              <input
                type="text"
                value={opdReason}
                onChange={(e) => setOpdReason(e.target.value)}
                required
                placeholder="e.g. Ankle X-ray after sports injury"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                External Doctor
              </label>
              <input
                type="text"
                value={opdDoctor}
                onChange={(e) => setOpdDoctor(e.target.value)}
                placeholder="e.g. Dr. Mehta (Orthopedics)"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Escort / Parent
              </label>
              <input
                type="text"
                value={opdEscort}
                onChange={(e) => setOpdEscort(e.target.value)}
                placeholder="e.g. Hostel Warden"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Status
              </label>
              <CustomSelect
                value={opdStatus}
                onChange={(val) => setOpdStatus(val as OpdStatus)}
                options={OPD_STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Follow-up Date
              </label>
              <input
                type="date"
                value={opdFollowUpDate}
                onChange={(e) => setOpdFollowUpDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-mono text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Diagnosis & Advice
            </label>
            <textarea
              rows={2}
              value={opdDiagnosis}
              onChange={(e) => setOpdDiagnosis(e.target.value)}
              placeholder="Hospital findings, X-ray result, prescribed medicines, or rest days..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          {/* OPD Slip Photo Upload */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              OPD Slip / Prescription Photo (Saved to Google Drive)
            </label>
            <input
              ref={opdFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleOpdPhotoChange}
              className="hidden"
            />
            {opdImageDataUrl || isSafeImageSrc(editingOpd?.image_url) ? (
              <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={opdImageDataUrl || editingOpd?.image_url}
                    alt="OPD slip preview"
                    className="w-14 h-14 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-slate-800 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">OPD slip ready</span>
                    </div>
                    <div className="text-[11.5px] text-slate-500">
                      {opdImageSizeKb ? `Compressed ~${opdImageSizeKb} KB` : 'Existing slip attached'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => opdFileInputRef.current?.click()}
                    className="h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Replace
                  </button>
                  {opdImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpdImageDataUrl(undefined);
                        setOpdImageSizeKb(null);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      aria-label="Remove slip photo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => opdFileInputRef.current?.click()}
                disabled={opdImageCompressing}
                className="w-full py-3.5 px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-teal-50/40 hover:border-teal-400 transition-colors flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-700 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-teal-700" />
                <span>
                  {opdImageCompressing
                    ? 'Compressing photo...'
                    : 'Take Photo or Upload OPD Slip'}
                </span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Notes
            </label>
            <input
              type="text"
              value={opdNotes}
              onChange={(e) => setOpdNotes(e.target.value)}
              placeholder="Optional transport or parent communication notes..."
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setOpdModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
      {/* MODAL 4: OPD SLIP LIGHTBOX PREVIEW                                */}
      {/* ================================================================= */}
      <ModalDialog
        open={Boolean(lightboxOpd)}
        onClose={() => setLightboxOpd(null)}
        title={
          lightboxOpd
            ? `OPD Slip — ${lightboxOpd.student_name || lightboxOpd.student_id}`
            : 'OPD Slip'
        }
        subtitle={
          lightboxOpd
            ? `${lightboxOpd.hospital_or_clinic} · ${formatReadableDate(lightboxOpd.referral_datetime)}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {lightboxOpd && (
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 flex items-center justify-center max-h-[62vh]">
              {isSafeImageSrc(lightboxOpd.image_data_url || lightboxOpd.image_url) ? (
                <img
                  src={lightboxOpd.image_data_url || lightboxOpd.image_url}
                  alt="OPD slip"
                  className="max-h-[60vh] w-auto object-contain"
                />
              ) : (
                <div className="py-12 text-center text-slate-400 text-[13px] flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8" />
                  <span>Preview unavailable</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              {isSafeExternalLink(lightboxOpd.image_url) ? (
                <a
                  href={lightboxOpd.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-teal-50 text-teal-800 hover:bg-teal-100 text-[13px] font-semibold"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Google Drive</span>
                </a>
              ) : (
                <span className="text-[12px] text-slate-500">
                  Saved locally (syncs to Drive when updated Apps Script is deployed)
                </span>
              )}
              <button
                type="button"
                onClick={() => setLightboxOpd(null)}
                className="h-9 px-4 rounded-xl bg-slate-900 text-white text-[13px] font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Camp Title *
            </label>
            <input
              type="text"
              value={campTitle}
              onChange={(e) => setCampTitle(e.target.value)}
              required
              placeholder="e.g. Annual Dental & Eye Checkup Camp"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Camp Type
              </label>
              <CustomSelect
                value={campType}
                onChange={setCampType}
                options={CAMP_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Camp Date *
              </label>
              <input
                type="date"
                value={campDate}
                onChange={(e) => setCampDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] font-mono text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Organizer / Hospital Partner
              </label>
              <input
                type="text"
                value={campOrganizer}
                onChange={(e) => setCampOrganizer(e.target.value)}
                placeholder="e.g. Lions Club / Civil Health Team"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Target Classes
              </label>
              <input
                type="text"
                value={campTargetClasses}
                onChange={(e) => setCampTargetClasses(e.target.value)}
                placeholder="e.g. All Classes or Sparkle, Twinkle"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Visiting Doctor Team
            </label>
            <input
              type="text"
              value={campDoctorTeam}
              onChange={(e) => setCampDoctorTeam(e.target.value)}
              placeholder="e.g. Dr. Patel (Dentist), Dr. Verma (Optometrist)"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Camp Summary
            </label>
            <textarea
              rows={2}
              value={campSummary}
              onChange={(e) => setCampSummary(e.target.value)}
              placeholder="Overview, key observations, or follow-up plan..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCampModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Screening Findings *
            </label>
            <textarea
              rows={2}
              value={screeningFindings}
              onChange={(e) => setScreeningFindings(e.target.value)}
              required
              placeholder="e.g. Vision 6/6 normal, or Mild myopia — advise optometrist check"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600 resize-none"
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Notes
            </label>
            <input
              type="text"
              value={screeningNotes}
              onChange={(e) => setScreeningNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setScreeningModalOpen(false)}
              className="h-10 px-3.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
                className="h-9 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
