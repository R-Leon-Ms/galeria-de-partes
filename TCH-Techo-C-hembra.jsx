import React, { useMemo, useState, useEffect } from "react";
import { Ruler, Layers, Settings2, AlertTriangle, Boxes } from "lucide-react";
import { evaluar } from "../lib/bomDesdeVista.js";

/* ============================================================
   TCH — MOTOR DE CÁLCULO (BOM paramétrico)
   Techo C Hembra — Ojeda
   Copia derivada del motor TCM (Techo C Macho). Toda la
   estructura, constantes y fórmulas son idénticas a TCM, con
   la única diferencia de que la sub-estructura "Oscilock Macho"
   se sustituye por "Oscilock Hembra" (kit de 4 piezas, sin
   pintura epóxica ni lámina C-10, con remache en vez de pija).
   ============================================================ */

// ---------- Constantes globales ----------
const MODULO_M = 0.2921;
const TOL_ANCHO = 0.002;
const TOL_LARGO = 0.001;
const CONSUMO_DOBLEZ = 0.051;
const AJUSTE_LAM_INT = 0.016;
const ANCHO_ROLLO = 1.219;
const ANCHO_MOD_MAX = 4;
const CONSUMO_DOBLEZ_CAP = 0.05;

// ---------- Maestro de materiales (lámina) ----------
const MATERIALES = [
  { code: "100435025", desc: "Pintro Embozado Cal-26 Blanco Ojeda", calibre: 26, espesor: 0.0005, factor: 4.653, color: "BLANCO", inox: false },
  { code: "400000027", desc: "Galvanizada Estucada C-26", calibre: 26, espesor: 0.0005, factor: 4.653, color: "GRIS", inox: false },
  { code: "100435005", desc: "Pintro Liso Blanco Cal-24", calibre: 24, espesor: 0.0005, factor: 5.46, color: "BLANCO", inox: false },
  { code: "100458138", desc: "Inoxidable Cal-24 T-304 P3 PVC", calibre: 24, espesor: 0.0005, factor: 6.396, color: "GRIS", inox: true },
  { code: "100444009", desc: "Aluminio Estucada Cal-22", calibre: 22, espesor: 0.001, factor: 2.441, color: "GRIS", inox: false },
  { code: "100458177", desc: "Inoxidable Cal-22 T-304 P3 PVC", calibre: 22, espesor: 0.001, factor: 7.6, color: "GRIS", inox: true },
];

const ESPESORES = [
  { mm: 75, label: '3" (75 mm)' },
  { mm: 100, label: '4" (100 mm)' },
  { mm: 125, label: '5" (125 mm)' },
  { mm: 150, label: '6" (150 mm)' },
];

const GRAPA_CODES = { 75: "400004129", 100: "400030028", 125: "400004135", 150: "400004136" };
// Consumo de lámina galvanizada C-20 (100450016) por grapa, según espesor de panel.
// 75mm: valor genérico previo (0.07 kg). 100mm, 125mm y 150mm: confirmados.
const GRAPA_KG_LAMINA = { 75: 0.07, 100: 0.092, 125: 0.092, 150: 0.115 };
const GASKET_CODES = { BLANCO: "400004007", GRIS: "400004008" };

// Código de color por tipo de oscilock, para uso consistente en TCM, TCH y TH
const OSCILOCK_COLOR = { macho: "#1B5E85", hembra: "#C2185B" };
const TIPO_OSCILOCK = "hembra"; // TCH lleva oscilock hembra en el lado de unión

// ---------- Utilidades ----------
const r = (n, d = 3) => {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
};
const fmt__base = (n, d = 3) => r(n, d).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: d });

function findMat(code) {
  return MATERIALES.find((m) => m.code === code);
}

