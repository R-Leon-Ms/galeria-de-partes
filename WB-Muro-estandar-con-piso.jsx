import React, { useMemo, useState, useEffect } from "react";
import { Ruler, Layers, Settings2, AlertTriangle, Boxes, Copy } from "lucide-react";
import { evaluar } from "../lib/bomDesdeVista.js";

/* ============================================================
   WB — MOTOR DE CÁLCULO (BOM paramétrico)
   Muro Estándar con Piso — Ojeda
   Derivado directo de W (Muro Estándar sin Piso). Se conservan
   TODAS las reglas de W, excepto:

   1. NUEVO — Oscilock Macho en CABEZAL INFERIOR (unión con piso):
      misma cantidad que el cabezal superior según ancho modular
        · 1 o 2 módulos → 1 pza (centrada)
        · 3 o 4 módulos → 2 pzas (a 0.292 m de cada borde)
      Mismo kit/código 400004053; se SUMA al total de macho:
        qtyMacho = lateral + cabezalSup + cabezalInf
   2. Sello Gasket: se agrega el ancho del cabezal inferior.
        longitud por cara = largoM + 2 × anchoM
      Código según color de lámina de cada cara:
        BLANCO → 400004007 · GRIS → 400004008

   Sin cambios vs. W: láminas ext/int (ancho −2 mm, largo sin
   resta, interior idéntica a exterior), núcleo de espuma,
   oscilock hembra (solo lateral), consumibles y promotor.
   Eliminados (igual que W): End Cap, Grapa Techo-Piso, Perno.
   ============================================================ */

// ---------- Constantes globales ----------
const MODULO_M = 0.2921;
const TOL_ANCHO = 0.002;
const CONSUMO_DOBLEZ = 0.051;
const ANCHO_ROLLO = 1.219;
const ANCHO_MOD_MIN = 1;
const ANCHO_MOD_MAX = 4;
const OSCILOCK_PRIMERA_POS = 0.438;
const OSCILOCK_PASO = 0.876;
const OSCILOCK_CABEZAL_INSET = 0.292;

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

const GASKET_CODES = { BLANCO: "400004007", GRIS: "400004008" };

