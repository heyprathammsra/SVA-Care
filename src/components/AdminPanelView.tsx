import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Users,
  UserPlus,
  Layers,
  GraduationCap,
  Pencil,
  Trash2,
  Check,
  X,
  Eye,
  EyeOff,
  Search,
  ShieldCheck,
  FileSpreadsheet,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Plus,
  Clock,
} from 'lucide-react';
import {
  sanitizeClassSectionName,
  searchStudents,
  formatHHMMTo12h,
  DEFAULT_INFIRMARY_SETTINGS,
  type StudentRecord,
  type AppUserRecord,
  type InfirmarySettings,
} from '../utils/nurseLogic';
import { type AuthRole, type AuthUser } from '../utils/auth';
import { CustomSelect } from './CustomSelect';
import { ModalDialog } from './ModalDialog';

export interface AdminActionResult {
  ok: boolean;
  message: string;
}

interface AdminPanelViewProps {
  currentUser: AuthUser;
  students: StudentRecord[];
  classes: string[];
  users: AppUserRecord[];
  settings?: InfirmarySettings;
  onCreateStudent: (
    fullName: string,
    section: string,
    rollNumber: string,
    activeStatus?: 'Active' | 'Inactive'
  ) => Promise<AdminActionResult>;
  onUpdateStudent: (student: StudentRecord) => Promise<AdminActionResult>;
  onCreateClass: (className: string) => Promise<AdminActionResult>;
  onRenameClass: (oldName: string, newName: string) => Promise<AdminActionResult>;
  onDeleteClass: (className: string) => Promise<AdminActionResult>;
  onUpsertUser: (user: AppUserRecord) => Promise<AdminActionResult>;
  onDeleteUser: (username: string) => Promise<AdminActionResult>;
  onUpdateSchoolHours?: (start: string, end: string) => Promise<AdminActionResult>;
  onOpenStudentProfile: (studentId: string) => void;
  onOpenSheetsSetup: () => void;
  onBackToHome: () => void;
}

type AdminTab = 'users' | 'classes' | 'students' | 'hours';

