import { porCodigo } from "./catalogo.js";
import { calcularLista, aCSV, redondear } from "./motor-core.js";
export { aCSV, redondear };
export const consolidar = (items) => calcularLista(porCodigo, { items }).filas;
