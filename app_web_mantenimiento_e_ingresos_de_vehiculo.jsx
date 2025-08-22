import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { Plus, Trash2, Edit2, Download, Car, Wrench, Receipt, Wallet, Calendar, Fuel, Gauge, AlertTriangle } from "lucide-react";

// ===================== Utilidades =====================
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const parseISO = (s) => new Date(`${s}T00:00:00`);

const CRC = new Intl.NumberFormat(undefined, { style: "currency", currency: "CRC", maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtMoney = (n, currency) => (currency === "USD" ? USD : CRC).format(Number(n || 0));

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (typeof initial === "function" ? initial() : initial);
    } catch {
      return typeof initial === "function" ? initial() : initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState];
}

// ===================== Modelos =====================
/** Vehículo */
// id, nombre, placa, marca, modelo, año, combustible, odometro, serviceIntervalKm, serviceIntervalDays, lastServiceKm, lastServiceDate

/** Movimiento */
// id, vehicleId, type: 'income'|'maintenance'|'repair'|'expense', date: 'YYYY-MM-DD', amount, odometer, category, note

const DEFAULT_VEHICLE = () => ({
  id: uid(),
  nombre: "Mi vehículo",
  placa: "",
  marca: "",
  modelo: "",
  anio: "",
  combustible: "Gasolina",
  odometro: 0,
  serviceIntervalKm: 5000,
  serviceIntervalDays: 180,
  lastServiceKm: 0,
  lastServiceDate: todayISO(),
});

const CATEGORY_OPTIONS = {
  maintenance: [
    "Cambio de aceite",
    "Filtro de aceite",
    "Filtro de aire",
    "Bujías",
    "Líquido de frenos",
    "Alineación y balanceo",
    "Batería",
    "Revisión general",
  ],
  repair: [
    "Frenos",
    "Suspensión",
    "Dirección",
    "Enfriamiento",
    "Transmisión",
    "Motor",
    "Eléctrico",
    "Llantas",
  ],
  expense: ["Peajes", "Parqueo", "Lavado", "Seguro", "Marchamo", "Revisión técnica", "Otros"],
};

const COLOR_PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];

