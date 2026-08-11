import { useState, useEffect, useMemo } from "react";
import {
  Package, Plus, Search, AlertTriangle, Pencil, Trash2, X,
  ChevronUp, ChevronDown, Boxes, CircleAlert, CircleCheck,
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, ArrowDownToLine, ArrowUpFromLine
} from "lucide-react";

const PRODUCTS_KEY = "products";
const TRANSACTIONS_KEY = "transactions"; // unified log: restock | sale | adjustment

const emptyForm = {
  name: "", sku: "", category: "", quantity: "",
  reorderPoint: "", unitPrice: "", costPrice: "", location: "",
};

function statusOf(p) {
  if (p.quantity <= 0) return "out";
  if (p.quantity <= p.reorderPoint) return "low";
  return "healthy";
}

const STATUS_META = {
  out: { label: "Out of stock", color: "var(--red)", bg: "rgba(229,72,77,0.14)" },
  low: { label: "Reorder", color: "var(--amber)", bg: "rgba(242,169,59,0.14)" },
  healthy: { label: "Healthy", color: "var(--teal)", bg: "rgba(62,207,142,0.14)" },
};

const TX_META = {
  restock: { label: "Stock in", color: "var(--teal)", bg: "rgba(62,207,142,0.14)", sign: "+" },
  sale: { label: "Stock out", color: "var(--amber)", bg: "rgba(242,169,59,0.14)", sign: "-" },
  adjustment: { label: "Adjustment", color: "#8891a0", bg: "rgba(136,145,160,0.14)", sign: "" },
};

function currency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function pct(n) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfWeek() { const d = startOfToday(); d.setDate(d.getDate() - d.getDay()); return d; }
function startOfMonth() { const d = startOfToday(); d.setDate(1); return d; }

