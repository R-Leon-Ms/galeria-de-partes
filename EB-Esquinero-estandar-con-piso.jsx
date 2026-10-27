import React, { useMemo, useState, useEffect } from "react";
import { Ruler, Layers, Settings2, AlertTriangle, Boxes } from "lucide-react";
import { evaluar } from "../lib/bomDesdeVista.js";

/* ============================================================
   EB — MOTOR DE CÁLCULO (BOM paramétrico)
   Esquinero Estándar con Piso (EB) — Ojeda
   Derivado del motor E (Esquinero Estándar sin Piso) y W (Muro Estándar sin Piso). Diferencias:

   1. GEOMETRÍA: pieza en escuadra de 1 módulo × 1 módulo
      (0.2921 m × 0.2921 m = 11 1/2" × 11 1/2"). Sin selector de
      ancho; el largo (altura) se captura en metros.
   2. Lámina exterior: desarrollo de 2 módulos (0.5842 m = 23"),
      menos TOL_ANCHO (2 mm). Largo sin tolerancia (igual que W).
   3. Lámina interior: desarrollo exterior menos 2 × espesor del
      panel (para formar el ángulo a 90°) menos TOL_ANCHO (2 mm).
      Ej. panel 4": 23" − 8" = 15" − 2 mm. Largo igual al exterior.
   4. Núcleo de espuma: sección en L = M² − (M − e)²,
      volumen = sección × largo.
   5. Oscilock lateral (a lo largo): misma fórmula que W
      (primera pos. 0.438 m, paso 0.876 m). Macho / hembra.
   6. Oscilock Macho en CABEZAL SUPERIOR: siempre 1 pieza
      (esquinero de 1 módulo). Se SUMA al macho lateral (mismo kit
      400004053). La hembra es solo lateral.
   7. Sello Gasket (solo lado macho):
        · Exterior: largo + 0.5842 m (2 módulos)
        · Interior: largo + ancho de lámina interior (cabezal)
      Código por color de cada lámina (blanco / gris).
   8. Consumibles y promotor: mismas fórmulas que W, usando como
      ancho de referencia el desarrollo exterior (0.5842 m).
   ============================================================ */

// ---------- Constantes globales ----------
const MODULO_M = 0.2921;
const ANCHO_DESARROLLO_M = 2 * MODULO_M; // 0.5842 m — desarrollo exterior (23")
const TOL_ANCHO = 0.002;
const CONSUMO_DOBLEZ = 0.051;
const ANCHO_ROLLO = 1.219;
const OSCILOCK_PRIMERA_POS = 0.438;
const OSCILOCK_PASO = 0.876;
const QTY_OSCILOCK_TOP = 1; // EB: siempre 1 en cabezal superior
const QTY_OSCILOCK_BOTTOM = 1; // EB: 1 en cabezal inferior

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

const GASKET_CODES = {
  BLANCO: "400004007",
  GRIS: "400004008",
};

// ---------- Núcleo de espuma ----------
const DENSIDAD_ESPUMA = 40; // kg/m3
const RATIO_POLIOL = 100;
const RATIO_ISOCIANATO = 120;

function fmt__base(n, d = 3) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ============================================================
   Motor de cálculo — calcularBOM
   ============================================================ */
