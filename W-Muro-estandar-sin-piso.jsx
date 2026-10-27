import React, { useMemo, useState, useEffect } from "react";
import { Ruler, Layers, Settings2, AlertTriangle, Boxes } from "lucide-react";
import { evaluar } from "../lib/bomDesdeVista.js";

/* ============================================================
   W — MOTOR DE CÁLCULO (BOM paramétrico)
   Muro Estándar sin Piso — Ojeda
   Derivado del motor TH (Techo de Relleno/Central), que a su vez
   deriva de TCM (Techo C Macho). Se conserva la estructura general
   (constantes, maestro de materiales, patrón de tablas/diagrama),
   con las siguientes diferencias propias de un MURO SIN PISO:

   1. Se ELIMINA End Cap / Trim Cap, Grapa Techo-Piso y Perno de
      latón (no aplican a un muro sin piso).
   2. Lámina exterior: a lo ANCHO se resta 2 mm (igual que TH/TCM,
      TOL_ANCHO). A lo LARGO ya NO se resta ninguna tolerancia
      (en TH/TCM se restaba TOL_LARGO = 1 mm).
   3. Lámina interior: dimensionalmente IDÉNTICA a la exterior
      (mismo ancho y largo doblada, sin descuento de espesor de
      panel ni AJUSTE_LAM_INT). Solo el material/acabado puede
      diferir entre cara exterior e interior, según el proyecto.
   4. Núcleo de espuma: sin cambios respecto a TH/TCM.
   5. Oscilock lateral (macho + hembra), a lo largo del muro:
      misma fórmula de espaciamiento que TH/TCM (cada 0.876 m,
      primera posición a 0.438 m). Macho de un lado, hembra del
      otro.
   6. NUEVO — Oscilock Macho en CABEZAL SUPERIOR: el muro ensambla
      con el techo de la posición que ocupa dentro de la cámara.
      Cantidad según ancho modular de la pieza:
        · 1 o 2 módulos de ancho → 1 oscilock (centrado)
        · 3 o 4 módulos de ancho → 2 oscilock (a 0.292 m de c/borde)
      Es el MISMO oscilock macho (mismo código/kit 400004053) que
      el lateral — su cantidad se SUMA a la cantidad de oscilock
      macho lateral para todos los materiales del kit.
      Como W es fijo a 4 módulos de ancho → siempre son 2 piezas.
   7. Sello Gasket: ahora cubre lado lateral macho + cabezal
      superior (longitud base por cara = largoM + anchoM, en vez
      de solo largoM×2 como en TH). Código de gasket depende del
      color de la lámina (blanco/gris) de cada cara, igual patrón
      condicional que TH.
   8. Consumibles (Masking Tape, Poliuretano, Desmoldante, Cartón)
      y Promotor de Adherencia: SIN CAMBIOS respecto a TH/TCM.
   ============================================================ */

// ---------- Constantes globales ----------
const MODULO_M = 0.2921;
const TOL_ANCHO = 0.002;              // resta a lo ancho (lámina ext/int)
const CONSUMO_DOBLEZ = 0.051;
const ANCHO_ROLLO = 1.219;
const ANCHO_MOD_MIN = 1;              // W: ancho mínimo = 1 módulo
const ANCHO_MOD_MAX = 4;              // W: ancho máximo = 4 módulos
const OSCILOCK_PRIMERA_POS = 0.438;
const OSCILOCK_PASO = 0.876;
const OSCILOCK_TOP_INSET = 0.292;     // inset desde cada borde cuando hay 2 piezas arriba

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

// Código de Sello Gasket según color de lámina
const GASKET_CODES = {
  BLANCO: "400004007",
  GRIS: "400004008",
};

// ---------- Núcleo de espuma ----------
const DENSIDAD_ESPUMA = 40; // kg/m3, fijo
const RATIO_POLIOL = 100;
const RATIO_ISOCIANATO = 120;

function fmt__base(n, d = 3) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ============================================================
   Motor de cálculo — calcularBOM
   ============================================================ */
