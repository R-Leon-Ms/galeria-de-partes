import React, { useMemo, useState, useEffect } from "react";
import { Ruler, Layers, Settings2, AlertTriangle, Boxes } from "lucide-react";
import { evaluar } from "../lib/bomDesdeVista.js";

/* ============================================================
   TH — MOTOR DE CÁLCULO (BOM paramétrico)
   Techo de Relleno / Central — Ojeda
   Copia derivada del motor TCM (Techo C Macho). Se conserva toda
   la estructura, constantes y fórmulas de TCM, con 4 diferencias
   estructurales propias de un techo central/de relleno (va entre
   dos techos, no en el extremo de la cámara):

   1. NO lleva TRIM CAP (solo va en el lado opuesto al sistema de
      ensamble). Solo lleva END CAP: 2 piezas del ancho nominal.
   2. Lámina interior: el ANCHO ahora es igual al ancho de la
      lámina exterior (ya no se resta espesor de panel + ajuste
      en el ancho). El LARGO conserva la fórmula original de TCM.
   3. Se agrega Oscilock HEMBRA (mismo patrón de espaciamiento que
      el Macho), ya que el techo central ensambla con un techo a
      cada lado: un lado con macho, el lado opuesto con hembra.
   4. Grapa Techo-Piso: YA NO lleva la porción "a lo largo" (1 por
      módulo) que tenía TCM. En TH la cantidad es fija según el
      ancho de la pieza: 4 kits para techos de 2, 3 o 4 módulos de
      ancho, y 2 kits cuando el ancho es de 1 módulo.

   El resto (láminas ext/int en cuanto a fórmula base, núcleo de
   espuma, Oscilock Macho, Sello Gasket, Cinta Masking Tape, Cinta
   de Poliuretano, Desmoldante, Cartón, Promotor de Adherencia)
   permanece idéntico a TCM.
   ============================================================ */

// ---------- Constantes globales ----------
const MODULO_M = 0.2921;
const TOL_ANCHO = 0.002;
const TOL_LARGO = 0.001;
const CONSUMO_DOBLEZ = 0.051;
const AJUSTE_LAM_INT = 0.016; // sigue aplicando SOLO a lo largo en TH
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

// Código de Grapa Techo-Piso según espesor de panel (librería reutilizable)
const GRAPA_CODES = {
  75: "400004129",
  100: "400030028",
  125: "400004135",
  150: "400004136",
};

