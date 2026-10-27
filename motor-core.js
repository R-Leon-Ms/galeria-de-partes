// Núcleo SIN React: lo usan la app y el archivo empaquetado.
export const redondear = (n) => Math.round(n * 1000) / 1000;

// Artículo "estático": solo una lista fija de materiales.
export function estatico(def) {
  return {
    META: { codigo: def.codigo, nombre: def.nombre, categoria: def.categoria ?? "General", descripcion: def.descripcion ?? "" },
    PARAMS_DEFAULT: {},
    etiqueta: () => def.codigo,
    bomPlano: () => def.materiales.map((m) => ({ codigo: m.codigo, descripcion: m.descripcion, cantidad: m.cantidad, unidad: m.unidad })),
  };
}

// Convierte un módulo de src/articulos/ en un artículo del catálogo (o null si no cumple).
export function normalizar(m) {
  const base = m.ARTICULO ? estatico(m.ARTICULO) : m;
  if (!base.META?.codigo || typeof base.bomPlano !== "function") return null;
  const art = {
    ...base.META,
    tipo: m.ARTICULO ? "estático" : "paramétrico",
    params0: base.PARAMS_DEFAULT ?? {},
    etiqueta: base.etiqueta ?? (() => base.META.codigo),
    bomPlano: base.bomPlano,
    Componente: m.default,
  };
  try { art.nPartes = art.bomPlano(art.params0).length; } catch (e) { art.error = String(e.message || e); }
  return art;
}

export function construirCatalogo(modulos) {
  const articulos = [], porCodigo = {}, advertencias = [];
  for (const [origen, m] of modulos) {
    const a = normalizar(m);
    if (!a) { advertencias.push(`${origen}: no cumple el contrato (META + bomPlano, o ARTICULO). Se omitió.`); continue; }
    if (porCodigo[a.codigo]) { advertencias.push(`${origen}: el código "${a.codigo}" ya existe. Se omitió.`); continue; }
    porCodigo[a.codigo] = a; articulos.push(a);
  }
  articulos.sort((x, y) => x.codigo.localeCompare(y.codigo));
  return { articulos, porCodigo, advertencias };
}

// lista = { nombre, items: [{ codigo, params?, piezas? }] }  →  { filas, errores }
export function calcularLista(porCodigo, lista) {
  const mapa = new Map(), errores = [];
  for (const it of lista.items || []) {
    const art = porCodigo[it.codigo];
    if (!art) { errores.push(`Artículo desconocido: ${it.codigo}`); continue; }
    const piezas = Number(it.piezas ?? 1) || 0;
    const params = { ...art.params0, ...(it.params || {}) };
    let rows;
    try { rows = art.bomPlano(params); } catch (e) { errores.push(`${it.codigo}: ${e.message}`); continue; }
    const marca = `${art.etiqueta(params)} ×${piezas}`;
    for (const r of rows) {
      const f = mapa.get(r.codigo) || { ...r, cantidad: 0, usadoEn: [] };
      f.cantidad += r.cantidad * piezas;
      if (!f.usadoEn.includes(marca)) f.usadoEn.push(marca);
      mapa.set(r.codigo, f);
    }
  }
  return { filas: [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)), errores };
}

// Acepta JSON o CSV (columnas: codigo, piezas, y cualquier otra = parámetro).
export function parsearLista(texto) {
  const t = texto.replace(/^\uFEFF/, "").trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    const j = JSON.parse(t);
    return Array.isArray(j) ? { nombre: "", items: j } : j;
  }
  const [cab, ...resto] = t.split(/\r?\n/).filter(Boolean).map((l) => l.split(",").map((c) => c.trim()));
  if (!cab || !cab.includes("codigo")) throw new Error('El CSV necesita una columna "codigo".');
  const items = resto.map((fila) => {
    const it = { params: {} };
    cab.forEach((c, i) => {
      const v = fila[i];
      if (v === undefined || v === "") return;
      if (c === "codigo") it.codigo = v;
      else if (c === "piezas") it.piezas = Number(v);
      else it.params[c] = v !== "" && !isNaN(Number(v)) ? Number(v) : v;
    });
    return it;
  });
  return { nombre: "", items };
}

export function aCSV(filas, nombre = "Proyecto") {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const cuerpo = filas.map((f) => [f.codigo, f.descripcion, redondear(f.cantidad), f.unidad, f.usadoEn.join(" | ")].map(esc).join(","));
  return "\uFEFF" + [esc(nombre), ["No. Parte", "Descripción", "Cantidad", "UM", "Usado en"].map(esc).join(","), ...cuerpo].join("\n");
}