function calcularBOM({ anchoMod, largoM, espesorMm, matExtCode, matIntCode }) {
  const matExt = MATERIALES.find((m) => m.code === matExtCode);
  const matInt = MATERIALES.find((m) => m.code === matIntCode);

  // Ancho: en módulos (1 a 4). Largo: directamente en metros (NO modular).
  const anchoM = anchoMod * MODULO_M;

  // ---- Componente 1: Lámina exterior ----
  // Ancho doblada: se resta 2 mm (TOL_ANCHO). Largo doblada: sin resta.
  const anchoDobladaExt = anchoM - TOL_ANCHO;
  const largoDobladaExt = largoM;
  const anchoFlatExt = anchoDobladaExt - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const largoFlatExt = largoDobladaExt - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaExt = (anchoFlatExt / ANCHO_ROLLO) * largoFlatExt * matExt.factor;

  // ---- Componente 2: Lámina interior ----
  // Idéntica dimensionalmente a la exterior; solo puede variar el material.
  const anchoDobladaInt = anchoDobladaExt;
  const largoDobladaInt = largoDobladaExt;
  const anchoFlatInt = anchoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const largoFlatInt = largoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaInt = (anchoFlatInt / ANCHO_ROLLO) * largoFlatInt * matInt.factor;

  // ---- Componente 3: Núcleo de espuma ----
  const espesorPanel = espesorMm / 1000;
  const volumenNucleo = anchoM * largoM * espesorPanel;
  const kgEspumaTotal = volumenNucleo * DENSIDAD_ESPUMA;
  const kgPoliol = kgEspumaTotal * (RATIO_POLIOL / (RATIO_POLIOL + RATIO_ISOCIANATO));
  const kgIsocianato = kgEspumaTotal * (RATIO_ISOCIANATO / (RATIO_POLIOL + RATIO_ISOCIANATO));

  // ---- Oscilock lateral (a lo largo) — Macho y Hembra ----
  const qtyOscilockLateral =
    largoM >= OSCILOCK_PRIMERA_POS ? Math.floor((largoM - OSCILOCK_PRIMERA_POS) / OSCILOCK_PASO) + 1 : 0;

  // ---- Oscilock Macho — Cabezal superior (NUEVO en W) ----
  const qtyOscilockTop = anchoMod >= 3 ? 2 : 1;
  const posicionesTop =
    qtyOscilockTop === 2
      ? [OSCILOCK_TOP_INSET, anchoM - OSCILOCK_TOP_INSET]
      : [anchoM / 2];

  // ---- Oscilock Macho TOTAL (lateral + cabezal superior, mismo kit) ----
  const qtyOscilockMachoTotal = qtyOscilockLateral + qtyOscilockTop;
  const kgLaminaC20OscilockMacho = qtyOscilockMachoTotal * 0.44;
  const hojaLaminaC10OscilockMacho = qtyOscilockMachoTotal * 0.002;
  const kgPinturaEpoxicaOscilockMacho = qtyOscilockMachoTotal * 0.0132;

  // ---- Oscilock Hembra (solo lateral) ----
  const qtyOscilockHembra = qtyOscilockLateral;
  const KG_LAMINA_POR_CARCASA_HEMBRA = 0.18;
  const CARCASAS_POR_KIT_HEMBRA = 2;
  const kgLaminaC20OscilockHembra = qtyOscilockHembra * CARCASAS_POR_KIT_HEMBRA * KG_LAMINA_POR_CARCASA_HEMBRA;

  // ---- Componente 6: Sello Gasket (lateral macho + cabezal superior) ----
  const longitudGasketPorCara = largoM + anchoM;
  const colorExt = matExt.color;
  const colorInt = matInt.color;
  let gasketLines = [];
  if (colorExt === colorInt) {
    gasketLines.push({ code: GASKET_CODES[colorExt], metros: longitudGasketPorCara * 2, cara: "Exterior + Interior (lateral + cabezal sup.)" });
  } else {
    gasketLines.push({ code: GASKET_CODES[colorExt], metros: longitudGasketPorCara, cara: "Exterior (lateral + cabezal sup.)" });
    gasketLines.push({ code: GASKET_CODES[colorInt], metros: longitudGasketPorCara, cara: "Interior (lateral + cabezal sup.)" });
  }

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
  const ltPromotorTotal = areaM2 * 0.03125 * qtyCarasInox;

  return {
    anchoM,
    largoM,
    espesorPanel,
    laminaExt: { anchoDoblada: anchoDobladaExt, largoDoblada: largoDobladaExt, anchoFlat: anchoFlatExt, largoFlat: largoFlatExt, kg: kgLaminaExt },
    laminaInt: { anchoDoblada: anchoDobladaInt, largoDoblada: largoDobladaInt, anchoFlat: anchoFlatInt, largoFlat: largoFlatInt, kg: kgLaminaInt },
    nucleo: { volumen: volumenNucleo, kgEspuma: kgEspumaTotal, kgPoliol, kgIsocianato },
    oscilockLateral: { qty: qtyOscilockLateral },
    oscilockTop: { qty: qtyOscilockTop, posiciones: posicionesTop },
    oscilockMacho: { qtyTotal: qtyOscilockMachoTotal, kgLaminaC20: kgLaminaC20OscilockMacho, hojaLaminaC10: hojaLaminaC10OscilockMacho, kgPintura: kgPinturaEpoxicaOscilockMacho },
    oscilockHembra: { qty: qtyOscilockHembra, kgLaminaC20: kgLaminaC20OscilockHembra },
    gasket: gasketLines,
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

function PanelDiagram({ anchoM, largoM, posicionesTop, qtyOscTop, qtyOscLateral }) {
  const maxRw = 220;
  const maxRh = 460;
  const scale = Math.min(maxRw / anchoM, maxRh / largoM);
  const rw = anchoM * scale;
  const rh = largoM * scale;

  const padTop = 60, padBottom = 40, padSide = 110;
  const w = rw + padSide * 2;
  const h = rh + padTop + padBottom;
  const x0 = (w - rw) / 2;
  const y0 = padTop;

  // Marcas laterales (macho/hembra), medidas desde la parte inferior
  const marks = [];
  for (let p = OSCILOCK_PRIMERA_POS; p <= largoM + 1e-6; p += OSCILOCK_PASO) marks.push(p);

  const COLOR_MACHO = "#1B5E85"; // azul
  const COLOR_HEMBRA = "#D6409F"; // rosa/magenta
  const COLOR_GASKET = "#2E9E5B"; // verde

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: 300, display: "block", margin: "0 auto" }}>
      <rect x={x0} y={y0} width={rw} height={rh} fill="#F4F7F8" stroke="#1B5E85" strokeWidth="1.5" />

      {/* Gasket — cabezal superior (línea verde) */}
      <line x1={x0} y1={y0 - 5} x2={x0 + rw} y2={y0 - 5} stroke={COLOR_GASKET} strokeWidth="2.5" />
      {/* Gasket — lateral macho (línea verde, lado derecho) */}
      <line x1={x0 + rw + 5} y1={y0} x2={x0 + rw + 5} y2={y0 + rh} stroke={COLOR_GASKET} strokeWidth="2.5" />

      {/* Oscilock macho — cabezal superior */}
      {posicionesTop.map((p, i) => (
        <rect key={"top" + i} x={x0 + p * scale - 5} y={y0 - 16} width="10" height="8" fill={COLOR_MACHO} />
      ))}

      {/* Oscilock hembra lateral — lado izquierdo */}
      {marks.map((p, i) => (
        <rect key={"h" + i} x={x0 - 12} y={y0 + rh - p * scale - 3} width="10" height="6" fill={COLOR_HEMBRA} />
      ))}
      {/* Oscilock macho lateral — lado derecho */}
      {marks.map((p, i) => (
        <rect key={"m" + i} x={x0 + rw + 2} y={y0 + rh - p * scale - 3} width="10" height="6" fill={COLOR_MACHO} />
      ))}

      <text x={x0 + rw / 2} y={y0 - 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#1B5E85">{fmt(anchoM, 3)} m</text>
      <text x={x0 - 42} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#1B5E85" transform={`rotate(-90 ${x0 - 42} ${y0 + rh / 2})`}>{fmt(largoM, 3)} m</text>

      <text x={x0 - 30} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_HEMBRA} transform={`rotate(-90 ${x0 - 30} ${y0 + rh / 2})`}>HEMBRA ({qtyOscLateral})</text>
      <text x={x0 + rw + 30} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO} transform={`rotate(90 ${x0 + rw + 30} ${y0 + rh / 2})`}>MACHO ({qtyOscLateral})</text>

      <text x={x0 + rw / 2} y={y0 - 40} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO}>MACHO CABEZAL SUP. ({qtyOscTop})</text>
      <text x={x0 + rw / 2} y={y0 + rh + 20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_GASKET}>— Gasket (lateral macho + cabezal sup.)</text>
      <text x={x0 + rw / 2} y={y0 + rh + 34} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">Sin End Cap · Sin Grapa · Sin Perno</text>
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

