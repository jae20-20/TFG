// Bloque de la batería de integración: edición de citas desde la agenda (arrastre y modal), huecos para editar y
// avisos al barbero. Lo ejecuta tests/integracion.mjs sobre la misma API y BD desechable, con un escenario propio.
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ_API } from "./entorno.mjs";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "./semilla.mjs";

export const pruebasEditarCita = async ({ check, entorno, req }) => {
    const { bd } = entorno;
    const utilCitas = await import(pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", "cita-estado.util.ts")).href);
    const firmar = (usuario) => jwt.sign({ id: usuario._id.toString(), rol: usuario.rol, barberiaId: usuario.barberiaId?.toString() ?? null }, process.env.JWT_SECRET, { expiresIn: "5m" });

    // ---------------------------------------------------------------- Escenario
    const servicio = (nombre, precio, duracion) => ({ _id: new ObjectId(), nombre, descripcion: nombre, precio, duracion, createdAt: new Date() });
    const corte = servicio("Corte", 15, 30);
    const barba = servicio("Barba", 10, 30);
    const tinte = servicio("Tinte", 25, 60);

    const persona = (usuario, rol, extra = {}) => usuarioBase({ _id: new ObjectId(), nombre: usuario, apellido: "Edicion", correo: `${usuario}@edicion.test`, usuario, rol, telefono: "+34600999888", ...extra });
    const admin = persona("dueno_edicion", "admin");
    const b1 = persona("barbero_edicion1", "barbero", { vacaciones: [{ fechaInicio: fechaRelativa(15), fechaFin: fechaRelativa(15) }] });
    const b2 = persona("barbero_edicion2", "barbero", { serviciosBloqueados: [tinte._id.toString()] });
    const b3 = persona("barbero_edicion3", "barbero", { activo: false });
    const cliente = persona("cliente_edicion", "cliente", { ciudad: "Madrid", barberiaId: null });
    const adminOtro = persona("dueno_edicion_otro", "admin");
    const barberoOtro = persona("barbero_edicion_otro", "barbero");

    const barberia = crearBarberia("Barbería Edición", "Madrid", admin._id, [b1._id, b2._id, b3._id], corte);
    barberia.servicios.push(barba, tinte);
    const otraBarberia = crearBarberia("Barbería Edición Otra", "Madrid", adminOtro._id, [barberoOtro._id], corte);
    for (const u of [admin, b1, b2, b3]) u.barberiaId = barberia._id;
    for (const u of [adminOtro, barberoOtro]) u.barberiaId = otraBarberia._id;
    await bd.collection("Usuarios").insertMany([admin, b1, b2, b3, cliente, adminOtro, barberoOtro]);
    await bd.collection("Barberias").insertMany([barberia, otraBarberia]);

    const d10 = fechaRelativa(10), d11 = fechaRelativa(11), d12 = fechaRelativa(12), d13 = fechaRelativa(13), d14 = fechaRelativa(14);
    const cita = (barbero, fecha, horaInicio, horaFin, estado = "confirmada", servicios = [corte], b = barberia) => {
        const base = crearCita({ barberia: b, barbero, cliente, servicio: servicios[0], fecha, horaInicio, horaFin, estado });
        const precio = servicios.reduce((t, s) => t + s.precio, 0);
        return {
            ...base, _id: new ObjectId(), servicios,
            servicioNombre: servicios.map((s) => s.nombre).join(" + "),
            servicioPrecio: precio, importePagado: precio,
            servicioDuracion: servicios.reduce((t, s) => t + s.duracion, 0)
        };
    };
    const cA = cita(b1, d10, "10:00", "10:30");
    const cB = cita(b1, d10, "12:00", "13:00", "confirmada", [corte, barba]);
    const cOcupa = cita(b1, d10, "16:00", "16:30");
    const cPasada = cita(b1, fechaRelativa(-2), "10:00", "10:30");
    const cCancelada = cita(b1, d11, "10:00", "10:30", "cancelada");
    const cCompletada = cita(b1, fechaRelativa(-3), "10:00", "10:30", "completada");
    const cNoPresentada = cita(b1, fechaRelativa(-4), "10:00", "10:30", "no_presentada");
    const cDeB2 = cita(b2, d10, "10:00", "10:30");
    const cOtra = cita(barberoOtro, d10, "10:00", "10:30", "confirmada", [corte], otraBarberia);
    const cReasignar = cita(b1, d12, "11:00", "11:30");
    const cServicios = cita(b1, d13, "10:00", "10:30");
    const cConc1 = cita(b1, d14, "10:00", "10:30");
    const cConc2 = cita(b1, d14, "11:00", "11:30");
    const cConc3 = cita(b1, d14, "12:00", "12:30");
    await bd.collection("Citas").insertMany([cA, cB, cOcupa, cPasada, cCancelada, cCompletada, cNoPresentada, cDeB2, cOtra, cReasignar, cServicios, cConc1, cConc2, cConc3]);

    const tAdmin = firmar(admin), tB1 = firmar(b1), tB2 = firmar(b2), tCliente = firmar(cliente), tAdminOtro = firmar(adminOtro);
    const editar = (token, c, body) => req("PATCH", `/citas/${c._id}`, { token, body });
    const leer = (c) => bd.collection("Citas").findOne({ _id: c._id });
    const resumen = (doc) => JSON.stringify(doc && { b: doc.barberoId?.toString(), f: doc.fecha, i: doc.horaInicio, fin: doc.horaFin, e: doc.estado });

    // ---------------------------------------------------------------- El dueño arrastra una cita a otra hora
    let r = await editar(tAdmin, cA, { horaInicio: "11:00" });
    let doc = await leer(cA);
    check("Editar (dueño): mover la cita a un hueco libre -> 200 con la cita actualizada",
        r.status === 200 && r.data?.cita?.horaInicio === "11:00" && r.data.cita.horaFin === "11:30", `${r.status} ${JSON.stringify(r.data)}`);
    check("Editar: la respuesta no incluye avisosBarbero (ids internos de barberos)", r.status === 200 && !("avisosBarbero" in (r.data?.cita || {})));
    check("Editar: la BD guarda la nueva hora y la misma duración", doc.horaInicio === "11:00" && doc.horaFin === "11:30" && doc.fecha === d10, resumen(doc));
    check("Editar: el cliente recibe el aviso «modificada» con la fecha y hora anteriores",
        doc.avisoCliente?.tipo === "modificada" && doc.avisoCliente.anterior?.fecha === d10 && doc.avisoCliente.anterior?.horaInicio === "10:00" && doc.avisoCliente.creadoEn instanceof Date,
        JSON.stringify(doc.avisoCliente));
    check("Editar: al moverla el dueño, el barbero afectado recibe el aviso «modificada»",
        doc.avisosBarbero?.length === 1 && doc.avisosBarbero[0].barberoId.equals(b1._id) && doc.avisosBarbero[0].tipo === "modificada", JSON.stringify(doc.avisosBarbero));

    r = await req("GET", "/citas/avisos/barbero", { token: tB1 });
    const avisoA = (r.data || []).find((a) => a.citaId === cA._id.toString());
    check("Avisos del barbero: ve la cita que le movió el dueño, con la hora anterior y la nueva",
        r.status === 200 && avisoA?.tipo === "modificada" && avisoA.anterior?.horaInicio === "10:00" && avisoA.horaInicio === "11:00", `${r.status} ${JSON.stringify(r.data)}`);
    check("Avisos del barbero: no llevan datos del cliente", !/cliente_edicion|600999888|clienteId|clienteNombre/.test(JSON.stringify(r.data)), JSON.stringify(r.data));

    r = await req("GET", "/citas/mis-citas", { token: tCliente });
    const enMisCitas = (r.data || []).find((c) => c._id === cA._id.toString());
    check("Mis citas: la cita movida no expone avisosBarbero al cliente", enMisCitas && !("avisosBarbero" in enMisCitas), JSON.stringify(Object.keys(enMisCitas || {})));
    const avisosApp = utilCitas.avisosDeCitas(r.data || []);
    const textoEsperado = `Barbería Edición ha cambiado tu cita del ${d10.slice(8, 10)}/${d10.slice(5, 7)} a las 10:00: ahora es el ${d10.slice(8, 10)}/${d10.slice(5, 7)} a las 11:00.`;
    check("App: el aviso «modificada» se muestra al cliente con la cita anterior y la nueva",
        avisosApp.some((a) => a.citaId === cA._id.toString() && a.tipo === "modificada" && a.texto === textoEsperado), JSON.stringify(avisosApp));

    // ---------------------------------------------------------------- El barbero mueve su propia cita
    r = await editar(tB1, cA, { horaInicio: "11:30" });
    doc = await leer(cA);
    check("Editar (barbero): mover su propia cita -> 200 y aviso al cliente desde la hora que tenía",
        r.status === 200 && doc.horaInicio === "11:30" && doc.avisoCliente?.anterior?.horaInicio === "11:00", `${r.status} ${resumen(doc)}`);
    check("Editar (barbero): quien mueve la cita no se avisa a sí mismo (sigue solo el aviso anterior del dueño)",
        doc.avisosBarbero?.length === 1 && doc.avisosBarbero[0].anterior?.horaInicio === "10:00", JSON.stringify(doc.avisosBarbero));

    r = await editar(tB1, cA, { horaInicio: "11:30" });
    check("Editar sin cambios reales -> 200 sin tocar la cita", r.status === 200 && r.data?.message === "La cita no tenía cambios", `${r.status} ${JSON.stringify(r.data)}`);

    // ---------------------------------------------------------------- Arrastre de una cita con varios servicios
    r = await editar(tB1, cB, { horaInicio: "14:00" });
    doc = await leer(cB);
    check("Arrastre con varios servicios: solo cambia el inicio y se conserva la duración total (60 min)",
        r.status === 200 && doc.horaInicio === "14:00" && doc.horaFin === "15:00" && doc.servicios.length === 2 && doc.servicioDuracion === 60, `${r.status} ${resumen(doc)}`);
    r = await editar(tB1, cB, { horaInicio: "14:30" });
    doc = await leer(cB);
    check("Mover la cita dentro de su propio tramo (14:00-15:00 -> 14:30) -> 200: no choca consigo misma",
        r.status === 200 && doc.horaInicio === "14:30" && doc.horaFin === "15:30", `${r.status} ${resumen(doc)}`);

    // ---------------------------------------------------------------- Huecos que no valen: 409/400 y nada cambia
    const antesA = resumen(await leer(cA));
    for (const [nombre, body, esperado] of [
        ["a una hora ocupada por otra cita", { horaInicio: "16:00" }, 409],
        ["fuera del horario de la barbería", { horaInicio: "21:00" }, 409],
        ["a una hora que no es un hueco de la agenda", { horaInicio: "10:15" }, 409],
        ["a un día de vacaciones del barbero", { fecha: fechaRelativa(15) }, 409],
        ["a una fecha pasada", { fecha: fechaRelativa(-1) }, 400]
    ]) {
        r = await editar(tAdmin, cA, body);
        check(`Mover la cita ${nombre} -> ${esperado}`, r.status === esperado && typeof r.data?.error === "string", `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await editar(tAdmin, cB, { horaInicio: "15:30" });
    check("Mover una cita de 60 min a un hueco donde solo cabe en parte (pisa otra cita) -> 409", r.status === 409, `${r.status}`);
    check("Ningún intento rechazado ha movido la cita", resumen(await leer(cA)) === antesA, `${antesA} -> ${resumen(await leer(cA))}`);

    // ---------------------------------------------------------------- Citas no editables
    for (const [nombre, c] of [["cancelada", cCancelada], ["completada", cCompletada], ["no presentada", cNoPresentada], ["pasada (aún confirmada)", cPasada]]) {
        r = await editar(tAdmin, c, { fecha: d11, horaInicio: "15:00" });
        check(`Editar una cita ${nombre} -> 409 con mensaje y sin cambios`,
            r.status === 409 && /No se puede modificar/.test(r.data?.error || "") && (await leer(c)).horaInicio === c.horaInicio, `${r.status} ${JSON.stringify(r.data)}`);
    }

    // ---------------------------------------------------------------- Permisos por recurso (sin IDOR)
    r = await editar(tB1, cDeB2, { horaInicio: "13:00" });
    check("Un barbero no puede editar la cita de otro barbero de su barbería -> 404 (como si no existiera)", r.status === 404, `${r.status}`);
    r = await editar(tB2, cA, { horaInicio: "13:00" });
    check("El otro barbero tampoco puede editar las citas del primero -> 404", r.status === 404, `${r.status}`);
    r = await editar(tAdminOtro, cA, { horaInicio: "13:00" });
    check("El dueño de otra barbería no puede editar la cita -> 404", r.status === 404, `${r.status}`);
    r = await editar(tAdmin, cOtra, { horaInicio: "13:00" });
    check("El dueño no puede editar una cita de otra barbería -> 404", r.status === 404, `${r.status}`);
    r = await editar(tCliente, cA, { horaInicio: "13:00" });
    check("Un cliente no edita citas desde la agenda -> 403", r.status === 403, `${r.status}`);
    r = await req("PATCH", `/citas/${cA._id}`, { body: { horaInicio: "13:00" } });
    check("Editar sin token -> 401", r.status === 401, `${r.status}`);
    r = await editar(tB1, cA, { barberoId: b2._id.toString() });
    check("Un barbero no puede cambiar el barbero de su cita -> 403", r.status === 403 && (await leer(cA)).barberoId.equals(b1._id), `${r.status}`);
    r = await editar(tB1, cA, { barberoId: b1._id.toString(), horaInicio: "13:00" });
    check("Un barbero que envía su propio id como barbero no cambia nada de barbero -> 200", r.status === 200 && (await leer(cA)).horaInicio === "13:00", `${r.status}`);
    check("Ningún intento sin permiso ha tocado la cita de otro barbero ni la de otra barbería",
        resumen(await leer(cDeB2)) === resumen(cDeB2) && resumen(await leer(cOtra)) === resumen(cOtra));

    // ---------------------------------------------------------------- Modal: cambiar los servicios
    r = await editar(tAdmin, cServicios, { servicioIds: [corte._id.toString(), tinte._id.toString()] });
    doc = await leer(cServicios);
    check("Modal: cambiar los servicios recalcula la duración (30 + 60) y la hora de fin",
        r.status === 200 && doc.horaFin === "11:30" && doc.servicioDuracion === 90 && doc.servicios.length === 2, `${r.status} ${resumen(doc)}`);
    check("Modal: el precio y el importe pendiente de cobro siguen a los servicios nuevos",
        doc.servicioPrecio === 40 && doc.importePagado === 40 && doc.servicioNombre === "Corte + Tinte" && doc.servicioId.equals(corte._id), JSON.stringify({ p: doc.servicioPrecio, i: doc.importePagado, n: doc.servicioNombre }));
    r = await editar(tAdmin, cServicios, { servicioIds: [new ObjectId().toString()] });
    check("Modal: un servicio que no es de la barbería -> 404", r.status === 404, `${r.status}`);
    r = await editar(tAdmin, cServicios, { servicioIds: [corte._id.toString(), corte._id.toString()] });
    check("Modal: el mismo servicio repetido -> 400", r.status === 400, `${r.status}`);

    // ---------------------------------------------------------------- Modal: cambiar el barbero (solo el dueño)
    r = await editar(tAdmin, cServicios, { barberoId: b2._id.toString() });
    check("Cambiar a un barbero que no realiza uno de los servicios -> 400 y no se reasigna",
        r.status === 400 && /no realiza/.test(r.data?.error || "") && (await leer(cServicios)).barberoId.equals(b1._id), `${r.status} ${JSON.stringify(r.data)}`);
    r = await editar(tAdmin, cReasignar, { barberoId: b3._id.toString() });
    check("Cambiar a un barbero desactivado -> 409", r.status === 409, `${r.status}`);
    r = await editar(tAdmin, cReasignar, { barberoId: barberoOtro._id.toString() });
    check("Cambiar a un barbero de otra barbería -> 404", r.status === 404, `${r.status}`);
    r = await editar(tAdmin, cReasignar, { barberoId: new ObjectId().toString() });
    check("Cambiar a un barbero que no existe -> 404", r.status === 404, `${r.status}`);
    r = await editar(tAdmin, cReasignar, { barberoId: b2._id.toString(), fecha: d10, horaInicio: "10:00" });
    check("Cambiar al barbero cuyo hueco ya está ocupado -> 409", r.status === 409 && (await leer(cReasignar)).barberoId.equals(b1._id), `${r.status}`);

    r = await editar(tAdmin, cReasignar, { barberoId: b2._id.toString() });
    doc = await leer(cReasignar);
    check("Cambiar de barbero (dueño) -> 200 y la cita pasa al barbero nuevo", r.status === 200 && doc.barberoId.equals(b2._id), `${r.status} ${resumen(doc)}`);
    const tipoPara = (barbero) => doc.avisosBarbero?.find((a) => a.barberoId.equals(barbero._id))?.tipo;
    check("Cambio de barbero: avisa al anterior («reasignada_saliente») y al nuevo («reasignada_entrante») y al cliente",
        tipoPara(b1) === "reasignada_saliente" && tipoPara(b2) === "reasignada_entrante" && doc.avisoCliente?.tipo === "modificada", JSON.stringify(doc.avisosBarbero));

    r = await req("GET", "/citas/avisos/barbero", { token: tB2 });
    check("Avisos del barbero nuevo: ve la cita que le han pasado",
        (r.data || []).some((a) => a.citaId === cReasignar._id.toString() && a.tipo === "reasignada_entrante"), JSON.stringify(r.data));
    r = await req("GET", "/citas/avisos/barbero", { token: tB1 });
    check("Avisos del barbero anterior: ve la cita que le han quitado, aunque ya no esté en su agenda",
        (r.data || []).some((a) => a.citaId === cReasignar._id.toString() && a.tipo === "reasignada_saliente"), JSON.stringify(r.data));
    r = await req("GET", "/citas/barbero", { token: tB1 });
    check("La agenda del barbero anterior ya no incluye la cita reasignada", !(r.data || []).some((c) => c._id === cReasignar._id.toString()));

    r = await req("PUT", "/citas/avisos/barbero/leidos", { token: tB1 });
    const avisosB1 = await req("GET", "/citas/avisos/barbero", { token: tB1 });
    const avisosB2 = await req("GET", "/citas/avisos/barbero", { token: tB2 });
    check("Avisos del barbero: al marcarlos como leídos desaparecen los suyos",
        r.status === 200 && r.data?.avisosLeidos >= 2 && avisosB1.data?.length === 0, `${r.status} ${JSON.stringify(r.data)} ${JSON.stringify(avisosB1.data)}`);
    check("Avisos del barbero: marcar los propios no borra los de otro barbero en la misma cita",
        (avisosB2.data || []).some((a) => a.citaId === cReasignar._id.toString()), JSON.stringify(avisosB2.data));
    r = await req("GET", "/citas/avisos/barbero", { token: tAdmin });
    check("Avisos del barbero con rol dueño -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", "/citas/avisos/barbero/leidos", { token: tCliente });
    check("Marcar avisos del barbero con rol cliente -> 403", r.status === 403, `${r.status}`);

    // ---------------------------------------------------------------- Validación estricta del cuerpo
    const antesServicios = resumen(await leer(cServicios));
    for (const [nombre, body] of [
        ["un campo que no se puede editar (estado)", { estado: "cancelada" }],
        ["un campo que no se puede editar (precio)", { horaInicio: "15:00", servicioPrecio: 0 }],
        ["un cuerpo vacío", {}],
        ["el operador $gt en la fecha", { fecha: { $gt: "" } }],
        ["el operador $ne en el barbero", { barberoId: { $ne: null } }],
        ["un operador $set en la raíz del cuerpo", { $set: { estado: "cancelada" } }],
        ["operadores dentro de servicioIds", { servicioIds: [{ $ne: null }] }],
        ["servicioIds como texto", { servicioIds: corte._id.toString() }],
        ["servicioIds vacío", { servicioIds: [] }],
        ["más de 4 servicios", { servicioIds: [1, 2, 3, 4, 5].map(() => new ObjectId().toString()) }],
        ["una fecha que no existe", { fecha: "2026-02-30" }],
        ["una fecha con otro formato", { fecha: "30/10/2026" }],
        ["una hora no válida", { horaInicio: "25:00" }],
        ["una hora numérica", { horaInicio: 1000 }],
        ["un barbero con id mal formado", { barberoId: "abc" }]
    ]) {
        r = await editar(tAdmin, cServicios, body);
        check(`Editar con ${nombre} -> 400`, r.status === 400 && typeof r.data?.error === "string", `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("PATCH", `/citas/${cServicios._id}`, { token: tAdmin, body: [{ horaInicio: "15:00" }] });
    check("Editar con un array como cuerpo -> 400", r.status === 400, `${r.status}`);
    doc = await leer(cServicios);
    check("Ninguna petición rechazada ha cambiado la cita (ni su estado ni su precio)",
        resumen(doc) === antesServicios && doc.estado === "confirmada" && doc.servicioPrecio === 40, `${antesServicios} -> ${resumen(doc)}`);
    r = await req("PATCH", "/citas/abc", { token: tAdmin, body: { horaInicio: "15:00" } });
    check("Editar con un id de cita mal formado -> 400", r.status === 400, `${r.status}`);
    r = await req("PATCH", `/citas/${new ObjectId()}`, { token: tAdmin, body: { horaInicio: "15:00" } });
    check("Editar una cita que no existe -> 404", r.status === 404, `${r.status}`);

    // ---------------------------------------------------------------- Huecos para editar (modal)
    doc = await leer(cB);
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=${d10}`, { token: tB1 });
    check("Huecos para editar: se ofrece la hora que ocupa la propia cita (se excluye a sí misma)",
        r.status === 200 && r.data.horariosDisponibles.includes(doc.horaInicio), `${r.status} ${JSON.stringify(r.data)}`);
    check("Huecos para editar: con la duración de la cita (60 min) no se ofrece un hueco que pisa otra cita",
        r.status === 200 && !r.data.horariosDisponibles.includes("15:30") && !r.data.horariosDisponibles.includes("16:00"), JSON.stringify(r.data?.horariosDisponibles));
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=${d10}&duracion=30`, { token: tB1 });
    check("Huecos para editar: la duración de la consulta cambia los huecos (30 min sí cabe a las 15:30)",
        r.status === 200 && r.data.horariosDisponibles.includes("15:30"), JSON.stringify(r.data?.horariosDisponibles));
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=${d10}&barberoId=${b2._id}`, { token: tB1 });
    check("Huecos para editar: un barbero no puede consultar a otro barbero -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=${d10}&barberoId=${b2._id}`, { token: tAdmin });
    check("Huecos para editar: el dueño consulta los huecos de otro barbero (ocupado a las 10:00)",
        r.status === 200 && r.data.barberoId === b2._id.toString() && !r.data.horariosDisponibles.includes("10:00"), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=${d10}`, { token: tB2 });
    check("Huecos para editar: la cita de otro barbero -> 404", r.status === 404, `${r.status}`);
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=${d10}`, { token: tCliente });
    check("Huecos para editar con rol cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `/citas/${cB._id}/huecos?fecha=2026-13-01`, { token: tAdmin });
    check("Huecos para editar con una fecha no válida -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/${cCancelada._id}/huecos?fecha=${d10}`, { token: tAdmin });
    check("Huecos para editar una cita cancelada -> 409", r.status === 409, `${r.status}`);

    // ---------------------------------------------------------------- Concurrencia: dos movimientos al mismo hueco
    const simultaneas = await Promise.all([editar(tAdmin, cConc1, { horaInicio: "15:00" }), editar(tB1, cConc2, { horaInicio: "15:00" })]);
    const codigos = simultaneas.map((x) => x.status).sort((a, b) => a - b);
    const enHueco = await bd.collection("Citas").countDocuments({ barberoId: b1._id, fecha: d14, horaInicio: "15:00" });
    check("Dos citas movidas a la vez al mismo hueco: una 200 y otra 409", JSON.stringify(codigos) === "[200,409]", JSON.stringify(codigos));
    check("Tras los movimientos simultáneos solo hay una cita en el hueco", enHueco === 1, `${enHueco}`);

    const [movida, reserva] = await Promise.all([
        editar(tAdmin, cConc3, { horaInicio: "17:00" }),
        req("POST", "/citas", { token: tCliente, body: { barberiaId: barberia._id.toString(), barberoId: b1._id.toString(), servicioIds: [corte._id.toString()], fecha: d14, horaInicio: "17:00" } })
    ]);
    const exitos = [movida.status === 200, reserva.status === 201].filter(Boolean).length;
    const ocupantes = await bd.collection("Citas").countDocuments({ barberoId: b1._id, fecha: d14, horaInicio: "17:00", estado: { $in: ["pendiente", "confirmada"] } });
    check("Mover una cita y reservar a la vez el mismo hueco: solo una prospera (la otra 409)",
        exitos === 1 && [movida.status, reserva.status].includes(409) && ocupantes === 1, `${movida.status} ${reserva.status} ocupantes=${ocupantes}`);

    // ---------------------------------------------------------------- Reglas de la app
    const futura = { estado: "confirmada", fecha: d10, horaInicio: "10:00" };
    check("App: admiteEdicion acepta pendientes y confirmadas futuras y rechaza el resto",
        utilCitas.admiteEdicion(futura) && utilCitas.admiteEdicion({ ...futura, estado: "pendiente" })
        && !utilCitas.admiteEdicion({ ...futura, estado: "cancelada" }) && !utilCitas.admiteEdicion({ ...futura, estado: "completada" })
        && !utilCitas.admiteEdicion({ ...futura, fecha: fechaRelativa(-1) }));
    check("App: texto del aviso al barbero según el tipo",
        /te ha pasado/.test(utilCitas.textoAvisoBarbero({ tipo: "reasignada_entrante", fecha: d12, horaInicio: "11:00" }))
        && /ya no es tuya/.test(utilCitas.textoAvisoBarbero({ tipo: "reasignada_saliente", fecha: d12, horaInicio: "11:00" }))
        && /ha movido/.test(utilCitas.textoAvisoBarbero({ tipo: "modificada", fecha: d10, horaInicio: "11:00", anterior: { fecha: d10, horaInicio: "10:00" } })));

    await bd.collection("Citas").deleteMany({ barberiaId: { $in: [barberia._id, otraBarberia._id] } });
    await bd.collection("Barberias").deleteMany({ _id: { $in: [barberia._id, otraBarberia._id] } });
    await bd.collection("Usuarios").deleteMany({ correo: /@edicion\.test$/ });
};