// ===================== Componente principal =====================
export default function VehicleMaintenanceApp() {
  const [currency, setCurrency] = useLocalState("vmgr.currency", "CRC");
  const [vehicles, setVehicles] = useLocalState("vmgr.vehicles", [DEFAULT_VEHICLE()]);
  const [activeVehicleId, setActiveVehicleId] = useLocalState("vmgr.activeVehicleId", vehicles[0]?.id || "");
  const [records, setRecords] = useLocalState("vmgr.records", []);
  const [month, setMonth] = useLocalState("vmgr.month", monthKey());
  const [ui, setUi] = useState({ editingId: null, tab: "captura" });

  useEffect(() => {
    if (!vehicles.find(v => v.id === activeVehicleId) && vehicles.length) {
      setActiveVehicleId(vehicles[0].id);
    }
  }, [vehicles, activeVehicleId, setActiveVehicleId]);

  const vehicle = vehicles.find(v => v.id === activeVehicleId);
  const monthStart = useMemo(() => parseISO(`${month}-01`), [month]);
  const monthEnd = useMemo(() => new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0), [monthStart]);

  const monthRecords = useMemo(() => records
    .filter(r => r.vehicleId === activeVehicleId)
    .filter(r => {
      const d = parseISO(r.date);
      return d >= monthStart && d <= monthEnd;
    })
    .sort((a, b) => a.date.localeCompare(b.date)), [records, activeVehicleId, monthStart, monthEnd]);

  const totals = useMemo(() => {
    const inc = monthRecords.filter(r => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const egMant = monthRecords.filter(r => r.type === "maintenance" || r.type === "repair" || r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
    return { ingresos: inc, egresos: egMant, neto: inc - egMant };
  }, [monthRecords]);

  const nextService = useMemo(() => {
    if (!vehicle) return null;
    const kmRest = vehicle.serviceIntervalKm - Math.max(0, vehicle.odometro - vehicle.lastServiceKm);
    const daysFromLast = Math.floor((parseISO(todayISO()) - parseISO(vehicle.lastServiceDate)) / (1000*60*60*24));
    const daysRest = vehicle.serviceIntervalDays - daysFromLast;
    return { kmRest, daysRest };
  }, [vehicle]);

  const byCategory = useMemo(() => {
    const map = new Map();
    monthRecords.filter(r => r.type !== "income").forEach(r => {
      const key = r.category || "Otros";
      map.set(key, (map.get(key) || 0) + Number(r.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [monthRecords]);

  const monthlySeries = useMemo(() => {
    // Agrupa por mes (12 últimos incluyendo el actual)
    const series = [];
    const base = parseISO(`${month}-01`);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const mk = monthKey(d);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const rr = records.filter(r => r.vehicleId === activeVehicleId).filter(r => {
        const rd = parseISO(r.date);
        return rd >= start && rd <= end;
      });
      const ingresos = rr.filter(r => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
      const egresos = rr.filter(r => r.type !== "income").reduce((s, r) => s + Number(r.amount), 0);
      series.push({ mes: mk, ingresos, egresos, neto: ingresos - egresos });
    }
    return series;
  }, [records, activeVehicleId, month]);

  function addVehicle(v) {
    setVehicles(prev => [...prev, v]);
    setActiveVehicleId(v.id);
  }

  function updateVehicle(patch) {
    setVehicles(prev => prev.map(v => (v.id === activeVehicleId ? { ...v, ...patch } : v)));
  }

  function upsertRecord(data) {
    if (ui.editingId) {
      setRecords(prev => prev.map(r => (r.id === ui.editingId ? { ...r, ...data } : r)));
      setUi(s => ({ ...s, editingId: null }));
    } else {
      setRecords(prev => [...prev, { id: uid(), vehicleId: activeVehicleId, ...data }]);
    }
  }

  function onEditRecord(id) {
    setUi(s => ({ ...s, editingId: id }));
  }

  function onDeleteRecord(id) {
    if (confirm("¿Eliminar este registro?")) {
      setRecords(prev => prev.filter(r => r.id !== id));
    }
  }

  function exportCSV() {
    const header = [
      "id,vehiculo,tipo,fecha,monto,odometro,categoria,nota",
    ];
    const rows = records.filter(r => r.vehicleId === activeVehicleId).map(r => [
      r.id,
      r.vehicleId,
      r.type,
      r.date,
      r.amount,
      r.odometer || "",
      (r.category || ""),
      (r.note || "").replace(/\n/g, " ")
    ].join(","));
    const csv = [...header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehiculo_${vehicle?.placa || vehicle?.nombre || "sin_nombre"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const editing = ui.editingId ? records.find(r => r.id === ui.editingId) : null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Car className="w-6 h-6" />
          <h1 className="text-xl font-semibold">Gestor de Mantenimiento e Ingresos</h1>
          <div className="ml-auto flex items-center gap-2">
            <select className="border rounded-md px-2 py-1" value={activeVehicleId} onChange={e => setActiveVehicleId(e.target.value)}>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.nombre || v.placa || v.id}</option>
              ))}
            </select>
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border hover:bg-gray-50" onClick={() => addVehicle({ ...DEFAULT_VEHICLE(), nombre: `Vehículo ${vehicles.length + 1}` })}>
              <Plus className="w-4 h-4" /> Nuevo vehículo
            </button>
            <select className="border rounded-md px-2 py-1" value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="CRC">CRC ₡</option>
              <option value="USD">USD $</option>
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Datos del vehículo */}
        {vehicle && (
          <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Datos del vehículo</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <LabeledInput label="Nombre" value={vehicle.nombre} onChange={v => updateVehicle({ nombre: v })} />
              <LabeledInput label="Placa" value={vehicle.placa} onChange={v => updateVehicle({ placa: v })} />
              <LabeledInput label="Marca" value={vehicle.marca} onChange={v => updateVehicle({ marca: v })} />
              <LabeledInput label="Modelo" value={vehicle.modelo} onChange={v => updateVehicle({ modelo: v })} />
              <LabeledInput label="Año" value={vehicle.anio} onChange={v => updateVehicle({ anio: v })} type="number" />
              <LabeledSelect label="Combustible" value={vehicle.combustible} onChange={v => updateVehicle({ combustible: v })} options={["Gasolina", "Diésel", "Híbrido", "Eléctrico"]} />
              <LabeledInput label="Odómetro (km)" value={vehicle.odometro} onChange={v => updateVehicle({ odometro: Number(v) || 0 })} type="number" />
              <LabeledInput label="Intervalo servicio (km)" value={vehicle.serviceIntervalKm} onChange={v => updateVehicle({ serviceIntervalKm: Number(v) || 0 })} type="number" />
              <LabeledInput label="Intervalo servicio (días)" value={vehicle.serviceIntervalDays} onChange={v => updateVehicle({ serviceIntervalDays: Number(v) || 0 })} type="number" />
              <LabeledInput label="Último servicio a (km)" value={vehicle.lastServiceKm} onChange={v => updateVehicle({ lastServiceKm: Number(v) || 0 })} type="number" />
              <LabeledInput label="Fecha último servicio" value={vehicle.lastServiceDate} onChange={v => updateVehicle({ lastServiceDate: v })} type="date" />
            </div>
            {nextService && (
              <div className="mt-3 p-3 rounded-xl border bg-gray-50 flex items-center gap-3">
                <AlertTriangle className={`w-5 h-5 ${nextService.kmRest <= 0 || nextService.daysRest <= 0 ? "text-red-600" : nextService.kmRest < 500 || nextService.daysRest < 7 ? "text-amber-600" : "text-emerald-600"}`} />
                <p className="text-sm">
                  Próximo servicio: <strong>{nextService.kmRest <= 0 ? "¡Vencido por km!" : `${nextService.kmRest.toLocaleString()} km`}</strong> · {" "}
                  <strong>{nextService.daysRest <= 0 ? "¡Vencido por días!" : `${nextService.daysRest} días`}</strong>
                </p>
                <button className="ml-auto text-sm px-3 py-1.5 rounded-md border hover:bg-white" onClick={() => updateVehicle({ lastServiceKm: vehicle.odometro, lastServiceDate: todayISO() })}>
                  Registrar servicio ahora
                </button>
              </div>
            )}
          </motion.section>
        )}

        {/* Resumen mensual */}
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard icon={Wallet} title="Ingresos del mes" value={fmtMoney(totals.ingresos, currency)} />
          <SummaryCard icon={Receipt} title="Egresos del mes" value={fmtMoney(totals.egresos, currency)} />
          <SummaryCard icon={Wrench} title="Neto" value={fmtMoney(totals.neto, currency)} positive={totals.neto >= 0} />
        </motion.section>

        {/* Selector de mes y pestañas */}
        <section className="flex items-center gap-3">
          <label className="text-sm font-medium">Mes</label>
          <input className="border rounded-md px-2 py-1" type="month" value={month} onChange={e => setMonth(e.target.value)} />
          <div className="ml-auto flex gap-2 text-sm">
            <TabButton active={ui.tab === "captura"} onClick={() => setUi(s => ({ ...s, tab: "captura" }))}>Captura</TabButton>
            <TabButton active={ui.tab === "historial"} onClick={() => setUi(s => ({ ...s, tab: "historial" }))}>Historial</TabButton>
            <TabButton active={ui.tab === "analitica"} onClick={() => setUi(s => ({ ...s, tab: "analitica" }))}>Analítica</TabButton>
          </div>
        </section>

        {ui.tab === "captura" && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={editing ? "Editar movimiento" : "Nuevo egreso (mantenimiento/reparación/gasto)"} icon={Wrench}>
              <MovementForm
                key={editing ? editing.id : "new-expense"}
                mode="expense"
                editing={editing}
                onSubmit={(data) => upsertRecord(data)}
                onCancel={() => setUi(s => ({ ...s, editingId: null }))}
                currency={currency}
              />
            </Card>
            <Card title={editing ? "Editar movimiento" : "Nuevo ingreso diario"} icon={Wallet}>
              <MovementForm
                key={editing ? editing.id : "new-income"}
                mode="income"
                editing={editing}
                onSubmit={(data) => upsertRecord(data)}
                onCancel={() => setUi(s => ({ ...s, editingId: null }))}
                currency={currency}
              />
            </Card>
          </motion.section>
        )}

        {ui.tab === "historial" && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Movimientos del mes</h2>
              <button onClick={exportCSV} className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-md border hover:bg-gray-50">
                <Download className="w-4 h-4" /> Exportar CSV
              </button>
            </div>
            <RecordsTable
              records={monthRecords}
              currency={currency}
              onEdit={onEditRecord}
              onDelete={onDeleteRecord}
            />
          </motion.section>
        )}

        {ui.tab === "analitica" && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Ingresos vs egresos (últimos 12 meses)" icon={Calendar}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip formatter={(v) => fmtMoney(v, currency)} />
                    <Legend />
                    <Bar dataKey="ingresos"/>
                    <Bar dataKey="egresos"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip formatter={(v) => fmtMoney(v, currency)} />
                    <Legend />
                    <Line type="monotone" dataKey="neto"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Distribución de egresos por categoría (mes)" icon={Receipt}>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={120}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={COLOR_PALETTE[i % COLOR_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(v, currency)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.section>
        )}

        <footer className="py-8 text-center text-xs text-gray-500">
          Hecho con ♥ — Tus datos se guardan en tu navegador (localStorage).
        </footer>
      </main>
    </div>
  );
}

