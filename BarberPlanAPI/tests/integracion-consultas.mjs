// Bloque de la batería de integración: la barrera de las pruebas (solo bases _test), la disponibilidad con sus tres lecturas
// en paralelo (mismas respuestas y mismos 404 de siempre) y «Mis citas» con la barbería recortada.
// Lo ejecuta tests/integracion.mjs sobre la misma API y BD desechable.
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ_API, exigirBaseDePruebas } from "./entorno.mjs";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "./semilla.mjs";
import { LIMITES_IMAGEN_KB, MAX_IMAGENES_GALERIA } from "../src/middleware/validateMiddleware.js";

// Imagen PNG válida de 1×1 píxel (70 bytes)
const PNG_MINIMO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// Data URL con exactamente `total` caracteres (base64 válido, no una imagen real: el servidor solo valida formato y peso)
const imagenDeLongitud = (total, tipo = "jpeg") => {
    const cabecera = `data:image/${tipo};base64,`;
    return cabecera + "A".repeat(total - cabecera.length);
};
// Longitud máxima admitida en caracteres para cada tipo (la misma fórmula que el servidor)
const longitudMaxima = (tipo) => 32 + Math.ceil((LIMITES_IMAGEN_KB[tipo] * 1024 * 4) / 3);

// Campos de la barbería que lee «Mis citas» (nombre y dirección) más el id y la ciudad
const CAMPOS_BARBERIA_EN_MIS_CITAS = ["_id", "ciudad", "direccion", "nombre"];
const CAMPOS_QUE_NO_DEBEN_VIAJAR = ["logoUrl", "portadaUrl", "galeriaTrabajos", "servicios", "schedule", "adminId", "barberos", "tags", "telefono", "descripcion"];

