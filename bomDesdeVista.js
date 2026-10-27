// Obtiene el BOM de una pieza paramétrica leyendo EXACTAMENTE las tablas que ese componente dibuja.
// Así el BOM de la galería, del proyecto y del archivo empaquetado siempre coincide con la pantalla.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const M = "\u2063"; // marcador que `fmt` agrega en modo RAW para conservar todos los decimales
const cache = new WeakMap();

const entidades = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Quita de la descripción lo que depende de las medidas de UNA pieza, para que
// la línea consolidada del proyecto no quede con datos de una sola pieza.
function limpiarDescripcion(d) {
  return d
    .replace(/\s*\((?:doblada|longitud|espesor|\d+ cara)[^()]*(?:\([^()]*\)[^()]*)*\)/gi, "")
    .replace(/^Lámina (?:exterior|interior)(?: \(Piso\))? — /i, "")
    .replace(/^(Sello gasket.*?c\/UV).*$/i, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluar(Vista, params) {
  let porVista = cache.get(Vista);
  if (!porVista) cache.set(Vista, (porVista = new Map()));
  const clave = JSON.stringify(params);
  if (porVista.has(clave)) return porVista.get(clave);

  globalThis.__BOM_RAW__ = true;
  globalThis.__BOM_ETIQUETA__ = undefined;
  let html;
  try {
    html = renderToStaticMarkup(createElement(Vista, { paramsIniciales: params }));
  } finally {
    globalThis.__BOM_RAW__ = false;
  }
  const etiqueta = globalThis.__BOM_ETIQUETA__ ?? "";
  const texto = (c) => entidades(c.replace(/<[^>]*>/g, ""));
  const marcas = new RegExp(`${M}(.*?)${M}`, "g");
  const filas = [];

  for (const tabla of html.split("<table").slice(1)) {
    if (!/No\. parte/i.test(tabla)) continue;
    for (const tr of tabla.split("<tr").slice(1)) {
      if (tr.includes("<th")) continue;
      const celdas = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
      if (celdas.length < 4) continue;
      const codigo = celdas[0].trim();
      const marca = celdas[2].match(new RegExp(`${M}(.*?)${M}`));
      const cantidad = marca ? Number(marca[1]) : Number(celdas[2].replace(/,/g, ""));
      if (!codigo || codigo === "—" || !Number.isFinite(cantidad) || cantidad <= 0) continue;
      filas.push({
        codigo,
        descripcion: limpiarDescripcion(celdas[1].replace(marcas, "")),
        cantidad,
        unidad: celdas[3].trim(),
      });
    }
  }
  const r = { filas, etiqueta };
  porVista.set(clave, r);
  return r;
}