const ROLE_LABELS: Record<AuthRole, { label: string; defaultBadge: string; pillClass: string }> = {
  admin: {
    label: 'Admin',
    defaultBadge: 'System Admin',
    pillClass: 'bg-zinc-900 text-white',
  },
  nurse: {
    label: 'Nurse',
    defaultBadge: 'Infirmary Nurse',
    pillClass: 'bg-teal-50 text-teal-800 border border-teal-200/80',
  },
  warden: {
    label: 'Warden',
    defaultBadge: 'Hostel Warden',
    pillClass: 'bg-amber-50 text-amber-900 border border-amber-200/80',
  },
};

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  currentUser,
  students,
  classes,
  users,
  settings = DEFAULT_INFIRMARY_SETTINGS,
  onCreateStudent,
  onUpdateStudent,
  onCreateClass,
  onRenameClass,
  onDeleteClass,
  onUpsertUser,
  onDeleteUser,
  onUpdateSchoolHours,
  onOpenStudentProfile,
  onOpenSheetsSetup,
  onBackToHome,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  // School Hours / Shift Settings state
  const [hoursStart, setHoursStart] = useState(
    settings.school_hours_start || DEFAULT_INFIRMARY_SETTINGS.school_hours_start
  );
  const [hoursEnd, setHoursEnd] = useState(
    settings.school_hours_end || DEFAULT_INFIRMARY_SETTINGS.school_hours_end
  );

  // ============================================================================
  // USERS & ROLES STATE
  // ============================================================================
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [roleInput, setRoleInput] = useState<AuthRole>('nurse');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [badgeTitleInput, setBadgeTitleInput] = useState('');
  const [userStatusInput, setUserStatusInput] = useState<'Active' | 'Inactive'>('Active');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);

  // Users strictly loaded from authenticated Admin server response (zero hardcoded client passwords)
  const effectiveUsers = useMemo(() => {
    const byKey = new Map<string, AppUserRecord>();
    for (const u of users) {
      const key = (u.username || '').trim().toLowerCase();
      if (!key) continue;
      byKey.set(key, { ...u, username: key });
    }
    const roleOrder: Record<AuthRole, number> = { admin: 0, nurse: 1, warden: 2 };
    return Array.from(byKey.values()).sort((a, b) => {
      const rDiff = roleOrder[a.role] - roleOrder[b.role];
      if (rDiff !== 0) return rDiff;
      return a.username.localeCompare(b.username);
    });
  }, [users]);

  // ============================================================================
  // CLASSES (SECTIONS ONLY — NO GRADE NUMBERS) STATE
  // ============================================================================
  const [newClassInput, setNewClassInput] = useState('');
  const [renamingClass, setRenamingClass] = useState<string | null>(null);
  const [renameClassInput, setRenameClassInput] = useState('');
  const [confirmDeleteClass, setConfirmDeleteClass] = useState<string | null>(null);

  const sanitizedNewClassPreview = useMemo(
    () => sanitizeClassSectionName(newClassInput),
    [newClassInput]
  );

  const studentCountByClass = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      const key = s.section.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [students]);

  // ============================================================================
  // STUDENTS STATE
  // ============================================================================
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'Active' | 'Inactive'>(
    'ALL'
  );
  const [showCreateStudentCard, setShowCreateStudentCard] = useState(false);
  const [createStuName, setCreateStuName] = useState('');
  const [createStuClass, setCreateStuClass] = useState(classes[0] || 'Sparkle');
  const [createStuRoll, setCreateStuRoll] = useState('');
  const [createStuStatus, setCreateStuStatus] = useState<'Active' | 'Inactive'>('Active');

  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [editStuName, setEditStuName] = useState('');
  const [editStuClass, setEditStuClass] = useState('');
  const [editStuRoll, setEditStuRoll] = useState('');
  const [editStuStatus, setEditStuStatus] = useState<'Active' | 'Inactive'>('Active');

  const deferredStudentSearch = useDeferredValue(studentSearch);

  const filteredStudents = useMemo(() => {
    let list = searchStudents(students, deferredStudentSearch, studentClassFilter);
    if (studentStatusFilter !== 'ALL') {
      list = list.filter((s) => s.active_status === studentStatusFilter);
    }
    return list;
  }, [students, deferredStudentSearch, studentClassFilter, studentStatusFilter]);

  const showToast = (res: AdminActionResult) => {
    setFeedback({ type: res.ok ? 'success' : 'error', text: res.message });
  };

  // ============================================================================
  // USER HANDLERS
  // ============================================================================
  const resetUserForm = () => {
    setEditingUsername(null);
    setUserIdInput('');
    setPasswordInput('');
    setRoleInput('nurse');
    setDisplayNameInput('');
    setBadgeTitleInput('');
    setUserStatusInput('Active');
    setShowFormPassword(false);
  };

  const startEditUser = (u: AppUserRecord) => {
    setEditingUsername(u.username);
    setUserIdInput(u.username);
    setPasswordInput('');
    setRoleInput(u.role);
    setDisplayNameInput(u.display_name || '');
    setBadgeTitleInput(u.badge_title || '');
    setUserStatusInput(u.active_status === 'Inactive' ? 'Inactive' : 'Active');
    setShowFormPassword(false);
    setFeedback(null);
  };

  const handleSaveUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = userIdInput.trim().toLowerCase().replace(/\s+/g, '');
    const cleanPassword = passwordInput.trim();
    if (!cleanUsername) {
      showToast({ ok: false, message: 'Please enter a User ID (username).' });
      return;
    }
    if (!editingUsername && !cleanPassword) {
      showToast({ ok: false, message: 'Please enter a password (minimum 6 characters).' });
      return;
    }
    if (cleanPassword && cleanPassword.length < 6) {
      showToast({ ok: false, message: 'Password must be at least 6 characters long.' });
      return;
    }
    if (
      cleanUsername === currentUser.username.toLowerCase() &&
      (roleInput !== 'admin' || userStatusInput === 'Inactive')
    ) {
      showToast({
        ok: false,
        message: 'You cannot demote or deactivate the currently signed-in Admin account.',
      });
      return;
    }

    setBusy(true);
    try {
      const res = await onUpsertUser({
        username: cleanUsername,
        password: cleanPassword,
        role: roleInput,
        display_name:
          displayNameInput.trim() ||
          (roleInput === 'admin'
            ? 'Infirmary Administrator'
            : roleInput === 'nurse'
              ? 'School Nurse'
              : `${cleanUsername} (Hostel Warden)`),
        badge_title: badgeTitleInput.trim() || ROLE_LABELS[roleInput].defaultBadge,
        active_status: userStatusInput,
      });
      showToast(res);
      if (res.ok) {
        resetUserForm();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteUser = async (username: string) => {
    if (username.toLowerCase() === currentUser.username.toLowerCase()) {
      showToast({ ok: false, message: 'Cannot delete the currently logged-in Admin account.' });
      return;
    }
    setBusy(true);
    try {
      const res = await onDeleteUser(username);
      showToast(res);
      setConfirmDeleteUser(null);
      if (editingUsername === username) {
        resetUserForm();
      }
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // CLASS HANDLERS
  // ============================================================================
  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizeClassSectionName(newClassInput);
    if (!clean) {
      showToast({
        ok: false,
        message: 'Enter a valid section name (letters only — do not use grade numbers).',
      });
      return;
    }
    if (classes.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      showToast({ ok: false, message: `Class "${clean}" already exists.` });
      return;
    }
    setBusy(true);
    try {
      const res = await onCreateClass(clean);
      showToast(res);
      if (res.ok) {
        setNewClassInput('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRenameClassSubmit = async (oldName: string) => {
    const clean = sanitizeClassSectionName(renameClassInput);
    if (!clean) {
      showToast({
        ok: false,
        message: 'Enter a valid section name (no grade numbers).',
      });
      return;
    }
    if (clean.toLowerCase() === oldName.toLowerCase()) {
      setRenamingClass(null);
      setRenameClassInput('');
      return;
    }
    setBusy(true);
    try {
      const res = await onRenameClass(oldName, clean);
      showToast(res);
      if (res.ok) {
        setRenamingClass(null);
        setRenameClassInput('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteClass = async (className: string) => {
    setBusy(true);
    try {
      const res = await onDeleteClass(className);
      showToast(res);
      setConfirmDeleteClass(null);
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // STUDENT HANDLERS
  // ============================================================================
  const handleCreateStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createStuName.trim();
    const sec = sanitizeClassSectionName(createStuClass) || createStuClass.trim();
    const roll = createStuRoll.trim();
    if (!name || !sec || !roll) {
      showToast({ ok: false, message: 'Full name, class section, and roll number are required.' });
      return;
    }
    setBusy(true);
    try {
      const res = await onCreateStudent(name, sec, roll, createStuStatus);
      showToast(res);
      if (res.ok) {
        setCreateStuName('');
        setCreateStuRoll('');
        setCreateStuStatus('Active');
        setShowCreateStudentCard(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const openEditStudentModal = (student: StudentRecord) => {
    setEditingStudent(student);
    setEditStuName(student.full_name);
    setEditStuClass(student.section);
    setEditStuRoll(student.roll_number);
    setEditStuStatus(student.active_status === 'Inactive' ? 'Inactive' : 'Active');
    setFeedback(null);
  };

  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    const name = editStuName.trim();
    const sec = sanitizeClassSectionName(editStuClass) || editStuClass.trim();
    const roll = editStuRoll.trim();
    if (!name || !sec || !roll) {
      showToast({ ok: false, message: 'Full name, class section, and roll number are required.' });
      return;
    }
    setBusy(true);
    try {
      const res = await onUpdateStudent({
        ...editingStudent,
        full_name: name,
        section: sec,
        roll_number: /^\d+$/.test(roll) ? roll.padStart(2, '0') : roll,
        active_status: editStuStatus,
      });
      showToast(res);
      if (res.ok) {
        setEditingStudent(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* Desktop Top Action Strip (Mobile already has dedicated Back + Sheets buttons in header) */}
      <div className="hidden sm:flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBackToHome}
          className="px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Infirmary Desk
        </button>

        <button
          type="button"
          onClick={onOpenSheetsSetup}
          className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Google Sheets &amp; Excel Backup</span>
        </button>
      </div>

      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 sm:gap-3 border-b border-stone-200/80 pb-3.5 sm:pb-4">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-semibold text-teal-700 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Administrator Portal · {currentUser.displayName}</span>
          </p>
          <h1 className="text-xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5 leading-tight">
            <span className="sm:hidden">Admin Console</span>
            <span className="hidden sm:inline">Users, Classes &amp; Student Management</span>
          </h1>
          <p className="hidden sm:block text-sm text-zinc-500 mt-1">
            Create staff accounts with roles, manage classes by section name, and add or edit student records.
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono tabular-nums text-zinc-500 shrink-0">
          <span>{effectiveUsers.length} users</span>
          <span className="text-stone-300">·</span>
          <span>{classes.length} classes</span>
          <span className="text-stone-300">·</span>
          <span>{students.length} students</span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/90 border-rose-200 text-rose-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-500 hover:text-zinc-900 p-0.5 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs (Single row on mobile & desktop) */}
      <div
        role="tablist"
        aria-label="Admin management sections"
        className={`grid ${onUpdateSchoolHours ? 'grid-cols-4' : 'grid-cols-3'} sm:inline-flex items-center gap-1 p-1 bg-stone-100/90 border border-stone-200/70 rounded-xl w-full sm:w-auto`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => {
            setActiveTab('users');
            setFeedback(null);
          }}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'users'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <UserPlus className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span className="sm:hidden">Users</span>
          <span className="hidden sm:inline">Staff Users &amp; Roles</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({effectiveUsers.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'classes'}
          onClick={() => {
            setActiveTab('classes');
            setFeedback(null);
          }}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'classes'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Layers className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span className="sm:hidden">Classes</span>
          <span className="hidden sm:inline">Classes (Sections)</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({classes.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'students'}
          onClick={() => {
            setActiveTab('students');
            setFeedback(null);
          }}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'students'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <GraduationCap className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span>Students</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({students.length})</span>
        </button>

        {onUpdateSchoolHours && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'hours'}
            onClick={() => {
              setHoursStart(
                settings.school_hours_start || DEFAULT_INFIRMARY_SETTINGS.school_hours_start
              );
              setHoursEnd(
                settings.school_hours_end || DEFAULT_INFIRMARY_SETTINGS.school_hours_end
              );
              setActiveTab('hours');
              setFeedback(null);
            }}
            className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'hours'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Clock className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
            <span className="sm:hidden">Hours</span>
            <span className="hidden sm:inline">Infirmary Hours</span>
          </button>
        )}
      </div>

      {/* ========================================================================
          TAB 1: STAFF USERS & ROLES
      ======================================================================== */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Create / Edit User Form */}
          <form
            onSubmit={handleSaveUserSubmit}
            className="lg:col-span-5 bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 font-display">
                  {editingUsername ? `Edit User: ${editingUsername}` : 'Create New User'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Assign a login ID, password, and portal role.
                </p>
              </div>
              {editingUsername && (
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="space-y-3.5">
              <div>
                <label htmlFor="admin-user-id" className="block text-xs font-semibold text-zinc-700 mb-1">
                  User ID (Login Username) *
                </label>
                <input
                  id="admin-user-id"
                  type="text"
                  value={userIdInput}
                  disabled={Boolean(editingUsername)}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  placeholder="e.g. nurse2, warden_priya"
                  className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 disabled:opacity-60 disabled:bg-stone-100"
                />
              </div>

              <div>
                <label htmlFor="admin-user-password" className="block text-xs font-semibold text-zinc-700 mb-1">
                  {editingUsername ? 'Reset Password (Optional)' : 'Password *'}
                </label>
                <div className="relative">
                  <input
                    id="admin-user-password"
                    type={showFormPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={
                      editingUsername
                        ? 'Leave blank to keep current password'
                        : 'Minimum 6 characters (scrypt hashed)'
                    }
                    className="w-full h-10 pl-3 pr-10 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword((v) => !v)}
                    aria-label={showFormPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-2.5 p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Passwords are one-way hashed with salted scrypt and never stored or displayed in plain text.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="admin-user-role" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Defined Role *
                  </label>
                  <CustomSelect
                    id="admin-user-role"
                    ariaLabel="Defined role"
                    value={roleInput}
                    onChange={(val) => setRoleInput(val as AuthRole)}
                    variant="subtle"
                    className="w-full"
                    options={[
                      { value: 'nurse', label: 'Nurse', sublabel: 'Infirmary Portal' },
                      { value: 'warden', label: 'Warden', sublabel: 'Hostel Pass Portal' },
                      { value: 'admin', label: 'Admin', sublabel: 'Full Control' },
                    ]}
                  />
                </div>

                <div>
                  <label htmlFor="admin-user-status" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Account Status
                  </label>
                  <CustomSelect
                    id="admin-user-status"
                    ariaLabel="Account status"
                    value={userStatusInput}
                    onChange={(val) => setUserStatusInput(val as 'Active' | 'Inactive')}
                    variant="subtle"
                    className="w-full"
                    options={[
                      { value: 'Active', label: 'Active' },
                      { value: 'Inactive', label: 'Inactive' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-user-display" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Display Name
                </label>
                <input
                  id="admin-user-display"
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="e.g. Sister Meera / Warden Rahul"
                  className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="admin-user-badge" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Title / Label (Optional)
                </label>
                <input
                  id="admin-user-badge"
                  type="text"
                  value={badgeTitleInput}
                  onChange={(e) => setBadgeTitleInput(e.target.value)}
                  placeholder={ROLE_LABELS[roleInput].defaultBadge}
                  className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] rounded-xl transition-all inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingUsername ? 'Save User Changes' : 'Create User Account'}</span>
            </button>
          </form>

          {/* Right: Existing Staff Accounts List */}
          <div className="lg:col-span-7 bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 font-display">
                  Authorized Staff Accounts
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Changes apply immediately at login and sync with your school backend.
                </p>
              </div>
            </div>

            <div className="divide-y divide-stone-100">
              {effectiveUsers.map((u) => {
                const isSelf = u.username.toLowerCase() === currentUser.username.toLowerCase();
                const roleMeta = ROLE_LABELS[u.role];
                return (
                  <div
                    key={u.username}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/60 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-900">
                          {u.display_name || u.username}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md ${roleMeta.pillClass}`}
                        >
                          {roleMeta.label}
                        </span>
                        {u.active_status === 'Inactive' && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                            Inactive
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-[11px] font-medium text-teal-700">
                            (Signed in)
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 font-mono">
                        <span>ID: <strong className="text-zinc-800">{u.username}</strong></span>
                        <span className="text-stone-300">·</span>
                        <span className="inline-flex items-center gap-1.5 text-teal-700">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>Hashed (scrypt)</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditUser(u)}
                        className="h-8 px-3 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200/80 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      {!isSelf && (
                        confirmDeleteUser === u.username ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleConfirmDeleteUser(u.username)}
                              className="h-8 px-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUser(null)}
                              className="h-8 px-2 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser(u.username)}
                            aria-label={`Delete user ${u.username}`}
                            className="h-8 px-2.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 2: CLASSES (SECTION NAMES ONLY — NO GRADE NUMBERS)
      ======================================================================== */}
      {activeTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Create Class Card */}
          <form
            onSubmit={handleCreateClassSubmit}
            className="lg:col-span-5 bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="pb-3 border-b border-stone-100">
              <h2 className="text-base font-semibold text-zinc-900 font-display">
                Create New Class
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Use the section name only (for example: <strong>Sapphire</strong>,{' '}
                <strong>Pearl</strong>, <strong>Coral</strong>). Grade numbers are not used.
              </p>
            </div>

            <div>
              <label htmlFor="admin-new-class" className="block text-xs font-semibold text-zinc-700 mb-1">
                Class Section Name *
              </label>
              <input
                id="admin-new-class"
                type="text"
                value={newClassInput}
                onChange={(e) => setNewClassInput(e.target.value)}
                placeholder="e.g. Sapphire"
                className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
              {newClassInput.trim() && (
                <p className="text-[11px] mt-1.5 text-zinc-500">
                  {sanitizedNewClassPreview ? (
                    <>
                      Will be saved as section:{' '}
                      <strong className="text-teal-800">{sanitizedNewClassPreview}</strong>
                    </>
                  ) : (
                    <span className="text-rose-600">
                      Please enter letters for the section name (no grade numbers).
                    </span>
                  )}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy || !sanitizedNewClassPreview}
              className="w-full h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] rounded-xl transition-all inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Class Section</span>
            </button>
          </form>

          {/* Existing Classes List */}
          <div className="lg:col-span-7 bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <h2 className="text-base font-semibold text-zinc-900 font-display">
                Active School Classes ({classes.length})
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Renaming a class automatically updates all students and visit records in that section.
              </p>
            </div>

            <div className="divide-y divide-stone-100">
              {classes.map((cls) => {
                const count = studentCountByClass.get(cls.toLowerCase()) || 0;
                const isRenaming = renamingClass === cls;
                return (
                  <div
                    key={cls}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/60 transition-colors"
                  >
                    {isRenaming ? (
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          aria-label={`New section name for ${cls}`}
                          value={renameClassInput}
                          onChange={(e) => setRenameClassInput(e.target.value)}
                          placeholder="New section name"
                          className="h-9 px-3 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-zinc-900 flex-1 min-w-[140px]"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRenameClassSubmit(cls)}
                          className="h-9 px-3 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Update
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingClass(null);
                            setRenameClassInput('');
                          }}
                          className="h-9 px-2.5 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 font-semibold text-xs flex items-center justify-center shrink-0">
                            {cls.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-zinc-900">{cls}</h3>
                            <p className="text-xs font-mono tabular-nums text-zinc-500">
                              {count} {count === 1 ? 'student' : 'students'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setStudentClassFilter(cls);
                              setActiveTab('students');
                            }}
                            className="h-8 px-2.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Students</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRenamingClass(cls);
                              setRenameClassInput(cls);
                              setConfirmDeleteClass(null);
                            }}
                            className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200/80 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Rename</span>
                          </button>

                          {count === 0 && (
                            confirmDeleteClass === cls ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleConfirmDeleteClass(cls)}
                                  className="h-8 px-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteClass(null)}
                                  className="h-8 px-2 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteClass(cls)}
                                aria-label={`Delete empty class ${cls}`}
                                className="h-8 px-2.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 3: STUDENTS (CREATE NEW + EDIT ALL INFORMATION)
      ======================================================================== */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name, roll #, or section..."
                  className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-zinc-900"
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => setStudentSearch('')}
                    className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <CustomSelect
                ariaLabel="Filter students by class section"
                value={studentClassFilter}
                onChange={setStudentClassFilter}
                menuMinWidth={190}
                className="min-w-[155px]"
                options={[
                  { value: 'ALL', label: `All Classes (${students.length})` },
                  ...classes.map((cls) => ({
                    value: cls,
                    label: `${cls} (${studentCountByClass.get(cls.toLowerCase()) || 0})`,
                  })),
                ]}
              />

              <CustomSelect
                ariaLabel="Filter students by active status"
                value={studentStatusFilter}
                onChange={(val) =>
                  setStudentStatusFilter(val as 'ALL' | 'Active' | 'Inactive')
                }
                menuMinWidth={140}
                className="min-w-[115px]"
                options={[
                  { value: 'ALL', label: 'All Status' },
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' },
                ]}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (studentClassFilter !== 'ALL') {
                  setCreateStuClass(studentClassFilter);
                } else if (classes.length > 0 && !classes.includes(createStuClass)) {
                  setCreateStuClass(classes[0]);
                }
                setShowCreateStudentCard((v) => !v);
              }}
              className="h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreateStudentCard ? 'Close Form' : 'New Student'}</span>
            </button>
          </div>

          {/* Create New Student Card */}
          {showCreateStudentCard && (
            <form
              onSubmit={handleCreateStudentSubmit}
              className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-stone-100">
                <h2 className="text-base font-semibold text-zinc-900 font-display">
                  Add New Student
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreateStudentCard(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label htmlFor="admin-create-stu-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    id="admin-create-stu-name"
                    type="text"
                    value={createStuName}
                    onChange={(e) => setCreateStuName(e.target.value)}
                    placeholder="Student full name"
                    className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="admin-create-stu-class" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Class (Section Name) *
                  </label>
                  <CustomSelect
                    id="admin-create-stu-class"
                    ariaLabel="Class section name"
                    value={createStuClass}
                    onChange={setCreateStuClass}
                    variant="subtle"
                    className="w-full"
                    options={classes.map((cls) => ({ value: cls, label: cls }))}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="admin-create-stu-roll" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Roll Number *
                  </label>
                  <input
                    id="admin-create-stu-roll"
                    type="text"
                    value={createStuRoll}
                    onChange={(e) => setCreateStuRoll(e.target.value)}
                    placeholder="e.g. 31"
                    className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="admin-create-stu-status" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Status
                  </label>
                  <CustomSelect
                    id="admin-create-stu-status"
                    ariaLabel="Student status"
                    value={createStuStatus}
                    onChange={(val) => setCreateStuStatus(val as 'Active' | 'Inactive')}
                    variant="subtle"
                    className="w-full"
                    options={[
                      { value: 'Active', label: 'Active' },
                      { value: 'Inactive', label: 'Inactive' },
                    ]}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Student</span>
                </button>
              </div>
            </form>
          )}

          {/* Student List */}
          <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 bg-stone-50/70 border-b border-stone-100 flex items-center justify-between text-xs text-zinc-500">
              <span>
                Showing <strong className="text-zinc-900 font-mono">{filteredStudents.length}</strong>{' '}
                of <span className="font-mono">{students.length}</span> students
              </span>
              <span>Click Edit to update name, class section, roll number, or status</span>
            </div>

            <div className="divide-y divide-stone-100 max-h-[560px] overflow-y-auto smooth-scroll-list">
              {filteredStudents.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  No students match your current search or filter.
                </div>
              ) : (
                filteredStudents.map((stu) => (
                  <div
                    key={stu.student_id}
                    className="list-row-opt px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-8 h-8 rounded-lg bg-stone-100 text-zinc-700 font-mono tabular-nums text-xs font-semibold flex items-center justify-center shrink-0">
                        {stu.roll_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-zinc-900 truncate">
                            {stu.full_name}
                          </span>
                          {stu.active_status === 'Inactive' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-rose-50 text-rose-700 border border-rose-200">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                          <span className="font-medium text-teal-800">{stu.section}</span>
                          <span className="text-stone-300">·</span>
                          <span className="font-mono text-[11px] text-zinc-400">
                            {stu.student_id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditStudentModal(stu)}
                        className="h-8 px-3 text-xs font-semibold text-zinc-800 bg-stone-100 hover:bg-stone-200/80 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStudentProfile(stu.student_id)}
                        className="h-8 px-2.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer hidden sm:inline-flex items-center"
                      >
                        Profile
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 4: INFIRMARY HOURS (SCHOOL HOURS VS NIGHT CLASSIFICATION)
      ======================================================================== */}
      {activeTab === 'hours' && onUpdateSchoolHours && (
        <div className="max-w-xl bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-5">
          <div className="pb-3 border-b border-stone-100">
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              School Hours vs. Night Visit Timings
            </h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Visits recorded within this window are tagged as{' '}
              <strong className="text-teal-800">School Hours</strong>; visits outside it are tagged as{' '}
              <strong className="text-indigo-700">Night</strong>. Staff can still manually override on any visit.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold text-zinc-500">Quick Timings</span>
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5">
              {[
                { short: '7:30 – 3:30', label: '7:30 AM – 3:30 PM', start: '07:30', end: '15:30' },
                { short: '8:00 – 2:30', label: '8:00 AM – 2:30 PM', start: '08:00', end: '14:30' },
                { short: '8:00 – 4:00', label: '8:00 AM – 4:00 PM', start: '08:00', end: '16:00' },
              ].map((preset) => {
                const isSelected = hoursStart === preset.start && hoursEnd === preset.end;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setHoursStart(preset.start);
                      setHoursEnd(preset.end);
                    }}
                    className={`h-9 sm:h-8 px-2 sm:px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap text-center font-mono sm:font-sans cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 font-semibold'
                        : 'bg-white text-zinc-700 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <span className="sm:hidden">{preset.short}</span>
                    <span className="hidden sm:inline">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!hoursStart || !hoursEnd || hoursEnd <= hoursStart) {
                showToast({ ok: false, message: 'School Hours End must be later than Start.' });
                return;
              }
              setBusy(true);
              try {
                const res = await onUpdateSchoolHours(hoursStart, hoursEnd);
                showToast(res);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="school-hours-start" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  School Hours Start
                </label>
                <input
                  id="school-hours-start"
                  type="time"
                  required
                  value={hoursStart}
                  onChange={(e) => setHoursStart(e.target.value)}
                  className="w-full h-11 sm:h-10 px-3 text-sm font-mono tabular-nums bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="school-hours-end" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  School Hours End
                </label>
                <input
                  id="school-hours-end"
                  type="time"
                  required
                  value={hoursEnd}
                  onChange={(e) => setHoursEnd(e.target.value)}
                  className="w-full h-11 sm:h-10 px-3 text-sm font-mono tabular-nums bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
            </div>

            {hoursStart && hoursEnd && hoursEnd <= hoursStart ? (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                School Hours End must be later than School Hours Start.
              </div>
            ) : (
              <div className="rounded-xl bg-stone-50/90 border border-stone-200/70 grid grid-cols-2 divide-x divide-stone-200/80">
                <div className="p-3 sm:p-3.5 min-w-0">
                  <span className="block text-[11px] font-semibold text-teal-800">School Hours</span>
                  <span className="block text-xs font-mono tabular-nums font-semibold text-zinc-900 mt-0.5">
                    {formatHHMMTo12h(hoursStart)} – {formatHHMMTo12h(hoursEnd)}
                  </span>
                </div>
                <div className="p-3 sm:p-3.5 min-w-0">
                  <span className="block text-[11px] font-semibold text-indigo-700">Night / After-Hours</span>
                  <span className="block text-xs text-zinc-600 mt-0.5">
                    Before {formatHHMMTo12h(hoursStart)} or after {formatHHMMTo12h(hoursEnd)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setHoursStart(DEFAULT_INFIRMARY_SETTINGS.school_hours_start);
                  setHoursEnd(DEFAULT_INFIRMARY_SETTINGS.school_hours_end);
                }}
                className="h-10 px-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                Reset default
              </button>
              <button
                type="submit"
                disabled={busy || !hoursStart || !hoursEnd || hoursEnd <= hoursStart}
                className="h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>{busy ? 'Saving...' : 'Save School Hours'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================
          EDIT STUDENT MODAL
      ======================================================================== */}
      <ModalDialog
        open={Boolean(editingStudent)}
        onClose={() => setEditingStudent(null)}
        title="Edit Student Information"
        subtitle={editingStudent ? `Permanent ID · ${editingStudent.student_id}` : undefined}
        icon={<Pencil className="w-4 h-4 text-teal-700" />}
        titleId="edit-student-modal-title"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingStudent(null)}
              className="h-9 px-3.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-edit-student-form"
              disabled={busy}
              className="h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </>
        }
      >
        <form
          id="admin-edit-student-form"
          onSubmit={handleSaveEditStudent}
          className="space-y-4"
        >
          <div>
            <label htmlFor="edit-stu-name" className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Full Name *
            </label>
            <input
              id="edit-stu-name"
              type="text"
              value={editStuName}
              onChange={(e) => setEditStuName(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-stu-class" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Class (Section Name) *
              </label>
              <CustomSelect
                id="edit-stu-class"
                ariaLabel="Class section name"
                value={editStuClass}
                onChange={setEditStuClass}
                variant="subtle"
                className="w-full"
                options={[
                  ...(!classes.includes(editStuClass) && editStuClass
                    ? [{ value: editStuClass, label: editStuClass }]
                    : []),
                  ...classes.map((cls) => ({ value: cls, label: cls })),
                ]}
              />
            </div>

            <div>
              <label htmlFor="edit-stu-roll" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Roll Number *
              </label>
              <input
                id="edit-stu-roll"
                type="text"
                value={editStuRoll}
                onChange={(e) => setEditStuRoll(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-stu-status" className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Enrollment Status
            </label>
            <CustomSelect
              id="edit-stu-status"
              ariaLabel="Enrollment status"
              value={editStuStatus}
              onChange={(val) => setEditStuStatus(val as 'Active' | 'Inactive')}
              variant="subtle"
              className="w-full"
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' },
              ]}
            />
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