export const pruebasConsultas = async ({ check, entorno, req }) => {
    const { bd } = entorno;
    const utilCitas = await import(pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", "cita-estado.util.ts")).href);
    const firmar = (usuario) => jwt.sign({ id: usuario._id.toString(), rol: usuario.rol, barberiaId: usuario.barberiaId?.toString() ?? null }, process.env.JWT_SECRET, { expiresIn: "5m" });

    // ---------------------------------------------------------------- Barrera: las pruebas solo tocan bases _test
    const rechaza = (nombre) => { try { exigirBaseDePruebas(nombre); return false; } catch { return true; } };
    check("Barrera de pruebas: acepta BarberPlan_test y los nombres de medidas (_test)", ["BarberPlan_test", "BarberPlan_carga_test", "BarberPlan_sonda_test"].every((n) => exigirBaseDePruebas(n) === n));
    check("Barrera de pruebas: rechaza la base de desarrollo y cualquier nombre que no termine en _test",
        ["BarberPlan", "BarberPlan_prod", "BarberPlan_test_prod", "test", "_test", "prueba-test", "", undefined, null, "BarberPlan_test; drop"].every(rechaza));

    // ---------------------------------------------------------------- Escenario con una barbería muy cargada de imágenes
    const imagenGrande = `data:image/jpeg;base64,${"A".repeat(400_000)}`; // ~300 KB de imagen en base64
    const servicio = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte", precio: 15, duracion: 30, createdAt: new Date() };
    const admin = usuarioBase({ _id: new ObjectId(), nombre: "Dueño", apellido: "Consultas", correo: "dueno.consultas@prueba.test", usuario: "dueno_consultas", rol: "admin" });
    const barbero = usuarioBase({ _id: new ObjectId(), nombre: "Barbero", apellido: "Consultas", correo: "barbero.consultas@prueba.test", usuario: "barbero_consultas", rol: "barbero", cargo: "Barbero" });
    const inactivo = usuarioBase({ _id: new ObjectId(), nombre: "Inactivo", apellido: "Consultas", correo: "inactivo.consultas@prueba.test", usuario: "inactivo_consultas", rol: "barbero", cargo: "Barbero", activo: false });
    const ajeno = usuarioBase({ _id: new ObjectId(), nombre: "Ajeno", apellido: "Consultas", correo: "ajeno.consultas@prueba.test", usuario: "ajeno_consultas", rol: "barbero", cargo: "Barbero" });
    const cliente = usuarioBase({ _id: new ObjectId(), nombre: "Cliente", apellido: "Consultas", correo: "cliente.consultas@prueba.test", usuario: "cliente_consultas", rol: "cliente", ciudad: "Madrid", barberiaId: null });
    const barberia = crearBarberia("Barbería Consultas", "Madrid", admin._id, [barbero._id, inactivo._id], servicio);
    Object.assign(barberia, {
        telefono: "+34600000000", descripcion: "Descripción de prueba", tags: ["clásica", "barba"], logoUrl: imagenGrande, portadaUrl: imagenGrande,
        galeriaTrabajos: [imagenGrande, imagenGrande, imagenGrande]
    });
    const otraBarberia = crearBarberia("Otra Barbería Consultas", "Sevilla", ajeno._id, [], servicio);
    for (const u of [admin, barbero, inactivo]) u.barberiaId = barberia._id;
    ajeno.barberiaId = otraBarberia._id;

    const fechaCita = fechaRelativa(5), otraFecha = fechaRelativa(9);
    const citas = [
        crearCita({ barberia, barbero, cliente, servicio, fecha: fechaCita, horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" }),
        crearCita({ barberia, barbero, cliente, servicio, fecha: otraFecha, horaInicio: "11:00", horaFin: "11:30", estado: "pendiente" }),
        crearCita({ barberia, barbero, cliente, servicio, fecha: fechaRelativa(-4), horaInicio: "12:00", horaFin: "12:30", estado: "completada" })
    ];
    await bd.collection("Usuarios").insertMany([admin, barbero, inactivo, ajeno, cliente]);
    await bd.collection("Barberias").insertMany([barberia, otraBarberia]);
    await bd.collection("Citas").insertMany(citas);

    // ---------------------------------------------------------------- Mis citas: la barbería recortada
    let r = await req("GET", "/citas/mis-citas", { token: firmar(cliente) });
    const bytes = JSON.stringify(r.data).length;
    const barberiaDeCita = r.data?.[0]?.barberia ?? {};
    check("Mis citas: 200 con las 3 citas del cliente, de la más reciente a la más antigua",
        r.status === 200 && r.data.length === 3 && r.data.map((c) => c.fecha).join() === [otraFecha, fechaCita, fechaRelativa(-4)].join(), `${r.status} ${r.data?.map?.((c) => c.fecha)}`);
    check("Mis citas: de la barbería solo viajan _id, nombre, dirección y ciudad",
        r.data.every((c) => Object.keys(c.barberia).sort().join() === CAMPOS_BARBERIA_EN_MIS_CITAS.join()), JSON.stringify(Object.keys(barberiaDeCita)));
    check("Mis citas: no viaja ni la galería, ni los logos, ni los servicios, ni el horario, ni el adminId ni el equipo",
        r.data.every((c) => CAMPOS_QUE_NO_DEBEN_VIAJAR.every((campo) => !(campo in c.barberia))));
    check("Mis citas: los datos de la barbería son los de la BD (nombre y dirección)",
        r.data.every((c) => c.barberia.nombre === "Barbería Consultas" && c.barberia.direccion === "Calle de prueba 1" && c.barberia._id === barberia._id.toString()));
    check("Mis citas: del barbero solo viajan nombre y apellido", r.data.every((c) => Object.keys(c.barbero).sort().join() === "apellido,nombre"));
    check("Mis citas: la respuesta pesa unos pocos KB aunque la barbería tenga ~2 MB de imágenes en la BD", bytes < 6000, `${bytes} bytes`);

    // La pantalla «Mis citas» y los avisos solo necesitan estas cosas; se comprueba con el código real de la app
    const conAviso = { ...r.data[0], estado: "cancelada", motivoCancelacion: "barberia", avisoCliente: { tipo: "cancelada", creadoEn: new Date().toISOString() } };
    check("Mis citas con la barbería recortada: el aviso de la app sigue nombrando la barbería", utilCitas.textoAvisoCita(conAviso).includes("Barbería Consultas"), utilCitas.textoAvisoCita(conAviso));
    check("Mis citas con la barbería recortada: la app encuentra nombre y dirección donde los lee (cita.barberia.nombre / .direccion)",
        r.data.every((c) => (c.barberiaNombre || c.barberia?.nombre || c.barberia?.name) === "Barbería Consultas" && Boolean(c.barberia?.direccion || c.barberiaDireccion || c.direccion)));
    check("Mis citas con la barbería recortada: las citas próximas se calculan igual", r.data.filter((c) => utilCitas.esCitaProxima(c)).length === 2);

    // El listado público sí necesita las imágenes y no cambia
    r = await req("GET", "/barberias");
    const enListado = (r.data || []).find((b) => b._id === barberia._id.toString());
    check("El listado público trae el logo y la portada de cada barbería pero NO su galería (solo hace falta en la ficha)",
        r.status === 200 && enListado?.logoUrl === imagenGrande && enListado.portadaUrl === imagenGrande && !("galeriaTrabajos" in enListado), `${Object.keys(enListado ?? {})}`);
    r = await req("GET", `/barberias/${barberia._id}`);
    check("La ficha de una barbería sí trae su galería completa", r.status === 200 && r.data?.galeriaTrabajos?.length === 3, `${r.status}`);

    // ---------------------------------------------------------------- Disponibilidad con las tres lecturas en paralelo
    const rutaDia = (barberoId, fecha, barberiaId = barberia._id) => `/citas/disponibilidad/${barberoId}/${fecha}?barberiaId=${barberiaId}`;
    r = await req("GET", rutaDia(barbero._id, fechaCita));
    check("Disponibilidad: 200 y la hora ocupada por una cita confirmada no se ofrece",
        r.status === 200 && r.data.estado === "abierto" && !r.data.horariosDisponibles.includes("10:00") && r.data.horariosDisponibles.includes("09:00") && r.data.horariosDisponibles.includes("10:30"), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", rutaDia(barbero._id, otraFecha));
    check("Disponibilidad: una cita pendiente también ocupa su hueco", r.status === 200 && !r.data.horariosDisponibles.includes("11:00"), `${r.status}`);
    r = await req("GET", rutaDia(barbero._id, fechaRelativa(15)));
    check("Disponibilidad: un día sin citas ofrece el horario completo", r.status === 200 && r.data.horariosDisponibles.includes("10:00") && r.data.horariosDisponibles.includes("11:00"), `${r.status}`);

    r = await req("GET", rutaDia(barbero._id, fechaCita, new ObjectId()));
    check("Disponibilidad: barbería inexistente -> 404 «Barbería no encontrada»", r.status === 404 && r.data?.error === "Barbería no encontrada", `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", rutaDia(new ObjectId(), fechaCita));
    check("Disponibilidad: barbero inexistente -> 404 «Barbero no encontrado en esta barbería»", r.status === 404 && r.data?.error === "Barbero no encontrado en esta barbería", `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", rutaDia(ajeno._id, fechaCita));
    check("Disponibilidad: barbero de otra barbería -> 404 (sin filtrar sus citas)", r.status === 404 && r.data?.error === "Barbero no encontrado en esta barbería", `${r.status}`);
    r = await req("GET", rutaDia(inactivo._id, fechaCita));
    check("Disponibilidad: barbero desactivado -> 404", r.status === 404, `${r.status}`);
    r = await req("GET", rutaDia(new ObjectId(), fechaCita, new ObjectId()));
    check("Disponibilidad: si faltan los dos, manda el error de la barbería (el orden de validación no cambia)", r.status === 404 && r.data?.error === "Barbería no encontrada", `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/mañana?barberiaId=${barberia._id}`);
    check("Disponibilidad: una fecha mal formada sigue dando 400 antes de leer nada", r.status === 400, `${r.status}`);

    // Días del mes (misma estructura de tres lecturas)
    const mesDeCita = fechaCita.slice(0, 7);
    const rutaMes = (barberoId, mes, barberiaId = barberia._id) => `/citas/disponibilidad/${barberoId}/mes/${mes}?barberiaId=${barberiaId}`;
    r = await req("GET", rutaMes(barbero._id, mesDeCita));
    check("Días del mes: 200 con una lista de fechas YYYY-MM-DD", r.status === 200 && Array.isArray(r.data.dias) && r.data.dias.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), `${r.status}`);
    r = await req("GET", rutaMes(barbero._id, mesDeCita, new ObjectId()));
    check("Días del mes: barbería inexistente -> 404 «Barbería no encontrada»", r.status === 404 && r.data?.error === "Barbería no encontrada", `${r.status}`);
    r = await req("GET", rutaMes(ajeno._id, mesDeCita));
    check("Días del mes: barbero de otra barbería -> 404", r.status === 404 && r.data?.error === "Barbero no encontrado en esta barbería", `${r.status}`);
    r = await req("GET", rutaMes(inactivo._id, mesDeCita));
    check("Días del mes: barbero desactivado -> 404", r.status === 404, `${r.status}`);

    // ---------------------------------------------------------------- Imágenes de la barbería: validación en el servidor
    const tokenAdmin = firmar(admin);
    const guardarBarberia = (cuerpo, token = tokenAdmin) => req("PUT", `/barberias/${barberia._id}`, { token, body: cuerpo });
    const enBD = async (campo) => (await bd.collection("Barberias").findOne({ _id: barberia._id }))[campo];
    const MSG_IMAGEN = /^Imagen no válida/;

    r = await guardarBarberia({ logoUrl: PNG_MINIMO });
    check("Imágenes: un logo PNG válido se guarda -> 200", r.status === 200 && await enBD("logoUrl") === PNG_MINIMO, `${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
    r = await guardarBarberia({ portadaUrl: imagenDeLongitud(longitudMaxima("portada")) });
    check(`Imágenes: una portada del tamaño máximo (${LIMITES_IMAGEN_KB.portada} KB) se admite -> 200`, r.status === 200, `${r.status}`);
    r = await guardarBarberia({ portadaUrl: imagenDeLongitud(longitudMaxima("portada") + 1) });
    check("Imágenes: una portada que pasa el máximo en un solo carácter -> 400 y no cambia", r.status === 400 && MSG_IMAGEN.test(r.data?.error) && /la portada/.test(r.data.error), `${r.status} ${r.data?.error}`);
    r = await guardarBarberia({ logoUrl: imagenDeLongitud(longitudMaxima("logo") + 1, "webp") });
    check("Imágenes: un logo que pasa su máximo (60 KB) -> 400 y se conserva el anterior", r.status === 400 && await enBD("logoUrl") === PNG_MINIMO, `${r.status}`);

    const logoAntes = await enBD("logoUrl");
    for (const [descripcion, valor] of [
        ["texto que no es una imagen", "hola"],
        ["una URL javascript:", "javascript:alert(1)"],
        ["una URL https (no se guardan enlaces externos)", "https://sitio-malicioso.example/logo.png"],
        ["un SVG (puede llevar scripts)", "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4="],
        ["un HTML en data URL", "data:text/html;base64,PGgxPmhvbGE8L2gxPg=="],
        ["base64 con caracteres que no lo son", "data:image/png;base64,@@@@"],
        ["una data URL con comillas (intento de salir del atributo)", 'data:image/png;base64,AAAA"onerror="alert(1)'],
        ["un número", 5],
        ["un objeto con operador de Mongo", { $ne: null }],
        ["un array", [PNG_MINIMO]],
        ["un booleano", true]
    ]) {
        r = await guardarBarberia({ logoUrl: valor });
        check(`Imágenes: logoUrl con ${descripcion} -> 400 y no cambia nada`, r.status === 400 && await enBD("logoUrl") === logoAntes, `${r.status} ${JSON.stringify(r.data)?.slice(0, 100)}`);
    }
    r = await guardarBarberia({ imagen: "hola" });
    check("Imágenes: el campo antiguo «imagen» también se valida -> 400", r.status === 400 && MSG_IMAGEN.test(r.data?.error), `${r.status}`);

    r = await guardarBarberia({ galeriaTrabajos: Array.from({ length: MAX_IMAGENES_GALERIA }, () => PNG_MINIMO) });
    check(`Galería: ${MAX_IMAGENES_GALERIA} imágenes válidas se guardan -> 200`, r.status === 200 && (await enBD("galeriaTrabajos")).length === MAX_IMAGENES_GALERIA, `${r.status}`);
    r = await guardarBarberia({ galeriaTrabajos: Array.from({ length: MAX_IMAGENES_GALERIA + 1 }, () => PNG_MINIMO) });
    check(`Galería: ${MAX_IMAGENES_GALERIA + 1} imágenes -> 400 «como máximo ${MAX_IMAGENES_GALERIA}» y la galería no cambia`, r.status === 400 && new RegExp(`máximo ${MAX_IMAGENES_GALERIA}`).test(r.data?.error) && (await enBD("galeriaTrabajos")).length === MAX_IMAGENES_GALERIA, `${r.status} ${r.data?.error}`);
    for (const [descripcion, valor] of [["un texto en lugar de una lista", PNG_MINIMO], ["un objeto", { 0: PNG_MINIMO }], ["una lista con un elemento no válido", [PNG_MINIMO, "hola"]], ["una lista con una cadena vacía", [PNG_MINIMO, ""]], ["una lista con null", [PNG_MINIMO, null]], ["una imagen de la galería demasiado pesada", [imagenDeLongitud(longitudMaxima("galeria") + 1)]]]) {
        r = await guardarBarberia({ galeriaTrabajos: valor });
        check(`Galería: ${descripcion} -> 400`, r.status === 400, `${r.status} ${r.data?.error}`);
    }
    r = await guardarBarberia({ galeriaTrabajos: [] });
    check("Galería: vaciarla con una lista vacía -> 200", r.status === 200 && (await enBD("galeriaTrabajos")).length === 0, `${r.status}`);
    r = await guardarBarberia({ logoUrl: "" });
    check("Imágenes: un texto vacío quita la imagen -> 200", r.status === 200 && await enBD("logoUrl") === "", `${r.status}`);

    r = await guardarBarberia({ logoUrl: "hola" }, firmar(barbero));
    check("Imágenes: un barbero que no es el dueño recibe 403 (la autorización va antes que la validación)", r.status === 403, `${r.status}`);
    r = await guardarBarberia({ logoUrl: PNG_MINIMO }, firmar(cliente));
    check("Imágenes: un cliente tampoco puede cambiar las imágenes de la barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", `/barberias/${otraBarberia._id}`, { token: tokenAdmin, body: { logoUrl: PNG_MINIMO } });
    check("Imágenes: el dueño de una barbería no puede cambiar las imágenes de otra (sin IDOR) -> 403", r.status === 403 && !(await bd.collection("Barberias").findOne({ _id: otraBarberia._id })).logoUrl, `${r.status}`);

    // El listado ligero: con una galería guardada por la API
    await guardarBarberia({ logoUrl: PNG_MINIMO, galeriaTrabajos: [PNG_MINIMO, PNG_MINIMO] });
    r = await req("GET", "/barberias");
    const guardada = (r.data || []).find((b) => b._id === barberia._id.toString());
    check("Listado: la barbería con galería guardada por la API sale con su logo y sin galería", guardada?.logoUrl === PNG_MINIMO && !("galeriaTrabajos" in guardada), `${Object.keys(guardada ?? {})}`);
    r = await req("GET", `/barberias/${barberia._id}`);
    check("Ficha: la misma barbería trae su galería", r.data?.galeriaTrabajos?.length === 2);

    // ---------------------------------------------------------------- Avatares
    const perfil = (cuerpo, token = firmar(cliente)) => req("PUT", "/usuarios/perfil", { token, body: cuerpo });
    r = await perfil({ avatar: PNG_MINIMO });
    check("Avatar: una imagen válida se guarda -> 200", r.status === 200 && (await bd.collection("Usuarios").findOne({ _id: cliente._id })).avatar === PNG_MINIMO, `${r.status}`);
    for (const [descripcion, valor] of [["un texto cualquiera", "hola"], ["un SVG", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="], ["una imagen de más de 40 KB", imagenDeLongitud(longitudMaxima("avatar") + 1)]]) {
        r = await perfil({ avatar: valor });
        check(`Avatar: ${descripcion} -> 400 y se conserva el anterior`, r.status === 400 && MSG_IMAGEN.test(r.data?.error) && (await bd.collection("Usuarios").findOne({ _id: cliente._id })).avatar === PNG_MINIMO, `${r.status} ${r.data?.error}`);
    }
    r = await req("PUT", `/barberos/${barbero._id}`, { token: tokenAdmin, body: { avatar: "hola" } });
    check("Avatar del barbero editado por el dueño: un texto cualquiera -> 400", r.status === 400 && MSG_IMAGEN.test(r.data?.error), `${r.status}`);
    r = await req("PUT", `/barberos/${barbero._id}`, { token: tokenAdmin, body: { avatar: PNG_MINIMO } });
    check("Avatar del barbero editado por el dueño: una imagen válida -> 200", r.status === 200, `${r.status}`);
    r = await perfil({ avatar: "" });
    check("Avatar: un texto vacío lo quita -> 200", r.status === 200 && (await bd.collection("Usuarios").findOne({ _id: cliente._id })).avatar === "", `${r.status}`);

    // ---------------------------------------------------------------- Calendario del personal: sin avatares
    await perfil({ avatar: PNG_MINIMO });
    r = await req("GET", `/citas/barberia/${barberia._id}`, { token: tokenAdmin });
    check("Calendario del dueño: las citas traen nombre y apellido del cliente pero no su avatar ni el del barbero",
        r.status === 200 && r.data.length >= 3 && r.data.every((c) => c.cliente?.nombre && !("avatar" in c.cliente) && c.barbero?.nombre && !("avatar" in c.barbero) && !("pw" in c.cliente)), `${r.status} ${JSON.stringify(r.data?.[0]?.cliente ? Object.keys(r.data[0].cliente) : null)}`);
    r = await req("GET", "/citas/barbero", { token: firmar(barbero) });
    check("Calendario del barbero: las citas traen los datos del cliente (nombre, correo) pero no su avatar",
        r.status === 200 && r.data.length >= 3 && r.data.every((c) => c.cliente?.nombre && c.cliente.correo && !("avatar" in c.cliente)), `${r.status}`);

    // ---------------------------------------------------------------- Reseñas: imagen validada y fuera de la ficha pública
    const citaCompletada = citas[2];
    const resenar = (cuerpo) => req("POST", `/citas/${citaCompletada._id}/resena`, { token: firmar(cliente), body: { valoracion: 5, comentario: "Genial", ...cuerpo } });
    r = await resenar({ imagen: "hola" });
    check("Reseña: una imagen que no es una data URL de imagen -> 400", r.status === 400 && MSG_IMAGEN.test(r.data?.error), `${r.status} ${r.data?.error}`);
    r = await resenar({ imagen: imagenDeLongitud(longitudMaxima("resena") + 1) });
    check("Reseña: una imagen que pasa los 120 KB -> 400", r.status === 400, `${r.status}`);
    r = await resenar({ imagen: 12345 });
    check("Reseña: una imagen que no es texto -> 400", r.status === 400, `${r.status}`);
    r = await resenar({ imagen: PNG_MINIMO });
    check("Reseña: una imagen válida -> 201", r.status === 201 && (await bd.collection("Citas").findOne({ _id: citaCompletada._id })).resena?.imagen === PNG_MINIMO, `${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
    r = await req("GET", `/barberias/${barberia._id}/resenas`);
    const publica = (r.data || []).find((x) => x._id === citaCompletada._id.toString());
    check("Reseñas públicas: llegan la valoración y el comentario pero NO la foto de la reseña", r.status === 200 && publica?.resena?.valoracion === 5 && publica.resena.comentario === "Genial" && !("imagen" in publica.resena), JSON.stringify(publica?.resena)?.slice(0, 100));
    r = await req("GET", "/citas/resenas/barberia", { token: tokenAdmin });
    const delPersonal = (r.data || []).find((x) => x._id === citaCompletada._id.toString());
    check("Reseñas del personal (dueño): sí incluyen la foto", r.status === 200 && delPersonal?.resena?.imagen === PNG_MINIMO, `${r.status}`);

    // La ficha pública solo devuelve las 50 reseñas más recientes
    const resenasEnMasa = Array.from({ length: 55 }, (_, i) => ({
        ...crearCita({ barberia: otraBarberia, barbero: ajeno, cliente, servicio, fecha: fechaRelativa(-10 - i), horaInicio: "09:00", horaFin: "09:30", estado: "completada" }),
        clienteId: null, clienteNombre: `Cliente ${i}`, resena: { valoracion: 1 + (i % 5), comentario: `Reseña ${i}`, imagen: PNG_MINIMO, createdAt: new Date(Date.now() - i * 60_000) }
    }));
    await bd.collection("Citas").insertMany(resenasEnMasa);
    r = await req("GET", `/barberias/${otraBarberia._id}/resenas`);
    const fechasResenas = (r.data || []).map((x) => new Date(x.resena.createdAt).getTime());
    check("Reseñas públicas: de 55 reseñas solo se devuelven las 50 más recientes, de la más nueva a la más antigua, sin fotos",
        r.status === 200 && r.data.length === 50 && fechasResenas.every((t, i) => i === 0 || fechasResenas[i - 1] >= t) && r.data[0].resena.comentario === "Reseña 0" && r.data.every((x) => !("imagen" in x.resena)), `${r.status} ${r.data?.length}`);
    r = await req("GET", "/citas/resenas/barberia", { token: firmar(ajeno) });
    check("Reseñas del personal: el barbero ve todas las de su barbería (55), con foto", r.status === 200 && r.data.length === 55 && r.data.every((x) => x.resena.imagen === PNG_MINIMO), `${r.status} ${r.data?.length}`);

    // ---------------------------------------------------------------- Utilidades de la app (código real de BarberPlanApp)
    const enApp = (archivo) => pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", archivo)).href;
    const imagenApp = await import(enApp("imagen.util.ts"));
    const arranqueApp = await import(enApp("arranque-servidor.util.ts"));
    const ordenado = (objeto) => JSON.stringify(Object.entries(objeto).sort(([a], [b]) => a.localeCompare(b)));

    check("App y servidor: mismos pesos máximos por tipo de imagen y mismo máximo de fotos en la galería",
        ordenado(imagenApp.LIMITES_IMAGEN_KB) === ordenado(LIMITES_IMAGEN_KB) && imagenApp.MAX_IMAGENES_GALERIA === MAX_IMAGENES_GALERIA, `${ordenado(imagenApp.LIMITES_IMAGEN_KB)} / ${ordenado(LIMITES_IMAGEN_KB)}`);
    check("App: tamaños a los que se reduce cada imagen (logo y avatar 256, portada 1024, galería y reseña 800)",
        ordenado(imagenApp.LADO_MAXIMO_PX) === ordenado({ logo: 256, avatar: 256, portada: 1024, galeria: 800, resena: 800 }) && imagenApp.CALIDAD_JPEG_INICIAL === 0.7);
    const dim = imagenApp.dimensionesReducidas;
    check("App: una foto apaisada de 4000×3000 se reduce a 1024×768 (mantiene la proporción)", JSON.stringify(dim(4000, 3000, 1024)) === JSON.stringify({ ancho: 1024, alto: 768 }));
    check("App: una foto vertical de 3000×4000 se reduce a 768×1024", JSON.stringify(dim(3000, 4000, 1024)) === JSON.stringify({ ancho: 768, alto: 1024 }));
    check("App: una imagen pequeña no se amplía nunca (200×100 con límite 800 se queda igual)", JSON.stringify(dim(200, 100, 800)) === JSON.stringify({ ancho: 200, alto: 100 }));
    check("App: una imagen muy alargada no se queda en 0 píxeles (10000×10 con límite 256 -> 256×1)", JSON.stringify(dim(10000, 10, 256)) === JSON.stringify({ ancho: 256, alto: 1 }));
    check("App: bytesDeDataUrl cuenta los bytes de la imagen decodificada (el PNG mínimo pesa 70)", imagenApp.bytesDeDataUrl(PNG_MINIMO) === Buffer.from(PNG_MINIMO.split(",")[1], "base64").length && imagenApp.bytesDeDataUrl(PNG_MINIMO) === 70, `${imagenApp.bytesDeDataUrl(PNG_MINIMO)}`);
    let intento = { calidad: imagenApp.CALIDAD_JPEG_INICIAL, lado: 1024, reducciones: 0 };
    const calidades = [intento.calidad];
    const lados = [intento.lado];
    while ((intento = imagenApp.siguienteIntento(intento.calidad, intento.lado, intento.reducciones))) { calidades.push(intento.calidad); lados.push(intento.lado); }
    check("App: si la imagen pesa de más baja la calidad (0,7 -> 0,4) y luego el tamaño un 15 %, hasta 3 veces, y se rinde después (16 intentos)",
        calidades.length === 16 && Math.min(...calidades) === 0.4 && JSON.stringify(calidades.slice(0, 5)) === JSON.stringify([0.7, 0.6, 0.5, 0.4, 0.7]) && lados[4] === 870 && lados[15] === 629, `${calidades.length} intentos; lados ${[...new Set(lados)]}`);
    check("App: los mensajes de la galería llena y de imagen demasiado pesada están definidos", /6 imágenes/.test(imagenApp.MENSAJE_GALERIA_LLENA) && /demasiado pesada/.test(imagenApp.MENSAJE_IMAGEN_DEMASIADO_PESADA));

    const iniciales = utilCitas.inicialesCliente;
    check("App: iniciales del cliente para la agenda (nombre y apellido; cita manual; cliente eliminado; sin datos)",
        iniciales({ cliente: { nombre: "Ana", apellido: "García" } }) === "AG" && iniciales({ clienteNombre: "Reserva manual" }) === "RM" && iniciales({ clienteNombre: "Cliente eliminado" }) === "CE"
        && iniciales({ cliente: { nombre: "luis" } }) === "L" && iniciales({}) === "CL" && iniciales(null) === "CL");

    const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const eventos = [];
    const rapida = await arranqueApp.vigilarLentitud(async () => { await esperar(5); return "listo"; }, () => eventos.push("tardar"), () => eventos.push("terminar"), 60);
    check("Aviso de arranque en frío: una respuesta rápida no muestra el aviso y siempre se limpia al terminar", rapida === "listo" && JSON.stringify(eventos) === JSON.stringify(["terminar"]), JSON.stringify(eventos));
    eventos.length = 0;
    const lenta = await arranqueApp.vigilarLentitud(async () => { await esperar(120); return 42; }, () => eventos.push("tardar"), () => eventos.push("terminar"), 30);
    check("Aviso de arranque en frío: una respuesta lenta muestra el aviso una vez, y se quita al llegar", lenta === 42 && JSON.stringify(eventos) === JSON.stringify(["tardar", "terminar"]), JSON.stringify(eventos));
    eventos.length = 0;
    let propagado = null;
    await arranqueApp.vigilarLentitud(async () => { await esperar(60); throw new Error("sin servidor"); }, () => eventos.push("tardar"), () => eventos.push("terminar"), 20).catch((e) => { propagado = e.message; });
    check("Aviso de arranque en frío: si la petición falla el error se propaga y el aviso se quita", propagado === "sin servidor" && JSON.stringify(eventos) === JSON.stringify(["tardar", "terminar"]), JSON.stringify(eventos));
    check("Aviso de arranque en frío: se muestra a los 2,5 s y se espera hasta 90 s", arranqueApp.AVISO_ARRANQUE_MS === 2500 && arranqueApp.ESPERA_MAXIMA_ARRANQUE_MS === 90000);
};
