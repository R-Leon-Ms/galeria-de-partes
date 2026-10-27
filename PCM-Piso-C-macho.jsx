import React, { useMemo, useState, useEffect } from "react";
import { Ruler, Layers, Settings2, AlertTriangle, Boxes } from "lucide-react";
import { evaluar } from "../lib/bomDesdeVista.js";

/* ============================================================
   PCM — MOTOR DE CÁLCULO (BOM paramétrico)
   Piso C Macho — Ojeda
   Copia idéntica del motor TCM (Techo C Macho). Único cambio
   funcional: la lámina interior se restringe a los calibres
   estructurales de piso (C-20 galv., C-16 galv., C-16 inox),
   ya que el interior soporta la carga de lo contenido en la
   cámara frigorífica.
   Todas las constantes y fórmulas provienen del documento de
   configuración cerrado en conjunto con el equipo de ingeniería.
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
  // --- Lámina interior de piso (estructural, soporta carga) ---
  { code: "100450016", desc: "Galvanizada Calibre 20 (Interior de Pisos)", calibre: 20, espesor: 0.001, factor: 9.02, color: "GRIS", inox: false },
  { code: "100450007", desc: "Galvanizada Calibre 16 (Interior de Pisos, Refuerzos)", calibre: 16, espesor: 0.0015, factor: 14.875, color: "GRIS", inox: false },
  { code: "100458023", desc: "Inoxidable Cal-16 T-304 P3 PVC (Interior de Pisos)", calibre: 16, espesor: 0.0015, factor: 15.013, color: "GRIS", inox: true },
];

// Códigos de lámina interior habilitados para piso (PCM): solo
// los calibres estructurales, por la carga que soporta el interior.
const CODIGOS_LAM_INT_PCM = ["100450016", "100450007", "100458023"];
const MATERIALES_INT_PCM = MATERIALES.filter((m) => CODIGOS_LAM_INT_PCM.includes(m.code));

const ESPESORES = [
  { mm: 75, label: '3" (75 mm)' },
  { mm: 100, label: '4" (100 mm)' },
  { mm: 125, label: '5" (125 mm)' },
  { mm: 150, label: '6" (150 mm)' },
];

const GRAPA_CODES = { 75: "400004129", 100: "400030028", 125: "400004135", 150: "400004136" };
const KG_LAMINA_POR_GRAPA = { 75: 0.07, 100: 0.092, 125: 0.092, 150: 0.115 };
const GASKET_CODES = { BLANCO: "400004007", GRIS: "400004008" };

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

  // ---- Oscilock Macho (librería) ----
  const qtyOscilock = largoM >= 0.438 ? Math.floor((largoM - 0.438) / 0.876) + 1 : 0;
  const kgLaminaC20Oscilock = qtyOscilock * 0.44;
  const hojaLaminaC10Oscilock = qtyOscilock * 0.002;
  const kgPinturaEpoxica = qtyOscilock * 0.0132;

  // ---- Grapa Techo-Piso (librería) ----
  const qtyGrapas = 4 + largoMod;
  const codigoGrapa = GRAPA_CODES[espesorMm] || null;
  const kgLaminaC20Grapas = qtyGrapas * (KG_LAMINA_POR_GRAPA[espesorMm] ?? 0.07);
  const longitudPernoTotal = qtyGrapas * espesorPanel;

  // ---- Componente 6: Sello Gasket ----
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
  const ltPromotor = areaM2 * 0.03125 * qtyCarasInox;

  return {
    anchoM, largoM, espesorPanel, excedeAncho, areaM2,
    lamExt: { anchoDoblada, largoDoblada, anchoFlat: anchoFlatExt, largoFlat: largoFlatExt, kg: kgLamExt, mat: matExt },
    lamInt: { anchoDoblada: r(anchoDobladaInt, 3), largoDoblada: r(largoDobladaInt, 3), anchoFlat: anchoFlatInt, largoFlat: largoFlatInt, kg: kgLamInt, mat: matInt },
    caps: { desarrolloCap, kgEndCap, kgTrimCap, longEndCap: anchoM, longTrimCap: largoM },
    nucleo: { volumenNucleo, kgEspumaTotal, kgPoliol, kgIsocianato },
    oscilock: { qty: qtyOscilock, kgLaminaC20: kgLaminaC20Oscilock, hojaLaminaC10: hojaLaminaC10Oscilock, kgPintura: kgPinturaEpoxica },
    grapa: { qty: qtyGrapas, codigo: codigoGrapa, kgLaminaC20: kgLaminaC20Grapas, longitudPerno: longitudPernoTotal },
    gasket: gasketLines,
    tape: { metros: metrosTape, rollos: qtyRollosTape },
    poliuretano: { metros: metrosPoliuretano, rollos: qtyRollosPoliuretano },
    desmoldante: { kg: kgDesmoldante },
    carton: { metros: metrosCarton, kg: kgCarton },
    promotor: { qtyCarasInox, lt: ltPromotor },
  };
}

// ---------- Componentes visuales ----------

function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, borderBottom: "1.5px solid #1B5E85", paddingBottom: 6 }}>
        <Icon size={16} color="#1B5E85" strokeWidth={2} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em", color: "#1B5E85", fontWeight: 700, textTransform: "uppercase" }}>
          {title}
        </span>
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

function Schematic({ anchoMod, largoMod, anchoM, largoM, qtyOscilock, qtyGrapas }) {
  const W = 260, H = 420, pad = 30;
  const scaleX = (W - 2 * pad) / Math.max(anchoM, 1);
  const scaleY = (H - 2 * pad) / Math.max(largoM, 1);
  const scale = Math.min(scaleX, scaleY);
  const rw = anchoM * scale, rh = largoM * scale;
  const x0 = (W - rw) / 2, y0 = (H - rh) / 2;

  const oscMarks = [];
  let pos = 0.438;
  while (pos <= largoM && oscMarks.length < 40) {
    oscMarks.push(pos);
    pos += 0.876;
  }

  const m = 6; // inset visual de la lámina interior
  // Lámina interior en forma de "C": recesada arriba/abajo (END CAP) e izquierda (TRIM CAP),
  // pero AL RAS del borde derecho (lado oscilock/macho) — de ahí el nombre "C Macho".
  // En PISO (PCM) la representación principal es la lámina interior (la que soporta la carga),
  // por eso se dibuja con línea roja de mayor grosor; la exterior se dibuja también con línea
  // continua pero más fina y en gris claro, como referencia secundaria
  // (a diferencia de TECHO, donde la exterior es la línea principal).
  const cPath = `M ${x0 + rw} ${y0 + m} H ${x0 + m} V ${y0 + rh - m} H ${x0 + rw}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 260, display: "block", margin: "0 auto" }}>
      <rect x={x0} y={y0} width={rw} height={rh} fill="#fff" stroke="#C9D8E3" strokeWidth="1" />
      <path d={cPath} fill="none" stroke="#B33F32" strokeWidth="1.5" />
      {/* Trim cap side (left) grapas per module */}
      {Array.from({ length: largoMod + 1 }).map((_, i) => {
        const yy = y0 + (i * largoM * scale) / largoMod;
        return <line key={i} x1={x0 + m} y1={yy} x2={x0 + m + 8} y2={yy} stroke="#B33F32" strokeWidth="1" />;
      })}
      {/* Oscilock marks (right side) — posicionados de ABAJO hacia ARRIBA */}
      {oscMarks.map((p, i) => {
        const yy = y0 + rh - p * scale;
        return <rect key={i} x={x0 + rw - 12} y={yy - 3} width="10" height="6" fill="#1B5E85" />;
      })}
      <text x={x0 + rw / 2} y={y0 - 10} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="#1B5E85">
        {fmt(anchoM, 3)} m
      </text>
      <text x={x0 - 8} y={y0 + rh / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="#1B5E85" transform={`rotate(-90 ${x0 - 8} ${y0 + rh / 2})`}>
        {fmt(largoM, 3)} m
      </text>
      <text x={x0 + rw / 2} y={y0 + rh + 20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#5A6B78">
        {qtyOscilock} oscilock · {qtyGrapas} grapas
      </text>
      <text x={x0 + rw / 2} y={y0 + rh + 34} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="#B33F32">
        ── línea roja = lámina interior (forma "C")
      </text>
      <text x={x0 + rw / 2} y={y0 + rh + 46} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="#5A6B78">
        ── línea gris = lámina exterior
      </text>
      <text x={x0 + rw / 2} y={y0 + rh + 58} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="#1B5E85">
        oscilock: posición 1 desde borde inferior ↑
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

export default function PCMMotorCalculo({ paramsIniciales, onParams }) {
  const [anchoMod, setAnchoMod] = useState(paramsIniciales?.anchoMod ?? 4);
  const [largoMod, setLargoMod] = useState(paramsIniciales?.largoMod ?? 10);
  const [espesorMm, setEspesorMm] = useState(paramsIniciales?.espesorMm ?? 100);
  const [matExtCode, setMatExtCode] = useState(paramsIniciales?.matExtCode ?? MATERIALES[0].code);
  const [matIntCode, setMatIntCode] = useState(paramsIniciales?.matIntCode ?? MATERIALES_INT_PCM[0].code);
  const __params = { anchoMod, largoMod, espesorMm, matExtCode, matIntCode };
  useEffect(() => { onParams?.(__params); }, [JSON.stringify(__params)]); // eslint-disable-line

  const bom = useMemo(
    () => calcularBOM({ anchoMod, largoMod, espesorMm, matExtCode, matIntCode }),
    [anchoMod, largoMod, espesorMm, matExtCode, matIntCode]
  );

  const codigo = `PCM-${anchoMod}-${largoMod}-${espesorMm}`;

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
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>Piso C Macho — PCM</div>
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

            <label style={label}>Lámina interior (estructural — piso)</label>
            <select style={select} value={matIntCode} onChange={(e) => setMatIntCode(e.target.value)}>
              {MATERIALES_INT_PCM.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.desc}
                </option>
              ))}
            </select>
            <div style={hint}>Restringida a calibres estructurales: soporta la carga de la cámara.</div>
          </Section>

          <Section icon={Settings2} title="Esquema">
            <Schematic
              anchoMod={anchoMod}
              largoMod={largoMod}
              anchoM={bom.anchoM}
              largoM={bom.largoM}
              qtyOscilock={bom.oscilock.qty}
              qtyGrapas={bom.grapa.qty}
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

          <Section icon={Boxes} title={`Oscilock Macho (librería) — ${bom.oscilock.qty} kits`}>
            <Table
              rows={[
                { code: "400004053", desc: "Oscilock Macho Mca. Ojeda", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004054", desc: "Carcasa izquierda p/ oscilock macho", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004055", desc: "Carcasa derecha p/ oscilock macho", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004056", desc: "Gancho para oscilock", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004030", desc: "Muelle oscilock", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "400004031", desc: "Excéntrico de zamac", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "100441000", desc: "Pija #8 x 3/4\" cabeza phillips c/arandela", qty: bom.oscilock.qty, unit: "PZA" },
                { code: "100432001", desc: "Pintura epóxica en polvo color negro", qty: fmt(bom.oscilock.kgPintura, 4), unit: "KG" },
                { code: "100450016", desc: "Lámina Galvanizada C-20 (carcasas)", qty: fmt(bom.oscilock.kgLaminaC20, 3), unit: "KG" },
                { code: "100462018", desc: "Lámina Negra C-10 4'x10' (gancho)", qty: fmt(bom.oscilock.hojaLaminaC10, 4), unit: "HJ" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title={`Grapa Techo-Piso (librería) — ${bom.grapa.qty} pzas`}>
            <Table
              rows={[
                { code: bom.grapa.codigo, desc: `Grapa techo-piso ensamble (espesor ${espesorMm}mm)`, qty: bom.grapa.qty, unit: "PZA" },
                { code: "100450016", desc: "Lámina Galvanizada C-20 (grapas)", qty: fmt(bom.grapa.kgLaminaC20, 3), unit: "KG" },
                { code: "400004006", desc: "Perno de latón 1/4\" x 3.66 m (a corte)", qty: fmt(bom.grapa.longitudPerno, 3), unit: "M" },
              ]}
            />
          </Section>

          <Section icon={Boxes} title="Componente 6 — Sello Gasket">
            <Table
              rows={bom.gasket.map((g) => ({ code: g.code, desc: `Sello Gasket PVC c/UV — ${g.cara}`, qty: fmt(g.metros, 3), unit: "M" }))}
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
  "codigo": "PCM",
  "nombre": "Piso C macho",
  "categoria": "Pisos",
  "descripcion": "Piso de cámara con borde macho."
};

export const PARAMS_DEFAULT = {
  anchoMod: 4,
  largoMod: 10,
  espesorMm: 100,
  matExtCode: MATERIALES[0].code,
  matIntCode: MATERIALES_INT_PCM[0].code,
};

const _ev = (p) => evaluar(PCMMotorCalculo, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