// ===================== Componentes auxiliares =====================
function Card({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center gap-2 mb-3">
        {Icon ? <Icon className="w-5 h-5" /> : null}
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, positive = true }) {
  return (
    <div className={`rounded-2xl shadow p-4 bg-white border ${positive ? "border-emerald-100" : "border-rose-100"}`}>
      <div className="flex items-center gap-3">
        {Icon ? <Icon className={`w-8 h-8 ${positive ? "text-emerald-600" : "text-rose-600"}`} /> : null}
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-md border ${active ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-100"}`}>
      {children}
    </button>
  );
}

function LabeledInput({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="text-sm">
      <span className="block text-gray-600 mb-1">{label}</span>
      <input
        type={type}
        className="w-full border rounded-md px-3 py-2"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(type === "number" ? e.target.value : e.target.value)}
      />
    </label>
  );
}

function LabeledSelect({ label, value, onChange, options }) {
  return (
    <label className="text-sm">
      <span className="block text-gray-600 mb-1">{label}</span>
      <select className="w-full border rounded-md px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

function MovementForm({ mode, editing, onSubmit, onCancel, currency }) {
  const isIncome = mode === "income";
  const [form, setForm] = useState(() => editing ? {
    type: editing.type,
    date: editing.date,
    amount: editing.amount,
    odometer: editing.odometer || "",
    category: editing.category || (isIncome ? "Ingreso" : "Cambio de aceite"),
    note: editing.note || "",
  } : {
    type: isIncome ? "income" : "maintenance",
    date: todayISO(),
    amount: "",
    odometer: "",
    category: isIncome ? "Ingreso" : "Cambio de aceite",
    note: "",
  });

  useEffect(() => {
    if (editing) {
      setForm({
        type: editing.type,
        date: editing.date,
        amount: editing.amount,
        odometer: editing.odometer || "",
        category: editing.category || (isIncome ? "Ingreso" : "Cambio de aceite"),
        note: editing.note || "",
      });
    }
  }, [editing, isIncome]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || !form.date) return;
    onSubmit({ ...form, amount: Number(form.amount) });
    if (!editing) {
      setForm(f => ({ ...f, amount: "", note: "" }));
    }
  }

  const categoryOptions = isIncome ? ["Ingreso"] : Array.from(new Set([...(CATEGORY_OPTIONS[form.type] || []), form.category || ""])) ;

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {!isIncome && (
        <LabeledSelect label="Tipo de egreso" value={form.type} onChange={(v) => setForm(f => ({ ...f, type: v }))} options={["maintenance", "repair", "expense"]} />
      )}
      <LabeledInput label="Fecha" type="date" value={form.date} onChange={(v) => setForm(f => ({ ...f, date: v }))} />
      <LabeledInput label={`Monto (${currency})`} type="number" value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} />
      {!isIncome && (
        <LabeledInput label="Odómetro (km)" type="number" value={form.odometer} onChange={(v) => setForm(f => ({ ...f, odometer: v }))} />
      )}
      <LabeledSelect label="Categoría" value={form.category} onChange={(v) => setForm(f => ({ ...f, category: v }))} options={categoryOptions} />
      <label className="md:col-span-2 text-sm">
        <span className="block text-gray-600 mb-1">Nota</span>
        <textarea className="w-full border rounded-md px-3 py-2" rows={3} value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
      </label>
      <div className="md:col-span-2 flex items-center gap-2">
        <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-900 text-white hover:bg-black" type="submit">
          <Plus className="w-4 h-4" /> {editing ? "Guardar cambios" : "Agregar"}
        </button>
        {editing && (
          <button type="button" className="px-3 py-2 rounded-md border" onClick={onCancel}>Cancelar</button>
        )}
      </div>
    </form>
  );
}