// ---------- Núcleo de espuma ----------
const DENSIDAD_ESPUMA = 40;
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
  const anchoM = anchoMod * MODULO_M;

  // ---- Componente 1: Lámina exterior (ancho −2 mm, largo sin resta) ----
  const anchoDoblada = anchoM - TOL_ANCHO;
  const largoDoblada = largoM;
  const anchoFlatExt = anchoDoblada - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const largoFlatExt = largoDoblada - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaExt = (anchoFlatExt / ANCHO_ROLLO) * largoFlatExt * matExt.factor;

  // ---- Componente 2: Lámina interior (idéntica dimensionalmente) ----
  const anchoFlatInt = anchoDoblada - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const largoFlatInt = largoDoblada - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaInt = (anchoFlatInt / ANCHO_ROLLO) * largoFlatInt * matInt.factor;

  // ---- Componente 3: Núcleo de espuma ----
  const espesorPanel = espesorMm / 1000;
  const volumen = anchoM * largoM * espesorPanel;
  const kgEspuma = volumen * DENSIDAD_ESPUMA;
  const kgPoliol = kgEspuma * (RATIO_POLIOL / (RATIO_POLIOL + RATIO_ISOCIANATO));
  const kgIsocianato = kgEspuma * (RATIO_ISOCIANATO / (RATIO_POLIOL + RATIO_ISOCIANATO));

  // ---- Oscilock lateral (a lo largo) ----
  const qtyLateral =
    largoM >= OSCILOCK_PRIMERA_POS ? Math.floor((largoM - OSCILOCK_PRIMERA_POS) / OSCILOCK_PASO + 1e-9) + 1 : 0;

  // ---- Oscilock Macho — cabezal superior e inferior (WB) ----
  const qtyCabezal = anchoMod >= 3 ? 2 : 1;
  const posCabezal = qtyCabezal === 2 ? [OSCILOCK_CABEZAL_INSET, anchoM - OSCILOCK_CABEZAL_INSET] : [anchoM / 2];

  // ---- Oscilock Macho TOTAL (mismo kit 400004053) ----
  const qtyMacho = qtyLateral + qtyCabezal + qtyCabezal;
  const kgC20Macho = qtyMacho * 0.44;
  const hojaC10Macho = qtyMacho * 0.002;
  const kgPinturaMacho = qtyMacho * 0.0132;

  // ---- Oscilock Hembra (solo lateral) ----
  const qtyHembra = qtyLateral;
  const kgC20Hembra = qtyHembra * 2 * 0.18;

  // ---- Sello Gasket (lateral macho + cabezal sup. + cabezal inf.) ----
  const gasketPorCara = largoM + 2 * anchoM;
  const gasket =
    matExt.color === matInt.color
      ? [{ code: GASKET_CODES[matExt.color], color: matExt.color, metros: gasketPorCara * 2, cara: "exterior + interior" }]
      : [
          { code: GASKET_CODES[matExt.color], color: matExt.color, metros: gasketPorCara, cara: "exterior" },
          { code: GASKET_CODES[matInt.color], color: matInt.color, metros: gasketPorCara, cara: "interior" },
        ];

  // ---- Consumibles (idénticos a W) ----
  const metrosTape = (4 * anchoM + 4 * largoM) * 1.1;
  const rollosTape = metrosTape / 50;
  const rollosPoliuretano = 0.6 / 10;
  const areaM2 = anchoM * largoM;
  const kgDesmoldante = areaM2 * 0.0625;
  const metrosCarton = largoM * 1.03;
  const kgCarton = metrosCarton * 0.5;

  // ---- Promotor de adherencia (condicional inox) ----
  const carasInox = (matExt.inox ? 1 : 0) + (matInt.inox ? 1 : 0);
  const ltPromotor = areaM2 * 0.03125 * carasInox;

  return {
    matExt, matInt, anchoM, largoM, espesorPanel,
    anchoDoblada, largoDoblada, anchoFlatExt, largoFlatExt, kgLaminaExt, anchoFlatInt, largoFlatInt, kgLaminaInt,
    volumen, kgPoliol, kgIsocianato,
    qtyLateral, qtyCabezal, posCabezal, qtyMacho, kgC20Macho, hojaC10Macho, kgPinturaMacho,
    qtyHembra, kgC20Hembra,
    gasketPorCara, gasket,
    metrosTape, rollosTape, rollosPoliuretano, areaM2, kgDesmoldante, kgCarton,
    carasInox, ltPromotor,
  };
}

/* ============================================================
   Estilos y componentes visuales
   ============================================================ */
const C = {
  bg: "#E9EEF1", panel: "#FFFFFF", panel2: "#F3F6F8", line: "#D4DDE3", lineSoft: "#E6ECEF",
  ink: "#16252E", ink2: "#4E606C", accent: "#1B5E85",
  macho: "#1B5E85", hembra: "#C23A8E", gasket: "#2A8F55", warn: "#9A5B12", warnSoft: "#FBF1E3",
  newSoft: "#E4F3EA",
};
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

const inputStyle = {
  border: `1px solid ${C.line}`, borderRadius: 5, padding: "8px 10px",
  fontSize: 14, color: C.ink, background: C.panel, minWidth: 0,
};

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: C.ink2, fontWeight: 500 }}>
      {label}
      {children}
    </label>
  );
}

