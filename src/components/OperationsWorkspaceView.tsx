import React, { useState, useMemo, useRef } from 'react';
import {
  Pill,
  Package,
  Receipt,
  History,
  Plus,
  Search,
  Pencil,
  Trash2,
  SlidersHorizontal,
  Camera,
  ExternalLink,
  Eye,
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  ArrowUpDown,
  Image as ImageIcon,
} from 'lucide-react';
import {
  getStockStatus,
  getExpiryStatus,
  type MedicineInventoryRecord,
  type ItemInventoryRecord,
  type StockTransactionRecord,
  type BillRecord,
  type BillCategory,
} from '../utils/nurseLogic';
import { getTodayLocalDateString } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';
import { ModalDialog } from './ModalDialog';

export interface OperationsActionResult {
  ok: boolean;
  message: string;
}

export interface BillRestockLine {
  target_type: 'medicine' | 'item';
  target_id: string;
  qty: number;
}

interface OperationsWorkspaceViewProps {
  medicines: MedicineInventoryRecord[];
  items: ItemInventoryRecord[];
  stockTransactions: StockTransactionRecord[];
  bills: BillRecord[];
  onUpsertMedicine: (medicine: Partial<MedicineInventoryRecord>) => Promise<OperationsActionResult>;
  onDeleteMedicine: (medicineId: string) => Promise<OperationsActionResult>;
  onUpsertItem: (item: Partial<ItemInventoryRecord>) => Promise<OperationsActionResult>;
  onDeleteItem: (itemId: string) => Promise<OperationsActionResult>;
  onAdjustStock: (payload: {
    target_type: 'medicine' | 'item';
    target_id: string;
    change_qty: number;
    reason?: 'adjustment' | 'bill_restock';
    notes?: string;
  }) => Promise<OperationsActionResult>;
  onCreateBill: (
    bill: Partial<BillRecord>,
    restockLines?: BillRestockLine[]
  ) => Promise<OperationsActionResult>;
  onUpdateBill: (bill: Partial<BillRecord>) => Promise<OperationsActionResult>;
  onDeleteBill: (billId: string) => Promise<OperationsActionResult>;
}

type OperationsTab = 'medicines' | 'items' | 'bills' | 'ledger';

const MEDICINE_CATEGORIES = [
  'Fever & Pain',
  'Hydration / ORS',
  'Allergy & Cold',
  'Stomach & Antacid',
  'Antiseptic / Topical',
  'Eye / Ear Drops',
  'General',
];

const MEDICINE_UNITS = ['tablets', 'bottles', 'sachets', 'strips', 'tubes', 'ml', 'vials'];

const ITEM_CATEGORIES = [
  'First Aid',
  'Dressing & Bandages',
  'Hygiene & Menstrual',
  'Diagnostic / Equipment',
  'Consumables',
  'Other',
];

const ITEM_UNITS = ['pcs', 'packs', 'rolls', 'boxes', 'bottles', 'pairs', 'kits'];

const BILL_CATEGORIES: BillCategory[] = ['Medicines', 'Items', 'Equipment', 'Camp', 'Other'];

/**
 * Compresses an uploaded bill photo in the browser to a lightweight JPEG data URL
 * (max 1200px longest side, quality 0.78) so uploads are fast over school mobile data.
 */