export default function StockDashboard() {
  const [products, setProducts] = useState(() => loadJSON(PRODUCTS_KEY, []));
  const [transactions, setTransactions] = useState(() => loadJSON(TRANSACTIONS_KEY, []));
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [saleModalProduct, setSaleModalProduct] = useState(null);
  const [saleQty, setSaleQty] = useState("1");
  const [saleError, setSaleError] = useState("");

  const [restockModalProduct, setRestockModalProduct] = useState(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockCost, setRestockCost] = useState("");
  const [restockError, setRestockError] = useState("");

  const [txTypeFilter, setTxTypeFilter] = useState("All");
  const [txRange, setTxRange] = useState("all");
  const [view, setView] = useState("inventory");

  function persistProducts(next) {
    setProducts(next);
    try {
      window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
      setSaveError("");
    } catch (e) {
      setSaveError("Changes aren't saving right now. They'll be lost on refresh.");
    }
  }

  function persistTransactions(next) {
    setTransactions(next);
    try {
      window.localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(next));
      setSaveError("");
    } catch (e) {
      setSaveError("Changes aren't saving right now. They'll be lost on refresh.");
    }
  }

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "All" || p.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || statusOf(p) === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
    list.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const stats = useMemo(() => {
    const totalUnits = products.reduce((s, p) => s + Number(p.quantity), 0);
    const totalValue = products.reduce((s, p) => s + Number(p.quantity) * Number(p.unitPrice), 0);
    const totalCostValue = products.reduce((s, p) => s + Number(p.quantity) * Number(p.costPrice || 0), 0);
    const low = products.filter((p) => statusOf(p) === "low").length;
    const out = products.filter((p) => statusOf(p) === "out").length;
    const potentialMargin = totalValue > 0 ? (totalValue - totalCostValue) / totalValue : NaN;
    return { skus: products.length, totalUnits, totalValue, totalCostValue, low, out, potentialMargin };
  }, [products]);

  const criticalItems = useMemo(
    () => products.filter((p) => statusOf(p) !== "healthy"),
    [products]
  );

  const txInRange = useMemo(() => {
    let cutoff = null;
    if (txRange === "today") cutoff = startOfToday();
    if (txRange === "week") cutoff = startOfWeek();
    if (txRange === "month") cutoff = startOfMonth();
    let list = transactions.filter((t) => (!cutoff || new Date(t.date) >= cutoff) && (txTypeFilter === "All" || t.type === txTypeFilter));
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, txRange, txTypeFilter]);

  const salesStats = useMemo(() => {
    const sales = txInRange.filter((t) => t.type === "sale");
    const units = sales.reduce((s, x) => s + x.quantity, 0);
    const revenue = sales.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
    const cogs = sales.reduce((s, x) => s + x.quantity * (x.unitCostAtSale || 0), 0);
    const profit = revenue - cogs;
    const restockSpend = txInRange.filter((t) => t.type === "restock").reduce((s, x) => s + x.quantity * x.unitCost, 0);
    return {
      units, revenue, cogs, profit,
      margin: revenue > 0 ? profit / revenue : NaN,
      restockSpend,
      count: sales.length,
    };
  }, [txInRange]);

  function openAdd() {
    setForm(emptyForm); setEditingId(null); setFormError(""); setModalOpen(true);
  }

  function openEdit(p) {
    setForm({
      name: p.name, sku: p.sku, category: p.category,
      quantity: String(p.quantity), reorderPoint: String(p.reorderPoint),
      unitPrice: String(p.unitPrice), costPrice: String(p.costPrice ?? ""), location: p.location || "",
    });
    setEditingId(p.id); setFormError(""); setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setFormError(""); }

  function submitForm(e) {
    e.preventDefault();
    const name = form.name.trim();
    const sku = form.sku.trim();
    const quantity = Number(form.quantity);
    const reorderPoint = Number(form.reorderPoint);
    const unitPrice = Number(form.unitPrice);
    const costPrice = form.costPrice === "" ? 0 : Number(form.costPrice);

    if (!name || !sku) { setFormError("Item name and SKU are required."); return; }
    if (form.quantity === "" || quantity < 0) { setFormError("Enter a valid quantity (0 or more)."); return; }
    if (form.reorderPoint === "" || reorderPoint < 0) { setFormError("Enter a valid reorder point (0 or more)."); return; }
    if (form.unitPrice === "" || unitPrice < 0) { setFormError("Enter a valid sell price (0 or more)."); return; }
    if (costPrice < 0) { setFormError("Enter a valid cost price (0 or more)."); return; }

    const dupe = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== editingId);
    if (dupe) { setFormError(`SKU "${sku}" is already used by ${dupe.name}.`); return; }

    if (editingId) {
      const next = products.map((p) =>
        p.id === editingId
          ? { ...p, name, sku, category: form.category.trim() || "Uncategorized", quantity, reorderPoint, unitPrice, costPrice, location: form.location.trim() }
          : p
      );
      persistProducts(next);
    } else {
      const next = [...products, {
        id: crypto.randomUUID(), name, sku, category: form.category.trim() || "Uncategorized",
        quantity, reorderPoint, unitPrice, costPrice, location: form.location.trim(),
      }];
      persistProducts(next);
    }
    setModalOpen(false);
  }

  // Quick +/- stays for minor corrections (damaged, miscount) — logged as an adjustment, no cost impact.
  function adjustQty(id, delta) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const newQty = Math.max(0, Number(product.quantity) + delta);
    const actualDelta = newQty - product.quantity;
    if (actualDelta === 0) return;
    const next = products.map((p) => (p.id === id ? { ...p, quantity: newQty } : p));
    persistProducts(next);
    persistTransactions([...transactions, {
      id: crypto.randomUUID(), productId: id, productName: product.name, sku: product.sku,
      type: "adjustment", quantity: actualDelta, date: new Date().toISOString(),
      note: "Manual quantity adjustment",
    }]);
  }

  function deleteProduct(id) {
    persistProducts(products.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
  }

  // ---- Stock IN (restock) ----
  function openRestockModal(p) {
    setRestockModalProduct(p); setRestockQty(""); setRestockCost(String(p.costPrice ?? "")); setRestockError("");
  }

  function submitRestock(e) {
    e.preventDefault();
    const qty = Number(restockQty);
    const unitCost = restockCost === "" ? 0 : Number(restockCost);
    if (!restockQty || qty <= 0) { setRestockError("Enter a quantity greater than 0."); return; }
    if (unitCost < 0) { setRestockError("Enter a valid cost (0 or more)."); return; }

    const p = restockModalProduct;
    const oldQty = Number(p.quantity);
    const oldCost = Number(p.costPrice || 0);
    // Weighted average cost across old stock + incoming stock.
    const newQty = oldQty + qty;
    const newCostPrice = newQty > 0 ? ((oldQty * oldCost) + (qty * unitCost)) / newQty : unitCost;

    const nextProducts = products.map((prod) =>
      prod.id === p.id ? { ...prod, quantity: newQty, costPrice: newCostPrice } : prod
    );
    persistProducts(nextProducts);
    persistTransactions([...transactions, {
      id: crypto.randomUUID(), productId: p.id, productName: p.name, sku: p.sku,
      type: "restock", quantity: qty, unitCost, date: new Date().toISOString(),
    }]);
    setRestockModalProduct(null);
  }

  // ---- Stock OUT (sale) ----
  function openSaleModal(p) {
    setSaleModalProduct(p); setSaleQty("1"); setSaleError("");
  }

  function submitSale(e) {
    e.preventDefault();
    const qty = Number(saleQty);
    if (!saleQty || qty <= 0) { setSaleError("Enter a quantity greater than 0."); return; }
    if (qty > saleModalProduct.quantity) { setSaleError(`Only ${saleModalProduct.quantity} in stock.`); return; }

    const nextProducts = products.map((p) =>
      p.id === saleModalProduct.id ? { ...p, quantity: p.quantity - qty } : p
    );
    persistProducts(nextProducts);

    const saleRecord = {
      id: crypto.randomUUID(),
      productId: saleModalProduct.id,
      productName: saleModalProduct.name,
      sku: saleModalProduct.sku,
      type: "sale",
      quantity: qty,
      unitPrice: saleModalProduct.unitPrice,
      unitCostAtSale: Number(saleModalProduct.costPrice || 0), // lock in cost at time of sale for accurate margin history
      date: new Date().toISOString(),
    };
    persistTransactions([...transactions, saleRecord]);
    setSaleModalProduct(null);
  }

  function undoTransaction(tx) {
    const product = products.find((p) => p.id === tx.productId);
    if (!product) { persistTransactions(transactions.filter((t) => t.id !== tx.id)); return; }
    let nextQty = product.quantity;
    if (tx.type === "sale") nextQty += tx.quantity;
    if (tx.type === "restock") nextQty -= tx.quantity;
    if (tx.type === "adjustment") nextQty -= tx.quantity;
    nextQty = Math.max(0, nextQty);
    const nextProducts = products.map((p) => (p.id === tx.productId ? { ...p, quantity: nextQty } : p));
    persistProducts(nextProducts);
    persistTransactions(transactions.filter((t) => t.id !== tx.id));
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <div className="stock-dash">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .stock-dash {
          --bg: #12151b; --surface: #1a1f28; --surface-2: #212836; --border: #2c3444;
          --text: #e8eaed; --text-muted: #8891a0; --amber: #f2a93b; --red: #e5484d; --teal: #3ecf8e;
          font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text);
          min-height: 100%; padding: 24px; border-radius: 8px; box-sizing: border-box;
        }
        .stock-dash * { box-sizing: border-box; }
        .sd-mono { font-family: 'IBM Plex Mono', monospace; }
        .sd-display { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }

        .sd-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .sd-title { display: flex; align-items: center; gap: 10px; }
        .sd-title h1 { font-size: 22px; font-weight: 700; margin: 0; }
        .sd-title .sub { color: var(--text-muted); font-size: 12px; margin-top: 2px; letter-spacing: 0.06em; }

        .sd-add-btn {
          display: flex; align-items: center; gap: 6px; background: var(--amber); color: #14161c; border: none;
          font-family: 'Oswald', sans-serif; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
          font-size: 13px; padding: 10px 16px; border-radius: 6px; cursor: pointer; transition: filter 0.15s ease;
        }
        .sd-add-btn:hover { filter: brightness(1.08); }
        .sd-add-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

        .sd-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
        .sd-tab {
          background: transparent; border: none; color: var(--text-muted); padding: 10px 16px;
          font-family: 'Oswald', sans-serif; text-transform: uppercase; font-size: 13px; letter-spacing: 0.04em;
          cursor: pointer; border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 6px;
        }
        .sd-tab.active { color: var(--amber); border-bottom-color: var(--amber); }
        .sd-tab:hover:not(.active) { color: var(--text); }

        .sd-ticker { background: #000; border: 1px solid #2a2000; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; overflow: hidden; }
        .sd-ticker-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); flex-shrink: 0; animation: sd-blink 1.4s ease-in-out infinite; }
        .sd-ticker-track { overflow: hidden; flex: 1; white-space: nowrap; }
        .sd-ticker-inner { display: inline-block; font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--amber); letter-spacing: 0.03em; animation: sd-scroll 22s linear infinite; }
        .sd-ticker-ok { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--teal); }
        @keyframes sd-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes sd-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .sd-ticker-inner { animation: none; } .sd-ticker-dot { animation: none; } }

        .sd-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .sd-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
        .sd-stat .val { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; }
        .sd-stat .lbl { color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }

        .sd-toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .sd-search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; flex: 1; min-width: 180px; }
        .sd-search input { background: transparent; border: none; outline: none; color: var(--text); font-size: 14px; width: 100%; }
        .sd-search input::placeholder { color: var(--text-muted); }
        .sd-select { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 8px 10px; font-size: 13px; cursor: pointer; }

        .sd-table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; overflow-x: auto; }
        table.sd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sd-table th { text-align: left; padding: 10px 12px; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; white-space: nowrap; }
        .sd-table th:hover { color: var(--text); }
        .sd-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .sd-table tr:last-child td { border-bottom: none; }
        .sd-table tr:hover td { background: rgba(255,255,255,0.02); }

        .sd-gauge-wrap { display: flex; align-items: center; gap: 8px; min-width: 130px; }
        .sd-gauge { flex: 1; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
        .sd-gauge-fill { height: 100%; border-radius: 3px; }

        .sd-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }

        .sd-qty-controls { display: flex; align-items: center; gap: 6px; }
        .sd-qty-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .sd-qty-btn:hover { border-color: var(--amber); }
        .sd-qty-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 1px; }

        .sd-icon-btn { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; }
        .sd-icon-btn:hover { color: var(--text); background: var(--surface-2); }
        .sd-icon-btn.danger:hover { color: var(--red); }
        .sd-icon-btn.sale:hover { color: var(--amber); }
        .sd-icon-btn.restock:hover { color: var(--teal); }
        .sd-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .sd-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .sd-empty h3 { color: var(--text); font-family: 'Oswald', sans-serif; text-transform: uppercase; margin: 12px 0 6px; }

        .sd-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
        .sd-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 22px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; }
        .sd-modal h2 { font-family: 'Oswald', sans-serif; text-transform: uppercase; font-size: 18px; margin: 0 0 16px; }
        .sd-field { margin-bottom: 12px; }
        .sd-field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .sd-field input { width: 100%; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 8px 10px; font-size: 14px; }
        .sd-field input:focus { outline: 2px solid var(--amber); outline-offset: 1px; border-color: var(--amber); }
        .sd-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .sd-form-error { background: rgba(229,72,77,0.12); color: var(--red); border: 1px solid rgba(229,72,77,0.3); padding: 8px 10px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
        .sd-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        .sd-btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .sd-btn-primary { background: var(--amber); border: none; color: #14161c; font-weight: 600; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }

        .sd-confirm { position: absolute; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px; z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .sd-save-error { background: rgba(229,72,77,0.12); color: var(--red); border: 1px solid rgba(229,72,77,0.3); padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }

        .sd-sale-summary { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
        .sd-sale-summary .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .sd-sale-summary .row:last-child { margin-bottom: 0; font-weight: 600; color: var(--teal); }

        .sd-range-tabs { display: flex; gap: 4px; }
        .sd-range-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .sd-range-btn.active { background: var(--surface-2); color: var(--amber); border-color: var(--amber); }

        .sd-cost-hint { font-size: 11px; color: var(--text-muted); margin-top: -6px; margin-bottom: 12px; }
      `}</style>

      <div className="sd-header">
        <div className="sd-title">
          <Boxes size={26} color="var(--amber)" />
          <div>
            <h1 className="sd-display">Stock Control</h1>
            <div className="sub sd-mono">{products.length} item{products.length === 1 ? "" : "s"} tracked</div>
          </div>
        </div>
        <button className="sd-add-btn" onClick={openAdd}><Plus size={16} /> Add Item</button>
      </div>

      {saveError && <div className="sd-save-error">{saveError}</div>}

      <div className="sd-tabs">
        <button className={`sd-tab ${view === "inventory" ? "active" : ""}`} onClick={() => setView("inventory")}>
          <Package size={14} /> Inventory
        </button>
        <button className={`sd-tab ${view === "activity" ? "active" : ""}`} onClick={() => setView("activity")}>
          <TrendingUp size={14} /> Activity &amp; Margin
        </button>
      </div>

      {view === "inventory" && (
        <>
          {criticalItems.length > 0 && (
            <div className="sd-ticker">
              <span className="sd-ticker-dot" aria-hidden="true" />
              <div className="sd-ticker-track">
                <div className="sd-ticker-inner">
                  {Array(2).fill(criticalItems.map((p) =>
                    `${statusOf(p) === "out" ? "OUT OF STOCK" : "REORDER"}: ${p.name} (${p.sku}) — ${p.quantity} units`
                  ).join("   //   ")).join("   //   ")}
                </div>
              </div>
            </div>
          )}
          {criticalItems.length === 0 && products.length > 0 && (
            <div className="sd-ticker">
              <CircleCheck size={16} color="var(--teal)" />
              <span className="sd-ticker-ok">All items are above their reorder point.</span>
            </div>
          )}

          <div className="sd-stats">
            <div className="sd-stat"><div className="val sd-mono">{stats.skus}</div><div className="lbl">SKUs</div></div>
            <div className="sd-stat"><div className="val sd-mono">{stats.totalUnits}</div><div className="lbl">Total units</div></div>
            <div className="sd-stat"><div className="val sd-mono">{currency(stats.totalValue)}</div><div className="lbl">Inventory value (retail)</div></div>
            <div className="sd-stat"><div className="val sd-mono">{currency(stats.totalCostValue)}</div><div className="lbl">Inventory value (cost)</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: "var(--teal)" }}>{pct(stats.potentialMargin)}</div><div className="lbl">Potential margin</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: "var(--amber)" }}>{stats.low}</div><div className="lbl">Needs reorder</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: "var(--red)" }}>{stats.out}</div><div className="lbl">Out of stock</div></div>
          </div>

          <div className="sd-toolbar">
            <div className="sd-search">
              <Search size={15} color="#8891a0" />
              <input placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="sd-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="sd-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All statuses</option>
              <option value="healthy">Healthy</option>
              <option value="low">Reorder</option>
              <option value="out">Out of stock</option>
            </select>
          </div>

          {products.length === 0 ? (
            <div className="sd-empty">
              <Package size={40} color="#8891a0" />
              <h3>No items yet</h3>
              <p>Add your first item to start tracking stock levels.</p>
              <button className="sd-add-btn" style={{ margin: "10px auto 0" }} onClick={openAdd}><Plus size={16} /> Add Item</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sd-empty">
              <Search size={32} color="#8891a0" />
              <h3>No matches</h3>
              <p>Try a different search or filter.</p>
            </div>
          ) : (
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead>
                  <tr>
                    <SortTh label="Item" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="SKU" k="sku" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="Category" k="category" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="Stock" k="quantity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <th>Status</th>
                    <SortTh label="Cost" k="costPrice" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortTh label="Sell" k="unitPrice" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <th>Margin</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const status = statusOf(p);
                    const meta = STATUS_META[status];
                    const max = Math.max(p.reorderPoint * 2, p.quantity, 1);
                    const gaugePct = Math.min(100, (p.quantity / max) * 100);
                    const cost = Number(p.costPrice || 0);
                    const marginPct = p.unitPrice > 0 ? (p.unitPrice - cost) / p.unitPrice : NaN;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          {p.location && <div className="sd-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.location}</div>}
                        </td>
                        <td className="sd-mono" style={{ color: "var(--text-muted)" }}>{p.sku}</td>
                        <td>{p.category}</td>
                        <td>
                          <div className="sd-qty-controls">
                            <button className="sd-qty-btn" onClick={() => adjustQty(p.id, -1)} aria-label={`Decrease ${p.name} quantity`}><ChevronDown size={13} /></button>
                            <span className="sd-mono" style={{ minWidth: 28, textAlign: "center" }}>{p.quantity}</span>
                            <button className="sd-qty-btn" onClick={() => adjustQty(p.id, 1)} aria-label={`Increase ${p.name} quantity`}><ChevronUp size={13} /></button>
                          </div>
                          <div className="sd-gauge-wrap" style={{ marginTop: 6 }}>
                            <div className="sd-gauge"><div className="sd-gauge-fill" style={{ width: `${gaugePct}%`, background: meta.color }} /></div>
                          </div>
                        </td>
                        <td>
                          <span className="sd-badge" style={{ color: meta.color, background: meta.bg }}>
                            {status === "out" && <AlertTriangle size={11} />}
                            {status === "low" && <CircleAlert size={11} />}
                            {status === "healthy" && <CircleCheck size={11} />}
                            {meta.label}
                          </span>
                        </td>
                        <td className="sd-mono" style={{ color: "var(--text-muted)" }}>{currency(cost)}</td>
                        <td className="sd-mono">{currency(p.unitPrice)}</td>
                        <td className="sd-mono" style={{ color: !isFinite(marginPct) ? "var(--text-muted)" : marginPct < 0 ? "var(--red)" : "var(--teal)" }}>
                          {pct(marginPct)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 2, position: "relative" }}>
                            <button className="sd-icon-btn restock" onClick={() => openRestockModal(p)} aria-label={`Restock ${p.name}`} title="Stock in (restock)"><ArrowDownToLine size={14} /></button>
                            <button className="sd-icon-btn sale" onClick={() => openSaleModal(p)} aria-label={`Record sale of ${p.name}`} disabled={p.quantity <= 0} title="Stock out (sale)"><ArrowUpFromLine size={14} /></button>
                            <button className="sd-icon-btn" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}><Pencil size={14} /></button>
                            <button className="sd-icon-btn danger" onClick={() => setConfirmDeleteId(p.id)} aria-label={`Delete ${p.name}`}><Trash2 size={14} /></button>
                            {confirmDeleteId === p.id && (
                              <div className="sd-confirm" style={{ right: 0, top: 28 }}>
                                <div style={{ fontSize: 12, marginBottom: 8, whiteSpace: "nowrap" }}>Delete "{p.name}"?</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button className="sd-btn-secondary" style={{ padding: "4px 10px" }} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                                  <button className="sd-btn-primary" style={{ padding: "4px 10px", background: "var(--red)" }} onClick={() => deleteProduct(p.id)}>Delete</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === "activity" && (
        <>
          <div className="sd-toolbar" style={{ justifyContent: "space-between" }}>
            <div className="sd-range-tabs">
              {[["all", "All time"], ["today", "Today"], ["week", "This week"], ["month", "This month"]].map(([k, label]) => (
                <button key={k} className={`sd-range-btn ${txRange === k ? "active" : ""}`} onClick={() => setTxRange(k)}>{label}</button>
              ))}
            </div>
            <select className="sd-select" value={txTypeFilter} onChange={(e) => setTxTypeFilter(e.target.value)}>
              <option value="All">All types</option>
              <option value="sale">Stock out (sales)</option>
              <option value="restock">Stock in (restocks)</option>
              <option value="adjustment">Adjustments</option>
            </select>
          </div>

          <div className="sd-stats">
            <div className="sd-stat"><div className="val sd-mono">{salesStats.count}</div><div className="lbl">Sales logged</div></div>
            <div className="sd-stat"><div className="val sd-mono">{salesStats.units}</div><div className="lbl">Units sold</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: "var(--teal)" }}>{currency(salesStats.revenue)}</div><div className="lbl">Revenue</div></div>
            <div className="sd-stat"><div className="val sd-mono">{currency(salesStats.cogs)}</div><div className="lbl">Cost of goods sold</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: salesStats.profit < 0 ? "var(--red)" : "var(--teal)" }}>{currency(salesStats.profit)}</div><div className="lbl">Gross profit</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: !isFinite(salesStats.margin) ? "var(--text-muted)" : salesStats.margin < 0 ? "var(--red)" : "var(--teal)" }}>{pct(salesStats.margin)}</div><div className="lbl">Margin</div></div>
            <div className="sd-stat"><div className="val sd-mono" style={{ color: "var(--amber)" }}>{currency(salesStats.restockSpend)}</div><div className="lbl">Restock spend</div></div>
          </div>

          {txInRange.length === 0 ? (
            <div className="sd-empty">
              <ShoppingCart size={36} color="#8891a0" />
              <h3>No activity in this range</h3>
              <p>Use the arrow icons next to an item in Inventory to log stock in or stock out.</p>
            </div>
          ) : (
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Item</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Total</th><th>Profit</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {txInRange.map((t) => {
                    const meta = TX_META[t.type];
                    const isSale = t.type === "sale";
                    const isRestock = t.type === "restock";
                    const unit = isSale ? t.unitPrice : isRestock ? t.unitCost : null;
                    const total = isSale ? t.quantity * t.unitPrice : isRestock ? t.quantity * t.unitCost : null;
                    const profit = isSale ? (t.unitPrice - (t.unitCostAtSale || 0)) * t.quantity : null;
                    return (
                      <tr key={t.id}>
                        <td className="sd-mono" style={{ color: "var(--text-muted)" }}>{new Date(t.date).toLocaleString()}</td>
                        <td><span className="sd-badge" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span></td>
                        <td style={{ fontWeight: 600 }}>{t.productName}</td>
                        <td className="sd-mono" style={{ color: "var(--text-muted)" }}>{t.sku}</td>
                        <td className="sd-mono">{meta.sign}{t.quantity}</td>
                        <td className="sd-mono">{unit != null ? currency(unit) : "—"}</td>
                        <td className="sd-mono">{total != null ? currency(total) : "—"}</td>
                        <td className="sd-mono" style={{ color: profit == null ? "var(--text-muted)" : profit < 0 ? "var(--red)" : "var(--teal)" }}>
                          {profit != null ? currency(profit) : "—"}
                        </td>
                        <td>
                          <button className="sd-icon-btn danger" onClick={() => undoTransaction(t)} title="Undo (reverses stock change)"><X size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <div className="sd-modal-overlay" onClick={closeModal}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit item" : "Add item"}</h2>
            {formError && <div className="sd-form-error">{formError}</div>}
            <form onSubmit={submitForm}>
              <div className="sd-field">
                <label htmlFor="sd-name">Item name</label>
                <input id="sd-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Steel Bolt M6" />
              </div>
              <div className="sd-field-row">
                <div className="sd-field">
                  <label htmlFor="sd-sku">SKU</label>
                  <input id="sd-sku" className="sd-mono" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SB-M6-01" />
                </div>
                <div className="sd-field">
                  <label htmlFor="sd-cat">Category</label>
                  <input id="sd-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Hardware" />
                </div>
              </div>
              <div className="sd-field-row">
                <div className="sd-field">
                  <label htmlFor="sd-qty">Quantity on hand</label>
                  <input id="sd-qty" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
                </div>
                <div className="sd-field">
                  <label htmlFor="sd-reorder">Reorder point</label>
                  <input id="sd-reorder" type="number" min="0" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="sd-field-row">
                <div className="sd-field">
                  <label htmlFor="sd-cost">Cost price</label>
                  <input id="sd-cost" type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} placeholder="0.00" />
                </div>
                <div className="sd-field">
                  <label htmlFor="sd-price">Sell price</label>
                  <input id="sd-price" type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="sd-cost-hint">Once stock is moving, cost price is auto-updated (weighted average) whenever you restock — you won't usually need to edit it here after that.</div>
              <div className="sd-field">
                <label htmlFor="sd-loc">Location (optional)</label>
                <input id="sd-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Aisle 3, Bin 4" />
              </div>
              <div className="sd-modal-actions">
                <button type="button" className="sd-btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="sd-btn-primary">{editingId ? "Save changes" : "Add item"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restockModalProduct && (
        <div className="sd-modal-overlay" onClick={() => setRestockModalProduct(null)}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Stock in — restock</h2>
            {restockError && <div className="sd-form-error">{restockError}</div>}
            <div className="sd-sale-summary">
              <div className="row"><span>{restockModalProduct.name}</span><span className="sd-mono">{restockModalProduct.quantity} in stock</span></div>
              <div className="row" style={{ color: "var(--text-muted)", fontWeight: 400 }}><span>Current avg. cost</span><span className="sd-mono">{currency(restockModalProduct.costPrice || 0)}</span></div>
            </div>
            <form onSubmit={submitRestock}>
              <div className="sd-field-row">
                <div className="sd-field">
                  <label htmlFor="sd-restock-qty">Quantity received</label>
                  <input id="sd-restock-qty" type="number" min="1" value={restockQty} onChange={(e) => setRestockQty(e.target.value)} autoFocus />
                </div>
                <div className="sd-field">
                  <label htmlFor="sd-restock-cost">Cost per unit</label>
                  <input id="sd-restock-cost" type="number" min="0" step="0.01" value={restockCost} onChange={(e) => setRestockCost(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="sd-cost-hint">
                {restockQty && restockCost !== "" ? (() => {
                  const oldQty = Number(restockModalProduct.quantity);
                  const oldCost = Number(restockModalProduct.costPrice || 0);
                  const qty = Number(restockQty) || 0;
                  const unitCost = Number(restockCost) || 0;
                  const newQty = oldQty + qty;
                  const newCost = newQty > 0 ? ((oldQty * oldCost) + (qty * unitCost)) / newQty : unitCost;
                  return `New weighted average cost will be ${currency(newCost)} across ${newQty} units.`;
                })() : "Enter quantity and cost to preview the new average cost."}
              </div>
              <div className="sd-modal-actions">
                <button type="button" className="sd-btn-secondary" onClick={() => setRestockModalProduct(null)}>Cancel</button>
                <button type="submit" className="sd-btn-primary">Add stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {saleModalProduct && (
        <div className="sd-modal-overlay" onClick={() => setSaleModalProduct(null)}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Stock out — sale</h2>
            {saleError && <div className="sd-form-error">{saleError}</div>}
            <div className="sd-sale-summary">
              <div className="row"><span>{saleModalProduct.name}</span><span className="sd-mono">{saleModalProduct.quantity} in stock</span></div>
            </div>
            <form onSubmit={submitSale}>
              <div className="sd-field">
                <label htmlFor="sd-sale-qty">Quantity sold</label>
                <input id="sd-sale-qty" type="number" min="1" max={saleModalProduct.quantity} value={saleQty} onChange={(e) => setSaleQty(e.target.value)} autoFocus />
              </div>
              <div className="sd-sale-summary">
                <div className="row"><span>Sell price</span><span className="sd-mono">{currency(saleModalProduct.unitPrice)}</span></div>
                <div className="row" style={{ color: "var(--text-muted)", fontWeight: 400 }}><span>Cost price</span><span className="sd-mono">{currency(saleModalProduct.costPrice || 0)}</span></div>
                <div className="row"><span>Profit</span><span className="sd-mono">{currency(((Number(saleQty) || 0)) * (saleModalProduct.unitPrice - Number(saleModalProduct.costPrice || 0)))}</span></div>
              </div>
              <div className="sd-modal-actions">
                <button type="button" className="sd-btn-secondary" onClick={() => setSaleModalProduct(null)}>Cancel</button>
                <button type="submit" className="sd-btn-primary">Record sale</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SortTh({ label, k, sortKey, sortDir, onClick }) {
  const active = sortKey === k;
  return (<th onClick={() => onClick(k)}>{label} {active && (sortDir === "asc" ? "↑" : "↓")}</th>);
}
