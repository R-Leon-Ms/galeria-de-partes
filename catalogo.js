// Toda pieza que pongas en src/articulos/*.jsx entra sola al catálogo.
import { construirCatalogo } from "./motor-core.js";
import { vistaEstatica } from "./Estatico.jsx";

const modulos = import.meta.glob("./articulos/*.jsx", { eager: true });
const cat = construirCatalogo(Object.entries(modulos));
for (const a of cat.articulos) {
  const m = modulos[Object.keys(modulos).find((k) => modulos[k].ARTICULO?.codigo === a.codigo)];
  if (m) a.Componente = vistaEstatica(m.ARTICULO);
}
export const { articulos, porCodigo, advertencias } = cat;
