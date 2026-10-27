import { useEffect, useMemo, useState } from "react";
import { articulos, porCodigo, advertencias } from "./catalogo.js";
import { parsearLista } from "./motor-core.js";
import { consolidar, redondear, aCSV } from "./consolidar.js";

const CLAVE = "bom-galeria:proyecto:v2";

function cargar() {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE));
    if (p && Array.isArray(p.items)) return p;
  } catch {}
  return { nombre: "", items: [] };
}

export default function App() {
  const [proyecto, setProyecto] = useState(cargar);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [activo, setActivo] = useState(null); // { codigo, params }
  const [aviso, setAviso] = useState("");
  const [paramsActuales, setParamsActuales] = useState(null);
  const abrir = (v) => { setActivo(v); setParamsActuales(null); };

  useEffect(() => {
    try { localStorage.setItem(CLAVE, JSON.stringify(proyecto)); } catch {}
  }, [proyecto]);

  const categorias = ["Todas", ...new Set(articulos.map((a) => a.categoria))];
  const visibles = articulos.filter((a) =>
    (categoria === "Todas" || a.categoria === categoria) &&
    `${a.codigo} ${a.nombre}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  const total = useMemo(() => consolidar(proyecto.items), [proyecto.items]);
  const nPiezas = proyecto.items.reduce((s, i) => s + i.piezas, 0);

  const agregar = (codigo, params) =>
    setProyecto((p) => {
      const id = codigo + JSON.stringify(params);
      const existe = p.items.some((i) => i.id === id);
      const items = existe
        ? p.items.map((i) => (i.id === id ? { ...i, piezas: i.piezas + 1 } : i))
        : [...p.items, { id, codigo, params, piezas: 1 }];
      return { ...p, items };
    });

  const cambiarPiezas = (id, d) =>
    setProyecto((p) => ({
      ...p,
      items: p.items.map((i) => (i.id === id ? { ...i, piezas: i.piezas + d } : i)).filter((i) => i.piezas > 0),
    }));

  const descargar = () => {
    const blob = new Blob([aCSV(total, proyecto.nombre || "Proyecto")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOM-${(proyecto.nombre || "proyecto").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportarLista = () => {
    const lista = { nombre: proyecto.nombre, items: proyecto.items.map(({ codigo, params, piezas }) => ({ codigo, params, piezas })) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(lista, null, 2)], { type: "application/json" }));
    a.download = `lista-${(proyecto.nombre || "proyecto").replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importar = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const lista = parsearLista(await f.text());
      const desconocidos = new Set();
      const items = [];
      for (const it of lista.items || []) {
        const a = porCodigo[it.codigo];
        if (!a) { desconocidos.add(it.codigo); continue; }
        const params = { ...a.params0, ...(it.params || {}) };
        const id = it.codigo + JSON.stringify(params);
        const piezas = Number(it.piezas ?? 1) || 1;
        const previo = items.find((x) => x.id === id);
        if (previo) previo.piezas += piezas; else items.push({ id, codigo: it.codigo, params, piezas });
      }
      setProyecto((p) => ({ nombre: lista.nombre || p.nombre, items }));
      setAviso(desconocidos.size ? `Importada. Sin pieza en la biblioteca: ${[...desconocidos].join(", ")}` : `Lista importada: ${items.length} líneas.`);
    } catch (err) {
      setAviso(`No se pudo leer la lista: ${err.message}`);
    }
  };

  const art = activo && porCodigo[activo.codigo];

  return (
    <div className="app">
      <main className="galeria">
        {art ? (
          <>
            <div className="barra">
              <button className="volver" onClick={() => abrir(null)}>Volver al catálogo</button>
              <button className="primario" onClick={() => agregar(art.codigo, paramsActuales ?? activo.params)}>Agregar al proyecto</button>
            </div>
            <art.Componente key={art.codigo + (activo.n ?? 0)} paramsIniciales={activo.params} onParams={setParamsActuales} />
          </>
        ) : (
          <>
            <header className="cabecera">
              <h1>Catálogo de piezas</h1>
              <p>{articulos.length} {articulos.length === 1 ? "pieza" : "piezas"} en la biblioteca. Para integrar o modificar una, edita su archivo en <code>src/articulos/</code>.</p>
            </header>
            {advertencias.length > 0 && (
              <ul className="aviso" role="alert">{advertencias.map((w) => <li key={w}>{w}</li>)}</ul>
            )}

            <div className="filtros">
              <input type="search" placeholder="Buscar por código o nombre" value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar piezas" />
              <div className="chips" role="group" aria-label="Categoría">
                {categorias.map((c) => (
                  <button key={c} className={c === categoria ? "chip activo" : "chip"} onClick={() => setCategoria(c)}>{c}</button>
                ))}
              </div>
            </div>

            {visibles.length === 0 && <p className="vacio">Ninguna pieza coincide con la búsqueda.</p>}

            <div className="rejilla">
              {visibles.map((a) => (
                <article key={a.codigo} className="tarjeta">
                  <div className="tarjeta-top">
                    <span className="codigo">{a.codigo}</span>
                    <span className="cat">{a.categoria}</span>
                  </div>
                  <h2>{a.nombre}</h2>
                  <p className="desc">{a.descripcion}</p>
                  <p className={a.error ? "meta error" : "meta"}>{a.error ? `error: ${a.error}` : `${a.nPartes} números de parte`}</p>
                  <div className="acciones">
                    <button className="primario" onClick={() => abrir({ codigo: a.codigo, params: a.params0 })}>
                      Configurar y ver BOM
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      <aside className="proyecto" aria-label="BOM total del proyecto">
        <input className="nombre-proyecto" placeholder="Nombre del proyecto" value={proyecto.nombre}
          onChange={(e) => setProyecto((p) => ({ ...p, nombre: e.target.value }))} aria-label="Nombre del proyecto" />
        <p className="resumen">{nPiezas} {nPiezas === 1 ? "pieza" : "piezas"} · {total.length} números de parte</p>
        {aviso && <p className="aviso" role="status">{aviso}</p>}

        {proyecto.items.length === 0 ? (
          <p className="vacio">Aún no hay piezas. Configura una y pulsa “Agregar al proyecto”.</p>
        ) : (
          <>
            <ul className="piezas">
              {proyecto.items.map((i) => (
                <li key={i.id}>
                  <button className="enlace" onClick={() => abrir({ codigo: i.codigo, params: i.params, n: i.id.length })}
                    title="Abrir y ajustar">{porCodigo[i.codigo]?.etiqueta(i.params) ?? i.codigo}</button>
                  <div className="cantidad chica">
                    <button onClick={() => cambiarPiezas(i.id, -1)} aria-label="Quitar una pieza">−</button>
                    <span>{i.piezas}</span>
                    <button onClick={() => cambiarPiezas(i.id, 1)} aria-label="Agregar una pieza">+</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="scroll">
              <table className="total">
                <thead><tr><th>No. Parte</th><th className="num">Cantidad</th></tr></thead>
                <tbody>
                  {total.map((f) => (
                    <tr key={f.codigo} title={f.usadoEn.join(", ")}>
                      <td><span className="codigo">{f.codigo}</span><span className="sub">{f.descripcion}</span></td>
                      <td className="num">{redondear(f.cantidad)} {f.unidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="pie">
          <button className="primario" disabled={!total.length} onClick={descargar}>Descargar CSV</button>
          <button disabled={!total.length} onClick={() => window.print()}>Imprimir</button>
          <button disabled={!nPiezas} onClick={() => setProyecto((p) => ({ ...p, items: [] }))}>Vaciar</button>
          <button disabled={!nPiezas} onClick={exportarLista}>Exportar lista</button>
          <label className="boton">Importar lista<input type="file" accept=".json,.csv" hidden onChange={importar} /></label>
        </div>
      </aside>
    </div>
  );
}