function calcularBOM({ largoM, espesorMm, matExtCode, matIntCode }) {
  const matExt = MATERIALES.find((m) => m.code === matExtCode);
  const matInt = MATERIALES.find((m) => m.code === matIntCode);

  const espesorPanel = espesorMm / 1000;

  // ---- Componente 1: Lámina exterior (desarrollo de 2 módulos) ----
  const anchoDobladaExt = ANCHO_DESARROLLO_M - TOL_ANCHO;
  const largoDobladaExt = largoM;
  const anchoFlatExt = anchoDobladaExt - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const largoFlatExt = largoDobladaExt - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaExt = (anchoFlatExt / ANCHO_ROLLO) * largoFlatExt * matExt.factor;

  // ---- Componente 2: Lámina interior (desarrollo − 2 × espesor de panel) ----
  const anchoDobladaInt = ANCHO_DESARROLLO_M - 2 * espesorPanel - TOL_ANCHO;
  const largoDobladaInt = largoDobladaExt;
  const anchoFlatInt = anchoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const largoFlatInt = largoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaInt = (anchoFlatInt / ANCHO_ROLLO) * largoFlatInt * matInt.factor;

  // ---- Componente 3: Núcleo de espuma (sección en L) ----
  const areaSeccion = MODULO_M * MODULO_M - (MODULO_M - espesorPanel) * (MODULO_M - espesorPanel);
  const volumenNucleo = areaSeccion * largoM;
  const kgEspumaTotal = volumenNucleo * DENSIDAD_ESPUMA;
  const kgPoliol = kgEspumaTotal * (RATIO_POLIOL / (RATIO_POLIOL + RATIO_ISOCIANATO));
  const kgIsocianato = kgEspumaTotal * (RATIO_ISOCIANATO / (RATIO_POLIOL + RATIO_ISOCIANATO));

  // ---- Oscilock lateral (a lo largo) ----
  const qtyOscilockLateral =
    largoM >= OSCILOCK_PRIMERA_POS ? Math.floor((largoM - OSCILOCK_PRIMERA_POS) / OSCILOCK_PASO) + 1 : 0;

  // ---- Oscilock macho — cabezal superior (1 pieza, centrada en el módulo) ----
  const qtyOscilockTop = QTY_OSCILOCK_TOP;
  const posicionesTop = [MODULO_M / 2];

  // ---- Oscilock macho — cabezal inferior (1 pieza, centrada en el módulo) ----
  const qtyOscilockBottom = QTY_OSCILOCK_BOTTOM;
  const posicionesBottom = [MODULO_M / 2];

  // ---- Oscilock macho TOTAL (lateral + cabezal sup. + cabezal inf., mismo kit) ----
  const qtyOscilockMachoTotal = qtyOscilockLateral + qtyOscilockTop + qtyOscilockBottom;
  const kgLaminaC20OscilockMacho = qtyOscilockMachoTotal * 0.44;
  const hojaLaminaC10OscilockMacho = qtyOscilockMachoTotal * 0.002;
  const kgPinturaEpoxicaOscilockMacho = qtyOscilockMachoTotal * 0.0132;

  // ---- Oscilock hembra (solo lateral) ----
  const qtyOscilockHembra = qtyOscilockLateral;
  const KG_LAMINA_POR_CARCASA_HEMBRA = 0.18;
  const CARCASAS_POR_KIT_HEMBRA = 2;
  const kgLaminaC20OscilockHembra = qtyOscilockHembra * CARCASAS_POR_KIT_HEMBRA * KG_LAMINA_POR_CARCASA_HEMBRA;

  // ---- Componente 6: Sello Gasket (solo lado macho) ----
  // Cabezal superior + cabezal inferior (2 cabezales por lámina)
  const longitudGasketExt = largoM + 2 * ANCHO_DESARROLLO_M; // largo + 2 × (2 módulos)
  const longitudGasketInt = largoM + 2 * anchoDobladaInt;    // largo + 2 × cabezal lámina interior
  const colorExt = matExt.color;
  const colorInt = matInt.color;
  const gasketLines = [];
  if (colorExt === colorInt) {
    gasketLines.push({ code: GASKET_CODES[colorExt], metros: longitudGasketExt + longitudGasketInt, cara: "Exterior + Interior (lado macho)" });
  } else {
    gasketLines.push({ code: GASKET_CODES[colorExt], metros: longitudGasketExt, cara: "Exterior (lado macho)" });
    gasketLines.push({ code: GASKET_CODES[colorInt], metros: longitudGasketInt, cara: "Interior (lado macho)" });
  }

  // ---- Componente 7: Masking tape (ancho de referencia = 0.5842 m) ----
  const metrosTape = (4 * ANCHO_DESARROLLO_M + 4 * largoM) * 1.1;
  const qtyRollosTape = metrosTape / 50;

  // ---- Componente 8: Cinta de poliuretano ----
  const metrosPoliuretano = 0.6;
  const qtyRollosPoliuretano = metrosPoliuretano / 10;

  // ---- Componente 9: Desmoldante ----
  const areaM2 = ANCHO_DESARROLLO_M * largoM;
  const kgDesmoldante = areaM2 * 0.0625;

  // ---- Componente 10: Cartón ----
  const metrosCarton = largoM * 1.03;
  const kgCarton = metrosCarton * 0.5;

  // ---- Componente 11: Promotor de adherencia (condicional) ----
  const qtyCarasInox = (matExt.inox ? 1 : 0) + (matInt.inox ? 1 : 0);
  const ltPromotorTotal = areaM2 * 0.03125 * qtyCarasInox;

  return {
    largoM,
    espesorPanel,
    laminaExt: { anchoDoblada: anchoDobladaExt, largoDoblada: largoDobladaExt, anchoFlat: anchoFlatExt, largoFlat: largoFlatExt, kg: kgLaminaExt },
    laminaInt: { anchoDoblada: anchoDobladaInt, largoDoblada: largoDobladaInt, anchoFlat: anchoFlatInt, largoFlat: largoFlatInt, kg: kgLaminaInt },
    nucleo: { areaSeccion, volumen: volumenNucleo, kgEspuma: kgEspumaTotal, kgPoliol, kgIsocianato },
    oscilockLateral: { qty: qtyOscilockLateral },
    oscilockTop: { qty: qtyOscilockTop, posiciones: posicionesTop },
    oscilockBottom: { qty: qtyOscilockBottom, posiciones: posicionesBottom },
    oscilockMacho: { qtyTotal: qtyOscilockMachoTotal, kgLaminaC20: kgLaminaC20OscilockMacho, hojaLaminaC10: hojaLaminaC10OscilockMacho, kgPintura: kgPinturaEpoxicaOscilockMacho },
    oscilockHembra: { qty: qtyOscilockHembra, kgLaminaC20: kgLaminaC20OscilockHembra },
    gasket: gasketLines,
    gasketLongitudes: { ext: longitudGasketExt, int: longitudGasketInt },
    tape: { metros: metrosTape, rollos: qtyRollosTape },
    poliuretano: { metros: metrosPoliuretano, rollos: qtyRollosPoliuretano },
    desmoldante: { area: areaM2, kg: kgDesmoldante },
    carton: { metros: metrosCarton, kg: kgCarton },
    promotor: { qtyCarasInox, lt: ltPromotorTotal },
  };
}

