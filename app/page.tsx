"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileImage,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  MessageCircleMore,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_EXPENSE_API_URL ?? "http://localhost:3001";
const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Household",
  "Health",
  "Personal care",
  "Entertainment",
  "Clothing",
  "Utilities",
  "Other",
] as const;
const CATEGORY_COLORS = ["#ec633e", "#315e50", "#e6ae53", "#7594a6", "#a7806b", "#8c8069", "#b76d68", "#79906a", "#64818f", "#b7b2a7"];

type Expense = {
  id: string;
  receipt_id: string | null;
  purchase_date: string;
  item_name: string;
  item_name_en: string | null;
  item_category: string;
  store: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
  currency: string;
  extraction_confidence: number | null;
};

type ChartDatum = { name: string; total: number; count: number };
type DashboardData = {
  summary: {
    total_spent: number;
    item_count: number;
    receipt_count: number;
    average_item_price: number;
    top_category: string | null;
    top_category_total: number;
  };
  daily: Array<{ date: string; total: number }>;
  categories: ChartDatum[];
  stores: ChartDatum[];
  expenses: Expense[];
  options: {
    categories: string[];
    stores: string[];
    min_date: string | null;
    max_date: string | null;
    max_price: number;
  };
};

type ReceiptItem = {
  original_name: string;
  english_name: string | null;
  category: (typeof CATEGORIES)[number];
  quantity: number | null;
  unit_price: number | null;
  total_price: number;
  confidence: number | null;
};

type ReceiptDraft = {
  store: string | null;
  receipt_date: string | null;
  receipt_number: string | null;
  currency: "AMD";
  receipt_total: number | null;
  items: ReceiptItem[];
  file_hash: string | null;
  source_filename: string | null;
  source_mime_type: string | null;
};

type Filters = {
  from: string;
  to: string;
  category: string;
  store: string;
  minPrice: string;
  maxPrice: string;
  search: string;
};

const emptyData: DashboardData = {
  summary: { total_spent: 0, item_count: 0, receipt_count: 0, average_item_price: 0, top_category: null, top_category_total: 0 },
  daily: [], categories: [], stores: [], expenses: [],
  options: { categories: [], stores: [], min_date: null, max_date: null, max_price: 0 },
};

function isoToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function currentMonthFilters(): Filters {
  const today = isoToday();
  return { from: `${today.slice(0, 7)}-01`, to: today, category: "", store: "", minPrice: "", maxPrice: "", search: "" };
}

