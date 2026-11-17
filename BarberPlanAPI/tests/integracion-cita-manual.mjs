// Bloque de la batería de integración: cita manual asignada a un cliente registrado por su correo. Creación por el dueño
// y por el barbero, «Mis citas» y aviso al cliente, cancelación por el cliente, correo sin cuenta de cliente (sin crear
// nada), misma comprobación de solape que las reservas y el limitador propio de la ruta (con una API aparte).
// Lo ejecuta tests/integracion.mjs sobre la misma API y BD desechable, con un escenario propio.
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ_API, crearCliente, lanzarServidor } from "./entorno.mjs";
import { crearBarberia, fechaRelativa, usuarioBase } from "./semilla.mjs";

const MSG_NO_ENCONTRADO = "No se ha encontrado un cliente con ese correo";

export const pruebasCitaManual = async ({ check, entorno, req }) => {
    const { bd } = entorno;
    const utilCitas = await import(pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", "cita-estado.util.ts")).href);
    const firmar = (usuario) => jwt.sign({ id: usuario._id.toString(), rol: usuario.rol, barberiaId: usuario.barberiaId?.toString() ?? null }, process.env.JWT_SECRET, { expiresIn: "5m" });

    // ---------------------------------------------------------------- Escenario
    const servicio = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte", precio: 18, duracion: 30, createdAt: new Date() };
    const persona = (usuario, rol, extra = {}) => usuarioBase({ _id: new ObjectId(), nombre: usuario, apellido: "Manual", correo: `${usuario}@manual.test`, usuario, rol, telefono: "+34600111222", ...extra });
    const admin = persona("dueno_manual", "admin");
    const barbero = persona("barbero_manual", "barbero");
    const otroBarbero = persona("barbero_manual2", "barbero");
    const cliente = persona("cliente_manual", "cliente", { ciudad: "Madrid", barberiaId: null });
    const barberia = crearBarberia("Barbería Manual", "Madrid", admin._id, [barbero._id, otroBarbero._id], servicio);
    for (const u of [admin, barbero, otroBarbero]) u.barberiaId = barberia._id;
    await bd.collection("Usuarios").insertMany([admin, barbero, otroBarbero, cliente]);
    await bd.collection("Barberias").insertOne(barberia);

    const tAdmin = firmar(admin), tBarbero = firmar(barbero), tCliente = firmar(cliente);
    const fecha = fechaRelativa(10);
    const manual = (token, cuerpo) => req("POST", "/citas/manual", {
        token, body: { barberoId: barbero._id.toString(), servicioIds: [servicio._id.toString()], fecha, ...cuerpo }
    });
    const citasDelBarbero = () => bd.collection("Citas").countDocuments({ barberoId: barbero._id });
    const sinDatosDelCliente = (data) => !/manual\.test|cliente_manual|600111222/.test(JSON.stringify(data ?? null));

    // ---------------------------------------------------------------- El dueño asigna una cita a un cliente por su correo
    let r = await manual(tAdmin, { horaInicio: "10:00", correoCliente: "  CLIENTE_MANUAL@Manual.TEST " });
    const idAdmin = r.data?.cita?.id;
    let doc = idAdmin && await bd.collection("Citas").findOne({ _id: new ObjectId(idAdmin) });
    check("Cita manual por correo (dueño): 201 con el correo normalizado (mayúsculas y espacios)",
        r.status === 201 && r.data?.cita?.clienteVinculado === true && r.data.cita.estado === "confirmada", `${r.status} ${JSON.stringify(r.data)}`);
    check("Cita manual por correo: la respuesta no incluye ningún dato del cliente (ni nombre, ni correo, ni teléfono)",
        sinDatosDelCliente(r.data) && !("clienteNombre" in (r.data?.cita || {})), JSON.stringify(r.data));
    check("Cita manual por correo: queda guardada con el clienteId de la cuenta, confirmada, con el precio de la barbería y sin nombre libre",
        doc?.clienteId?.toString() === cliente._id.toString() && doc.estado === "confirmada" && doc.servicioPrecio === 18 && !("clienteNombre" in doc) && !("expiraEn" in doc),
        JSON.stringify(doc && { clienteId: doc.clienteId, estado: doc.estado, precio: doc.servicioPrecio, nombre: doc.clienteNombre }));
    check("Cita manual por correo: deja al cliente el aviso «nueva» (RF12)", doc?.avisoCliente?.tipo === "nueva" && doc.avisoCliente.creadoEn instanceof Date, JSON.stringify(doc?.avisoCliente));

    r = await req("GET", "/citas/mis-citas", { token: tCliente });
    const enMisCitas = (r.data || []).find((c) => c._id === idAdmin);
    check("Mis citas: el cliente ve la cita que le asignó el dueño, con la barbería y el barbero",
        r.status === 200 && enMisCitas?.estado === "confirmada" && enMisCitas.barberia?.nombre === "Barbería Manual" && enMisCitas.barbero?.nombre === "barbero_manual", `${r.status}`);
    const avisos = utilCitas.avisosDeCitas(r.data || []);
    check("App: el aviso «nueva» se muestra en el inicio del cliente con la barbería, el día y la hora",
        avisos.some((a) => a.tipo === "nueva" && a.texto === `Tienes una cita nueva en Barbería Manual el ${fecha.slice(8, 10)}/${fecha.slice(5, 7)} a las 10:00.`), JSON.stringify(avisos));

    r = await req("GET", `/citas/barberia/${barberia._id}`, { token: tAdmin });
    const enCalendario = (r.data || []).find((c) => c._id === idAdmin);
    check("Calendario del dueño: la cita asignada sale vinculada al cliente registrado (clienteId y su nombre)",
        enCalendario?.clienteId === cliente._id.toString() && enCalendario.cliente?.nombre === "cliente_manual", JSON.stringify(enCalendario?.cliente));

    // ---------------------------------------------------------------- El barbero se asigna una cita a sí mismo
    r = await manual(tBarbero, { horaInicio: "11:00", correoCliente: "cliente_manual@manual.test", clienteNombre: "Se ignora" });
    const idBarbero = r.data?.cita?.id;
    doc = idBarbero && await bd.collection("Citas").findOne({ _id: new ObjectId(idBarbero) });
    check("Cita manual por correo (barbero, para sí mismo): 201 vinculada a la cuenta; el nombre libre no se guarda",
        r.status === 201 && doc?.clienteId?.toString() === cliente._id.toString() && !("clienteNombre" in doc), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("POST", "/citas/manual", { token: firmar(otroBarbero), body: { barberoId: barbero._id.toString(), servicioIds: [servicio._id.toString()], fecha, horaInicio: "12:00", correoCliente: "cliente_manual@manual.test" } });
    check("Un barbero no puede asignar por correo una cita a otro barbero -> 403", r.status === 403, `${r.status}`);

    // ---------------------------------------------------------------- Mismo solape que las reservas
    let antes = await citasDelBarbero();
    r = await manual(tAdmin, { horaInicio: "10:00", correoCliente: "cliente_manual@manual.test" });
    check("Cita manual por correo en un hueco ya ocupado -> 409 y no se crea", r.status === 409 && await citasDelBarbero() === antes, `${r.status}`);
    const simultaneas = await Promise.all([
        manual(tAdmin, { horaInicio: "13:00", correoCliente: "cliente_manual@manual.test" }),
        manual(tBarbero, { horaInicio: "13:00", clienteNombre: "Sin cuenta" })
    ]);
    const codigos = simultaneas.map((x) => x.status).sort((a, b) => a - b);
    check("Dos citas manuales a la vez en el mismo hueco (una por correo): una 201 y otra 409", JSON.stringify(codigos) === "[201,409]", JSON.stringify(codigos));

    // ---------------------------------------------------------------- Correo sin cuenta de cliente: 404 genérico y no se crea nada
    antes = await citasDelBarbero();
    const casos404 = [
        ["un correo sin cuenta", "nadie@manual.test"],
        ["el correo de un barbero", "barbero_manual2@manual.test"],
        ["el correo del dueño", "dueno_manual@manual.test"]
    ];
    for (const [nombre, correo] of casos404) {
        r = await manual(tAdmin, { horaInicio: "15:00", correoCliente: correo });
        check(`Cita manual con ${nombre} -> 404 con el mismo mensaje genérico y sin datos de la cuenta`,
            r.status === 404 && r.data?.error === MSG_NO_ENCONTRADO && Object.keys(r.data).length === 1, `${r.status} ${JSON.stringify(r.data)}`);
    }
    check("Ningún 404 ha creado una cita", await citasDelBarbero() === antes);

    // ---------------------------------------------------------------- Sin correo todo sigue igual
    r = await manual(tAdmin, { horaInicio: "16:00", clienteNombre: "  Cliente por teléfono  " });
    doc = r.data?.cita?.id && await bd.collection("Citas").findOne({ _id: new ObjectId(r.data.cita.id) });
    check("Sin correo: cita manual con solo el nombre, sin cliente vinculado y sin aviso",
        r.status === 201 && r.data.cita.clienteVinculado === false && r.data.cita.clienteNombre === "Cliente por teléfono"
        && doc?.clienteId === null && doc.clienteNombre === "Cliente por teléfono" && !("avisoCliente" in doc), `${r.status} ${JSON.stringify(r.data)}`);
    r = await manual(tAdmin, { horaInicio: "17:00", correoCliente: "   " });
    check("Correo en blanco equivale a no indicarlo -> 201 con «Reserva manual»", r.status === 201 && r.data?.cita?.clienteNombre === "Reserva manual", `${r.status}`);
    r = await manual(tAdmin, { horaInicio: "18:00", clienteNombre: 12345 });
    check("Nombre del cliente que no es texto -> 400 (antes provocaba un 500)", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);

    // ---------------------------------------------------------------- El cliente la cancela desde «Mis citas»
    r = await req("PUT", `/citas/${idAdmin}/cancelar`, { token: tCliente });
    doc = await bd.collection("Citas").findOne({ _id: new ObjectId(idAdmin) });
    check("El cliente cancela la cita que le asignaron, con las mismas reglas que una propia -> 200",
        r.status === 200 && doc.estado === "cancelada" && doc.motivoCancelacion === "cliente", `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", "/citas/mis-citas", { token: tCliente });
    check("App: una vez cancelada, el aviso de cita nueva deja de mostrarse",
        !utilCitas.avisosDeCitas(r.data || []).some((a) => a.citaId === idAdmin), JSON.stringify(utilCitas.avisosDeCitas(r.data || [])));

    // ---------------------------------------------------------------- Limitador propio (API aparte con un máximo de 3)
    const servidor = lanzarServidor({ puerto: 5083, nombreBD: entorno.nombreBD, variables: { MANUAL_CLIENT_RATE_LIMIT_MAX: "3" } });
    await servidor.listo;
    const reqLim = crearCliente("http://localhost:5083");
    try {
        const conCorreo = (token, i) => reqLim("POST", "/citas/manual", { token, body: { barberoId: barbero._id.toString(), servicioIds: [servicio._id.toString()], fecha: fechaRelativa(11), horaInicio: "10:00", correoCliente: `nadie${i}@manual.test` } });
        const estados = [];
        for (let i = 0; i < 4; i++) estados.push((await conCorreo(tAdmin, i)).status);
        check("Limitador: 3 búsquedas por correo y la cuarta -> 429", JSON.stringify(estados) === "[404,404,404,429]", JSON.stringify(estados));
        r = await reqLim("POST", "/citas/manual", { token: tAdmin, body: { barberoId: barbero._id.toString(), servicioIds: [servicio._id.toString()], fecha: fechaRelativa(11), horaInicio: "11:00", clienteNombre: "Sin correo" } });
        check("Limitador: agotado el cupo, una cita manual sin correo se sigue creando -> 201", r.status === 201, `${r.status}`);
        r = await conCorreo(tBarbero, 9);
        check("Limitador: es por usuario; otro usuario desde la misma IP puede buscar -> 404", r.status === 404, `${r.status}`);
    } finally {
        await servidor.detener();
    }

    await bd.collection("Citas").deleteMany({ barberiaId: barberia._id });
    await bd.collection("Barberias").deleteOne({ _id: barberia._id });
    await bd.collection("Usuarios").deleteMany({ correo: /@manual\.test$/ });
};
