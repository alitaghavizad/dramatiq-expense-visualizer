"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
import AmbientGeometry from "./chat/ambient-geometry";
import { useI18n } from "./i18n/provider";
import LanguageSwitcher from "./language-switcher";
import ThemeToggle from "./theme-toggle";

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
const CATEGORY_COLORS = ["var(--category-1)", "var(--category-2)", "var(--category-3)", "var(--category-4)", "var(--category-5)", "var(--category-6)", "var(--category-7)", "var(--category-8)", "var(--category-9)", "var(--category-10)"];
const CATEGORY_KEYS: Record<string, string> = {
  Groceries: "groceries",
  Dining: "dining",
  Transport: "transport",
  Household: "household",
  Health: "health",
  "Personal care": "personalCare",
  Entertainment: "entertainment",
  Clothing: "clothing",
  Utilities: "utilities",
  Other: "other",
};

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

type ExpenseSortKey = "item" | "category" | "store" | "date" | "price";
type SortDirection = "asc" | "desc";
type ExpenseSort = { key: ExpenseSortKey; direction: SortDirection };

const DEFAULT_SORT_DIRECTION: Record<ExpenseSortKey, SortDirection> = {
  item: "asc",
  category: "asc",
  store: "asc",
  date: "desc",
  price: "desc",
};
const EXPENSE_COLLATOR = new Intl.Collator(["en", "hy"], { numeric: true, sensitivity: "base" });

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

function formatDram(value: number, locale: string, compact = false) {
  return `֏ ${new Intl.NumberFormat(locale, {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(value)}`;
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function expenseItemName(expense: Expense) {
  return expense.item_name_en?.trim() || expense.item_name;
}

function compareExpenses(left: Expense, right: Expense, key: ExpenseSortKey) {
  if (key === "date") return left.purchase_date.localeCompare(right.purchase_date);
  if (key === "price") return left.total_price - right.total_price;

  const leftValue = key === "item" ? expenseItemName(left) : key === "category" ? left.item_category : left.store;
  const rightValue = key === "item" ? expenseItemName(right) : key === "category" ? right.item_category : right.store;
  return EXPENSE_COLLATOR.compare(leftValue, rightValue);
}

function SortableExpenseHeader({
  label,
  sortKey,
  activeSort,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: ExpenseSortKey;
  activeSort: ExpenseSort;
  align?: "left" | "right";
  onSort: (key: ExpenseSortKey) => void;
}) {
  const { t } = useI18n();
  const active = activeSort.key === sortKey;
  const nextDirection = active
    ? activeSort.direction === "asc" ? "desc" : "asc"
    : DEFAULT_SORT_DIRECTION[sortKey];
  const sortLabel = t("common.sortBy", {
    column: label,
    direction: t(nextDirection === "asc" ? "common.ascending" : "common.descending"),
  });

  return (
    <th
      className={`sortable-column ${align === "right" ? "align-right" : ""}`}
      scope="col"
      aria-sort={active ? activeSort.direction === "asc" ? "ascending" : "descending" : "none"}
    >
      <button
        className={`sort-button ${align === "right" ? "align-right" : ""} ${active ? "is-active" : ""}`}
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={sortLabel}
        title={sortLabel}
      >
        <span>{label}</span>
        {active
          ? activeSort.direction === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />
          : <ArrowUpDown size={12} aria-hidden="true" />}
      </button>
    </th>
  );
}

async function readJson(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? fallback);
  return payload;
}