function formatDram(value: number, compact = false) {
  if (compact && value >= 1_000_000) return `֏${(value / 1_000_000).toFixed(1)}m`;
  if (compact && value >= 1_000) return `֏${Math.round(value / 1_000)}k`;
  return `֏ ${Math.round(value).toLocaleString("en-US")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "The request could not be completed.");
  return payload;
}

export default function Home() {
  const [filters, setFilters] = useState<Filters>(currentMonthFilters);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptStage, setReceiptStage] = useState<"ready" | "extracting" | "review" | "saving" | "success" | "error">("ready");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    try {
      setLoading(true);
      setLoadError("");
      const response = await fetch(`${API_BASE}/api/dashboard?${params.toString()}`);
      setData(await readJson(response));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Cannot reach the expense database.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(loadDashboard, filters.search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard, refreshToken, filters.search]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const activeFilterCount = [filters.category, filters.store, filters.minPrice, filters.maxPrice].filter(Boolean).length;
  const filterLabel = useMemo(() => {
    if (!filters.from && !filters.to) return "All time";
    if (filters.from && filters.to) return `${formatDate(filters.from)} – ${formatDate(filters.to)}`;
    return filters.from ? `Since ${formatDate(filters.from)}` : `Through ${formatDate(filters.to)}`;
  }, [filters.from, filters.to]);

  function openFilePicker() {
    fileInput.current?.click();
  }

  function beginReceipt(file: File) {
    if (!file.type.startsWith("image/")) {
      setToast("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setDraft(null);
    setReceiptError("");
    setReceiptStage("ready");
    setReceiptOpen(true);
  }

  function closeReceipt() {
    if (receiptStage === "extracting" || receiptStage === "saving") return;
    setReceiptOpen(false);
  }

  async function scanReceipt() {
    if (!selectedFile) return;
    setReceiptStage("extracting");
    setReceiptError("");
    try {
      const form = new FormData();
      form.append("receipt", selectedFile);
      const response = await fetch(`${API_BASE}/api/receipts/extract`, { method: "POST", body: form });
      const result = (await readJson(response)) as ReceiptDraft;
      setDraft({ ...result, receipt_date: result.receipt_date ?? isoToday(), store: result.store ?? "" });
      setReceiptStage("review");
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "The receipt could not be read.");
      setReceiptStage("error");
    }
  }

  function startManualReceipt() {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDraft({
      store: "", receipt_date: isoToday(), receipt_number: null, currency: "AMD",
      receipt_total: null, file_hash: null, source_filename: null, source_mime_type: null,
      items: [{ original_name: "", english_name: "", category: "Other", quantity: 1, unit_price: null, total_price: 0, confidence: null }],
    });
    setReceiptError("");
    setReceiptStage("review");
    setReceiptOpen(true);
  }

  function updateItem(index: number, patch: Partial<ReceiptItem>) {
    setDraft((current) => current ? { ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } : current);
  }

  function addItem() {
    setDraft((current) => current ? {
      ...current,
      items: [...current.items, { original_name: "", english_name: "", category: "Other", quantity: 1, unit_price: null, total_price: 0, confidence: null }],
    } : current);
  }

  function removeItem(index: number) {
    setDraft((current) => current ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current);
  }

  async function saveReceipt() {
    if (!draft) return;
    if (!draft.store?.trim() || !draft.receipt_date || !draft.items.length || draft.items.some((item) => !item.original_name.trim())) {
      setReceiptError("Add a date, store, and name for every item before saving.");
      return;
    }
    setReceiptStage("saving");
    setReceiptError("");
    try {
      const response = await fetch(`${API_BASE}/api/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_date: draft.receipt_date,
          store: draft.store,
          receipt_number: draft.receipt_number,
          receipt_total: draft.receipt_total,
          currency: draft.currency,
          source_filename: draft.source_filename,
          source_mime_type: draft.source_mime_type,
          source_hash: draft.file_hash,
          items: draft.items,
        }),
      });
      await readJson(response);
      setReceiptStage("success");
      setRefreshToken((token) => token + 1);
      window.setTimeout(() => {
        setReceiptOpen(false);
        setToast(`${draft.items.length} purchase${draft.items.length === 1 ? "" : "s"} saved.`);
      }, 900);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "The receipt could not be saved.");
      setReceiptStage("review");
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!window.confirm(`Delete “${expense.item_name_en || expense.item_name}”?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/expenses/${expense.id}`, { method: "DELETE" });
      if (!response.ok) await readJson(response);
      setToast("Purchase deleted.");
      setRefreshToken((token) => token + 1);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not delete the purchase.");
    }
  }

  function exportCsv() {
    if (!data.expenses.length) return;
    const headers = ["Date", "Original item name", "English item name", "Category", "Store", "Quantity", "Unit price", "Total price", "Currency"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = data.expenses.map((expense) => [
      expense.purchase_date, expense.item_name, expense.item_name_en, expense.item_category,
      expense.store, expense.quantity, expense.unit_price, expense.total_price, expense.currency,
    ].map(escape).join(","));
    const blob = new Blob([[headers.map(escape).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `yerevan-expenses-${isoToday()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function resetFilters() {
    setFilters(currentMonthFilters());
  }

  const reviewedTotal = draft?.items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0) ?? 0;

  return (
    <main className="app-shell">
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => event.target.files?.[0] && beginReceipt(event.target.files[0])}
      />

      <aside className="sidebar">
        <a className="brand-mark" href="#overview" aria-label="Dramatiq home">Դ</a>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#overview" aria-label="Overview"><LayoutDashboard size={19} /></a>
          <a className="nav-item" href="#insights" aria-label="Insights"><BarChart3 size={19} /></a>
          <a className="nav-item" href="#purchases" aria-label="Purchases"><WalletCards size={19} /></a>
          <a className="nav-item" href="/chat" aria-label="Claude chat"><MessageCircleMore size={19} /></a>
        </nav>
        <button className="sidebar-add" type="button" onClick={openFilePicker} aria-label="Add receipt"><Plus size={19} /></button>
        <div className="user-badge">AM</div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">Expense book · Yerevan</p>
            <h1>Your spending, clearly.</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" type="button" onClick={exportCsv} disabled={!data.expenses.length}><Download size={16} /> Export</button>
            <button className="primary-button" type="button" onClick={openFilePicker}><Plus size={17} /> Add receipt</button>
          </div>
        </header>

        <section className="filter-shell" aria-label="Expense filters">
          <div className="search-field">
            <Search size={16} />
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search Armenian or English item names" aria-label="Search items" />
          </div>
          <label className="compact-field"><CalendarDays size={15} /><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} aria-label="Start date" /></label>
          <span className="date-separator">to</span>
          <label className="compact-field"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} aria-label="End date" /></label>
          <button className={`filter-button ${activeFilterCount ? "has-filters" : ""}`} type="button" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} /> Filters {activeFilterCount > 0 && <span>{activeFilterCount}</span>}<ChevronDown size={14} /></button>
          {filtersOpen && (
            <div className="filter-popover">
              <div className="popover-heading"><strong>Refine purchases</strong><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={16} /></button></div>
              <label>Category<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{(data.options.categories.length ? data.options.categories : CATEGORIES).map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Store<select value={filters.store} onChange={(event) => setFilters({ ...filters, store: event.target.value })}><option value="">All stores</option>{data.options.stores.map((store) => <option key={store}>{store}</option>)}</select></label>
              <div className="price-filter"><label>Minimum price<input inputMode="numeric" value={filters.minPrice} onChange={(event) => setFilters({ ...filters, minPrice: event.target.value.replace(/[^0-9]/g, "") })} placeholder="0" /></label><label>Maximum price<input inputMode="numeric" value={filters.maxPrice} onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value.replace(/[^0-9]/g, "") })} placeholder={data.options.max_price ? String(Math.ceil(data.options.max_price)) : "Any"} /></label></div>
              <button className="reset-button" type="button" onClick={resetFilters}>Reset to this month</button>
            </div>
          )}
        </section>

        {loadError ? (
          <section className="connection-error">
            <CircleDollarSign size={28} />
            <div><strong>We couldn’t reach your expense database.</strong><p>{loadError}</p></div>
            <button type="button" onClick={loadDashboard}>Try again</button>
          </section>
        ) : (
          <>
            <div className={`stat-grid ${loading ? "is-loading" : ""}`}>
              <article className="stat-card ink"><p>Spent in range</p><strong>{formatDram(data.summary.total_spent)}</strong><span className="stat-note">{filterLabel}</span></article>
              <article className="stat-card"><p>Average item</p><strong>{formatDram(data.summary.average_item_price)}</strong><span className="stat-note">Across {data.summary.item_count.toLocaleString()} purchase items</span></article>
              <article className="stat-card"><p>Largest category</p><strong>{data.summary.top_category ?? "—"}</strong><span className="stat-note">{data.summary.top_category ? `${formatDram(data.summary.top_category_total)} in this range` : "Add a receipt to get started"}</span></article>
              <article className="stat-card receipt-stat"><p>Receipts</p><strong>{data.summary.receipt_count}</strong><span className="stat-note">Processed and saved</span></article>
            </div>

            <div className="dashboard-grid" id="insights">
              <article className="panel trend-panel">
                <div className="panel-heading"><div><p className="eyebrow">Timeline</p><h2>Spending rhythm</h2></div><span className="range-label">{filterLabel}</span></div>
                {data.daily.length ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily} margin={{ top: 12, right: 4, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke="#e6e3dc" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} axisLine={false} tickLine={false} tick={{ fill: "#858a84", fontSize: 10 }} minTickGap={26} />
                        <YAxis tickFormatter={(value) => formatDram(Number(value), true)} axisLine={false} tickLine={false} tick={{ fill: "#858a84", fontSize: 10 }} width={54} />
                        <Tooltip cursor={{ fill: "#ece8df" }} formatter={(value) => [formatDram(Number(value)), "Spent"]} labelFormatter={(value) => formatDate(String(value))} contentStyle={{ borderRadius: 12, border: "1px solid #deddd6", boxShadow: "0 12px 36px #1c2b2414", fontSize: 12 }} />
                        <Bar dataKey="total" fill="#315e50" radius={[5, 5, 1, 1]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <ChartEmpty />}
              </article>

              <article className="panel category-panel">
                <div className="panel-heading"><div><p className="eyebrow">Composition</p><h2>By category</h2></div></div>
                {data.categories.length ? (
                  <div className="category-content">
                    <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categories} dataKey="total" nameKey="name" innerRadius="63%" outerRadius="90%" paddingAngle={2} stroke="none">{data.categories.map((entry, index) => <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatDram(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #deddd6", fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="donut-total"><span>Total</span><strong>{formatDram(data.summary.total_spent, true)}</strong></div></div>
                    <div className="category-legend">{data.categories.slice(0, 5).map((category, index) => <div key={category.name}><span style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><strong>{category.name}</strong><em>{data.summary.total_spent ? Math.round(category.total / data.summary.total_spent * 100) : 0}%</em></div>)}</div>
                  </div>
                ) : <ChartEmpty compact />}
              </article>
            </div>

            <div className="lower-grid">
              <article className="panel upload-panel" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) beginReceipt(file); }}>
                <div className="scan-icon"><ReceiptText size={22} /></div>
                <p className="eyebrow">Smart capture</p>
                <h2>Receipt to records in a minute.</h2>
                <p>Drop an Armenian receipt here. The extracted lines stay editable until you approve them.</p>
                <div className="upload-actions"><button className="secondary-button" type="button" onClick={openFilePicker}><UploadCloud size={16} /> Choose receipt</button><button className="manual-button" type="button" onClick={startManualReceipt}>Enter manually</button></div>
                <span className="file-hint">JPG, PNG or WEBP · up to 12 MB</span>
              </article>

              <article className="panel store-panel">
                <div className="panel-heading"><div><p className="eyebrow">Where it goes</p><h2>Top stores</h2></div></div>
                {data.stores.length ? <div className="store-list">{data.stores.map((store, index) => <div className="store-row" key={store.name}><span className="store-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{store.name}</strong><span>{store.count} item{store.count === 1 ? "" : "s"}</span></div><em>{formatDram(store.total)}</em></div>)}</div> : <ChartEmpty compact />}
              </article>
            </div>

            <article className="panel purchases-panel" id="purchases">
              <div className="panel-heading purchases-heading"><div><p className="eyebrow">Purchase ledger</p><h2>Items in this view</h2></div><span>{data.expenses.length} record{data.expenses.length === 1 ? "" : "s"}</span></div>
              {data.expenses.length ? (
                <div className="table-scroll"><table><thead><tr><th>Item</th><th>Category</th><th>Store</th><th>Date</th><th className="align-right">Price</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{data.expenses.map((expense) => <tr key={expense.id}><td><div className="item-cell"><span className="item-icon">{(expense.item_name_en || expense.item_name).slice(0, 1).toUpperCase()}</span><div><strong>{expense.item_name_en || expense.item_name}</strong>{expense.item_name_en && <span lang="hy">{expense.item_name}</span>}</div></div></td><td><span className="category-tag">{expense.item_category}</span></td><td>{expense.store}</td><td>{formatDate(expense.purchase_date)}</td><td className="align-right price-cell">{formatDram(expense.total_price)}</td><td><button className="row-action" type="button" onClick={() => deleteExpense(expense)} aria-label={`Delete ${expense.item_name_en || expense.item_name}`}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
              ) : (
                <div className="empty-ledger"><div><FileImage size={27} /></div><h3>No purchases in this view</h3><p>Try widening the date range, clearing filters, or add your first receipt.</p><button type="button" onClick={openFilePicker}>Add a receipt</button></div>
              )}
            </article>
          </>
        )}
      </section>

      {receiptOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeReceipt()}>
          <section className={`receipt-modal stage-${receiptStage}`} role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="modal-heading"><div><p className="eyebrow">New receipt</p><h2 id="receipt-title">{receiptStage === "review" || receiptStage === "saving" ? "Review every line" : receiptStage === "success" ? "Saved to your expense book" : "Capture your purchases"}</h2></div><button type="button" onClick={closeReceipt} aria-label="Close receipt dialog"><X size={19} /></button></div>

            {receiptStage === "ready" && selectedFile && (
              <div className="receipt-start">
                <div className="receipt-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl ?? ""} alt="Selected receipt" />
                </div>
                <div className="receipt-start-copy"><div className="ai-badge"><Sparkles size={14} /> Armenian receipt reader</div><h3>{selectedFile.name}</h3><p>We’ll find the store, date, and purchased items. You’ll review all names, categories, and prices before saving.</p><dl><div><dt>Image</dt><dd>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</dd></div><div><dt>Saved automatically?</dt><dd>No, review first</dd></div></dl><button className="primary-button wide" type="button" onClick={scanReceipt}><Sparkles size={16} /> Read this receipt</button><button className="replace-file" type="button" onClick={openFilePicker}>Choose a different image</button></div>
              </div>
            )}

            {receiptStage === "extracting" && (
              <div className="processing-state"><div className="processing-icon"><LoaderCircle size={28} /></div><h3>Reading the receipt…</h3><p>Recognizing Armenian item names, matching prices, and assigning useful categories.</p><div className="processing-line"><span /></div></div>
            )}

            {receiptStage === "error" && (
              <div className="processing-state error-state"><div className="processing-icon"><ReceiptText size={27} /></div><h3>We couldn’t read this one</h3><p>{receiptError}</p><div className="error-actions">{selectedFile && <button className="primary-button" type="button" onClick={scanReceipt}>Try again</button>}<button className="ghost-button" type="button" onClick={startManualReceipt}>Enter items manually</button></div></div>
            )}

            {(receiptStage === "review" || receiptStage === "saving") && draft && (
              <div className="review-layout">
                {previewUrl && <aside className="review-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Receipt being reviewed" />
                  <span><Sparkles size={13} /> AI extraction · verify against image</span>
                </aside>}
                <div className="review-form">
                  <div className="receipt-fields"><label>Date<input type="date" value={draft.receipt_date ?? ""} onChange={(event) => setDraft({ ...draft, receipt_date: event.target.value })} /></label><label>Store<input value={draft.store ?? ""} onChange={(event) => setDraft({ ...draft, store: event.target.value })} placeholder="Store name" /></label><label>Receipt no.<input value={draft.receipt_number ?? ""} onChange={(event) => setDraft({ ...draft, receipt_number: event.target.value || null })} placeholder="Optional" /></label></div>
                  <div className="line-items-heading"><div><strong>Purchased items</strong><span>{draft.items.length} line{draft.items.length === 1 ? "" : "s"}</span></div><button type="button" onClick={addItem}><Plus size={14} /> Add line</button></div>
                  <div className="line-items">{draft.items.map((item, index) => <div className="review-item" key={index}><span className="line-number">{String(index + 1).padStart(2, "0")}</span><div className="item-fields"><label className="original-name">Original name<input lang="hy" value={item.original_name} onChange={(event) => updateItem(index, { original_name: event.target.value })} /></label><label>English name<input value={item.english_name ?? ""} onChange={(event) => updateItem(index, { english_name: event.target.value || null })} /></label><label>Category<select value={item.category} onChange={(event) => updateItem(index, { category: event.target.value as ReceiptItem["category"] })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="quantity-field">Qty<input type="number" min="0.001" step="0.001" value={item.quantity ?? ""} onChange={(event) => updateItem(index, { quantity: event.target.value ? Number(event.target.value) : null })} /></label><label className="money-field">Total (֏)<input type="number" min="0" step="1" value={item.total_price} onChange={(event) => updateItem(index, { total_price: Number(event.target.value) })} /></label></div><button className="remove-line" type="button" onClick={() => removeItem(index)} aria-label={`Remove line ${index + 1}`} disabled={draft.items.length === 1}><Trash2 size={15} /></button></div>)}</div>
                  {receiptError && <p className="form-error">{receiptError}</p>}
                  <div className="review-footer"><div><span>Reviewed total</span><strong>{formatDram(reviewedTotal)}</strong>{draft.receipt_total !== null && Math.abs(reviewedTotal - draft.receipt_total) > 1 && <em>Receipt shows {formatDram(draft.receipt_total)}</em>}</div><button className="primary-button" type="button" onClick={saveReceipt} disabled={receiptStage === "saving"}>{receiptStage === "saving" ? <><LoaderCircle className="spin" size={16} /> Saving…</> : <><Check size={16} /> Save {draft.items.length} purchase{draft.items.length === 1 ? "" : "s"}</>}</button></div>
                </div>
              </div>
            )}

            {receiptStage === "success" && <div className="processing-state success-state"><div className="success-check"><Check size={30} /></div><h3>Everything is recorded.</h3><p>Your dashboard is refreshing with the new purchases.</p></div>}
          </section>
        </div>
      )}

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}

function ChartEmpty({ compact = false }: { compact?: boolean }) {
  return <div className={`chart-empty ${compact ? "compact" : ""}`}><Filter size={20} /><span>No data for these filters</span></div>;
}
