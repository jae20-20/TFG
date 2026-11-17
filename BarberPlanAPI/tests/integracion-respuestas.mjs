// Bloque de la batería de integración: respuestas del dueño y del barbero a las reseñas (crear, editar, borrar),
// su lectura en la ficha pública, en «Mis citas» y en el listado del personal, el aviso al cliente y la concurrencia.
// Lo ejecuta tests/integracion.mjs sobre la misma API y BD desechable, con un escenario propio.
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ_API } from "./entorno.mjs";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "./semilla.mjs";

export const pruebasRespuestas = async ({ check, entorno, req }) => {
    const { bd } = entorno;
    const utilCitas = await import(pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", "cita-estado.util.ts")).href);
    const firmar = (usuario) => jwt.sign({ id: usuario._id.toString(), rol: usuario.rol, barberiaId: usuario.barberiaId?.toString() ?? null }, process.env.JWT_SECRET, { expiresIn: "5m" });

    // ---------------------------------------------------------------- Escenario
    const servicio = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte", precio: 15, duracion: 30, createdAt: new Date() };
    const persona = (usuario, rol, extra = {}) => usuarioBase({ _id: new ObjectId(), nombre: usuario, apellido: "Respuestas", correo: `${usuario}@respuestas.test`, usuario, rol, ...extra });
    const admin = persona("dueno_resp", "admin");
    const barbero1 = persona("barbero_resp1", "barbero");
    const barbero2 = persona("barbero_resp2", "barbero");
    const inactivo = persona("barbero_resp_inactivo", "barbero", { activo: false });
    const exBarbero = persona("barbero_resp_ex", "barbero", { barberiaId: null });
    const cliente = persona("cliente_resp", "cliente", { ciudad: "Madrid", barberiaId: null });
    const barberia = crearBarberia("Barbería Respuestas", "Madrid", admin._id, [barbero1._id, barbero2._id, inactivo._id], servicio);
    for (const u of [admin, barbero1, barbero2, inactivo]) u.barberiaId = barberia._id;

    const conResena = (barbero, dias, comentario) => ({
        ...crearCita({ barberia, barbero, cliente, servicio, fecha: fechaRelativa(dias), horaInicio: "10:00", horaFin: "10:30", estado: "completada" }),
        _id: new ObjectId(),
        resena: { valoracion: 4, comentario, imagen: null, createdAt: new Date(Date.now() + dias * 1000) }
    });
    const cita1 = conResena(barbero1, -2, "Reseña para el barbero 1");
    const cita2 = conResena(barbero2, -3, "Reseña para el barbero 2");
    const citaInactivo = conResena(inactivo, -4, "Reseña para el barbero desactivado");
    const citaExBarbero = conResena(exBarbero, -5, "Reseña para quien ya no está");
    const sinResena = { ...crearCita({ barberia, barbero: barbero1, cliente, servicio, fecha: fechaRelativa(-6), horaInicio: "10:00", horaFin: "10:30", estado: "completada" }), _id: new ObjectId() };
    await bd.collection("Usuarios").insertMany([admin, barbero1, barbero2, inactivo, exBarbero, cliente]);
    await bd.collection("Barberias").insertOne(barberia);
    await bd.collection("Citas").insertMany([cita1, cita2, citaInactivo, citaExBarbero, sinResena]);

    const tAdmin = firmar(admin), tB1 = firmar(barbero1), tB2 = firmar(barbero2), tCliente = firmar(cliente);
    const ruta = (cita) => `/citas/${cita._id}/resena/respuesta`;
    const responder = (cita, token, texto) => req("POST", ruta(cita), { token, body: { texto } });
    const editar = (cita, token, texto) => req("PUT", ruta(cita), { token, body: { texto } });
    const borrar = (cita, token) => req("DELETE", ruta(cita), { token });
    const enBD = (cita) => bd.collection("Citas").findOne({ _id: cita._id });
    const publicas = async () => (await req("GET", `/barberias/${barberia._id}/resenas`)).data || [];
    const delPersonal = async (token) => (await req("GET", "/citas/resenas/barberia", { token })).data || [];
    const de = (lista, cita) => lista.find((x) => x._id === cita._id.toString());
    const sinAutorId = (valor) => !JSON.stringify(valor ?? null).includes("autorId");

    // ---------------------------------------------------------------- Barbero: crear, leer, editar
    let r = await responder(cita1, tB1, "  ¡Gracias por venir! Te esperamos pronto.  ");
    let doc = await enBD(cita1);
    check("Respuesta (barbero de la cita): POST -> 201 con el texto recortado y autorRol barbero, sin autorId",
        r.status === 201 && r.data?.respuesta?.texto === "¡Gracias por venir! Te esperamos pronto." && r.data.respuesta.autorRol === "barbero" && sinAutorId(r.data), `${r.status} ${JSON.stringify(r.data)}`);
    check("Respuesta (barbero): se guarda embebida en la reseña con autor, rol y fechas",
        doc.resena.respuesta?.autorId?.toString() === barbero1._id.toString() && doc.resena.respuesta.autorRol === "barbero"
        && doc.resena.respuesta.createdAt instanceof Date && doc.resena.respuesta.updatedAt === null && doc.resena.comentario === "Reseña para el barbero 1", JSON.stringify(doc.resena));
    check("Respuesta: deja al cliente un aviso respuesta_resena (RF12)", doc.avisoCliente?.tipo === "respuesta_resena", JSON.stringify(doc.avisoCliente));

    let lista = await publicas();
    check("Ficha pública: la reseña lleva la respuesta (texto, rol y fecha) sin el id del autor",
        de(lista, cita1)?.resena?.respuesta?.texto === "¡Gracias por venir! Te esperamos pronto." && de(lista, cita1).resena.respuesta.autorRol === "barbero" && sinAutorId(lista) && !("barberoId" in de(lista, cita1)),
        JSON.stringify(de(lista, cita1)?.resena));
    check("Ficha pública: una reseña sin respuesta no trae el campo respuesta", de(lista, cita2) && !("respuesta" in de(lista, cita2).resena));

    r = await req("GET", "/citas/mis-citas", { token: tCliente });
    const miCita = de(r.data || [], cita1);
    check("Mis citas (cliente): ve la respuesta a su reseña, sin autorId", miCita?.resena?.respuesta?.texto && sinAutorId(miCita), JSON.stringify(miCita?.resena));
    const avisos = utilCitas.avisosDeCitas(r.data || []);
    check("App: el aviso respuesta_resena se muestra con su texto en el inicio del cliente",
        avisos.some((a) => a.tipo === "respuesta_resena" && /ha respondido a tu reseña/.test(a.texto)), JSON.stringify(avisos));
    r = await req("GET", `/citas/${cita1._id}`, { token: tCliente });
    check("Detalle de la cita (cliente): incluye la respuesta sin autorId", r.status === 200 && r.data?.resena?.respuesta?.texto && sinAutorId(r.data), `${r.status}`);

    lista = await delPersonal(tB1);
    check("Reseñas del personal (barbero 1): puede responder las suyas y no las de otro barbero, sin barberoId ni autorId",
        de(lista, cita1)?.puedeResponder === true && de(lista, cita2)?.puedeResponder === false && lista.every((x) => !("barberoId" in x)) && sinAutorId(lista),
        JSON.stringify(lista.map((x) => [x.resena.comentario, x.puedeResponder])));
    lista = await delPersonal(tAdmin);
    check("Reseñas del personal (dueño): puede responder todas las de su barbería", lista.length === 4 && lista.every((x) => x.puedeResponder === true), `${lista.length}`);
    lista = await delPersonal(firmar(inactivo));
    check("Reseñas del personal (barbero desactivado): ve las reseñas pero no puede responder ninguna", lista.length === 4 && lista.every((x) => x.puedeResponder === false));

    r = await editar(cita1, tB1, "Gracias, ¡te esperamos!");
    doc = await enBD(cita1);
    check("Editar (autor barbero): PUT -> 200, cambia el texto y marca la fecha de edición",
        r.status === 200 && r.data?.respuesta?.texto === "Gracias, ¡te esperamos!" && r.data.respuesta.updatedAt && doc.resena.respuesta.updatedAt instanceof Date
        && doc.resena.respuesta.updatedAt >= doc.resena.respuesta.createdAt && doc.resena.respuesta.autorRol === "barbero", `${r.status} ${JSON.stringify(r.data)}`);

    // ---------------------------------------------------------------- El dueño edita la respuesta del barbero y la borra
    r = await editar(cita1, tAdmin, "Gracias de parte de todo el equipo");
    doc = await enBD(cita1);
    check("Editar (dueño, respuesta de un barbero): 200 y la respuesta pasa a ser de la barbería",
        r.status === 200 && r.data?.respuesta?.autorRol === "admin" && doc.resena.respuesta.autorId.toString() === admin._id.toString(), `${r.status} ${JSON.stringify(r.data)}`);
    r = await editar(cita1, tB1, "Intento del barbero");
    check("Editar (barbero) una respuesta que ya es del dueño -> 403 y no cambia", r.status === 403 && (await enBD(cita1)).resena.respuesta.texto === "Gracias de parte de todo el equipo", `${r.status}`);
    check("Reseñas del personal (barbero 1): ya no puede gestionar la respuesta que reescribió el dueño", de(await delPersonal(tB1), cita1)?.puedeResponder === false);
    r = await borrar(cita1, tB1);
    check("Borrar (barbero) la respuesta del dueño -> 403", r.status === 403 && (await enBD(cita1)).resena.respuesta, `${r.status}`);
    r = await borrar(cita1, tAdmin);
    doc = await enBD(cita1);
    check("Borrar (dueño): DELETE -> 200, la respuesta desaparece y la reseña se conserva",
        r.status === 200 && !("respuesta" in doc.resena) && doc.resena.valoracion === 4, `${r.status} ${JSON.stringify(doc.resena)}`);
    check("Borrar: el aviso de la respuesta que el cliente aún no había visto también se quita", !("avisoCliente" in doc), JSON.stringify(doc.avisoCliente));
    r = await borrar(cita1, tAdmin);
    check("Borrar una respuesta que ya no existe -> 404", r.status === 404, `${r.status}`);
    r = await editar(cita1, tAdmin, "Nada que editar");
    check("Editar una reseña sin respuesta -> 404", r.status === 404, `${r.status}`);
    check("Ficha pública: tras borrarla la reseña ya no lleva respuesta", !("respuesta" in (de(await publicas(), cita1)?.resena || { respuesta: 1 })));

    // ---------------------------------------------------------------- Dueño: crear y editar; barbero 2: crear y borrar la suya
    r = await responder(cita2, tAdmin, "Gracias por confiar en nosotros");
    check("Respuesta (dueño) a la reseña de otro barbero: 201 y autorRol admin", r.status === 201 && r.data?.respuesta?.autorRol === "admin", `${r.status}`);
    check("Ficha pública: la respuesta del dueño figura como de la barbería (autorRol admin)", de(await publicas(), cita2)?.resena?.respuesta?.autorRol === "admin");
    r = await responder(cita2, tB2, "Segunda respuesta");
    check("Segunda respuesta a la misma reseña (barbero de la cita) -> 409", r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
    r = await editar(cita2, tB2, "Edito la del dueño");
    check("Editar (barbero de la cita) la respuesta del dueño -> 403", r.status === 403, `${r.status}`);
    r = await borrar(cita2, tAdmin);
    check("Borrar (dueño) su propia respuesta -> 200", r.status === 200, `${r.status}`);

    r = await responder(cita2, tB2, "Gracias, un saludo");
    check("Respuesta (barbero 2) a su reseña -> 201", r.status === 201, `${r.status}`);
    // Un aviso de otro tipo posterior (p. ej. una cancelación) no se toca al borrar la respuesta
    await bd.collection("Citas").updateOne({ _id: cita2._id }, { $set: { avisoCliente: { tipo: "cancelada", creadoEn: new Date() } } });
    r = await borrar(cita2, tB2);
    doc = await enBD(cita2);
    check("Borrar (barbero, su respuesta) -> 200 y se conserva un aviso de otro tipo", r.status === 200 && !("respuesta" in doc.resena) && doc.avisoCliente?.tipo === "cancelada", `${r.status} ${JSON.stringify(doc.avisoCliente)}`);

    // ---------------------------------------------------------------- Permisos según la BD, no según el token
    r = await responder(citaInactivo, firmar(inactivo), "Respondo aunque esté desactivado");
    check("Barbero desactivado responde la reseña de su cita -> 403", r.status === 403 && !(await enBD(citaInactivo)).resena.respuesta, `${r.status}`);
    // Token con la barbería de la cita, pero en la BD el barbero ya no pertenece a ninguna
    r = await req("POST", ruta(citaExBarbero), { token: jwt.sign({ id: exBarbero._id.toString(), rol: "barbero", barberiaId: barberia._id.toString() }, process.env.JWT_SECRET, { expiresIn: "5m" }), body: { texto: "Ya no trabajo aquí" } });
    check("Barbero que ya dejó la barbería (aunque el token diga lo contrario) -> 403", r.status === 403 && !(await enBD(citaExBarbero)).resena.respuesta, `${r.status}`);
    r = await responder(sinResena, tB1, "Respuesta sin reseña");
    check("Responder una cita sin reseña -> 404", r.status === 404 && !(await enBD(sinResena)).resena, `${r.status}`);

    // ---------------------------------------------------------------- Concurrencia: dueño y barbero responden a la vez
    const simultaneas = await Promise.all([responder(cita1, tAdmin, "Respuesta del dueño"), responder(cita1, tB1, "Respuesta del barbero")]);
    const codigos = simultaneas.map((x) => x.status).sort((a, b) => a - b);
    check("Dos respuestas simultáneas a la misma reseña: una 201 y otra 409", JSON.stringify(codigos) === "[201,409]", JSON.stringify(codigos));
    await bd.collection("Citas").deleteMany({ barberiaId: barberia._id });
    await bd.collection("Barberias").deleteOne({ _id: barberia._id });
    await bd.collection("Usuarios").deleteMany({ correo: /@respuestas\.test$/ });
};