function RecordsTable({ records, currency, onEdit, onDelete }) {
  if (!records.length) return <p className="text-sm text-gray-500">No hay movimientos en este mes.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b bg-gray-50">
            <th className="py-2 px-2">Fecha</th>
            <th className="py-2 px-2">Tipo</th>
            <th className="py-2 px-2">Categoría</th>
            <th className="py-2 px-2">Odómetro</th>
            <th className="py-2 px-2">Monto</th>
            <th className="py-2 px-2">Nota</th>
            <th className="py-2 px-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b hover:bg-gray-50">
              <td className="py-2 px-2 whitespace-nowrap">{r.date}</td>
              <td className="py-2 px-2 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  r.type === "income" ? "bg-emerald-100 text-emerald-700" :
                  r.type === "maintenance" ? "bg-blue-100 text-blue-700" :
                  r.type === "repair" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-700"
                }`}>{translateType(r.type)}</span>
              </td>
              <td className="py-2 px-2">{r.category || "-"}</td>
              <td className="py-2 px-2">{r.odometer ? `${Number(r.odometer).toLocaleString()} km` : "-"}</td>
              <td className="py-2 px-2 font-medium">{fmtMoney(r.amount, currency)}</td>
              <td className="py-2 px-2 max-w-[28ch] truncate" title={r.note}>{r.note}</td>
              <td className="py-2 px-2 text-right">
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border mr-1" onClick={() => onEdit(r.id)}>
                  <Edit2 className="w-4 h-4" /> Editar
                </button>
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-rose-600" onClick={() => onDelete(r.id)}>
                  <Trash2 className="w-4 h-4" /> Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function translateType(t) {
  switch (t) {
    case "income": return "Ingreso";
    case "maintenance": return "Mantenimiento";
    case "repair": return "Reparación";
    case "expense": return "Gasto";
    default: return t;
  }
}
