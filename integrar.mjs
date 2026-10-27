// Integra una pieza paramétrica a la biblioteca SIN cambiar sus cálculos.
// Uso: node scripts/integrar.mjs <archivo.jsx> <CODIGO> "<Nombre>" <Categoria> "<Descripción>"
import fs from "node:fs";
import path from "node:path";

const [archivo, codigo, nombre, categoria = "General", descripcion = ""] = process.argv.slice(2);
if (!archivo || !codigo || !nombre) {
  console.error('Uso: node scripts/integrar.mjs <archivo.jsx> <CODIGO> "<Nombre>" <Categoria> "<Descripción>"');
  process.exit(1);
}
let s = fs.readFileSync(archivo, "utf8");
const falla = (m) => { console.error(`✖ ${path.basename(archivo)}: ${m}`); process.exit(1); };

// 1. useEffect en el import de react
s = s.replace(/import React, \{([^}]*)\} from "react";/, (m, nombres) =>
  nombres.includes("useEffect") ? m : `import React, {${nombres.trimEnd()}, useEffect } from "react";`);

// 2. firma del componente
const firma = s.match(/export default function (\w+)\(\) \{\n/);
if (!firma) falla("no encontré `export default function Nombre() {`");
const Comp = firma[1];
s = s.replace(firma[0], `export default function ${Comp}({ paramsIniciales, onParams }) {\n`);

// 3. estados → toman su valor inicial de paramsIniciales
const lineas = s.split("\n");
let i = lineas.findIndex((l) => l.includes(`export default function ${Comp}(`)) + 1;
const re = /^(\s*)const \[(\w+), (set\w+)\] = useState\((.*?)\);(\s*\/\/.*)?$/;
const params = [], inits = [];
let ultimo = -1;
for (; i < lineas.length; i++) {
  if (lineas[i].trim() === "") continue;
  const m = lineas[i].match(re);
  if (!m) break;
  const [, ind, nom, set, init, com = ""] = m;
  lineas[i] = `${ind}const [${nom}, ${set}] = useState(paramsIniciales?.${nom} ?? ${init});${com}`;
  ultimo = i;
  if (nom !== "copiado") { params.push(nom); inits.push(init); }
}
if (ultimo < 0 || !params.length) falla("no encontré los useState de parámetros al inicio del componente");
const lista = params.join(", ");
lineas.splice(ultimo + 1, 0,
  `  const __params = { ${lista} };`,
  `  useEffect(() => { onParams?.(__params); }, [JSON.stringify(__params)]); // eslint-disable-line`);
s = lineas.join("\n");

// 4. etiqueta (variable `codigo` del componente) visible al modo headless
if (!/^(\s*)const codigo = .*;\s*$/m.test(s)) falla("no encontré `const codigo = ...;` dentro del componente");
s = s.replace(/^(\s*)const codigo = .*;\s*$/m, (l, ind) => `${l}\n${ind}if (globalThis.__BOM_RAW__) globalThis.__BOM_ETIQUETA__ = codigo;`);

// 5. fmt: conserva todos los decimales en modo headless
let envolvio = false;
if (/^const fmt = /m.test(s)) { s = s.replace(/^const fmt = /m, "const fmt__base = "); envolvio = true; }
else if (/^function fmt\(/m.test(s)) { s = s.replace(/^function fmt\(/m, "function fmt__base("); envolvio = true; }
if (!envolvio) falla("no encontré la función `fmt`");
const envoltura = `// Modo headless: añade el valor completo junto al texto formateado.
const fmt = (n, d = 3) => {
  const t = fmt__base(n, d);
  return globalThis.__BOM_RAW__ && typeof n === "number" && Number.isFinite(n) ? t + "\\u2063" + n + "\\u2063" : t;
};

`;
s = s.replace(`export default function ${Comp}(`, envoltura + `export default function ${Comp}(`);

// 6. import del lector de tablas + contrato con la galería
const imports = [...s.matchAll(/^import .*;$/gm)];
const fin = imports.at(-1).index + imports.at(-1)[0].length;
s = s.slice(0, fin) + `\nimport { evaluar } from "../lib/bomDesdeVista.js";` + s.slice(fin);
s += `
/* ============================================================
   CONTRATO CON LA GALERÍA (generado por scripts/integrar.mjs)
   El BOM se lee de las mismas tablas que dibuja este componente.
   ============================================================ */
export const META = ${JSON.stringify({ codigo, nombre, categoria, descripcion }, null, 2)};

export const PARAMS_DEFAULT = {
${params.map((p, k) => `  ${p}: ${inits[k]},`).join("\n")}
};

const _ev = (p) => evaluar(${Comp}, { ...PARAMS_DEFAULT, ...p });
export const bomPlano = (p) => _ev(p).filas;
export const etiqueta = (p) => _ev(p).etiqueta;
`;

const slug = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const destino = path.join(import.meta.dirname, "..", "src/articulos", `${codigo}-${slug}.jsx`);
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, s);
console.log(`✔ ${codigo.padEnd(4)} ${path.relative(process.cwd(), destino)}   parámetros: ${lista}`);