// Consumo de lámina galvanizada C-20 (100450016) por cada kit de grapa,
// según espesor de panel (librería reutilizable)
const GRAPA_KG_LAMINA_C20 = {
  75: 0.07,
  100: 0.092,
  125: 0.092,
  150: 0.115,
};

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
function calcularBOM({ anchoMod, largoMod, espesorMm, matExtCode, matIntCode }) {
  const matExt = MATERIALES.find((m) => m.code === matExtCode);
  const matInt = MATERIALES.find((m) => m.code === matIntCode);
  const espesorPanel = espesorMm / 1000;

  const anchoM = anchoMod * MODULO_M;
  const largoM = largoMod * MODULO_M;

  const requiereTratoEspecial = anchoMod > ANCHO_MOD_MAX;

  // ---- Componente 1: Lámina exterior ----
  const anchoDobladaExt = anchoM - TOL_ANCHO;
  const largoDobladaExt = largoM - TOL_LARGO;
  const anchoFlatExt = anchoDobladaExt - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const largoFlatExt = largoDobladaExt - 2 * matExt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaExt = (anchoFlatExt / ANCHO_ROLLO) * largoFlatExt * matExt.factor;

  // ---- Componente 2: Lámina interior ----
  // MODIFICACIÓN TH (punto 2): el ancho de la lámina interior es
  // igual al ancho de la lámina exterior (ya no se resta espesor
  // de panel + AJUSTE_LAM_INT en el ancho). El largo conserva la
  // fórmula original de TCM (resta 2x espesor de panel + 2x ajuste).
  const anchoDobladaInt = anchoDobladaExt; // ← igual a exterior
  const largoDobladaInt = largoM - 2 * espesorPanel + 2 * AJUSTE_LAM_INT;
  const anchoFlatInt = anchoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const largoFlatInt = largoDobladaInt - 2 * matInt.espesor + CONSUMO_DOBLEZ;
  const kgLaminaInt = (anchoFlatInt / ANCHO_ROLLO) * largoFlatInt * matInt.factor;

  // ---- END CAP (librería) — MODIFICACIÓN TH (punto 1): sin TRIM CAP ----
  const desarrolloCap = espesorPanel + matExt.espesor + CONSUMO_DOBLEZ_CAP;
  const kgPorMetroCap = (desarrolloCap / ANCHO_ROLLO) * matExt.factor;
  const longitudEndCap = anchoM;
  const kgEndCap = 2 * longitudEndCap * kgPorMetroCap;
  // Trim Cap: NO APLICA en TH (techo central/de relleno).

  // ---- Componente 3: Núcleo de espuma ----
  const volumenNucleo = anchoM * largoM * espesorPanel;
  const kgEspumaTotal = volumenNucleo * DENSIDAD_ESPUMA;
  const kgPoliol = kgEspumaTotal * (RATIO_POLIOL / (RATIO_POLIOL + RATIO_ISOCIANATO));
  const kgIsocianato = kgEspumaTotal * (RATIO_ISOCIANATO / (RATIO_POLIOL + RATIO_ISOCIANATO));

  // ---- Oscilock Macho (librería) — idéntico a TCM ----
  const qtyOscilock = largoM >= 0.438 ? Math.floor((largoM - 0.438) / 0.876) + 1 : 0;
  const kgLaminaC20OscilockMacho = qtyOscilock * 0.44;
  const hojaLaminaC10OscilockMacho = qtyOscilock * 0.002;
  const kgPinturaEpoxicaOscilockMacho = qtyOscilock * 0.0132;

  // ---- Oscilock Hembra (librería) — MODIFICACIÓN TH (punto 3): se
  // agrega con la misma regla de uso (mismo patrón de espaciamiento)
  // que el Macho. El techo central ensambla con macho de un lado y
  // hembra del lado opuesto.
  const qtyOscilockHembra = qtyOscilock; // misma fórmula/espaciamiento
  const KG_LAMINA_POR_CARCASA_HEMBRA = 0.18;
  const CARCASAS_POR_KIT_HEMBRA = 2;
  const kgLaminaC20OscilockHembra = qtyOscilockHembra * CARCASAS_POR_KIT_HEMBRA * KG_LAMINA_POR_CARCASA_HEMBRA;

  // ---- Grapa Techo-Piso (librería) — MODIFICACIÓN TH (punto 4) ----
  // TH ya no lleva la porción "a lo largo" (1 por módulo) de TCM.
  // Cantidad fija según ancho: 4 kits (2/3/4 módulos), 2 kits (1 módulo).
  const qtyGrapas = anchoMod === 1 ? 2 : 4;
  const codigoGrapa = GRAPA_CODES[espesorMm] || null;
  const kgLaminaC20Grapas = qtyGrapas * (GRAPA_KG_LAMINA_C20[espesorMm] ?? 0);
  const longitudPernoTotal = qtyGrapas * espesorPanel;

  // ---- Componente 6: Sello Gasket — idéntico a TCM (va del lado macho) ----
  const longitudGasket = largoM;
  const colorExt = matExt.color;
  const colorInt = matInt.color;
  let gasketLines = [];
  if (colorExt === colorInt) {
    gasketLines.push({ code: GASKET_CODES[colorExt], metros: longitudGasket * 2, cara: "Exterior + Interior" });
  } else {
    gasketLines.push({ code: GASKET_CODES[colorExt], metros: longitudGasket, cara: "Exterior" });
    gasketLines.push({ code: GASKET_CODES[colorInt], metros: longitudGasket, cara: "Interior" });
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
    requiereTratoEspecial,
    anchoM,
    largoM,
    espesorPanel,
    laminaExt: { anchoDoblada: anchoDobladaExt, largoDoblada: largoDobladaExt, anchoFlat: anchoFlatExt, largoFlat: largoFlatExt, kg: kgLaminaExt },
    laminaInt: { anchoDoblada: anchoDobladaInt, largoDoblada: largoDobladaInt, anchoFlat: anchoFlatInt, largoFlat: largoFlatInt, kg: kgLaminaInt },
    endCap: { longitud: longitudEndCap, kg: kgEndCap },
    nucleo: { volumen: volumenNucleo, kgEspuma: kgEspumaTotal, kgPoliol, kgIsocianato },
    oscilockMacho: { qty: qtyOscilock, kgLaminaC20: kgLaminaC20OscilockMacho, hojaLaminaC10: hojaLaminaC10OscilockMacho, kgPintura: kgPinturaEpoxicaOscilockMacho },
    oscilockHembra: { qty: qtyOscilockHembra, kgLaminaC20: kgLaminaC20OscilockHembra },
    grapa: { qty: qtyGrapas, codigo: codigoGrapa, kgLaminaC20: kgLaminaC20Grapas, longitudPerno: longitudPernoTotal },
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

function PanelDiagram({ anchoM, largoM, largoDobladaInt, qtyOscMacho, qtyOscHembra, qtyGrapas }) {
  // Área máxima disponible para el rectángulo del panel (proporción real,
  // misma escala en ambos ejes — el techo normalmente es más angosto
  // a lo ancho que a lo largo, por lo que el dibujo debe salir "alto").
  const maxRw = 220; // ancho máx. disponible en px
  const maxRh = 460; // alto máx. disponible en px
  const scale = Math.min(maxRw / anchoM, maxRh / largoM);
  const rw = anchoM * scale;
  const rh = largoM * scale;

  const padTop = 50, padBottom = 60, padSide = 110;
  const w = rw + padSide * 2;
  const h = rh + padTop + padBottom;
  const x0 = (w - rw) / 2;
  const y0 = padTop;

  // Lámina interior: mismo ancho que la exterior (sin inset lateral),
  // pero el largo es menor — se dibuja como línea punteada, inset
  // simétrico arriba y abajo.
  const insetLargoInt = Math.max(0, (largoM - largoDobladaInt) / 2) * scale;

  // Posiciones de oscilock a lo largo, medidas desde la parte INFERIOR
  // de la pieza (0.438 m primera posición, cada 0.876 m siguiente).
  const marks = [];
  for (let p = 0.438; p <= largoM + 1e-6; p += 0.876) marks.push(p);

  const COLOR_MACHO = "#1B5E85"; // azul
  const COLOR_HEMBRA = "#D6409F"; // rosa/magenta

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: 300, display: "block", margin: "0 auto" }}>
      <rect x={x0} y={y0} width={rw} height={rh} fill="#F4F7F8" stroke="#1B5E85" strokeWidth="1.5" />
      {/* Lámina interior (punteada) */}
      <rect
        x={x0}
        y={y0 + insetLargoInt}
        width={rw}
        height={rh - 2 * insetLargoInt}
        fill="none"
        stroke="#B33F32"
        strokeWidth="1.25"
        strokeDasharray="6 4"
      />
      {/* END CAP — ambos extremos a lo ancho (arriba/abajo) */}
      <rect x={x0} y={y0 - 6} width={rw} height="6" fill="#B33F32" />
      <rect x={x0} y={y0 + rh} width={rw} height="6" fill="#B33F32" />
      {/* Oscilock hembra — lado IZQUIERDO (rosa), contado de abajo hacia arriba */}
      {marks.map((p, i) => (
        <rect key={"h" + i} x={x0 - 12} y={y0 + rh - p * scale - 3} width="10" height="6" fill={COLOR_HEMBRA} />
      ))}
      {/* Oscilock macho — lado DERECHO (azul), contado de abajo hacia arriba */}
      {marks.map((p, i) => (
        <rect key={"m" + i} x={x0 + rw + 2} y={y0 + rh - p * scale - 3} width="10" height="6" fill={COLOR_MACHO} />
      ))}
      <text x={x0 + rw / 2} y={y0 - 16} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#1B5E85">{fmt(anchoM, 3)} m</text>
      <text x={x0 - 42} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#1B5E85" transform={`rotate(-90 ${x0 - 42} ${y0 + rh / 2})`}>{fmt(largoM, 3)} m</text>
      <text x={x0 - 30} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_HEMBRA} transform={`rotate(-90 ${x0 - 30} ${y0 + rh / 2})`}>HEMBRA ({qtyOscHembra})</text>
      <text x={x0 + rw + 30} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={COLOR_MACHO} transform={`rotate(90 ${x0 + rw + 30} ${y0 + rh / 2})`}>MACHO ({qtyOscMacho})</text>
      <text x={x0 + rw / 2} y={y0 + rh + 30} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#B33F32">2 END CAP · sin Trim Cap</text>
      <text x={x0 + rw / 2} y={y0 + rh + 46} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">{qtyGrapas} grapas (fijo, sin componente a lo largo)</text>
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