function Section({ icon: Icon, title, badge, children }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 16, background: C.panel }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.lineSoft}`, background: C.panel2, borderRadius: "8px 8px 0 0" }}>
        <Icon size={15} color={C.accent} />
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.gasket, background: C.newSoft, borderRadius: 4, padding: "1px 7px" }}>{badge}</span>
        )}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function Table({ rows }) {
  const th = { textAlign: "left", padding: "7px 8px", color: C.ink2, borderBottom: `1.5px solid ${C.line}`, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>
            <th style={th}>No. parte</th>
            <th style={th}>Descripción</th>
            <th style={{ ...th, textAlign: "right" }}>Cant.</th>
            <th style={th}>UM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, fontFamily: MONO, whiteSpace: "nowrap" }}>{r.code}</td>
              <td style={td}>{r.desc}</td>
              <td style={{ ...td, fontFamily: MONO, textAlign: "right", whiteSpace: "nowrap" }}>{r.qty}</td>
              <td style={{ ...td, fontFamily: MONO, color: C.ink2 }}>{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Nota({ children }) {
  return <div style={{ marginTop: 8, fontSize: 12.5, color: C.ink2 }}>{children}</div>;
}

function PanelDiagram({ b }) {
  const s = Math.min(170 / b.anchoM, 360 / b.largoM);
  const rw = b.anchoM * s, rh = b.largoM * s;
  const padX = 70, padTop = 54, padBot = 54;
  const W = rw + padX * 2, H = rh + padTop + padBot;
  const x0 = padX, y0 = padTop, cy = y0 + rh / 2;
  const marks = [];
  for (let p = OSCILOCK_PRIMERA_POS; p <= b.largoM + 1e-6; p += OSCILOCK_PASO) marks.push(p);
  const t = { fontFamily: MONO };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 300, display: "block", margin: "0 auto" }}>
      <rect x={x0} y={y0} width={rw} height={rh} fill={C.panel2} stroke={C.accent} strokeWidth="1.5" />
      {/* Gasket: cabezal superior, cabezal inferior y lateral macho */}
      <line x1={x0} y1={y0 - 4} x2={x0 + rw} y2={y0 - 4} stroke={C.gasket} strokeWidth="2.5" />
      <line x1={x0} y1={y0 + rh + 4} x2={x0 + rw} y2={y0 + rh + 4} stroke={C.gasket} strokeWidth="2.5" />
      <line x1={x0 + rw + 4} y1={y0} x2={x0 + rw + 4} y2={y0 + rh} stroke={C.gasket} strokeWidth="2.5" />
      {/* Oscilock macho en cabezales */}
      {b.posCabezal.map((p, i) => (
        <g key={"cab" + i}>
          <rect x={x0 + p * s - 5} y={y0 - 15} width="10" height="7" fill={C.macho} />
          <rect x={x0 + p * s - 5} y={y0 + rh + 8} width="10" height="7" fill={C.macho} />
        </g>
      ))}
      {/* Laterales: hembra izquierda, macho derecha */}
      {marks.map((p, i) => (
        <g key={"lat" + i}>
          <rect x={x0 - 12} y={y0 + rh - p * s - 3} width="10" height="6" fill={C.hembra} />
          <rect x={x0 + rw + 8} y={y0 + rh - p * s - 3} width="10" height="6" fill={C.macho} />
        </g>
      ))}
      <text x={x0 + rw / 2} y={y0 - 38} textAnchor="middle" fontSize="11" fill={C.ink} style={t}>{fmt(b.anchoM)} m</text>
      <text x={x0 + rw / 2} y={y0 - 24} textAnchor="middle" fontSize="10" fill={C.macho} style={t}>cabezal sup. · {b.qtyCabezal}</text>
      <text x={x0 + rw / 2} y={y0 + rh + 30} textAnchor="middle" fontSize="10" fill={C.macho} style={t}>cabezal inf. · {b.qtyCabezal}</text>
      <text x={x0 + rw / 2} y={y0 + rh + 44} textAnchor="middle" fontSize="9.5" fill={C.ink2} style={t}>unión con piso</text>
      <text x={x0 - 44} y={cy} textAnchor="middle" fontSize="11" fill={C.ink} style={t} transform={`rotate(-90 ${x0 - 44} ${cy})`}>{fmt(b.largoM)} m</text>
      <text x={x0 - 26} y={cy} textAnchor="middle" fontSize="10" fill={C.hembra} style={t} transform={`rotate(-90 ${x0 - 26} ${cy})`}>hembra · {b.qtyLateral}</text>
      <text x={x0 + rw + 32} y={cy} textAnchor="middle" fontSize="10" fill={C.macho} style={t} transform={`rotate(90 ${x0 + rw + 32} ${cy})`}>macho · {b.qtyLateral}</text>
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

export default function WBMotorCalculo({ paramsIniciales, onParams }) {
  const [anchoMod, setAnchoMod] = useState(paramsIniciales?.anchoMod ?? 4);
  const [largoTxt, setLargoTxt] = useState(paramsIniciales?.largoTxt ?? "2.40");
  const [espesorMm, setEspesorMm] = useState(paramsIniciales?.espesorMm ?? 100);
  const [matExtCode, setMatExtCode] = useState(paramsIniciales?.matExtCode ?? MATERIALES[0].code);
  const [matIntCode, setMatIntCode] = useState(paramsIniciales?.matIntCode ?? MATERIALES[0].code);
  const [copiado, setCopiado] = useState(paramsIniciales?.copiado ?? "");
  const __params = { anchoMod, largoTxt, espesorMm, matExtCode, matIntCode };
  useEffect(() => { onParams?.(__params); }, [JSON.stringify(__params)]); // eslint-disable-line

  const largoRaw = parseFloat(largoTxt);
  const largoValido = Number.isFinite(largoRaw) && largoRaw > 0;
  const largoM = largoValido ? largoRaw : 0.1;
  const anchoOk = Math.min(ANCHO_MOD_MAX, Math.max(ANCHO_MOD_MIN, anchoMod));

  const b = useMemo(
    () => calcularBOM({ anchoMod: anchoOk, largoM, espesorMm, matExtCode, matIntCode }),
    [anchoOk, largoM, espesorMm, matExtCode, matIntCode]
  );

  const codigo = `WB-${anchoOk}-${largoM.toFixed(2)}-${espesorMm}`;


  if (globalThis.__BOM_RAW__) globalThis.__BOM_ETIQUETA__ = codigo;
  // ---- Filas por grupo ----
  const rowsLaminas = [
    { code: b.matExt.code, desc: `Lámina exterior — ${b.matExt.desc}`, qty: fmt(b.kgLaminaExt), unit: "KG" },
    { code: b.matInt.code, desc: `Lámina interior — ${b.matInt.desc}`, qty: fmt(b.kgLaminaInt), unit: "KG" },
  ];
  const rowsNucleo = [
    { code: "100709010", desc: "Poliol DCR 1148.06", qty: fmt(b.kgPoliol), unit: "KG" },
    { code: "100710008", desc: "Isocianato Voracor CE 153", qty: fmt(b.kgIsocianato), unit: "KG" },
  ];
  const q = b.qtyMacho;
  const rowsMacho = [
    { code: "400004053", desc: "Oscilock macho Mca. Ojeda", qty: q, unit: "PZA" },
    { code: "400004054", desc: "Carcasa izquierda p/ oscilock macho", qty: q, unit: "PZA" },
    { code: "400004055", desc: "Carcasa derecha p/ oscilock macho", qty: q, unit: "PZA" },
    { code: "400004056", desc: "Gancho para oscilock", qty: q, unit: "PZA" },
    { code: "400004030", desc: "Muelle oscilock", qty: q, unit: "PZA" },
    { code: "400004031", desc: "Excéntrico de zamac", qty: q, unit: "PZA" },
    { code: "100441000", desc: 'Pija #8 x 3/4"', qty: q, unit: "PZA" },
    { code: "100432001", desc: "Pintura epóxica polvo negro", qty: fmt(b.kgPinturaMacho, 4), unit: "KG" },
    { code: "100450016", desc: "Lámina galvanizada C-20 (carcasas macho)", qty: fmt(b.kgC20Macho), unit: "KG" },
    { code: "100462018", desc: "Lámina C-10 (gancho)", qty: fmt(b.hojaC10Macho, 4), unit: "HOJA" },
  ];
  const rowsHembra = [
    { code: "400004050", desc: "Oscilock hembra Mca. Ojeda", qty: b.qtyHembra, unit: "PZA" },
    { code: "400004051", desc: "Carcasa izquierda p/ oscilock hembra", qty: b.qtyHembra, unit: "PZA" },
    { code: "400004052", desc: "Carcasa derecha p/ oscilock hembra", qty: b.qtyHembra, unit: "PZA" },
    { code: "400030211", desc: "Remache semi-circular cabeza plana 250x375", qty: b.qtyHembra, unit: "PZA" },
    { code: "100450016", desc: "Lámina galvanizada C-20 (carcasas hembra)", qty: fmt(b.kgC20Hembra), unit: "KG" },
  ];
  const rowsGasket = b.gasket.map((g) => ({
    code: g.code, desc: `Sello gasket PVC c/UV ${g.color.toLowerCase()} — ${g.cara}`, qty: fmt(g.metros), unit: "M",
  }));
  const rowsConsumibles = [
    { code: "100350017", desc: 'Cinta masking tape 1 1/2" x 50 m', qty: fmt(b.rollosTape), unit: "ROLLO" },
    { code: "400004003", desc: 'Cinta blanca de poliuretano 3/16" x 1 1/2" x 10 m', qty: fmt(b.rollosPoliuretano), unit: "ROLLO" },
    { code: "400004119", desc: "Desmoldante-V Marca Hersol", qty: fmt(b.kgDesmoldante), unit: "KG" },
    { code: "100686002", desc: "Cartón corrugado de 1.25 m", qty: fmt(b.kgCarton), unit: "KG" },
  ];
  const rowsPromotor = b.carasInox > 0
    ? [{ code: "300371000", desc: `Promotor de adherencia (${b.carasInox} cara(s) inox)`, qty: fmt(b.ltPromotor), unit: "LT" }]
    : [];

  const todas = [...rowsLaminas, ...rowsNucleo, ...rowsMacho, ...rowsHembra, ...rowsGasket, ...rowsConsumibles, ...rowsPromotor];

  const copiarBOM = async () => {
    const lineas = [`Pieza\t${codigo}`, "No. parte\tDescripción\tCantidad\tUM"];
    todas.forEach((r) => lineas.push(`${r.code}\t${r.desc}\t${String(r.qty).replace(/,/g, "")}\t${r.unit}`));
    try {
      await navigator.clipboard.writeText(lineas.join("\n"));
      setCopiado("BOM copiado");
    } catch (e) {
      setCopiado("No se pudo copiar; selecciona la tabla manualmente");
    }
    setTimeout(() => setCopiado(""), 2200);
  };

  let aviso = { warn: false, text: `Ancho ${fmt(b.anchoM)} m (${anchoOk} módulo${anchoOk > 1 ? "s" : ""}). Sin largo máximo. Sin End Cap, grapa ni perno.` };
  if (!largoValido) aviso = { warn: true, text: "Escribe un largo mayor a 0 m. Mientras tanto se calcula con 0.10 m." };
  else if (b.qtyLateral === 0) aviso = { warn: true, text: `Con ${fmt(largoM, 2)} m de largo no cabe oscilock lateral (primera posición a 0.438 m). Solo se cuentan los de cabezal.` };

  const dims = [
    ["Ancho nominal", `${fmt(b.anchoM)} m`],
    ["Largo nominal", `${fmt(b.largoM)} m`],
    ["Lámina doblada", `${fmt(b.anchoDoblada)} × ${fmt(b.largoDoblada)}`],
    ["Flat exterior", `${fmt(b.anchoFlatExt)} × ${fmt(b.largoFlatExt)}`],
    ["Flat interior", `${fmt(b.anchoFlatInt)} × ${fmt(b.largoFlatInt)}`],
    ["Área", `${fmt(b.areaM2)} m²`],
    ["Volumen núcleo", `${fmt(b.volumen, 4)} m³`],
    ["Oscilock macho", `${b.qtyLateral} + ${b.qtyCabezal} + ${b.qtyCabezal} = ${b.qtyMacho}`],
    ["Oscilock hembra", `${b.qtyHembra}`],
    ["Gasket por cara", `${fmt(b.gasketPorCara)} m`],
  ];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", background: C.bg, color: C.ink, minHeight: "100%", padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Encabezado */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>WB — Muro estándar con piso</h1>
            <div style={{ fontSize: 14, color: C.ink2, marginTop: 4 }}>
              Motor de cálculo BOM. Derivado de W con oscilock macho y sello gasket en el cabezal inferior.
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: C.accent, background: C.panel, border: `1.5px solid ${C.accent}`, borderRadius: 6, padding: "6px 14px", whiteSpace: "nowrap" }}>
            {codigo}
          </div>
        </div>

        {/* Parámetros */}
        <Section icon={Settings2} title="Parámetros de la pieza">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            <Field label="Ancho (módulos, máx. 4)">
              <select style={inputStyle} value={anchoMod} onChange={(e) => setAnchoMod(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} módulo{n > 1 ? "s" : ""} · {(n * MODULO_M).toFixed(3)} m</option>
                ))}
              </select>
            </Field>
            <Field label="Largo (m)">
              <input style={inputStyle} type="number" inputMode="decimal" min={0.1} step={0.01} value={largoTxt} onChange={(e) => setLargoTxt(e.target.value)} />
            </Field>
            <Field label="Espesor de panel">
              <select style={inputStyle} value={espesorMm} onChange={(e) => setEspesorMm(Number(e.target.value))}>
                {ESPESORES.map((e) => <option key={e.mm} value={e.mm}>{e.label}</option>)}
              </select>
            </Field>
            <Field label="Lámina exterior">
              <select style={inputStyle} value={matExtCode} onChange={(e) => setMatExtCode(e.target.value)}>
                {MATERIALES.map((m) => <option key={m.code} value={m.code}>{m.desc}</option>)}
              </select>
            </Field>
            <Field label="Lámina interior">
              <select style={inputStyle} value={matIntCode} onChange={(e) => setMatIntCode(e.target.value)}>
                {MATERIALES.map((m) => <option key={m.code} value={m.code}>{m.desc}</option>)}
              </select>
            </Field>
          </div>
          <div style={{
            marginTop: 12, display: "flex", gap: 8, alignItems: "center", fontSize: 13,
            color: aviso.warn ? C.warn : C.ink2, background: aviso.warn ? C.warnSoft : "transparent",
            padding: aviso.warn ? "8px 12px" : 0, borderRadius: 5,
          }}>
            {aviso.warn && <AlertTriangle size={15} />}
            {aviso.text}
          </div>
        </Section>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          {/* BOM */}
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: C.ink2 }}>{todas.length} partidas · {codigo}</span>
              <button
                onClick={copiarBOM}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 500, color: C.accent, background: C.panel, border: `1px solid ${C.accent}`, borderRadius: 5, padding: "6px 12px", cursor: "pointer" }}
              >
                <Copy size={14} /> {copiado || "Copiar BOM para Excel"}
              </button>
            </div>

            <Section icon={Layers} title="Láminas exterior / interior">
              <Table rows={rowsLaminas} />
              <Nota>Ancho −2 mm, largo sin resta. Interior idéntica a exterior; solo puede variar el material.</Nota>
            </Section>

            <Section icon={Boxes} title="Núcleo de espuma">
              <Table rows={rowsNucleo} />
              <Nota>Volumen {fmt(b.volumen, 4)} m³ · densidad 40 kg/m³ · relación 100:120</Nota>
            </Section>

            <Section icon={Boxes} title="Oscilock macho" badge="cambia vs. W">
              <Table rows={rowsMacho} />
              <Nota>
                Total = lateral ({b.qtyLateral}) + cabezal superior ({b.qtyCabezal}) + cabezal inferior ({b.qtyCabezal}). Mismo kit en los tres usos.
              </Nota>
            </Section>

            <Section icon={Boxes} title="Oscilock hembra (lateral)">
              <Table rows={rowsHembra} />
            </Section>

            <Section icon={Boxes} title="Sello gasket" badge="cambia vs. W">
              <Table rows={rowsGasket} />
              <Nota>
                {fmt(b.gasketPorCara)} m por cara (lateral macho + cabezal sup. + cabezal inf.). Blanco → 400004007 · Gris → 400004008.
              </Nota>
            </Section>

            <Section icon={Boxes} title="Consumibles">
              <Table rows={rowsConsumibles} />
            </Section>

            {rowsPromotor.length > 0 && (
              <Section icon={Boxes} title="Promotor de adherencia (inox)">
                <Table rows={rowsPromotor} />
              </Section>
            )}
          </div>

          {/* Lateral: diagrama y dimensiones */}
          <div style={{ flex: "0 1 340px", minWidth: 280, position: "sticky", top: 12 }}>
            <Section icon={Ruler} title="Diagrama de pieza">
              <PanelDiagram b={b} />
              <div style={{ display: "grid", gap: 6, fontSize: 13, marginTop: 10 }}>
                {[["Oscilock macho", C.macho], ["Oscilock hembra", C.hembra], ["Sello gasket", C.gasket]].map(([t, c]) => (
                  <div key={t}>
                    <span style={{ display: "inline-block", width: 14, height: 8, borderRadius: 2, background: c, marginRight: 8 }} />
                    {t}
                  </div>
                ))}
              </div>
            </Section>
            <Section icon={Ruler} title="Dimensiones de cálculo">
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13.5 }}>
                {dims.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <span style={{ color: C.ink2 }}>{k}</span>
                    <span style={{ fontFamily: MONO, textAlign: "right" }}>{v}</span>
                  </React.Fragment>
                ))}
              </div>
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
  "codigo": "WB",
  "nombre": "Muro estándar con piso",
  "categoria": "Muros",
  "descripcion": "Muro de 1 a 4 módulos de ancho y largo libre, con piso."
};

export const PARAMS_DEFAULT = {
  anchoMod: 4,
  largoTxt: "2.40",
  espesorMm: 100,
  matExtCode: MATERIALES[0].code,
  matIntCode: MATERIALES[0].code,
};

const _ev = (p) => evaluar(WBMotorCalculo, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