export default function Home() {
  const { intlLocale, t } = useI18n();
  const [filters, setFilters] = useState<Filters>(currentMonthFilters);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [expenseSort, setExpenseSort] = useState<ExpenseSort>({ key: "date", direction: "desc" });
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
      setData(await readJson(response, t("common.requestFailed")));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("dashboard.databaseFallback"));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

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
    if (!filters.from && !filters.to) return t("dashboard.allTime");
    if (filters.from && filters.to) return `${formatDate(filters.from, intlLocale)} – ${formatDate(filters.to, intlLocale)}`;
    return filters.from
      ? t("dashboard.since", { date: formatDate(filters.from, intlLocale) })
      : t("dashboard.through", { date: formatDate(filters.to, intlLocale) });
  }, [filters.from, filters.to, intlLocale, t]);
  const sortedExpenses = useMemo(() => {
    const direction = expenseSort.direction === "asc" ? 1 : -1;
    return data.expenses
      .map((expense, index) => ({ expense, index }))
      .sort((left, right) => {
        const result = compareExpenses(left.expense, right.expense, expenseSort.key);
        return result === 0 ? left.index - right.index : result * direction;
      })
      .map(({ expense }) => expense);
  }, [data.expenses, expenseSort]);

  function handleExpenseSort(key: ExpenseSortKey) {
    setExpenseSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: DEFAULT_SORT_DIRECTION[key] });
  }

  function openFilePicker() {
    fileInput.current?.click();
  }

  function beginReceipt(file: File) {
    if (!file.type.startsWith("image/")) {
      setToast(t("dashboard.invalidImage"));
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
      const result = (await readJson(response, t("common.requestFailed"))) as ReceiptDraft;
      setDraft({ ...result, receipt_date: result.receipt_date ?? isoToday(), store: result.store ?? "" });
      setReceiptStage("review");
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : t("dashboard.readFailed"));
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
      setReceiptError(t("dashboard.saveValidation"));
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
      await readJson(response, t("common.requestFailed"));
      setReceiptStage("success");
      setRefreshToken((token) => token + 1);
      window.setTimeout(() => {
        setReceiptOpen(false);
        setToast(t(draft.items.length === 1 ? "dashboard.savedOne" : "dashboard.savedMany", { count: draft.items.length }));
      }, 900);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : t("dashboard.saveFailed"));
      setReceiptStage("review");
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!window.confirm(t("dashboard.deleteConfirm", { item: expense.item_name_en || expense.item_name }))) return;
    try {
      const response = await fetch(`${API_BASE}/api/expenses/${expense.id}`, { method: "DELETE" });
      if (!response.ok) await readJson(response, t("common.requestFailed"));
      setToast(t("dashboard.deleted"));
      setRefreshToken((token) => token + 1);
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("dashboard.deleteFailed"));
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

  function categoryLabel(category: string) {
    const key = CATEGORY_KEYS[category];
    return key ? t(`categories.${key}`) : category;
  }

  const reviewedTotal = draft?.items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0) ?? 0;

  return (
    <main className="app-shell">
      <div className="dashboard-background" aria-hidden="true">
        <div className="dashboard-aurora"><span /><span /><span /></div>
        <AmbientGeometry />
      </div>
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => event.target.files?.[0] && beginReceipt(event.target.files[0])}
      />

      <aside className="sidebar">
        <a className="brand-mark" href="#overview" aria-label={t("common.brandHome")}>Դ</a>
        <nav aria-label={t("common.mainNavigation")}>
          <a className="nav-item active" href="#overview" aria-label={t("common.overview")}><LayoutDashboard size={19} /></a>
          <a className="nav-item" href="#insights" aria-label={t("common.insights")}><BarChart3 size={19} /></a>
          <a className="nav-item" href="#purchases" aria-label={t("common.purchases")}><WalletCards size={19} /></a>
          <a className="nav-item" href="/chat" aria-label={t("common.claudeChat")}><MessageCircleMore size={19} /></a>
        </nav>
        <button className="sidebar-add" type="button" onClick={openFilePicker} aria-label={t("common.addReceipt")}><Plus size={19} /></button>
        <div className="user-badge">AM</div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("dashboard.expenseBook")}</p>
            <h1>{t("dashboard.headline")}</h1>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <ThemeToggle />
            <button className="ghost-button" type="button" onClick={exportCsv} disabled={!data.expenses.length}><Download size={16} /> {t("dashboard.export")}</button>
            <button className="primary-button" type="button" onClick={openFilePicker}><Plus size={17} /> {t("common.addReceipt")}</button>
          </div>
        </header>

        <section className="filter-shell" aria-label={t("dashboard.expenseFilters")}>
          <div className="search-field">
            <Search size={16} />
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder={t("dashboard.searchPlaceholder")} aria-label={t("dashboard.searchItems")} />
          </div>
          <label className="compact-field"><CalendarDays size={15} /><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} aria-label={t("dashboard.startDate")} /></label>
          <span className="date-separator">{t("dashboard.to")}</span>
          <label className="compact-field"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} aria-label={t("dashboard.endDate")} /></label>
          <button className={`filter-button ${activeFilterCount ? "has-filters" : ""}`} type="button" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} /> {t("dashboard.filters")} {activeFilterCount > 0 && <span>{activeFilterCount}</span>}<ChevronDown size={14} /></button>
          {filtersOpen && (
            <div className="filter-popover">
              <div className="popover-heading"><strong>{t("dashboard.refinePurchases")}</strong><button type="button" onClick={() => setFiltersOpen(false)} aria-label={t("dashboard.closeFilters")}><X size={16} /></button></div>
              <label>{t("dashboard.category")}<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">{t("dashboard.allCategories")}</option>{(data.options.categories.length ? data.options.categories : CATEGORIES).map((category) => <option value={category} key={category}>{categoryLabel(category)}</option>)}</select></label>
              <label>{t("dashboard.store")}<select value={filters.store} onChange={(event) => setFilters({ ...filters, store: event.target.value })}><option value="">{t("dashboard.allStores")}</option>{data.options.stores.map((store) => <option value={store} key={store}>{store}</option>)}</select></label>
              <div className="price-filter"><label>{t("dashboard.minimumPrice")}<input inputMode="numeric" value={filters.minPrice} onChange={(event) => setFilters({ ...filters, minPrice: event.target.value.replace(/[^0-9]/g, "") })} placeholder="0" /></label><label>{t("dashboard.maximumPrice")}<input inputMode="numeric" value={filters.maxPrice} onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value.replace(/[^0-9]/g, "") })} placeholder={data.options.max_price ? String(Math.ceil(data.options.max_price)) : t("common.any")} /></label></div>
              <button className="reset-button" type="button" onClick={resetFilters}>{t("dashboard.resetMonth")}</button>
            </div>
          )}
        </section>

        {loadError ? (
          <section className="connection-error">
            <CircleDollarSign size={28} />
            <div><strong>{t("dashboard.databaseUnavailable")}</strong><p>{loadError}</p></div>
            <button type="button" onClick={loadDashboard}>{t("common.tryAgain")}</button>
          </section>
        ) : (
          <>
            <div className={`stat-grid ${loading ? "is-loading" : ""}`}>
              <article className="stat-card ink"><p>{t("dashboard.spentInRange")}</p><strong>{formatDram(data.summary.total_spent, intlLocale)}</strong><span className="stat-note">{filterLabel}</span></article>
              <article className="stat-card"><p>{t("dashboard.averageItem")}</p><strong>{formatDram(data.summary.average_item_price, intlLocale)}</strong><span className="stat-note">{t("dashboard.acrossItems", { count: new Intl.NumberFormat(intlLocale).format(data.summary.item_count) })}</span></article>
              <article className="stat-card"><p>{t("dashboard.largestCategory")}</p><strong>{data.summary.top_category ? categoryLabel(data.summary.top_category) : "—"}</strong><span className="stat-note">{data.summary.top_category ? t("dashboard.inRange", { amount: formatDram(data.summary.top_category_total, intlLocale) }) : t("dashboard.addReceiptStart")}</span></article>
              <article className="stat-card receipt-stat"><p>{t("dashboard.receipts")}</p><strong>{new Intl.NumberFormat(intlLocale).format(data.summary.receipt_count)}</strong><span className="stat-note">{t("dashboard.processedSaved")}</span></article>
            </div>

            <div className="dashboard-grid" id="insights">
              <article className="panel trend-panel">
                <div className="panel-heading"><div><p className="eyebrow">{t("dashboard.timeline")}</p><h2>{t("dashboard.spendingRhythm")}</h2></div><span className="range-label">{filterLabel}</span></div>
                {data.daily.length ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily} margin={{ top: 12, right: 4, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString(intlLocale, { month: "short", day: "numeric" })} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 10 }} minTickGap={26} />
                        <YAxis tickFormatter={(value) => formatDram(Number(value), intlLocale, true)} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 10 }} width={54} />
                        <Tooltip cursor={{ fill: "var(--chart-cursor)" }} formatter={(value) => [formatDram(Number(value), intlLocale), t("dashboard.spent")]} labelFormatter={(value) => formatDate(String(value), intlLocale)} contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-elevated)", color: "var(--ink)", boxShadow: "0 12px 36px var(--shadow-soft)", fontSize: 12 }} />
                        <Bar dataKey="total" fill="var(--chart-bar)" radius={[5, 5, 1, 1]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <ChartEmpty />}
              </article>

              <article className="panel category-panel">
                <div className="panel-heading"><div><p className="eyebrow">{t("dashboard.composition")}</p><h2>{t("dashboard.byCategory")}</h2></div></div>
                {data.categories.length ? (
                  <div className="category-content">
                    <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categories} dataKey="total" nameKey="name" innerRadius="63%" outerRadius="90%" paddingAngle={2} stroke="none">{data.categories.map((entry, index) => <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatDram(Number(value), intlLocale)} contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-elevated)", color: "var(--ink)", fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="donut-total"><span>{t("dashboard.total")}</span><strong>{formatDram(data.summary.total_spent, intlLocale, true)}</strong></div></div>
                    <div className="category-legend">{data.categories.slice(0, 5).map((category, index) => <div key={category.name}><span style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><strong>{categoryLabel(category.name)}</strong><em>{new Intl.NumberFormat(intlLocale).format(data.summary.total_spent ? Math.round(category.total / data.summary.total_spent * 100) : 0)}%</em></div>)}</div>
                  </div>
                ) : <ChartEmpty compact />}
              </article>
            </div>

            <div className="lower-grid">
              <article className="panel upload-panel" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) beginReceipt(file); }}>
                <div className="scan-icon"><ReceiptText size={22} /></div>
                <p className="eyebrow">{t("dashboard.smartCapture")}</p>
                <h2>{t("dashboard.captureHeadline")}</h2>
                <p>{t("dashboard.captureDescription")}</p>
                <div className="upload-actions"><button className="secondary-button" type="button" onClick={openFilePicker}><UploadCloud size={16} /> {t("dashboard.chooseReceipt")}</button><button className="manual-button" type="button" onClick={startManualReceipt}>{t("dashboard.enterManually")}</button></div>
                <span className="file-hint">{t("dashboard.fileTypes")}</span>
              </article>

              <article className="panel store-panel">
                <div className="panel-heading"><div><p className="eyebrow">{t("dashboard.whereItGoes")}</p><h2>{t("dashboard.topStores")}</h2></div></div>
                {data.stores.length ? <div className="store-list">{data.stores.map((store, index) => <div className="store-row" key={store.name}><span className="store-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{store.name}</strong><span>{t("dashboard.itemCount", { count: new Intl.NumberFormat(intlLocale).format(store.count) })}</span></div><em>{formatDram(store.total, intlLocale)}</em></div>)}</div> : <ChartEmpty compact />}
              </article>
            </div>

            <article className="panel purchases-panel" id="purchases">
              <div className="panel-heading purchases-heading"><div><p className="eyebrow">{t("dashboard.purchaseLedger")}</p><h2>{t("dashboard.itemsInView")}</h2></div><span>{t(data.expenses.length === 1 ? "dashboard.recordCount" : "dashboard.recordCountPlural", { count: new Intl.NumberFormat(intlLocale).format(data.expenses.length) })}</span></div>
              {data.expenses.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <SortableExpenseHeader label={t("dashboard.item")} sortKey="item" activeSort={expenseSort} onSort={handleExpenseSort} />
                        <SortableExpenseHeader label={t("dashboard.category")} sortKey="category" activeSort={expenseSort} onSort={handleExpenseSort} />
                        <SortableExpenseHeader label={t("dashboard.store")} sortKey="store" activeSort={expenseSort} onSort={handleExpenseSort} />
                        <SortableExpenseHeader label={t("dashboard.date")} sortKey="date" activeSort={expenseSort} onSort={handleExpenseSort} />
                        <SortableExpenseHeader label={t("dashboard.price")} sortKey="price" activeSort={expenseSort} align="right" onSort={handleExpenseSort} />
                        <th scope="col"><span className="visually-hidden">{t("dashboard.actions")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedExpenses.map((expense) => (
                        <tr key={expense.id}>
                          <td><div className="item-cell"><span className="item-icon">{expenseItemName(expense).slice(0, 1).toUpperCase()}</span><div><strong>{expenseItemName(expense)}</strong>{expense.item_name_en && <span lang="hy">{expense.item_name}</span>}</div></div></td>
                          <td><span className="category-tag">{categoryLabel(expense.item_category)}</span></td>
                          <td>{expense.store}</td>
                          <td>{formatDate(expense.purchase_date, intlLocale)}</td>
                          <td className="align-right price-cell">{formatDram(expense.total_price, intlLocale)}</td>
                          <td><button className="row-action" type="button" onClick={() => deleteExpense(expense)} aria-label={t("dashboard.deleteItem", { item: expenseItemName(expense) })}><Trash2 size={15} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-ledger"><div><FileImage size={27} /></div><h3>{t("dashboard.emptyLedgerTitle")}</h3><p>{t("dashboard.emptyLedgerCopy")}</p><button type="button" onClick={openFilePicker}>{t("common.addReceipt")}</button></div>
              )}
            </article>
          </>
        )}
      </section>

      {receiptOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeReceipt()}>
          <section className={`receipt-modal stage-${receiptStage}`} role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="modal-heading"><div><p className="eyebrow">{t("dashboard.newReceipt")}</p><h2 id="receipt-title">{receiptStage === "review" || receiptStage === "saving" ? t("dashboard.reviewEveryLine") : receiptStage === "success" ? t("dashboard.savedToBook") : t("dashboard.capturePurchases")}</h2></div><button type="button" onClick={closeReceipt} aria-label={t("dashboard.closeReceipt")}><X size={19} /></button></div>

            {receiptStage === "ready" && selectedFile && (
              <div className="receipt-start">
                <div className="receipt-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl ?? ""} alt={t("dashboard.image")} />
                </div>
                <div className="receipt-start-copy"><div className="ai-badge"><Sparkles size={14} /> {t("dashboard.armenianReader")}</div><h3>{selectedFile.name}</h3><p>{t("dashboard.readerDescription")}</p><dl><div><dt>{t("dashboard.image")}</dt><dd>{new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(selectedFile.size / 1024 / 1024)} MB</dd></div><div><dt>{t("dashboard.savedAutomatically")}</dt><dd>{t("dashboard.reviewFirst")}</dd></div></dl><button className="primary-button wide" type="button" onClick={scanReceipt}><Sparkles size={16} /> {t("dashboard.readReceipt")}</button><button className="replace-file" type="button" onClick={openFilePicker}>{t("dashboard.chooseDifferent")}</button></div>
              </div>
            )}

            {receiptStage === "extracting" && (
              <div className="processing-state"><div className="processing-icon"><LoaderCircle size={28} /></div><h3>{t("dashboard.reading")}</h3><p>{t("dashboard.readingDescription")}</p><div className="processing-line"><span /></div></div>
            )}

            {receiptStage === "error" && (
              <div className="processing-state error-state"><div className="processing-icon"><ReceiptText size={27} /></div><h3>{t("dashboard.couldNotRead")}</h3><p>{receiptError}</p><div className="error-actions">{selectedFile && <button className="primary-button" type="button" onClick={scanReceipt}>{t("common.tryAgain")}</button>}<button className="ghost-button" type="button" onClick={startManualReceipt}>{t("dashboard.enterManually")}</button></div></div>
            )}

            {(receiptStage === "review" || receiptStage === "saving") && draft && (
              <div className="review-layout">
                {previewUrl && <aside className="review-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt={t("dashboard.image")} />
                  <span><Sparkles size={13} /> {t("dashboard.aiExtraction")}</span>
                </aside>}
                <div className="review-form">
                  <div className="receipt-fields"><label>{t("dashboard.date")}<input type="date" value={draft.receipt_date ?? ""} onChange={(event) => setDraft({ ...draft, receipt_date: event.target.value })} /></label><label>{t("dashboard.store")}<input value={draft.store ?? ""} onChange={(event) => setDraft({ ...draft, store: event.target.value })} placeholder={t("dashboard.storeName")} /></label><label>{t("dashboard.receiptNumber")}<input value={draft.receipt_number ?? ""} onChange={(event) => setDraft({ ...draft, receipt_number: event.target.value || null })} placeholder={t("common.optional")} /></label></div>
                  <div className="line-items-heading"><div><strong>{t("dashboard.purchasedItems")}</strong><span>{t("dashboard.lineCount", { count: new Intl.NumberFormat(intlLocale).format(draft.items.length) })}</span></div><button type="button" onClick={addItem}><Plus size={14} /> {t("dashboard.addLine")}</button></div>
                  <div className="line-items">{draft.items.map((item, index) => <div className="review-item" key={index}><span className="line-number">{String(index + 1).padStart(2, "0")}</span><div className="item-fields"><label className="original-name">{t("dashboard.originalName")}<input lang="hy" value={item.original_name} onChange={(event) => updateItem(index, { original_name: event.target.value })} /></label><label>{t("dashboard.englishName")}<input value={item.english_name ?? ""} onChange={(event) => updateItem(index, { english_name: event.target.value || null })} /></label><label>{t("dashboard.category")}<select value={item.category} onChange={(event) => updateItem(index, { category: event.target.value as ReceiptItem["category"] })}>{CATEGORIES.map((category) => <option value={category} key={category}>{categoryLabel(category)}</option>)}</select></label><label className="quantity-field">{t("dashboard.quantity")}<input type="number" min="0.001" step="0.001" value={item.quantity ?? ""} onChange={(event) => updateItem(index, { quantity: event.target.value ? Number(event.target.value) : null })} /></label><label className="money-field">{t("dashboard.lineTotal")}<input type="number" min="0" step="1" value={item.total_price} onChange={(event) => updateItem(index, { total_price: Number(event.target.value) })} /></label></div><button className="remove-line" type="button" onClick={() => removeItem(index)} aria-label={t("dashboard.removeLine", { number: index + 1 })} disabled={draft.items.length === 1}><Trash2 size={15} /></button></div>)}</div>
                  {receiptError && <p className="form-error">{receiptError}</p>}
                  <div className="review-footer"><div><span>{t("dashboard.reviewedTotal")}</span><strong>{formatDram(reviewedTotal, intlLocale)}</strong>{draft.receipt_total !== null && Math.abs(reviewedTotal - draft.receipt_total) > 1 && <em>{t("dashboard.receiptShows", { amount: formatDram(draft.receipt_total, intlLocale) })}</em>}</div><button className="primary-button" type="button" onClick={saveReceipt} disabled={receiptStage === "saving"}>{receiptStage === "saving" ? <><LoaderCircle className="spin" size={16} /> {t("dashboard.saving")}</> : <><Check size={16} /> {t(draft.items.length === 1 ? "dashboard.saveOne" : "dashboard.saveMany", { count: draft.items.length })}</>}</button></div>
                </div>
              </div>
            )}

            {receiptStage === "success" && <div className="processing-state success-state"><div className="success-check"><Check size={30} /></div><h3>{t("dashboard.successTitle")}</h3><p>{t("dashboard.successCopy")}</p></div>}
          </section>
        </div>
      )}

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}

function ChartEmpty({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return <div className={`chart-empty ${compact ? "compact" : ""}`}><Filter size={20} /><span>{t("dashboard.chartEmpty")}</span></div>;
}