export default function WMotorCalculo({ paramsIniciales, onParams }) {
  const [anchoMod, setAnchoMod] = useState(paramsIniciales?.anchoMod ?? 4); // W: 1 a 4 módulos, 4 = máximo permisible
  const [largoM, setLargoM] = useState(paramsIniciales?.largoM ?? 2.4);   // W: largo directo en metros (no modular)
  const [espesorMm, setEspesorMm] = useState(paramsIniciales?.espesorMm ?? 100);
  const [matExtCode, setMatExtCode] = useState(paramsIniciales?.matExtCode ?? MATERIALES[0].code);
  const [matIntCode, setMatIntCode] = useState(paramsIniciales?.matIntCode ?? MATERIALES[0].code);
  const __params = { anchoMod, largoM, espesorMm, matExtCode, matIntCode };
  useEffect(() => { onParams?.(__params); }, [JSON.stringify(__params)]); // eslint-disable-line

  const anchoModClamped = Math.min(ANCHO_MOD_MAX, Math.max(ANCHO_MOD_MIN, anchoMod || ANCHO_MOD_MIN));
  const largoMClamped = Math.max(0, largoM || 0);

  const bom = useMemo(
    () => calcularBOM({ anchoMod: anchoModClamped, largoM: largoMClamped, espesorMm, matExtCode, matIntCode }),
    [anchoModClamped, largoMClamped, espesorMm, matExtCode, matIntCode]
  );

  const codigo = `W-${anchoModClamped}-${largoMClamped.toFixed(2)}-${espesorMm}`;


  if (globalThis.__BOM_RAW__) globalThis.__BOM_ETIQUETA__ = codigo;
  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", background: "#EEF2F4", minHeight: "100%", padding: 20 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Motor de cálculo BOM · Derivado de TH / TCM
          </div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "#1B2A33", margin: "4px 0 0" }}>
            W — Muro Estándar sin Piso
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#1B5E85", marginTop: 4 }}>{codigo}</div>
        </div>

        <Section icon={Settings2} title="Parámetros de la pieza">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Field label="Ancho (módulos, máx. 4)">
              <select style={inputStyle} value={anchoModClamped} onChange={(e) => setAnchoMod(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} módulo{n > 1 ? "s" : ""} ({fmt(n * MODULO_M, 3)} m)</option>
                ))}
              </select>
            </Field>
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
            W: ancho de {ANCHO_MOD_MIN} a {ANCHO_MOD_MAX} módulos ({fmt(bom.anchoM, 3)} m con el ancho actual). El largo se define directamente en metros, sin límite máximo.
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
                Doblada Ext: {fmt(bom.laminaExt.anchoDoblada)} × {fmt(bom.laminaExt.largoDoblada)} m &nbsp;|&nbsp;
                Flat Ext: {fmt(bom.laminaExt.anchoFlat)} × {fmt(bom.laminaExt.largoFlat)} m
                <br />
                Doblada Int: {fmt(bom.laminaInt.anchoDoblada)} × {fmt(bom.laminaInt.largoDoblada)} m &nbsp;|&nbsp;
                Flat Int: {fmt(bom.laminaInt.anchoFlat)} × {fmt(bom.laminaInt.largoFlat)} m
                <div style={{ marginTop: 4, color: "#1B5E85" }}>
                  ★ W: lámina interior idéntica dimensionalmente a la exterior · sin tolerancia a lo largo (a diferencia de TH)
                </div>
              </div>
            </Section>

            <Section icon={Boxes} title="Componente 3 — Núcleo de espuma">
              <Table
                rows={[
                  { code: "100709010", desc: "POLIOL DCR 1148.06", qty: fmt(bom.nucleo.kgPoliol, 3), unit: "KG" },
                  { code: "100710008", desc: "ISOCIANATO VORACOR CE 153", qty: fmt(bom.nucleo.kgIsocianato, 3), unit: "KG" },
                ]}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78" }}>
                Volumen: {fmt(bom.nucleo.volumen, 4)} m³ &nbsp;|&nbsp; Densidad: 40 kg/m³ &nbsp;|&nbsp; Relación 100:120
              </div>
            </Section>

            <Section icon={Boxes} title="Oscilock Macho (lateral + cabezal superior)">
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
                ★ Total = lateral ({bom.oscilockLateral.qty}) + cabezal superior ({bom.oscilockTop.qty}). Mismo kit/código para ambos usos.
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

            <Section icon={Boxes} title="Componente 6 — Sello Gasket (lateral macho + cabezal superior)">
              <Table
                rows={bom.gasket.map((g) => ({ code: g.code, desc: `Sello Gasket PVC c/UV — ${g.cara}`, qty: fmt(g.metros, 3), unit: "M" }))}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#1B5E85" }}>
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
            </Section>

            {bom.promotor.qtyCarasInox > 0 && (
              <Section icon={Boxes} title="Componente 11 — Promotor de Adherencia (inox)">
                <Table rows={[{ code: "300371000", desc: `Promotor de Adherencia (${bom.promotor.qtyCarasInox} cara(s) inox)`, qty: fmt(bom.promotor.lt, 3), unit: "LT" }]} />
              </Section>
            )}
          </div>

          <div style={{ position: "sticky", top: 12 }}>
            <Section icon={Ruler} title="Diagrama de pieza">
              <PanelDiagram
                anchoM={bom.anchoM}
                largoM={bom.largoM}
                posicionesTop={bom.oscilockTop.posiciones}
                qtyOscTop={bom.oscilockTop.qty}
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
  "codigo": "W",
  "nombre": "Muro estándar sin piso",
  "categoria": "Muros",
  "descripcion": "Muro de 1 a 4 módulos de ancho y largo libre, sin piso."
};

export const PARAMS_DEFAULT = {
  anchoMod: 4,
  largoM: 2.4,
  espesorMm: 100,
  matExtCode: MATERIALES[0].code,
  matIntCode: MATERIALES[0].code,
};

const _ev = (p) => evaluar(WMotorCalculo, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