// ---------- Motor de cálculo ----------
function calcularBOM({ anchoMod, largoMod, espesorMm, matExtCode, matIntCode }) {
  const matExt = findMat(matExtCode);
  const matInt = findMat(matIntCode);
  const espesorPanel = espesorMm / 1000;

  const anchoM = anchoMod * MODULO_M;
  const largoM = largoMod * MODULO_M;

  const excedeAncho = anchoMod > ANCHO_MOD_MAX;

  // ---- Componente 1: Lámina exterior ----
  const anchoDoblada = r(anchoMod * MODULO_M - TOL_ANCHO, 3);
  const largoDoblada = r(largoMod * MODULO_M - TOL_LARGO, 3);
  const anchoFlatExt = anchoDoblada - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const largoFlatExt = largoDoblada - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const kgLamExt = (anchoFlatExt / ANCHO_ROLLO) * largoFlatExt * matExt.factor;

  // ---- Componente 2: Lámina interior ----
  const anchoDobladaInt = anchoMod * MODULO_M - espesorPanel + AJUSTE_LAM_INT;
  const largoDobladaInt = largoMod * MODULO_M - 2 * espesorPanel + 2 * AJUSTE_LAM_INT;
  const anchoFlatInt = anchoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const largoFlatInt = largoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const kgLamInt = (anchoFlatInt / ANCHO_ROLLO) * largoFlatInt * matInt.factor;

  // ---- END CAP / TRIM CAP (librería) ----
  const desarrolloCap = espesorPanel + matExt.espesor + CONSUMO_DOBLEZ_CAP;
  const kgPorMetroCap = (desarrolloCap / ANCHO_ROLLO) * matExt.factor;
  const kgEndCap = 2 * anchoM * kgPorMetroCap;
  const kgTrimCap = 1 * largoM * kgPorMetroCap;

  // ---- Componente 3: Núcleo de espuma ----
  const volumenNucleo = anchoM * largoM * espesorPanel;
  const kgEspumaTotal = volumenNucleo * 40;
  const kgPoliol = kgEspumaTotal * (100 / 220);
  const kgIsocianato = kgEspumaTotal * (120 / 220);

  // ---- Oscilock Hembra (librería) — SUSTITUYE a Oscilock Macho en TCH ----
  // Misma fórmula de cantidad/espaciamiento que el Macho (confirmado).
  // Kit de 4 piezas (sin pintura epóxica ni lámina C-10, remache en vez de pija).
  // Consumo de lámina galvanizada: 0.18 kg por carcasa × 2 carcasas/kit = 0.36 kg/kit.
  const qtyOscilock = largoM >= 0.438 ? Math.floor((largoM - 0.438) / 0.876) + 1 : 0;
  const KG_LAMINA_POR_CARCASA = 0.18;
  const CARCASAS_POR_KIT = 2;
  const kgLaminaC20Oscilock = qtyOscilock * CARCASAS_POR_KIT * KG_LAMINA_POR_CARCASA;

  // ---- Grapa Techo-Piso (librería) ----
  const qtyGrapas = 4 + largoMod;
  const codigoGrapa = GRAPA_CODES[espesorMm] || null;
  const kgLaminaC20Grapas = qtyGrapas * (GRAPA_KG_LAMINA[espesorMm] ?? 0.07);
  const longitudPernoTotal = qtyGrapas * espesorPanel;

  // ---- Componente 6: Sello Gasket — NO APLICA EN TCH ----
  // El sello gasket únicamente va en el lado con oscilock macho.
  // TCH lleva oscilock hembra en ese lado, por lo que este componente se omite.

  // ---- Componente 7: Cinta Masking Tape ----
  const metrosTape = (4 * anchoM + 4 * largoM) * 1.1;
  const qtyRollosTape = metrosTape / 50;

  // ---- Componente 8: Cinta de Poliuretano ----
  const metrosPoliuretano = 0.6;
  const qtyRollosPoliuretano = metrosPoliuretano / 10;

  // ---- Componente 9: Desmoldante ----
  const areaM2 = anchoM * largoM;
  const kgDesmoldante = areaM2 * 0.0625;

  // ---- Componente 10: Cartón ----
  const metrosCarton = largoM * 1.03;
  const kgCarton = metrosCarton * 0.5;

  // ---- Componente 11: Promotor de adherencia (condicional) ----
  const qtyCarasInox = (matExt.inox ? 1 : 0) + (matInt.inox ? 1 : 0);
  const ltPromotor = areaM2 * 0.03125 * qtyCarasInox;

  return {
    anchoM, largoM, espesorPanel, excedeAncho, areaM2,
    lamExt: { anchoDoblada, largoDoblada, anchoFlat: anchoFlatExt, largoFlat: largoFlatExt, kg: kgLamExt, mat: matExt },
    lamInt: { anchoDoblada: r(anchoDobladaInt, 3), largoDoblada: r(largoDobladaInt, 3), anchoFlat: anchoFlatInt, largoFlat: largoFlatInt, kg: kgLamInt, mat: matInt },
    caps: { desarrolloCap, kgEndCap, kgTrimCap, longEndCap: anchoM, longTrimCap: largoM },
    nucleo: { volumenNucleo, kgEspumaTotal, kgPoliol, kgIsocianato },
    oscilock: { qty: qtyOscilock, kgLaminaC20: kgLaminaC20Oscilock },
    grapa: { qty: qtyGrapas, codigo: codigoGrapa, kgLaminaC20: kgLaminaC20Grapas, longitudPerno: longitudPernoTotal },
    tape: { metros: metrosTape, rollos: qtyRollosTape },
    poliuretano: { metros: metrosPoliuretano, rollos: qtyRollosPoliuretano },
    desmoldante: { kg: kgDesmoldante },
    carton: { metros: metrosCarton, kg: kgCarton },
    promotor: { qtyCarasInox, lt: ltPromotor },
  };
}

