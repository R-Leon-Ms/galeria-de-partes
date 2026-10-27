// npm run empaquetar  →  salida/bom-motor.mjs  (un solo archivo con TODAS las piezas)
// Uso:  node salida/bom-motor.mjs lista.json [resultado.csv]
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const dir = path.join(raiz, "src/articulos");
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".jsx")).sort();
if (!archivos.length) { console.error("No hay piezas en src/articulos/"); process.exit(1); }

const ruta = (f) => JSON.stringify(path.join(dir, f));
const entrada = `
${archivos.map((f, i) => `import * as m${i} from ${ruta(f)};`).join("\n")}
import { construirCatalogo, calcularLista, parsearLista, aCSV } from ${JSON.stringify(path.join(raiz, "src/motor-core.js"))};
export const catalogo = construirCatalogo([${archivos.map((f, i) => `[${JSON.stringify(f)}, m${i}]`).join(",")}]);
export const calcular = (lista) => calcularLista(catalogo.porCodigo, typeof lista === "string" ? parsearLista(lista) : lista);
export { aCSV, parsearLista };
if (typeof process !== "undefined" && process.argv?.[1]) {
  const { pathToFileURL } = await import("node:url");
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const fs = await import("node:fs");
    const [, , entradaLista, salidaCsv] = process.argv;
    if (entradaLista === "--verificar") {
      let mal = 0;
      for (const a of catalogo.articulos) {
        try { const f = a.bomPlano(a.params0); console.log("OK   " + a.codigo.padEnd(4) + f.length + " partes  " + a.etiqueta(a.params0)); if (!f.length) mal++; }
        catch (e) { mal++; console.log("FALLA " + a.codigo + ": " + e.message); }
      }
      catalogo.advertencias.forEach((w) => console.log("AVISO " + w));
      process.exit(mal ? 1 : 0);
    } else if (!entradaLista) {
      console.log("Piezas incluidas:\\n" + catalogo.articulos.map((a) => " - " + a.codigo.padEnd(4) + a.nombre + "   [" + Object.keys(a.params0).join(", ") + "]").join("\\n"));
      console.log("\\nUso: node bom-motor.mjs lista.json|lista.csv [resultado.csv]");
    } else {
      const lista = parsearLista(fs.readFileSync(entradaLista, "utf8"));
      const { filas, errores } = calcular(lista);
      errores.forEach((e) => console.error("AVISO: " + e));
      const csv = aCSV(filas, lista.nombre || "Proyecto");
      if (salidaCsv) { fs.writeFileSync(salidaCsv, csv); console.log(filas.length + " números de parte → " + salidaCsv); }
      else console.log(csv);
    }
  }
}
`;
const temporal = path.join(raiz, "salida/.entrada.js");
fs.mkdirSync(path.dirname(temporal), { recursive: true });
fs.writeFileSync(temporal, entrada);
await build({
  entryPoints: [temporal], outfile: path.join(raiz, "salida/bom-motor.mjs"), bundle: true,
  format: "esm", platform: "browser", target: "es2022", external: ["node:*"],
  jsx: "automatic", loader: { ".js": "jsx" }, define: { "process.env.NODE_ENV": '"production"' }, minify: true, logLevel: "warning",
});
fs.rmSync(temporal);
console.log(`✔ salida/bom-motor.mjs  (${archivos.length} archivo(s) de piezas)`);