export default function THMotorCalculo({ paramsIniciales, onParams }) {
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

  const codigo = `TH-${anchoMod}-${largoMod}-${espesorMm}`;

  if (globalThis.__BOM_RAW__) globalThis.__BOM_ETIQUETA__ = codigo;
  const grapaPendiente = !bom.grapa.codigo;

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", background: "#EEF2F4", minHeight: "100%", padding: 20 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Motor de cálculo BOM · Estructura derivada de TCM
          </div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "#1B2A33", margin: "4px 0 0" }}>
            TH — Techo de Relleno / Central
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#1B5E85", marginTop: 4 }}>{codigo}</div>
        </div>

        <Section icon={Settings2} title="Parámetros de la pieza">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Field label="Ancho (módulos)">
              <input style={inputStyle} type="number" min={1} max={6} value={anchoMod} onChange={(e) => setAnchoMod(Number(e.target.value))} />
            </Field>
            <Field label="Largo (módulos)">
              <input style={inputStyle} type="number" min={1} max={40} value={largoMod} onChange={(e) => setLargoMod(Number(e.target.value))} />
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

          {bom.requiereTratoEspecial && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: "#FCEEEA", border: "1px solid #E3A18F", borderRadius: 4, color: "#B33F32", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
              <AlertTriangle size={15} />
              Ancho mayor a {ANCHO_MOD_MAX} módulos: requiere tratamiento especial (excede ancho de rollo de 48").
            </div>
          )}
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
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A6B78", lineHeight: 1.7 }}>
                Doblada Ext: {fmt(bom.laminaExt.anchoDoblada)} × {fmt(bom.laminaExt.largoDoblada)} m &nbsp;|&nbsp;
                Flat Ext: {fmt(bom.laminaExt.anchoFlat)} × {fmt(bom.laminaExt.largoFlat)} m
                <br />
                Doblada Int: {fmt(bom.laminaInt.anchoDoblada)} × {fmt(bom.laminaInt.largoDoblada)} m &nbsp;|&nbsp;
                Flat Int: {fmt(bom.laminaInt.anchoFlat)} × {fmt(bom.laminaInt.largoFlat)} m
                <div style={{ marginTop: 2, color: "#1B5E85" }}>
                  ★ TH: ancho de lámina interior = ancho de lámina exterior (sin descuento de espesor de panel)
                </div>
              </div>
            </Section>

            <Section icon={Boxes} title="END CAP (librería) — sin Trim Cap">
              <Table rows={[{ code: matExtCode, desc: "END CAP (2 piezas, ancho nominal)", qty: fmt(bom.endCap.kg, 3), unit: "KG" }]} />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#B33F32" }}>
                ★ TH: techo central/de relleno — no lleva Trim Cap.
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

            <Section icon={Boxes} title="Oscilock Macho (librería)">
              <Table
                rows={[
                  { code: "400004053", desc: "Oscilock Macho Mca. Ojeda", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "400004054", desc: "Carcasa izquierda p/ oscilock macho", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "400004055", desc: "Carcasa derecha p/ oscilock macho", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "400004056", desc: "Gancho para oscilock", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "400004030", desc: "Muelle oscilock", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "400004031", desc: "Excéntrico de zamac", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "100441000", desc: "Pija #8 x 3/4\"", qty: bom.oscilockMacho.qty, unit: "PZA" },
                  { code: "100432001", desc: "Pintura epóxica polvo negro", qty: fmt(bom.oscilockMacho.kgPintura, 4), unit: "KG" },
                  { code: "100450016", desc: "Lámina Galvanizada C-20 (carcasas)", qty: fmt(bom.oscilockMacho.kgLaminaC20, 3), unit: "KG" },
                  { code: "100462018", desc: "Lámina C-10 (gancho)", qty: fmt(bom.oscilockMacho.hojaLaminaC10, 4), unit: "HOJA" },
                ]}
              />
            </Section>

            <Section icon={Boxes} title="Oscilock Hembra (librería) — agregado en TH">
              <Table
                rows={[
                  { code: "400004050", desc: "Oscilock Hembra Mca. Ojeda", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "400004051", desc: "Carcasa izquierda p/ oscilock hembra", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "400004052", desc: "Carcasa derecha p/ oscilock hembra", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "400030211", desc: "Remache semi-circular cabeza plana 250x375", qty: bom.oscilockHembra.qty, unit: "PZA" },
                  { code: "100450016", desc: "Lámina Galvanizada C-20 (carcasas hembra)", qty: fmt(bom.oscilockHembra.kgLaminaC20, 3), unit: "KG" },
                ]}
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#1B5E85" }}>
                ★ TH: mismo patrón de espaciamiento que el Macho (techo central ensambla con macho de un lado y hembra del otro).
              </div>
            </Section>

            <Section icon={Boxes} title="Grapa Techo-Piso (librería)">
              {grapaPendiente ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: "#FCEEEA", border: "1px solid #E3A18F", borderRadius: 4, color: "#B33F32", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                  <AlertTriangle size={15} />
                  Código de grapa no definido para espesor {espesorMm} mm.
                </div>
              ) : (
                <Table
                  rows={[
                    { code: bom.grapa.codigo, desc: "Grapa Techo-Piso", qty: bom.grapa.qty, unit: "KIT" },
                    { code: "100450016", desc: "Lámina Galvanizada C-20 (grapas)", qty: fmt(bom.grapa.kgLaminaC20, 3), unit: "KG" },
                    { code: "400004006", desc: "Perno de latón 1/4\" x 3.66 m (corte)", qty: fmt(bom.grapa.longitudPerno, 3), unit: "M" },
                  ]}
                />
              )}
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#1B5E85" }}>
                ★ TH: cantidad fija (sin componente a lo largo) — {anchoMod === 1 ? "2 kits (ancho de 1 módulo)" : "4 kits (ancho de 2, 3 o 4 módulos)"}.
              </div>
            </Section>

            <Section icon={Boxes} title="Componente 6 — Sello Gasket (lado macho)">
              <Table
                rows={bom.gasket.map((g) => ({ code: g.code, desc: `Sello Gasket PVC c/UV — ${g.cara}`, qty: fmt(g.metros, 3), unit: "M" }))}
              />
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
                largoDobladaInt={bom.laminaInt.largoDoblada}
                qtyOscMacho={bom.oscilockMacho.qty}
                qtyOscHembra={bom.oscilockHembra.qty}
                qtyGrapas={bom.grapa.qty}
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
  "codigo": "TH",
  "nombre": "Techo H central",
  "categoria": "Techos",
  "descripcion": "Techo de relleno / central."
};

export const PARAMS_DEFAULT = {
  anchoMod: 4,
  largoMod: 10,
  espesorMm: 100,
  matExtCode: MATERIALES[0].code,
  matIntCode: MATERIALES[1].code,
};

const _ev = (p) => evaluar(THMotorCalculo, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