// ---------- Componentes visuales ----------

function Section({ icon: Icon, title, children, accentColor }) {
  const c = accentColor || "#1B5E85";
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, borderBottom: `1.5px solid ${c}`, paddingBottom: 6 }}>
        <Icon size={16} color={c} strokeWidth={2} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em", color: c, fontWeight: 700, textTransform: "uppercase" }}>
          {title}
        </span>
        {accentColor && (
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: accentColor, marginLeft: 2 }} />
        )}
      </div>
      {children}
    </div>
  );
}

function Table({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
      <thead>
        <tr style={{ background: "#DCEBF3" }}>
          <th style={th}>No. Parte</th>
          <th style={{ ...th, textAlign: "left" }}>Descripción</th>
          <th style={th}>Cantidad</th>
          <th style={th}>UM</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #C9D8E3", background: i % 2 ? "#FAFBFC" : "#fff" }}>
            <td style={td}>{row.code || "—"}</td>
            <td style={{ ...td, textAlign: "left", color: "#14202B" }}>{row.desc}</td>
            <td style={{ ...td, fontWeight: 700 }}>{row.qty}</td>
            <td style={td}>{row.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const th = { padding: "6px 8px", textAlign: "center", fontSize: 10.5, letterSpacing: "0.04em", color: "#1B5E85", textTransform: "uppercase", borderBottom: "1.5px solid #1B5E85" };
const td = { padding: "6px 8px", textAlign: "center" };

function Schematic({ anchoMod, largoMod, anchoM, largoM, qtyOscilock, qtyGrapas, tipoOscilock = TIPO_OSCILOCK }) {
  const W = 260, H = 410, pad = 30;
  const scaleX = (W - 2 * pad) / Math.max(anchoM, 1);
  const scaleY = (H - 2 * pad - 20) / Math.max(largoM, 1);
  const scale = Math.min(scaleX, scaleY);
  const rw = anchoM * scale, rh = largoM * scale;
  const x0 = (W - rw) / 2, y0 = (H - 20 - rh) / 2;
  const colorOscilock = OSCILOCK_COLOR[tipoOscilock];
  const labelOscilock = tipoOscilock === "macho" ? "Oscilock Macho" : "Oscilock Hembra";

  const oscMarks = [];
  let pos = 0.438;
  while (pos <= largoM && oscMarks.length < 40) {
    oscMarks.push(pos);
    pos += 0.876;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 260, display: "block", margin: "0 auto" }}>
      <rect x={x0} y={y0} width={rw} height={rh} fill="#fff" stroke="#14202B" strokeWidth="1.5" />
      {/* Lámina interior — línea oculta (no visible desde el exterior). Forma de "C":
          sin descuento de espesor en el lado izquierdo (queda a ras del borde exterior,
          ahí es donde el perfil queda abierto); offset solo en los otros 3 lados. */}
      <path
        d={`M ${x0},${y0 + 6} L ${x0 + rw - 6},${y0 + 6} L ${x0 + rw - 6},${y0 + rh - 6} L ${x0},${y0 + rh - 6}`}
        fill="none"
        stroke="#B33F32"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {/* Espejeado: Trim cap / grapas ahora del lado derecho (pieza final, no inicial) */}
      {Array.from({ length: largoMod + 1 }).map((_, i) => {
        const yy = y0 + (i * largoM * scale) / largoMod;
        return <line key={i} x1={x0 + rw - 6} y1={yy} x2={x0 + rw - 14} y2={yy} stroke="#B33F32" strokeWidth="1" />;
      })}
      {/* Espejeado: Oscilock ahora del lado izquierdo — color según tipo: macho=azul, hembra=rosa.
          Integración de abajo hacia arriba: el primer marcador queda cerca del borde inferior. */}
      {oscMarks.map((p, i) => {
        const yy = y0 + rh - p * scale;
        return <rect key={i} x={x0 + 2} y={yy - 3} width="10" height="6" fill={colorOscilock} />;
      })}
      <text x={x0 + rw / 2} y={y0 - 10} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="#1B5E85">
        {fmt(anchoM, 3)} m
      </text>
      <text x={x0 - 8} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="#1B5E85" transform={`rotate(-90 ${x0 - 8} ${y0 + rh / 2})`}>
        {fmt(largoM, 3)} m
      </text>
      <text x={x0 + rw / 2} y={y0 + rh + 20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">
        {qtyGrapas} grapas
      </text>
      {/* Leyenda de color por tipo de oscilock */}
      <rect x={x0} y={y0 + rh + 32} width="9" height="9" fill={colorOscilock} />
      <text x={x0 + 14} y={y0 + rh + 40} fontFamily="var(--font-mono)" fontSize="9" fill="#14202B">
        {labelOscilock} × {qtyOscilock}
      </text>
    </svg>
  );
}

// ---------- App principal ----------
// Modo headless: añade el valor completo junto al texto formateado.
const fmt = (n, d = 3) => {
  const t = fmt__base(n, d);
  return globalThis.__BOM_RAW__ && typeof n === "number" && Number.isFinite(n) ? t + "\u2063" + n + "\u2063" : t;
};

export default function TCHMotorCalculo({ paramsIniciales, onParams }) {
  const [anchoMod, setAnchoMod] = useState(paramsIniciales?.anchoMod ?? 4);
  const [largoMod, setLargoMod] = useState(paramsIniciales?.largoMod ?? 10);
  const [espesorMm, setEspesorMm] = useState(paramsIniciales?.espesorMm ?? 100);
  const [matExtCode, setMatExtCode] = useState(paramsIniciales?.matExtCode ?? MATERIALES[0].code);
  const [matIntCode, setMatIntCode] = useState(paramsIniciales?.matIntCode ?? MATERIALES[1].code);
  const __params = { anchoMod, largoMod, espesorMm, matExtCode, matIntCode };
  useEffect(() => { onParams?.(__params); }, [JSON.stringify(__params)]); // eslint-disable-line

  const bom = useMemo(
    () => calcularBOM({ anchoMod, largoMod, espesorMm, matExtCode, matIntCode }),
    [anchoMod, largoMod, espesorMm, matExtCode, matIntCode]
  );

  const codigo = `TCH-${anchoMod}-${largoMod}-${espesorMm}`;

  if (globalThis.__BOM_RAW__) globalThis.__BOM_ETIQUETA__ = codigo;
  const grapaPendiente = !bom.grapa.codigo;

  return (
    <div
      style={{
        "--font-mono": "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
        "--font-sans": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontFamily: "var(--font-sans)",
        background: "#FAFBFC",
        color: "#14202B",
        minHeight: "100%",
        padding: 0,
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: "2px solid #14202B", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.15em", color: "#1B5E85", textTransform: "uppercase" }}>
            Motor de cálculo · BOM paramétrico
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>Techo C Hembra — TCH</div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            fontWeight: 700,
            background: "#14202B",
            color: "#fff",
            padding: "8px 16px",
            letterSpacing: "0.04em",
          }}
        >
          {codigo}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 0, alignItems: "start" }}>
        {/* Panel de inputs */}
        <div style={{ borderRight: "1.5px solid #C9D8E3", padding: 24, position: "sticky", top: 0 }}>
          <Section icon={Ruler} title="Dimensiones">
            <label style={label}>Ancho (módulos, máx. 4)</label>
            <select style={select} value={anchoMod} onChange={(e) => setAnchoMod(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} módulo{n > 1 ? "s" : ""} ({fmt(n * MODULO_M, 3)} m)
                </option>
              ))}
            </select>

            <label style={label}>Largo (módulos)</label>
            <input
              type="number"
              min={1}
              max={60}
              style={select}
              value={largoMod}
              onChange={(e) => setLargoMod(Math.max(1, Number(e.target.value) || 1))}
            />
            <div style={hint}>{fmt(largoMod * MODULO_M, 3)} m</div>

            <label style={label}>Espesor de panel</label>
            <select style={select} value={espesorMm} onChange={(e) => setEspesorMm(Number(e.target.value))}>
              {ESPESORES.map((e) => (
                <option key={e.mm} value={e.mm}>
                  {e.label}
                </option>
              ))}
            </select>
          </Section>

          <Section icon={Layers} title="Materiales">
            <label style={label}>Lámina exterior</label>
            <select style={select} value={matExtCode} onChange={(e) => setMatExtCode(e.target.value)}>
              {MATERIALES.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.desc}
                </option>
              ))}
            </select>

            <label style={label}>Lámina interior</label>
            <select style={select} value={matIntCode} onChange={(e) => setMatIntCode(e.target.value)}>
              {MATERIALES.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.desc}
                </option>
              ))}
            </select>
          </Section>

          <Section icon={Settings2} title="Esquema">
            <Schematic
              anchoMod={anchoMod}
              largoMod={largoMod}
              anchoM={bom.anchoM}
              largoM={bom.largoM}
              qtyOscilock={bom.oscilock.qty}
              qtyGrapas={bom.grapa.qty}
              tipoOscilock="hembra"
            />
          </Section>
        </div>

        {/* Resultados */}
        <div style={{ padding: 24 }}>
          {bom.excedeAncho && (
            <div style={warn}>
              <AlertTriangle size={16} /> Ancho excede 4 módulos — requiere tratamiento especial (fuera del ancho de rollo de 48").
            </div>
          )}
          {grapaPendiente && (
            <div style={warn}>
              <AlertTriangle size={16} /> No hay código de Grapa Techo-Piso definido para {espesorMm} mm. Captura manual requerida.
            </div>
          )}

          <Section icon={Boxes} title="Componente 1 — Lámina exterior">
            <Table
              rows={[
                { code: bom.lamExt.mat.code, desc: `${bom.lamExt.mat.desc} (doblada ${fmt(bom.lamExt.anchoDoblada)}×${fmt(bom.lamExt.largoDoblada)} m · flat ${fmt(bom.lamExt.anchoFlat)}×${fmt(bom.lamExt.largoFlat)} m)`, qty: fmt(bom.lamExt.kg, 3), unit: "KG" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title="Componente 2 — Lámina interior">
            <Table
              rows={[
                { code: bom.lamInt.mat.code, desc: `${bom.lamInt.mat.desc} (doblada ${fmt(bom.lamInt.anchoDoblada)}×${fmt(bom.lamInt.largoDoblada)} m · flat ${fmt(bom.lamInt.anchoFlat)}×${fmt(bom.lamInt.largoFlat)} m)`, qty: fmt(bom.lamInt.kg, 3), unit: "KG" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title="END CAP / TRIM CAP (librería)">
            <Table
              rows={[
                { code: bom.lamExt.mat.code, desc: `END CAP × 2 pzas (longitud ${fmt(bom.caps.longEndCap)} m c/u, desarrollo ${fmt(bom.caps.desarrolloCap * 1000, 1)} mm)`, qty: fmt(bom.caps.kgEndCap, 3), unit: "KG" },
                { code: bom.lamExt.mat.code, desc: `TRIM CAP × 1 pza (longitud ${fmt(bom.caps.longTrimCap)} m)`, qty: fmt(bom.caps.kgTrimCap, 3), unit: "KG" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title="Componente 3 — Núcleo de espuma">
            <Table
              rows={[
                { code: "100709010", desc: "Poliol DCR 1148.06", qty: fmt(bom.nucleo.kgPoliol, 3), unit: "KG" },
                { code: "100710008", desc: "Isocianato Voracor CE 153", qty: fmt(bom.nucleo.kgIsocianato, 3), unit: "KG" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title={`Oscilock Hembra (librería) — ${bom.oscilock.qty} kits`} accentColor={OSCILOCK_COLOR.hembra}>
            <Table
              rows={[
                { code: "400004050", desc: "Oscilock Hembra Mca. Ojeda", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004051", desc: "Carcasa izquierda p/ oscilock hembra", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004052", desc: "Carcasa derecha p/ oscilock hembra", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400030211", desc: "Remache semi-circular cabeza plana 250x375", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "100450016", desc: "Lámina Galvanizada C-20 (carcasas, 0.18 kg/carcasa × 2 carcasas)", qty: fmt(bom.oscilock.kgLaminaC20, 3), unit: "KG" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title={`Grapa Techo-Piso (librería) — ${bom.grapa.qty} pzas`}>
            <Table
              rows={[
                { code: bom.grapa.codigo || "PENDIENTE", desc: `Grapa techo-piso ensamble (espesor ${espesorMm}mm)`, qty: bom.grapa.qty, unit: "PZA" },
                { code: "100450016", desc: "Lámina Galvanizada C-20 (grapas)", qty: fmt(bom.grapa.kgLaminaC20, 3), unit: "KG" },
                { code: "400004006", desc: "Perno de latón 1/4\" x 3.66 m (a corte)", qty: fmt(bom.grapa.longitudPerno, 3), unit: "M" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title="Componentes 7–10 — Consumibles">
            <Table
              rows={[
                { code: "100350017", desc: "Cinta Masking Tape 1 1/2\" x 50 m", qty: `${fmt(bom.tape.metros, 3)} m / ${fmt(bom.tape.rollos, 2)}`, unit: "ROLLO" },
                { code: "400004003", desc: "Cinta Poliuretano 3/16\" x 1 1/2\" x 10 m", qty: `${fmt(bom.poliuretano.metros, 2)} m / ${fmt(bom.poliuretano.rollos, 3)}`, unit: "ROLLO" },
                { code: "400004119", desc: "Desmoldante-V Hersol", qty: fmt(bom.desmoldante.kg, 3), unit: "KG" },
                { code: "100686002", desc: "Cartón Corrugado 1.25 m", qty: fmt(bom.carton.kg, 3), unit: "KG" },
              ]}
            />
          </Section>

          {bom.promotor.qtyCarasInox > 0 && (
            <Section icon={Boxes} title="Componente 11 — Promotor de adherencia (condicional)">
              <Table
                rows={[
                  { code: "300371000", desc: `Promotor Adherencia KDM Pro Adh Acemt (${bom.promotor.qtyCarasInox} cara${bom.promotor.qtyCarasInox > 1 ? "s" : ""} inox)`, qty: fmt(bom.promotor.lt, 3), unit: "LT" },
                ]}
              />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

const label = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A6B78", marginTop: 14, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
const select = { width: "100%", padding: "8px 10px", border: "1.5px solid #C9D8E3", background: "#fff", fontFamily: "var(--font-sans)", fontSize: 13, color: "#14202B" };
const hint = { fontFamily: "var(--font-mono)", fontSize: 11, color: "#1B5E85", marginTop: 4 };
const warn = { display: "flex", alignItems: "center", gap: 8, background: "#FBEAE8", border: "1.5px solid #B33F32", color: "#8A2E23", padding: "10px 14px", fontSize: 13, marginBottom: 16, fontWeight: 600 };

/* ============================================================
   CONTRATO CON LA GALERÍA (generado por scripts/integrar.mjs)
   El BOM se lee de las mismas tablas que dibuja este componente.
   ============================================================ */
export const META = {
  "codigo": "TCH",
  "nombre": "Techo C hembra",
  "categoria": "Techos",
  "descripcion": "Techo de cámara con borde hembra."
};

export const PARAMS_DEFAULT = {
  anchoMod: 4,
  largoMod: 10,
  espesorMm: 100,
  matExtCode: MATERIALES[0].code,
  matIntCode: MATERIALES[1].code,
};

const _ev = (p) => evaluar(TCHMotorCalculo, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