/* ============================================================
   Componentes visuales
   ============================================================ */
function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#5A6B78", fontFamily: "var(--font-mono)" }}>
      <span style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  border: "1px solid #C7D2D9",
  borderRadius: 4,
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  color: "#1B2A33",
  background: "#FFFFFF",
};

function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ border: "1px solid #DCE3E8", borderRadius: 6, marginBottom: 16, background: "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #E8EDF0", background: "#F4F7F8" }}>
        <Icon size={15} color="#1B5E85" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#1B5E85", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function Table({ rows, columns }) {
  const cols = columns || [
    { key: "code", label: "No. Parte" },
    { key: "desc", label: "Descripción" },
    { key: "qty", label: "Cant." },
    { key: "unit", label: "UM" },
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.key} style={{ textAlign: "left", padding: "6px 8px", color: "#5A6B78", borderBottom: "1.5px solid #C7D2D9", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #EEF2F4" }}>
            {cols.map((c) => (
              <td key={c.key} style={{ padding: "6px 8px", color: r.code ? "#1B2A33" : "#B33F32" }}>
                {r[c.key] ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const COLOR_MACHO = "#1B5E85";
const COLOR_HEMBRA = "#D6409F";
const COLOR_GASKET = "#2E9E5B";

// Vista en planta: sección en L (escuadra) con espesor de panel
function PlantaEscuadra({ espesorPanel }) {
  const size = 130;
  const s = size / MODULO_M; // px por metro
  const e = espesorPanel * s;
  const x0 = 20, y0 = 14;
  // L: esquina exterior arriba-izquierda; alas hacia derecha y abajo
  const d = `M ${x0} ${y0} H ${x0 + size} V ${y0 + e} H ${x0 + e} V ${y0 + size} H ${x0} Z`;
  return (
    <svg viewBox="0 0 180 170" width="100%" style={{ maxWidth: 200, display: "block", margin: "0 auto" }}>
      <path d={d} fill="#E3EDF3" stroke={COLOR_MACHO} strokeWidth="1.5" />
      <text x={x0 + size / 2} y={y0 - 3} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO}>{fmt(MODULO_M, 4)} m</text>
      <text x={x0 - 6} y={y0 + size / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO} transform={`rotate(-90 ${x0 - 6} ${y0 + size / 2})`}>{fmt(MODULO_M, 4)} m</text>
      <text x={x0 + size / 2 + 10} y={y0 + size / 2 + 30} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">Vista en planta (L)</text>
      <text x={x0 + size / 2 + 10} y={y0 + size / 2 + 44} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">espesor {fmt(espesorPanel * 1000, 0)} mm</text>
    </svg>
  );
}

// Vista lateral: ancho 1 módulo × largo, con oscilock
function PanelDiagram({ largoM, posicionesTop, qtyOscTop, posicionesBottom, qtyOscBottom, qtyOscLateral }) {
  const anchoM = MODULO_M;
  const maxRw = 120;
  const maxRh = 420;
  const scale = Math.min(maxRw / anchoM, maxRh / Math.max(largoM, 0.01));
  const rw = anchoM * scale;
  const rh = Math.max(largoM, 0.01) * scale;

  const padTop = 60, padBottom = 76, padSide = 110;
  const w = rw + padSide * 2;
  const h = rh + padTop + padBottom;
  const x0 = (w - rw) / 2;
  const y0 = padTop;

  const marks = [];
  for (let p = OSCILOCK_PRIMERA_POS; p <= largoM + 1e-6; p += OSCILOCK_PASO) marks.push(p);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: 300, display: "block", margin: "0 auto" }}>
      <rect x={x0} y={y0} width={rw} height={rh} fill="#F4F7F8" stroke="#1B5E85" strokeWidth="1.5" />

      <line x1={x0} y1={y0 - 5} x2={x0 + rw} y2={y0 - 5} stroke={COLOR_GASKET} strokeWidth="2.5" />
      <line x1={x0} y1={y0 + rh + 5} x2={x0 + rw} y2={y0 + rh + 5} stroke={COLOR_GASKET} strokeWidth="2.5" />
      <line x1={x0 + rw + 5} y1={y0} x2={x0 + rw + 5} y2={y0 + rh} stroke={COLOR_GASKET} strokeWidth="2.5" />

      {posicionesTop.map((p, i) => (
        <rect key={"top" + i} x={x0 + p * scale - 5} y={y0 - 16} width="10" height="8" fill={COLOR_MACHO} />
      ))}

      {posicionesBottom.map((p, i) => (
        <rect key={"bot" + i} x={x0 + p * scale - 5} y={y0 + rh + 8} width="10" height="8" fill={COLOR_MACHO} />
      ))}

      {marks.map((p, i) => (
        <rect key={"h" + i} x={x0 - 12} y={y0 + rh - p * scale - 3} width="10" height="6" fill={COLOR_HEMBRA} />
      ))}
      {marks.map((p, i) => (
        <rect key={"m" + i} x={x0 + rw + 2} y={y0 + rh - p * scale - 3} width="10" height="6" fill={COLOR_MACHO} />
      ))}

      <text x={x0 + rw / 2} y={y0 - 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#1B5E85">{fmt(anchoM, 4)} m</text>
      <text x={x0 - 42} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#1B5E85" transform={`rotate(-90 ${x0 - 42} ${y0 + rh / 2})`}>{fmt(largoM, 3)} m</text>

      <text x={x0 - 30} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_HEMBRA} transform={`rotate(-90 ${x0 - 30} ${y0 + rh / 2})`}>HEMBRA ({qtyOscLateral})</text>
      <text x={x0 + rw + 30} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO} transform={`rotate(90 ${x0 + rw + 30} ${y0 + rh / 2})`}>MACHO ({qtyOscLateral})</text>

      <text x={x0 + rw / 2} y={y0 - 40} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO}>MACHO CABEZAL SUP. ({qtyOscTop})</text>
      <text x={x0 + rw / 2} y={y0 + rh + 34} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO}>MACHO CABEZAL INF. ({qtyOscBottom})</text>
      <text x={x0 + rw / 2} y={y0 + rh + 48} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_GASKET}>— Gasket (lado macho + cabezal sup. e inf.)</text>
      <text x={x0 + rw / 2} y={y0 + rh + 62} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">Sin End Cap · Sin Grapa · Sin Perno</text>
    </svg>
  );
}