async function compressBillImageFile(file: File): Promise<{ dataUrl: string; sizeKb: number }> {
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

function formatInr(amount: number): string {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export const OperationsWorkspaceView: React.FC<OperationsWorkspaceViewProps> = ({
  medicines,
  items,
  stockTransactions,
  bills,
  onUpsertMedicine,
  onDeleteMedicine,
  onUpsertItem,
  onDeleteItem,
  onAdjustStock,
  onCreateBill,
  onUpdateBill,
  onDeleteBill,
}) => {
  const [activeTab, setActiveTab] = useState<OperationsTab>('medicines');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Filters
  const [medSearch, setMedSearch] = useState('');
  const [medFilter, setMedFilter] = useState<'all' | 'low' | 'expiring'>('all');

  const [itemSearch, setItemSearch] = useState('');
  const [itemFilter, setItemFilter] = useState<'all' | 'low'>('all');

  const [billSearch, setBillSearch] = useState('');
  const [billCatFilter, setBillCatFilter] = useState<string>('ALL');

  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'medicine' | 'item'>('all');

  // Medicine modal state
  const [showMedModal, setShowMedModal] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicineInventoryRecord | null>(null);
  const [medName, setMedName] = useState('');
  const [medCategory, setMedCategory] = useState('Fever & Pain');
  const [medFormStrength, setMedFormStrength] = useState('');
  const [medUnit, setMedUnit] = useState('tablets');
  const [medBatch, setMedBatch] = useState('');
  const [medExpiry, setMedExpiry] = useState('');
  const [medStock, setMedStock] = useState('10');
  const [medMinAlert, setMedMinAlert] = useState('5');
  const [medNotes, setMedNotes] = useState('');
  const [confirmDeleteMedId, setConfirmDeleteMedId] = useState<string | null>(null);

  // Item modal state
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemInventoryRecord | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('First Aid');
  const [itemUnit, setItemUnit] = useState('pcs');
  const [itemStock, setItemStock] = useState('10');
  const [itemMinAlert, setItemMinAlert] = useState('5');
  const [itemNotes, setItemNotes] = useState('');
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);

  // Stock adjustment modal state
  const [adjustTarget, setAdjustTarget] = useState<{
    type: 'medicine' | 'item';
    id: string;
    name: string;
    currentStock: number;
    unit: string;
  } | null>(null);
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'remove'>('add');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustNotes, setAdjustNotes] = useState('');

  // Bill modal state
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<BillRecord | null>(null);
  const [billVendor, setBillVendor] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(getTodayLocalDateString);
  const [billCategory, setBillCategory] = useState<BillCategory>('Medicines');
  const [billAmount, setBillAmount] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [billImageDataUrl, setBillImageDataUrl] = useState<string | undefined>(undefined);
  const [billImageSizeKb, setBillImageSizeKb] = useState<number | null>(null);
  const [compressingImage, setCompressingImage] = useState(false);
  const [restockLines, setRestockLines] = useState<BillRestockLine[]>([]);
  const [confirmDeleteBillId, setConfirmDeleteBillId] = useState<string | null>(null);
  const [previewBill, setPreviewBill] = useState<BillRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (res: OperationsActionResult) => {
    setFeedback({ type: res.ok ? 'success' : 'error', text: res.message });
  };

  // Computed KPIs
  const medStats = useMemo(() => {
    let lowOrOut = 0;
    let expiringOrExpired = 0;
    for (const m of medicines) {
      const s = getStockStatus(m.current_stock, m.min_stock_alert);
      if (s !== 'ok') lowOrOut++;
      const exp = getExpiryStatus(m.expiry_date);
      if (exp === 'expired' || exp === 'expiring_soon') expiringOrExpired++;
    }
    return { total: medicines.length, lowOrOut, expiringOrExpired };
  }, [medicines]);

  const itemStats = useMemo(() => {
    let lowOrOut = 0;
    let totalUnits = 0;
    for (const it of items) {
      if (getStockStatus(it.current_stock, it.min_stock_alert) !== 'ok') lowOrOut++;
      totalUnits += Number(it.current_stock) || 0;
    }
    return { total: items.length, lowOrOut, totalUnits };
  }, [items]);

  const billStats = useMemo(() => {
    let totalSpend = 0;
    let photosCount = 0;
    for (const b of bills) {
      totalSpend += Number(b.total_amount) || 0;
      if (b.image_url || b.image_data_url) photosCount++;
    }
    return { total: bills.length, totalSpend, photosCount };
  }, [bills]);

  // Filtered lists
  const filteredMedicines = useMemo(() => {
    const q = medSearch.trim().toLowerCase();
    return medicines.filter((m) => {
      if (medFilter === 'low' && getStockStatus(m.current_stock, m.min_stock_alert) === 'ok') {
        return false;
      }
      if (medFilter === 'expiring') {
        const exp = getExpiryStatus(m.expiry_date);
        if (exp !== 'expired' && exp !== 'expiring_soon') return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.form_strength.toLowerCase().includes(q) ||
        m.batch_number.toLowerCase().includes(q)
      );
    });
  }, [medicines, medSearch, medFilter]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      if (itemFilter === 'low' && getStockStatus(it.current_stock, it.min_stock_alert) === 'ok') {
        return false;
      }
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.notes || '').toLowerCase().includes(q)
      );
    });
  }, [items, itemSearch, itemFilter]);

  const filteredBills = useMemo(() => {
    const q = billSearch.trim().toLowerCase();
    return bills.filter((b) => {
      if (billCatFilter !== 'ALL' && b.category !== billCatFilter) return false;
      if (!q) return true;
      return (
        b.vendor_name.toLowerCase().includes(q) ||
        b.bill_number.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q)
      );
    });
  }, [bills, billSearch, billCatFilter]);

  const filteredLedger = useMemo(() => {
    if (ledgerFilter === 'all') return stockTransactions;
    return stockTransactions.filter((t) => t.target_type === ledgerFilter);
  }, [stockTransactions, ledgerFilter]);

  // Modal openers
  const openAddMedicine = () => {
    setEditingMed(null);
    setMedName('');
    setMedCategory('Fever & Pain');
    setMedFormStrength('');
    setMedUnit('tablets');
    setMedBatch('');
    setMedExpiry('');
    setMedStock('10');
    setMedMinAlert('5');
    setMedNotes('');
    setShowMedModal(true);
  };

  const openEditMedicine = (m: MedicineInventoryRecord) => {
    setEditingMed(m);
    setMedName(m.name);
    setMedCategory(m.category || 'General');
    setMedFormStrength(m.form_strength || '');
    setMedUnit(m.unit || 'tablets');
    setMedBatch(m.batch_number || '');
    setMedExpiry(m.expiry_date || '');
    setMedStock(String(m.current_stock));
    setMedMinAlert(String(m.min_stock_alert));
    setMedNotes(m.notes || '');
    setShowMedModal(true);
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemName('');
    setItemCategory('First Aid');
    setItemUnit('pcs');
    setItemStock('10');
    setItemMinAlert('5');
    setItemNotes('');
    setShowItemModal(true);
  };

  const openEditItem = (it: ItemInventoryRecord) => {
    setEditingItem(it);
    setItemName(it.name);
    setItemCategory(it.category || 'First Aid');
    setItemUnit(it.unit || 'pcs');
    setItemStock(String(it.current_stock));
    setItemMinAlert(String(it.min_stock_alert));
    setItemNotes(it.notes || '');
    setShowItemModal(true);
  };

  const openAdjustStock = (
    type: 'medicine' | 'item',
    id: string,
    name: string,
    currentStock: number,
    unit: string
  ) => {
    setAdjustTarget({ type, id, name, currentStock, unit });
    setAdjustDirection('add');
    setAdjustQty('5');
    setAdjustNotes('');
  };

  const openAddBill = () => {
    setEditingBill(null);
    setBillVendor('');
    setBillNumber('');
    setBillDate(getTodayLocalDateString());
    setBillCategory('Medicines');
    setBillAmount('');
    setBillNotes('');
    setBillImageDataUrl(undefined);
    setBillImageSizeKb(null);
    setRestockLines([]);
    setShowBillModal(true);
  };

  const openEditBill = (b: BillRecord) => {
    setEditingBill(b);
    setBillVendor(b.vendor_name);
    setBillNumber(b.bill_number || '');
    setBillDate(b.bill_date || getTodayLocalDateString());
    setBillCategory(b.category);
    setBillAmount(String(b.total_amount));
    setBillNotes(b.notes || '');
    setBillImageDataUrl(b.image_data_url);
    setBillImageSizeKb(null);
    setRestockLines([]);
    setShowBillModal(true);
  };

  // Submit handlers
  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName.trim()) {
      showToast({ ok: false, message: 'Medicine name is required.' });
      return;
    }
    setBusy(true);
    try {
      const res = await onUpsertMedicine({
        medicine_id: editingMed?.medicine_id,
        name: medName.trim(),
        category: medCategory,
        form_strength: medFormStrength.trim(),
        unit: medUnit,
        batch_number: medBatch.trim(),
        expiry_date: medExpiry,
        current_stock: Math.max(0, Number(medStock) || 0),
        min_stock_alert: Math.max(0, Number(medMinAlert) || 0),
        notes: medNotes.trim() || undefined,
      });
      showToast(res);
      if (res.ok) setShowMedModal(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showToast({ ok: false, message: 'Item name is required.' });
      return;
    }
    setBusy(true);
    try {
      const res = await onUpsertItem({
        item_id: editingItem?.item_id,
        name: itemName.trim(),
        category: itemCategory,
        unit: itemUnit,
        current_stock: Math.max(0, Number(itemStock) || 0),
        min_stock_alert: Math.max(0, Number(itemMinAlert) || 0),
        notes: itemNotes.trim() || undefined,
      });
      showToast(res);
      if (res.ok) setShowItemModal(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const mag = Math.abs(Number(adjustQty) || 0);
    if (mag <= 0) {
      showToast({ ok: false, message: 'Enter a quantity greater than zero.' });
      return;
    }
    const delta = adjustDirection === 'add' ? mag : -mag;
    setBusy(true);
    try {
      const res = await onAdjustStock({
        target_type: adjustTarget.type,
        target_id: adjustTarget.id,
        change_qty: delta,
        reason: 'adjustment',
        notes: adjustNotes.trim() || (adjustDirection === 'add' ? 'Manual restock' : 'Manual stock usage'),
      });
      showToast(res);
      if (res.ok) setAdjustTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleBillFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast({ ok: false, message: 'Please choose an image file (JPG, PNG, or WebP).' });
      return;
    }
    setCompressingImage(true);
    try {
      const { dataUrl, sizeKb } = await compressBillImageFile(file);
      setBillImageDataUrl(dataUrl);
      setBillImageSizeKb(sizeKb);
    } catch (err) {
      showToast({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to process bill photo.',
      });
    } finally {
      setCompressingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddRestockLine = () => {
    const firstMed = medicines[0];
    const firstItem = items[0];
    if (firstMed) {
      setRestockLines((prev) => [
        ...prev,
        { target_type: 'medicine', target_id: firstMed.medicine_id, qty: 10 },
      ]);
    } else if (firstItem) {
      setRestockLines((prev) => [
        ...prev,
        { target_type: 'item', target_id: firstItem.item_id, qty: 10 },
      ]);
    }
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billVendor.trim()) {
      showToast({ ok: false, message: 'Vendor or pharmacy name is required.' });
      return;
    }
    const amountNum = Number(billAmount);
    if (billAmount.trim() === '' || Number.isNaN(amountNum) || amountNum < 0) {
      showToast({ ok: false, message: 'Enter a valid bill amount in ₹.' });
      return;
    }
    setBusy(true);
    try {
      const res = editingBill
        ? await onUpdateBill({
            bill_id: editingBill.bill_id,
            vendor_name: billVendor.trim(),
            bill_number: billNumber.trim(),
            bill_date: billDate,
            category: billCategory,
            total_amount: amountNum,
            notes: billNotes.trim(),
            image_data_url: billImageDataUrl,
          })
        : await onCreateBill(
            {
              vendor_name: billVendor.trim(),
              bill_number: billNumber.trim(),
              bill_date: billDate,
              category: billCategory,
              total_amount: amountNum,
              notes: billNotes.trim() || undefined,
              image_data_url: billImageDataUrl,
            },
            restockLines.filter((l) => l.target_id && l.qty > 0)
          );
      showToast(res);
      if (res.ok) setShowBillModal(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center sm:items-end justify-between gap-3 border-b border-stone-200/80 pb-3.5 sm:pb-4">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-medium text-teal-700">
            Infirmary Stock &amp; Expense Register
          </p>
          <h1 className="text-xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5 leading-tight truncate">
            Inventory &amp; Bills
          </h1>
          <p className="hidden sm:block text-sm text-zinc-500 mt-1">
            Track medicines, first-aid supplies, purchase bills with receipts, and live stock movements.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeTab === 'medicines' && (
            <button
              type="button"
              onClick={openAddMedicine}
              className="h-9 sm:h-10 px-3 sm:px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] rounded-xl inline-flex items-center gap-1.5 shadow-xs whitespace-nowrap transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="sm:hidden">Add Med</span>
              <span className="hidden sm:inline">Add Medicine</span>
            </button>
          )}
          {activeTab === 'items' && (
            <button
              type="button"
              onClick={openAddItem}
              className="h-9 sm:h-10 px-3 sm:px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] rounded-xl inline-flex items-center gap-1.5 shadow-xs whitespace-nowrap transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item</span>
            </button>
          )}
          {activeTab === 'bills' && (
            <button
              type="button"
              onClick={openAddBill}
              className="h-9 sm:h-10 px-3 sm:px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] rounded-xl inline-flex items-center gap-1.5 shadow-xs whitespace-nowrap transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Bill</span>
            </button>
          )}
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
            aria-label="Dismiss message"
            className="text-zinc-500 hover:text-zinc-900 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Segmented Workspace Tabs (Single row on mobile & desktop) */}
      <div
        role="tablist"
        aria-label="Inventory and bills sections"
        className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 bg-stone-100/90 border border-stone-200/70 rounded-xl w-full sm:w-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'medicines'}
          onClick={() => setActiveTab('medicines')}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'medicines'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Pill className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span>Medicines</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({medicines.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'items'}
          onClick={() => setActiveTab('items')}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'items'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Package className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span className="sm:hidden">Items</span>
          <span className="hidden sm:inline">Items &amp; Supplies</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({items.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'bills'}
          onClick={() => setActiveTab('bills')}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'bills'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Receipt className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span className="sm:hidden">Bills</span>
          <span className="hidden sm:inline">Bills &amp; Receipts</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({bills.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ledger'}
          onClick={() => setActiveTab('ledger')}
          className={`px-1.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'ledger'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <History className="hidden sm:block w-4 h-4 shrink-0 text-teal-700" />
          <span className="sm:hidden">History</span>
          <span className="hidden sm:inline">Stock History</span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">({stockTransactions.length})</span>
        </button>
      </div>

      {/* ====================================================================
          TAB 1: MEDICINES INVENTORY
      ==================================================================== */}
      {activeTab === 'medicines' && (
        <div className="space-y-3.5 sm:space-y-4">
          {/* Unified 3-Column Metric Strip */}
          <div className="bg-white border border-stone-200/80 rounded-2xl grid grid-cols-3 divide-x divide-stone-100 shadow-2xs">
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Medicines</span>
                <span className="hidden sm:inline">Total Medicines</span>
              </p>
              <p className="text-lg sm:text-2xl font-semibold tabular-nums text-zinc-900 mt-0.5 sm:mt-1">
                {medStats.total}
              </p>
            </div>
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Low Stock</span>
                <span className="hidden sm:inline">Low / Out of Stock</span>
              </p>
              <p
                className={`text-lg sm:text-2xl font-semibold tabular-nums mt-0.5 sm:mt-1 ${
                  medStats.lowOrOut > 0 ? 'text-amber-700' : 'text-zinc-900'
                }`}
              >
                {medStats.lowOrOut}
              </p>
            </div>
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Expiring</span>
                <span className="hidden sm:inline">Expiring / Expired</span>
              </p>
              <p
                className={`text-lg sm:text-2xl font-semibold tabular-nums mt-0.5 sm:mt-1 ${
                  medStats.expiringOrExpired > 0 ? 'text-rose-700' : 'text-zinc-900'
                }`}
              >
                {medStats.expiringOrExpired}
              </p>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                placeholder="Search medicine, category, strength, or batch..."
                className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-zinc-900"
              />
              {medSearch && (
                <button
                  type="button"
                  onClick={() => setMedSearch('')}
                  aria-label="Clear medicine search"
                  className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-stone-100/90 border border-stone-200/60 rounded-xl w-full sm:w-auto shrink-0">
              {(
                [
                  { key: 'all', mobileLabel: 'All', label: 'All' },
                  { key: 'low', mobileLabel: `Low (${medStats.lowOrOut})`, label: `Low / Out (${medStats.lowOrOut})` },
                  { key: 'expiring', mobileLabel: `Exp (${medStats.expiringOrExpired})`, label: `Expiring (${medStats.expiringOrExpired})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMedFilter(opt.key)}
                  className={`px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center cursor-pointer ${
                    medFilter === opt.key
                      ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <span className="sm:hidden">{opt.mobileLabel}</span>
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Medicines Register Table / List */}
          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
            {filteredMedicines.length === 0 ? (
              <div className="py-14 px-4 text-center max-w-sm mx-auto">
                <p className="text-base font-semibold text-zinc-900 font-display">
                  {medicines.length === 0 ? 'No medicines in stock yet' : 'No matching medicines'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {medicines.length === 0
                    ? 'Add your infirmary medicines so stock updates automatically when visits are recorded.'
                    : 'Try clearing the search or filter above.'}
                </p>
                {medicines.length === 0 && (
                  <button
                    type="button"
                    onClick={openAddMedicine}
                    className="mt-4 h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add First Medicine
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredMedicines.map((med) => {
                  const stockState = getStockStatus(med.current_stock, med.min_stock_alert);
                  const expiryState = getExpiryStatus(med.expiry_date);
                  return (
                    <div
                      key={med.medicine_id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h3 className="text-sm font-semibold text-zinc-900">
                            {med.name}
                          </h3>
                          {med.form_strength && (
                            <span className="text-xs text-zinc-500">
                              {med.form_strength}
                            </span>
                          )}
                          <span className="text-zinc-300" aria-hidden="true">·</span>
                          <span className="text-xs text-zinc-500">{med.category}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <span className="tabular-nums">
                            Stock:{' '}
                            <strong
                              className={
                                stockState === 'out'
                                  ? 'text-rose-700'
                                  : stockState === 'low'
                                    ? 'text-amber-700'
                                    : 'text-zinc-900'
                              }
                            >
                              {med.current_stock} {med.unit}
                            </strong>
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              stockState === 'out'
                                ? 'text-rose-700'
                                : stockState === 'low'
                                  ? 'text-amber-700'
                                  : 'text-teal-700'
                            }`}
                          >
                            {stockState === 'out'
                              ? 'Out of Stock'
                              : stockState === 'low'
                                ? `Low Stock (min ${med.min_stock_alert})`
                                : 'In Stock'}
                          </span>
                          {med.expiry_date && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span
                                className={`tabular-nums text-[11px] ${
                                  expiryState === 'expired'
                                    ? 'text-rose-700 font-semibold'
                                    : expiryState === 'expiring_soon'
                                      ? 'text-amber-700 font-semibold'
                                      : 'text-zinc-500'
                                }`}
                              >
                                Exp {med.expiry_date}
                                {expiryState === 'expired'
                                  ? ' (Expired)'
                                  : expiryState === 'expiring_soon'
                                    ? ' (Expiring Soon)'
                                    : ''}
                              </span>
                            </>
                          )}
                          {med.batch_number && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span className="font-mono text-[11px] text-zinc-400">
                                Batch {med.batch_number}
                              </span>
                            </>
                          )}
                        </div>
                        {med.notes && (
                          <p className="text-xs text-zinc-500 truncate">{med.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-stone-100 shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            openAdjustStock(
                              'medicine',
                              med.medicine_id,
                              med.name,
                              med.current_stock,
                              med.unit
                            )
                          }
                          className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/70 rounded-lg inline-flex items-center gap-1.5 sm:gap-1 transition-colors cursor-pointer"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span>Stock</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditMedicine(med)}
                          className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200/80 rounded-lg inline-flex items-center gap-1.5 sm:gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {confirmDeleteMedId === med.medicine_id ? (
                          <div className="flex items-center gap-1 ml-auto sm:ml-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  const res = await onDeleteMedicine(med.medicine_id);
                                  showToast(res);
                                  setConfirmDeleteMedId(null);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                              className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMedId(null)}
                              className="h-9 sm:h-8 px-2 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMedId(med.medicine_id)}
                            aria-label={`Delete ${med.name}`}
                            className="h-9 sm:h-8 px-2.5 sm:px-2 ml-auto sm:ml-0 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg inline-flex items-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: ITEMS & SUPPLIES INVENTORY
      ==================================================================== */}
      {activeTab === 'items' && (
        <div className="space-y-3.5 sm:space-y-4">
          <div className="bg-white border border-stone-200/80 rounded-2xl grid grid-cols-3 divide-x divide-stone-100 shadow-2xs">
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Items</span>
                <span className="hidden sm:inline">Tracked Items</span>
              </p>
              <p className="text-lg sm:text-2xl font-semibold tabular-nums text-zinc-900 mt-0.5 sm:mt-1">
                {itemStats.total}
              </p>
            </div>
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Low Stock</span>
                <span className="hidden sm:inline">Low / Out of Stock</span>
              </p>
              <p
                className={`text-lg sm:text-2xl font-semibold tabular-nums mt-0.5 sm:mt-1 ${
                  itemStats.lowOrOut > 0 ? 'text-amber-700' : 'text-zinc-900'
                }`}
              >
                {itemStats.lowOrOut}
              </p>
            </div>
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Total Units</span>
                <span className="hidden sm:inline">Total Units Available</span>
              </p>
              <p className="text-lg sm:text-2xl font-semibold tabular-nums text-zinc-900 mt-0.5 sm:mt-1">
                {itemStats.totalUnits}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search bandages, cotton, pads, thermometer, ice packs..."
                className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-zinc-900"
              />
              {itemSearch && (
                <button
                  type="button"
                  onClick={() => setItemSearch('')}
                  aria-label="Clear item search"
                  className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-stone-100/90 border border-stone-200/60 rounded-xl w-full sm:w-auto shrink-0">
              {(
                [
                  { key: 'all', label: 'All Items' },
                  { key: 'low', label: `Low / Out (${itemStats.lowOrOut})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setItemFilter(opt.key)}
                  className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center cursor-pointer ${
                    itemFilter === opt.key
                      ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
            {filteredItems.length === 0 ? (
              <div className="py-14 px-4 text-center max-w-sm mx-auto">
                <p className="text-base font-semibold text-zinc-900 font-display">
                  {items.length === 0 ? 'No infirmary items tracked yet' : 'No matching items'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {items.length === 0
                    ? 'Add bandages, sterile gauze, cotton, ice packs, sanitary pads, or thermometers.'
                    : 'Try adjusting your search or filter above.'}
                </p>
                {items.length === 0 && (
                  <button
                    type="button"
                    onClick={openAddItem}
                    className="mt-4 h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add First Item
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredItems.map((it) => {
                  const stockState = getStockStatus(it.current_stock, it.min_stock_alert);
                  return (
                    <div
                      key={it.item_id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h3 className="text-sm font-semibold text-zinc-900">{it.name}</h3>
                          <span className="text-zinc-300" aria-hidden="true">·</span>
                          <span className="text-xs text-zinc-500">{it.category}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <span className="tabular-nums">
                            Stock:{' '}
                            <strong
                              className={
                                stockState === 'out'
                                  ? 'text-rose-700'
                                  : stockState === 'low'
                                    ? 'text-amber-700'
                                    : 'text-zinc-900'
                              }
                            >
                              {it.current_stock} {it.unit}
                            </strong>
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              stockState === 'out'
                                ? 'text-rose-700'
                                : stockState === 'low'
                                  ? 'text-amber-700'
                                  : 'text-teal-700'
                            }`}
                          >
                            {stockState === 'out'
                              ? 'Out of Stock'
                              : stockState === 'low'
                                ? `Low Stock (min ${it.min_stock_alert})`
                                : 'In Stock'}
                          </span>
                          {it.notes && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span className="text-zinc-500 truncate">{it.notes}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-stone-100 shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            openAdjustStock(
                              'item',
                              it.item_id,
                              it.name,
                              it.current_stock,
                              it.unit
                            )
                          }
                          className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/70 rounded-lg inline-flex items-center gap-1.5 sm:gap-1 transition-colors cursor-pointer"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span>Stock</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditItem(it)}
                          className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200/80 rounded-lg inline-flex items-center gap-1.5 sm:gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {confirmDeleteItemId === it.item_id ? (
                          <div className="flex items-center gap-1 ml-auto sm:ml-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  const res = await onDeleteItem(it.item_id);
                                  showToast(res);
                                  setConfirmDeleteItemId(null);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                              className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteItemId(null)}
                              className="h-9 sm:h-8 px-2 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteItemId(it.item_id)}
                            aria-label={`Delete ${it.name}`}
                            className="h-9 sm:h-8 px-2.5 sm:px-2 ml-auto sm:ml-0 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg inline-flex items-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: BILLS & RECEIPTS LEDGER
      ==================================================================== */}
      {activeTab === 'bills' && (
        <div className="space-y-3.5 sm:space-y-4">
          <div className="bg-white border border-stone-200/80 rounded-2xl grid grid-cols-3 divide-x divide-stone-100 shadow-2xs">
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Bills</span>
                <span className="hidden sm:inline">Total Bills Recorded</span>
              </p>
              <p className="text-lg sm:text-2xl font-semibold tabular-nums text-zinc-900 mt-0.5 sm:mt-1">
                {billStats.total}
              </p>
            </div>
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Total Spend</span>
                <span className="hidden sm:inline">Total Recorded Spend</span>
              </p>
              <p className="text-base sm:text-2xl font-semibold tabular-nums text-zinc-900 mt-0.5 sm:mt-1 truncate">
                {formatInr(billStats.totalSpend)}
              </p>
            </div>
            <div className="px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-[11px] font-medium text-zinc-500 truncate">
                <span className="sm:hidden">Photos</span>
                <span className="hidden sm:inline">Bill Photos Stored</span>
              </p>
              <p className="text-lg sm:text-2xl font-semibold tabular-nums text-teal-800 mt-0.5 sm:mt-1">
                {billStats.photosCount}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                placeholder="Search pharmacy/vendor, bill number, or notes..."
                className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-zinc-900"
              />
              {billSearch && (
                <button
                  type="button"
                  onClick={() => setBillSearch('')}
                  aria-label="Clear bill search"
                  className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="w-full sm:w-auto shrink-0">
              <CustomSelect
                ariaLabel="Filter bills by category"
                value={billCatFilter}
                onChange={setBillCatFilter}
                className="w-full sm:min-w-[165px]"
                options={[
                  { value: 'ALL', label: 'All Categories' },
                  ...BILL_CATEGORIES.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>
          </div>

          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
            {filteredBills.length === 0 ? (
              <div className="py-14 px-4 text-center max-w-sm mx-auto">
                <p className="text-base font-semibold text-zinc-900 font-display">
                  {bills.length === 0 ? 'No bills recorded yet' : 'No matching bills'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {bills.length === 0
                    ? 'Log pharmacy or supplier bills, attach compressed receipt photos to Google Drive, and optionally restock inventory.'
                    : 'Try clearing the search or category filter above.'}
                </p>
                {bills.length === 0 && (
                  <button
                    type="button"
                    onClick={openAddBill}
                    className="mt-4 h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Record First Bill
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredBills.map((bill) => {
                  const hasPhoto = Boolean(bill.image_data_url || bill.image_url);
                  return (
                    <div
                      key={bill.bill_id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {hasPhoto ? (
                          <button
                            type="button"
                            onClick={() => setPreviewBill(bill)}
                            aria-label={`View bill photo for ${bill.vendor_name}`}
                            className="w-12 h-12 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shrink-0 hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center"
                          >
                            {bill.image_data_url || bill.image_url ? (
                              <img
                                src={bill.image_data_url || bill.image_url}
                                alt={`Receipt from ${bill.vendor_name}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-zinc-400" />
                            )}
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-stone-200/70 bg-stone-50 shrink-0 flex items-center justify-center text-zinc-400">
                            <Receipt className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <h3 className="text-sm font-semibold text-zinc-900">
                              {bill.vendor_name}
                            </h3>
                            {bill.bill_number && (
                              <span className="font-mono text-xs text-zinc-500">
                                #{bill.bill_number}
                              </span>
                            )}
                            <span className="text-stone-300">·</span>
                            <span className="text-xs text-zinc-500">{bill.category}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                            <span className="tabular-nums text-zinc-600">
                              {bill.bill_date}
                            </span>
                            {bill.image_url && (
                              <>
                                <span className="text-stone-300">·</span>
                                <span className="text-[11px] text-teal-700 font-medium">
                                  Saved on Drive
                                </span>
                              </>
                            )}
                          </div>

                          {bill.notes && (
                            <p className="text-xs text-zinc-500 truncate">{bill.notes}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-stone-100 shrink-0">
                        <span className="tabular-nums text-base font-semibold text-zinc-900">
                          {formatInr(bill.total_amount)}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {hasPhoto && (
                            <button
                              type="button"
                              onClick={() => setPreviewBill(bill)}
                              className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/70 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Photo</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditBill(bill)}
                            className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200/80 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          {confirmDeleteBillId === bill.bill_id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    const res = await onDeleteBill(bill.bill_id);
                                    showToast(res);
                                    setConfirmDeleteBillId(null);
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                                className="h-9 sm:h-8 px-3 sm:px-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBillId(null)}
                                className="h-9 sm:h-8 px-2 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteBillId(bill.bill_id)}
                              aria-label={`Delete bill ${bill.bill_id}`}
                              className="h-9 sm:h-8 px-2.5 sm:px-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg inline-flex items-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 4: STOCK LEDGER (AUDIT TRAIL)
      ==================================================================== */}
      {activeTab === 'ledger' && (
        <div className="space-y-3.5 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <p className="text-xs text-zinc-500">
              Automatic log of visit deductions, bill restocks, and manual stock adjustments.
            </p>
            <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-stone-100/90 border border-stone-200/60 rounded-xl w-full sm:w-auto shrink-0">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'medicine', label: 'Medicines' },
                  { key: 'item', label: 'Items' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLedgerFilter(opt.key)}
                  className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center cursor-pointer ${
                    ledgerFilter === opt.key
                      ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
            {filteredLedger.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-zinc-500">
                No stock movements recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredLedger.slice(0, 120).map((txn) => {
                  const isAdd = txn.change_qty > 0;
                  const reasonLabel =
                    txn.reason === 'visit'
                      ? 'Student Visit'
                      : txn.reason === 'bill_restock'
                        ? 'Bill Restock'
                        : txn.reason === 'menstrual'
                          ? 'Hygiene Support'
                          : 'Manual Adjustment';
                  return (
                    <div
                      key={txn.txn_id}
                      className="p-3.5 sm:px-5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-zinc-900">{txn.target_name}</span>
                          <span className="text-zinc-400">·</span>
                          <span className="text-zinc-600 capitalize">{txn.target_type}</span>
                          <span className="text-zinc-400">·</span>
                          <span className="text-teal-800 font-medium">{reasonLabel}</span>
                          {txn.reference_id && (
                            <span className="font-mono text-[11px] text-zinc-400">
                              ({txn.reference_id})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                          <span className="font-mono">
                            {txn.created_at.slice(0, 16).replace('T', ' ')}
                          </span>
                          <span>· {txn.recorded_by}</span>
                          {txn.notes && <span>· {txn.notes}</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <span
                          className={`block text-sm font-semibold ${
                            isAdd ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isAdd ? `+${txn.change_qty}` : `${txn.change_qty}`}
                        </span>
                        {txn.balance_after !== undefined && (
                          <span className="block text-[11px] text-zinc-400">
                            Bal: {txn.balance_after}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: ADD / EDIT MEDICINE
      ==================================================================== */}
      <ModalDialog
        open={showMedModal}
        onClose={() => setShowMedModal(false)}
        title={editingMed ? `Edit Medicine · ${editingMed.medicine_id}` : 'Add Medicine to Stock'}
        subtitle="Tracked automatically during student visits and bill restocks"
        icon={<Pill className="w-4 h-4 text-teal-700" />}
        titleId="medicine-modal-title"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowMedModal(false)}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-3.5 text-xs font-medium text-zinc-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="medicine-upsert-form"
              disabled={busy}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingMed ? 'Save Changes' : 'Add Medicine'}</span>
            </button>
          </div>
        }
      >
        <form id="medicine-upsert-form" onSubmit={handleSaveMedicine} className="space-y-3.5">
          <div>
            <label htmlFor="med-name" className="block text-xs font-semibold text-zinc-700 mb-1">
              Medicine Name *
            </label>
            <input
              id="med-name"
              type="text"
              required
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              placeholder="e.g. Paracetamol Syrup, ORS Electoral"
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="med-category" className="block text-xs font-semibold text-zinc-700 mb-1">
                Category
              </label>
              <CustomSelect
                id="med-category"
                ariaLabel="Medicine category"
                value={medCategory}
                onChange={setMedCategory}
                variant="subtle"
                className="w-full"
                options={MEDICINE_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label htmlFor="med-strength" className="block text-xs font-semibold text-zinc-700 mb-1">
                Form &amp; Strength
              </label>
              <input
                id="med-strength"
                type="text"
                value={medFormStrength}
                onChange={(e) => setMedFormStrength(e.target.value)}
                placeholder="e.g. 500mg Tablet / 60ml"
                className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="med-stock" className="block text-xs font-semibold text-zinc-700 mb-1">
                Current Stock
              </label>
              <input
                id="med-stock"
                type="number"
                min="0"
                step="any"
                value={medStock}
                onChange={(e) => setMedStock(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label htmlFor="med-unit" className="block text-xs font-semibold text-zinc-700 mb-1">
                Unit
              </label>
              <CustomSelect
                id="med-unit"
                ariaLabel="Medicine stock unit"
                value={medUnit}
                onChange={setMedUnit}
                variant="subtle"
                className="w-full"
                options={MEDICINE_UNITS.map((u) => ({ value: u, label: u }))}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="med-min" className="block text-xs font-semibold text-zinc-700 mb-1">
                Low Stock Alert
              </label>
              <input
                id="med-min"
                type="number"
                min="0"
                step="any"
                value={medMinAlert}
                onChange={(e) => setMedMinAlert(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="med-expiry" className="block text-xs font-semibold text-zinc-700 mb-1">
                Expiry Date
              </label>
              <input
                id="med-expiry"
                type="date"
                value={medExpiry}
                onChange={(e) => setMedExpiry(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label htmlFor="med-batch" className="block text-xs font-semibold text-zinc-700 mb-1">
                Batch Number
              </label>
              <input
                id="med-batch"
                type="text"
                value={medBatch}
                onChange={(e) => setMedBatch(e.target.value)}
                placeholder="Optional"
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="med-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
              Notes (Optional)
            </label>
            <input
              id="med-notes"
              type="text"
              value={medNotes}
              onChange={(e) => setMedNotes(e.target.value)}
              placeholder="Shelf location, dosage instructions..."
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>
        </form>
      </ModalDialog>

      {/* ====================================================================
          MODAL: ADD / EDIT ITEM
      ==================================================================== */}
      <ModalDialog
        open={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editingItem ? `Edit Item · ${editingItem.item_id}` : 'Add Infirmary Item'}
        subtitle="Bandages, gauze, cotton, ice packs, hygiene supplies, and equipment"
        icon={<Package className="w-4 h-4 text-teal-700" />}
        titleId="item-modal-title"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowItemModal(false)}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-3.5 text-xs font-medium text-zinc-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="item-upsert-form"
              disabled={busy}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingItem ? 'Save Changes' : 'Add Item'}</span>
            </button>
          </div>
        }
      >
        <form id="item-upsert-form" onSubmit={handleSaveItem} className="space-y-3.5">
          <div>
            <label htmlFor="item-name" className="block text-xs font-semibold text-zinc-700 mb-1">
              Item Name *
            </label>
            <input
              id="item-name"
              type="text"
              required
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Sterile Cotton Roll, Crepe Bandage, Sanitary Pads"
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="item-cat" className="block text-xs font-semibold text-zinc-700 mb-1">
                Category
              </label>
              <CustomSelect
                id="item-cat"
                ariaLabel="Item category"
                value={itemCategory}
                onChange={setItemCategory}
                variant="subtle"
                className="w-full"
                options={ITEM_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label htmlFor="item-unit" className="block text-xs font-semibold text-zinc-700 mb-1">
                Unit
              </label>
              <CustomSelect
                id="item-unit"
                ariaLabel="Item unit"
                value={itemUnit}
                onChange={setItemUnit}
                variant="subtle"
                className="w-full"
                options={ITEM_UNITS.map((u) => ({ value: u, label: u }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="item-stock" className="block text-xs font-semibold text-zinc-700 mb-1">
                Current Stock
              </label>
              <input
                id="item-stock"
                type="number"
                min="0"
                step="any"
                value={itemStock}
                onChange={(e) => setItemStock(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label htmlFor="item-min" className="block text-xs font-semibold text-zinc-700 mb-1">
                Low Stock Alert
              </label>
              <input
                id="item-min"
                type="number"
                min="0"
                step="any"
                value={itemMinAlert}
                onChange={(e) => setItemMinAlert(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="item-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
              Notes / Storage Shelf (Optional)
            </label>
            <input
              id="item-notes"
              type="text"
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              placeholder="e.g. Cabinet B, First-Aid Kit #2"
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>
        </form>
      </ModalDialog>

      {/* ====================================================================
          MODAL: QUICK STOCK ADJUSTMENT
      ==================================================================== */}
      <ModalDialog
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        title={adjustTarget ? `Adjust Stock · ${adjustTarget.name}` : 'Adjust Stock'}
        subtitle={
          adjustTarget
            ? `Current balance: ${adjustTarget.currentStock} ${adjustTarget.unit}`
            : undefined
        }
        icon={<SlidersHorizontal className="w-4 h-4 text-teal-700" />}
        titleId="adjust-stock-modal-title"
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setAdjustTarget(null)}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-3.5 text-xs font-medium text-zinc-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="adjust-stock-form"
              disabled={busy}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Update Stock</span>
            </button>
          </div>
        }
      >
        <form id="adjust-stock-form" onSubmit={handleSaveAdjustStock} className="space-y-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-xl">
            <button
              type="button"
              onClick={() => setAdjustDirection('add')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                adjustDirection === 'add'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              + Add Stock
            </button>
            <button
              type="button"
              onClick={() => setAdjustDirection('remove')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                adjustDirection === 'remove'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              − Deduct Stock
            </button>
          </div>

          <div>
            <label htmlFor="adj-qty" className="block text-xs font-semibold text-zinc-700 mb-1">
              Quantity ({adjustTarget?.unit || 'units'}) *
            </label>
            <input
              id="adj-qty"
              type="number"
              min="0.1"
              step="any"
              required
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
            {adjustTarget && (
              <p className="text-[11px] font-mono text-zinc-500 mt-1">
                New balance:{' '}
                <strong className="text-zinc-900">
                  {Math.max(
                    0,
                    Number(
                      (
                        adjustTarget.currentStock +
                        (adjustDirection === 'add'
                          ? Math.abs(Number(adjustQty) || 0)
                          : -Math.abs(Number(adjustQty) || 0))
                      ).toFixed(2)
                    )
                  )}{' '}
                  {adjustTarget.unit}
                </strong>
              </p>
            )}
          </div>

          <div>
            <label htmlFor="adj-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
              Reason / Notes
            </label>
            <input
              id="adj-notes"
              type="text"
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              placeholder="e.g. Monthly restock, expired batch removed..."
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>
        </form>
      </ModalDialog>

      {/* ====================================================================
          MODAL: RECORD / EDIT BILL + PHOTO UPLOAD + OPTIONAL RESTOCK
      ==================================================================== */}
      <ModalDialog
        open={showBillModal}
        onClose={() => setShowBillModal(false)}
        title={editingBill ? `Edit Bill · ${editingBill.bill_id}` : 'Record Infirmary Bill'}
        subtitle="Bill photos are automatically compressed and archived to Google Drive"
        icon={<Receipt className="w-4 h-4 text-teal-700" />}
        titleId="bill-modal-title"
        maxWidthClass="max-w-xl"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowBillModal(false)}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-3.5 text-xs font-medium text-zinc-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bill-upsert-form"
              disabled={busy || compressingImage}
              className="flex-1 sm:flex-none h-10 sm:h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{busy ? 'Saving...' : editingBill ? 'Save Changes' : 'Save Bill'}</span>
            </button>
          </div>
        }
      >
        <form id="bill-upsert-form" onSubmit={handleSaveBill} className="space-y-3.5 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bill-vendor" className="block text-xs font-semibold text-zinc-700 mb-1">
                Pharmacy / Vendor Name *
              </label>
              <input
                id="bill-vendor"
                type="text"
                required
                value={billVendor}
                onChange={(e) => setBillVendor(e.target.value)}
                placeholder="e.g. Apollo Pharmacy, Sai Medicals"
                className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label htmlFor="bill-number" className="block text-xs font-semibold text-zinc-700 mb-1">
                Invoice / Bill Number
              </label>
              <input
                id="bill-number"
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="e.g. INV-2026-412"
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="bill-date" className="block text-xs font-semibold text-zinc-700 mb-1">
                Bill Date *
              </label>
              <input
                id="bill-date"
                type="date"
                required
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full h-10 px-2.5 text-xs font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label htmlFor="bill-amount" className="block text-xs font-semibold text-zinc-700 mb-1">
                Total Amount (₹) *
              </label>
              <input
                id="bill-amount"
                type="number"
                min="0"
                step="any"
                required
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 px-3 text-sm font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="bill-cat" className="block text-xs font-semibold text-zinc-700 mb-1">
                Category
              </label>
              <CustomSelect
                id="bill-cat"
                ariaLabel="Bill category"
                value={billCategory}
                onChange={(v) => setBillCategory(v as BillCategory)}
                variant="subtle"
                className="w-full"
                options={BILL_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          {/* Bill Photo Upload (create & edit) */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-zinc-700">
              Bill / Receipt Photo (Optional)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleBillFileSelect}
              className="hidden"
            />
            {billImageDataUrl || (editingBill?.image_url && /^https:\/\//i.test(editingBill.image_url)) ? (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={billImageDataUrl || editingBill?.image_url}
                    alt="Bill receipt preview"
                    className="w-14 h-14 rounded-lg object-cover border border-stone-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900">Receipt photo attached</p>
                    <p className="text-[11px] font-mono text-zinc-500">
                      {billImageSizeKb
                        ? `Compressed to ${billImageSizeKb} KB JPEG`
                        : editingBill && !billImageSizeKb
                          ? 'Existing receipt attached'
                          : 'Ready to upload'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg cursor-pointer"
                  >
                    Replace
                  </button>
                  {billImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setBillImageDataUrl(undefined);
                        setBillImageSizeKb(null);
                      }}
                      className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={compressingImage}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 px-4 border border-dashed border-stone-300 hover:border-zinc-500 bg-stone-50/70 hover:bg-stone-100/70 rounded-xl flex items-center justify-center gap-2 text-xs font-medium text-zinc-700 transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 text-teal-700" />
                <span>
                  {compressingImage
                    ? 'Compressing photo...'
                    : 'Take Photo or Upload Receipt Image (JPG / PNG)'}
                </span>
              </button>
            )}
          </div>

          {/* Optional Restock Inventory Lines on new bills */}
          {!editingBill && (medicines.length > 0 || items.length > 0) && (
            <div className="pt-3 border-t border-stone-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-xs font-semibold text-zinc-800">
                    Auto-Restock Inventory (Optional)
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    Link purchased medicines or items to increase stock automatically.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddRestockLine}
                  className="h-8 px-2.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/70 rounded-lg inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Stock Line</span>
                </button>
              </div>

              {restockLines.length > 0 && (
                <div className="space-y-2">
                  {restockLines.map((line, idx) => {
                    const targetOptions =
                      line.target_type === 'medicine'
                        ? medicines.map((m) => ({
                            value: m.medicine_id,
                            label: `${m.name} (${m.current_stock} ${m.unit})`,
                          }))
                        : items.map((it) => ({
                            value: it.item_id,
                            label: `${it.name} (${it.current_stock} ${it.unit})`,
                          }));

                    return (
                      <div
                        key={idx}
                        className="p-2.5 bg-stone-50 border border-stone-200/70 rounded-xl grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-4 sm:col-span-3">
                          <CustomSelect
                            ariaLabel="Restock target type"
                            size="sm"
                            value={line.target_type}
                            onChange={(val) => {
                              const nextType = val === 'item' ? 'item' : 'medicine';
                              const defaultId =
                                nextType === 'medicine'
                                  ? medicines[0]?.medicine_id || ''
                                  : items[0]?.item_id || '';
                              setRestockLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, target_type: nextType, target_id: defaultId }
                                    : r
                                )
                              );
                            }}
                            options={[
                              ...(medicines.length > 0 ? [{ value: 'medicine', label: 'Medicine' }] : []),
                              ...(items.length > 0 ? [{ value: 'item', label: 'Item' }] : []),
                            ]}
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-6">
                          <CustomSelect
                            ariaLabel="Select inventory item to restock"
                            size="sm"
                            value={line.target_id}
                            onChange={(val) =>
                              setRestockLines((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, target_id: val } : r))
                              )
                            }
                            options={targetOptions}
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-2">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            aria-label="Restock quantity"
                            value={line.qty}
                            onChange={(e) =>
                              setRestockLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, qty: Math.max(0, Number(e.target.value) || 0) } : r
                                )
                              )
                            }
                            className="w-full h-9 px-2 text-xs font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setRestockLines((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label="Remove restock line"
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="bill-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
              Notes (Optional)
            </label>
            <input
              id="bill-notes"
              type="text"
              value={billNotes}
              onChange={(e) => setBillNotes(e.target.value)}
              placeholder="Items summary, medicines/supplies purchased, remarks..."
              className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>
        </form>
      </ModalDialog>

      {/* ====================================================================
          MODAL: BILL PHOTO LIGHTBOX PREVIEW
      ==================================================================== */}
      <ModalDialog
        open={Boolean(previewBill)}
        onClose={() => setPreviewBill(null)}
        title={previewBill ? `${previewBill.vendor_name} · ${formatInr(previewBill.total_amount)}` : 'Bill Photo'}
        subtitle={
          previewBill
            ? `${previewBill.bill_date}${previewBill.bill_number ? ` · #${previewBill.bill_number}` : ''} · ${previewBill.category}`
            : undefined
        }
        icon={<Receipt className="w-4 h-4 text-teal-700" />}
        titleId="bill-photo-preview-title"
        maxWidthClass="max-w-2xl"
        footer={
          <div className="w-full flex items-center justify-between gap-2">
            {previewBill?.image_url && /^https:\/\//i.test(previewBill.image_url) ? (
              <a
                href={previewBill.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-xl inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Google Drive</span>
              </a>
            ) : (
              <span className="text-[11px] text-zinc-500">
                Stored locally; sync updated Code.gs to archive to Google Drive.
              </span>
            )}
            <button
              type="button"
              onClick={() => setPreviewBill(null)}
              className="h-9 px-3.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {previewBill && (
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-100 flex items-center justify-center max-h-[65vh]">
              {(previewBill.image_data_url && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(previewBill.image_data_url)) ||
              (previewBill.image_url && /^https:\/\//i.test(previewBill.image_url)) ? (
                <img
                  src={
                    previewBill.image_data_url &&
                    /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(previewBill.image_data_url)
                      ? previewBill.image_data_url
                      : previewBill.image_url
                  }
                  alt={`Bill receipt from ${previewBill.vendor_name}`}
                  className="max-h-[65vh] w-auto object-contain"
                />
              ) : (
                <div className="py-12 text-center text-xs text-zinc-500">Preview unavailable</div>
              )}
            </div>
            {previewBill.notes && (
              <p className="text-xs text-zinc-600 bg-stone-50 p-3 rounded-xl border border-stone-200/60">
                {previewBill.notes}
              </p>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
