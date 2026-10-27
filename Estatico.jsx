// Vista para artículos estáticos (export const ARTICULO = {...}).
export function vistaEstatica(def) {
  return function VistaEstatica({ onAgregar }) {
    return (
      <div className="estatico">
        <p className="codigo">{def.codigo}</p>
        <h1>{def.nombre}</h1>
        <p className="desc">{def.descripcion}</p>
        <table className="total">
          <thead><tr><th>No. Parte</th><th>Descripción</th><th className="num">Cant.</th><th>UM</th></tr></thead>
          <tbody>
            {def.materiales.map((m) => (
              <tr key={m.codigo}><td className="codigo">{m.codigo}</td><td>{m.descripcion}</td><td className="num">{m.cantidad}</td><td>{m.unidad}</td></tr>
            ))}
          </tbody>
        </table>
        {onAgregar && <button className="primario" style={{ marginTop: 16, maxWidth: 260 }} onClick={() => onAgregar({})}>Agregar al proyecto</button>}
      </div>
    );
  };
}