/* ============================================================
   App principal
   ============================================================ */
// Modo headless: añade el valor completo junto al texto formateado.
const fmt = (n, d = 3) => {
  const t = fmt__base(n, d);
  return globalThis.__BOM_RAW__ && typeof n === "number" && Number.isFinite(n) ? t + "\u2063" + n + "\u2063" : t;
};

export default function EBMotorCalculo({ paramsIniciales, onParams }) {
  const [largoM, setLargoM] = useState(paramsIniciales?.largoM ?? 2.4);
  const [espesorMm, setEspesorMm] = useState(paramsIniciales?.espesorMm ?? 100);
  const [matExtCode, setMatExtCode] = useState(paramsIniciales?.matExtCode ?? MATERIALES[0].code);
  const [matIntCode, setMatIntCode] = useState(paramsIniciales?.matIntCode ?? MATERIALES[0].code);
  const __params = { largoM, espesorMm, matExtCode, matIntCode };
  useEffect(() => { onParams?.(__params); }, [JSON.stringify(__params)]); // eslint-disable-line

  const largoMClamped = Math.max(0, largoM || 0);

  const bom = useMemo(
    () => calcularBOM({ largoM: largoMClamped, espesorMm, matExtCode, matIntCode }),
    [largoMClamped, espesorMm, matExtCode, matIntCode]
  );

  const codigo = `EB-${largoMClamped.toFixed(2)}-${espesorMm}`;


  if (globalThis.__BOM_RAW__) globalThis.__BOM_ETIQUETA__ = codigo;
  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", background: "#EEF2F4", minHeight: "100%", padding: 20 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Motor de cálculo BOM · Derivado de E y W
          </div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "#1B2A33", margin: "4px 0 0" }}>
            EB — Esquinero Estándar con Piso
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#1B5E85", marginTop: 4 }}>{codigo}</div>
        </div>

        <Section icon={Settings2} title="Parámetros de la pieza">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Field label="Largo (metros)">
              <input style={inputStyle} type="number" min={0} step={0.01} value={largoM} onChange={(e) => setLargoM(Number(e.target.value))} />
            </Field>
            <Field label="Espesor de panel">
              <select style={inputStyle} value={espesorMm} onChange={(e) => setEspesorMm(Number(e.target.value))}>
                {ESPESORES.map((e) => (
                  <option key={e.mm} value={e.mm}>{e.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Material exterior">
              <select style={inputStyle} value={matExtCode} onChange={(e) => setMatExtCode(e.target.value)}>
                {MATERIALES.map((m) => (
                  <option key={m.code} value={m.code}>{m.desc}</option>
                ))}
              </select>
            </Field>
            <Field label="Material interior">
              <select style={inputStyle} value={matIntCode} onChange={(e) => setMatIntCode(e.target.value)}>
                {MATERIALES.map((m) => (
                  <option key={m.code} value={m.code}>{m.desc}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: "#EAF2F6", border: "1px solid #B7D3E0", borderRadius: 4, color: "#1B5E85", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
            <AlertTriangle size={15} />
            EB: escuadra fija de 1 × 1 módulo ({fmt(MODULO_M, 4)} m por lado). Desarrollo exterior {fmt(ANCHO_DESARROLLO_M, 4)} m. El largo se define en metros.
          </div>
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 460px", gap: 16, alignItems: "start" }}>
          <div>
            <Section icon={Layers} title="Componentes 1–2 — Láminas exterior / interior">
              <Table
                rows={[
                  { code: matExtCode, desc: `Lámina Exterior — ${MATERIALES.find((m) => m.code === matExtCode)?.desc}`, qty: fmt(bom.laminaExt.kg, 3), unit: "KG" },
                  { code: matIntCode, desc: `Lámina Interior — ${MATERIALES.find((m) => m.code === matIntCode)?.desc}`, qty: fmt(bom.laminaInt.kg, 3), unit: "KG" },
                ]}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78" }}>
                Doblada Ext: {fmt(bom.laminaExt.anchoDoblada, 4)} × {fmt(bom.laminaExt.largoDoblada)} m &nbsp;|&nbsp;
                Flat Ext: {fmt(bom.laminaExt.anchoFlat, 4)} × {fmt(bom.laminaExt.largoFlat)} m
                <br />
                Doblada Int: {fmt(bom.laminaInt.anchoDoblada, 4)} × {fmt(bom.laminaInt.largoDoblada)} m &nbsp;|&nbsp;
                Flat Int: {fmt(bom.laminaInt.anchoFlat, 4)} × {fmt(bom.laminaInt.largoFlat)} m
                <div style={{ marginTop: 4, color: "#1B5E85" }}>
                  ★ EB: exterior = 2 módulos − 2 mm · interior = exterior − 2 × espesor de panel
                </div>
              </div>
            </Section>

            <Section icon={Boxes} title="Componente 3 — Núcleo de espuma (sección en L)">
              <Table
                rows={[
                  { code: "100709010", desc: "POLIOL DCR 1148.06", qty: fmt(bom.nucleo.kgPoliol, 3), unit: "KG" },
                  { code: "100710008", desc: "ISOCIANATO VORACOR CE 153", qty: fmt(bom.nucleo.kgIsocianato, 3), unit: "KG" },
                ]}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78" }}>
                Sección L: {fmt(bom.nucleo.areaSeccion, 4)} m² &nbsp;|&nbsp; Volumen: {fmt(bom.nucleo.volumen, 4)} m³ &nbsp;|&nbsp; Densidad: 40 kg/m³ &nbsp;|&nbsp; Relación 100:120
              </div>
            </Section>

            <Section icon={Boxes} title="Oscilock Macho (lateral + cabezal superior + cabezal inferior)">
              <Table
                rows={[
                  { code: "400004053", desc: "Oscilock Macho Mca. Ojeda", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "400004054", desc: "Carcasa izquierda p/ oscilock macho", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "400004055", desc: "Carcasa derecha p/ oscilock macho", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "400004056", desc: "Gancho para oscilock", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "400004030", desc: "Muelle oscilock", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "400004031", desc: "Excéntrico de zamac", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "100441000", desc: "Pija #8 x 3/4\"", qty: bom.oscilockMacho.qtyTotal, unit: "PZA" },
                  { code: "100432001", desc: "Pintura epóxica polvo negro", qty: fmt(bom.oscilockMacho.kgPintura, 4), unit: "KG" },
                  { code: "100450016", desc: "Lámina Galvanizada C-20 (carcasas)", qty: fmt(bom.oscilockMacho.kgLaminaC20, 3), unit: "KG" },
                  { code: "100462018", desc: "Lámina C-10 (gancho)", qty: fmt(bom.oscilockMacho.hojaLaminaC10, 4), unit: "HOJA" },
                ]}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#1B5E85" }}>
                ★ Total = lateral ({bom.oscilockLateral.qty}) + cabezal superior ({bom.oscilockTop.qty}) + cabezal inferior ({bom.oscilockBottom.qty}). Mismo kit/código para todos los usos.
              </div>
            </Section>

            <Section icon={Boxes} title="Oscilock Hembra (lateral)">
              <Table
                rows={[
                  { code: "400004050", desc: "Oscilock Hembra Mca. Ojeda", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "400004051", desc: "Carcasa izquierda p/ oscilock hembra", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "400004052", desc: "Carcasa derecha p/ oscilock hembra", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "400030211", desc: "Remache semi-circular cabeza plana 250x375", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "100450016", desc: "Lámina Galvanizada C-20 (carcasas hembra)", qty: fmt(bom.oscilockHembra.kgLaminaC20, 3), unit: "KG" },
                ]}
              />
            </Section>

            <Section icon={Boxes} title="Componente 6 — Sello Gasket (solo lado macho)">
              <Table
                rows={bom.gasket.map((g) => ({ code: g.code, desc: `Sello Gasket PVC c/UV — ${g.cara}`, qty: fmt(g.metros, 3), unit: "M" }))}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78" }}>
                Exterior: {fmt(bom.largoM)} + 2 × {fmt(ANCHO_DESARROLLO_M, 4)} = {fmt(bom.gasketLongitudes.ext)} m &nbsp;|&nbsp;
                Interior: {fmt(bom.largoM)} + 2 × {fmt(bom.laminaInt.anchoDoblada, 4)} = {fmt(bom.gasketLongitudes.int)} m
              </div>
              <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "#1B5E85" }}>
                ★ Código según color de lámina: BLANCO → 400004007 · GRIS → 400004008
              </div>
            </Section>

            <Section icon={Boxes} title="Componentes 7–10 — Consumibles">
              <Table
                rows={[
                  { code: "100350017", desc: "Cinta Masking Tape 1 1/2\" x 50 m", qty: fmt(bom.tape.rollos, 3), unit: "ROLLO" },
                  { code: "400004003", desc: "Cinta Blanca de Poliuretano 3/16\" x 1 1/2\" x 10 m", qty: fmt(bom.poliuretano.rollos, 3), unit: "ROLLO" },
                  { code: "400004119", desc: "Desmoldante-V Marca Hersol", qty: fmt(bom.desmoldante.kg, 3), unit: "KG" },
                  { code: "100686002", desc: "Cartón Corrugado de 1.25 m", qty: fmt(bom.carton.kg, 3), unit: "KG" },
                ]}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78" }}>
                Ancho de referencia: {fmt(ANCHO_DESARROLLO_M, 4)} m (desarrollo exterior)
              </div>
            </Section>

            {bom.promotor.qtyCarasInox > 0 && (
              <Section icon={Boxes} title="Componente 11 — Promotor de Adherencia (inox)">
                <Table rows={[{ code: "300371000", desc: `Promotor de Adherencia (${bom.promotor.qtyCarasInox} cara(s) inox)`, qty: fmt(bom.promotor.lt, 3), unit: "LT" }]} />
              </Section>
            )}
          </div>

          <div style={{ position: "sticky", top: 12 }}>
            <Section icon={Ruler} title="Diagrama de pieza">
              <PlantaEscuadra espesorPanel={bom.espesorPanel} />
              <PanelDiagram
                largoM={bom.largoM}
                posicionesTop={bom.oscilockTop.posiciones}
                qtyOscTop={bom.oscilockTop.qty}
                posicionesBottom={bom.oscilockBottom.posiciones}
                qtyOscBottom={bom.oscilockBottom.qty}
                qtyOscLateral={bom.oscilockLateral.qty}
              />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CONTRATO CON LA GALERÍA (generado por scripts/integrar.mjs)
   El BOM se lee de las mismas tablas que dibuja este componente.
   ============================================================ */
export const META = {
  "codigo": "EB",
  "nombre": "Esquinero estándar con piso",
  "categoria": "Esquineros",
  "descripcion": "Esquinero estándar, largo libre, con piso."
};

export const PARAMS_DEFAULT = {
  largoM: 2.4,
  espesorMm: 100,
  matExtCode: MATERIALES[0].code,
  matIntCode: MATERIALES[0].code,
};

const _ev = (p) => evaluar(EBMotorCalculo, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
