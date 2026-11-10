// Bloque de la batería de integración para el despliegue: configuración obligatoria en producción (DB_NAME y TRUST_PROXY),
// límites configurables, registro de errores sin datos, puesta al día de las citas al arrancar (la instancia gratuita se
// duerme), prueba de humo y script de limpieza de participantes.
// Lo ejecuta tests/integracion.mjs sobre la misma BD desechable; levanta sus propias APIs.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RAIZ_API, URI_PRUEBAS, crearCliente, lanzarServidor } from "./entorno.mjs";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "./semilla.mjs";

const CLAVE_LARGA = "k".repeat(48);
const CORS_PROD = "https://barberplan.example";
const PW = "password123";

// Ejecuta un script de scripts/ como proceso aparte y devuelve código y salida
const ejecutarScript = (script, argumentos, env = {}) => {
    const resultado = spawnSync(process.execPath, [`scripts/${script}`, ...argumentos], {
        cwd: RAIZ_API, env: { ...process.env, ...env }, encoding: "utf8", timeout: 120000
    });
    return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
};

export const pruebasDespliegue = async ({ check, entorno }) => {
    const { bd } = entorno;
    const { registrarError, describirError, mensajeSeguro } = await import("../src/utils/registrarError.js");
    const usuarios = bd.collection("Usuarios");
    const citas = bd.collection("Citas");
    const hash = await bcrypt.hash(PW, 4);

    // ---------------------------------------------------------------- Configuración obligatoria en producción
    const arranque = async (variables, quitar = []) => {
        const servidor = lanzarServidor({ puerto: 5088, nombreBD: entorno.nombreBD, variables: { NODE_ENV: "production", JWT_SECRET: CLAVE_LARGA, CORS_ORIGINS: CORS_PROD, TRUST_PROXY: "1", ...variables }, quitar });
        const codigo = await Promise.race([servidor.salio, new Promise((resolve) => setTimeout(() => resolve("sigue vivo"), 30000))]);
        if (codigo === "sigue vivo") await servidor.detener();
        return { codigo, salida: servidor.salida() };
    };
    let r = await arranque({}, ["DB_NAME"]);
    check("Producción sin DB_NAME: no arranca y lo dice (no se usaría por error la base de desarrollo)", r.codigo === 1 && /DB_NAME/.test(r.salida) && !r.salida.includes("Servidor corriendo"), `código ${r.codigo}`);
    r = await arranque({ DB_NAME: "BarberPlan" });
    check("Producción con DB_NAME=BarberPlan (la de desarrollo): no arranca", r.codigo === 1 && /base de desarrollo/.test(r.salida), `código ${r.codigo}`);
    r = await arranque({}, ["TRUST_PROXY"]);
    check("Producción sin TRUST_PROXY: no arranca y lo dice", r.codigo === 1 && /TRUST_PROXY/.test(r.salida), `código ${r.codigo}`);
    // Producción con TRUST_PROXY=0 explícito (sin proxy): arranca
    const sinProxy = lanzarServidor({
        puerto: 5088, nombreBD: entorno.nombreBD,
        variables: { NODE_ENV: "production", JWT_SECRET: CLAVE_LARGA, CORS_ORIGINS: CORS_PROD, TRUST_PROXY: "0" }
    });
    let arrancaSinProxy = true;
    try { await sinProxy.listo; } catch { arrancaSinProxy = false; } finally { await sinProxy.detener(); }
    check("Producción con TRUST_PROXY=0 explícito (sin proxy) sí arranca", arrancaSinProxy);

    // Los cuatro limitadores por IP son configurables por variable de entorno
    const estados = async (req, metodo, ruta, cuerpo, veces) => {
        const lista = [];
        for (let i = 0; i < veces; i++) lista.push((await req(metodo, ruta, { body: cuerpo })).status);
        return lista;
    };
    const limitado = lanzarServidor({ puerto: 5088, nombreBD: entorno.nombreBD, variables: { AUTH_RATE_LIMIT_MAX: "2", INVITATION_RATE_LIMIT_MAX: "2" } });
    try {
        await limitado.listo;
        const req = crearCliente("http://localhost:5088");
        const login = await estados(req, "POST", "/usuarios/login", { correo: "x@x.test", pw: "x" }, 3);
        check("Limitador 1 (login y registro de usuarios): AUTH_RATE_LIMIT_MAX=2 -> el tercer intento 429", login[2] === 429 && login[0] !== 429 && login[1] !== 429, JSON.stringify(login));
        const registroBarberia = await estados(req, "POST", "/barberias/registro", {}, 3);
        check("Limitador 2 (registro de barbería): AUTH_RATE_LIMIT_MAX=2 -> el tercer intento 429, con su propio contador", registroBarberia[2] === 429 && registroBarberia[0] === 400 && registroBarberia[1] === 400, JSON.stringify(registroBarberia));
        const invitacion = await estados(req, "POST", "/barberias/invitaciones/validar", { code: "AAAA-BBBB" }, 3);
        check("Limitador 3 (códigos de invitación): INVITATION_RATE_LIMIT_MAX=2 -> el tercer intento 429", invitacion[2] === 429 && invitacion[0] !== 429, JSON.stringify(invitacion));
    } finally {
        await limitado.detener();
    }
    const globalAcotado = lanzarServidor({ puerto: 5088, nombreBD: entorno.nombreBD, variables: { RATE_LIMIT_MAX: "3" } });
    try {
        await globalAcotado.listo;
        const globales = await estados(crearCliente("http://localhost:5088"), "GET", "/", undefined, 5);
        check("Limitador 4 (global): RATE_LIMIT_MAX=3 -> pasado el límite 429 para cualquier ruta", JSON.stringify(globales) === "[200,200,200,429,429]", JSON.stringify(globales));
    } finally {
        await globalAcotado.detener();
    }

    // ---------------------------------------------------------------- Registro de errores sin datos
    class ErrorMongoSimulado extends Error { constructor(mensaje, code) { super(mensaje); this.name = "MongoServerError"; this.code = code; } }
    const duplicado = new ErrorMongoSimulado('E11000 duplicate key error collection: BarberPlan.Usuarios index: correo_unico dup key: { correo: "ana.garcia@ejemplo.com" }', 11000);
    duplicado.keyValue = { correo: "ana.garcia@ejemplo.com" };
    duplicado.errorResponse = { command: { filter: { correo: "ana.garcia@ejemplo.com" }, pw: "$2a$10$hashsecreto" } };
    const linea = describirError("Error al crear usuario", duplicado);
    check("Registro de errores: una línea con contexto, tipo, código y mensaje", /^Error al crear usuario \| MongoServerError code=11000 \| /.test(linea), linea);
    check("Registro de errores: el correo del mensaje y el documento de la clave duplicada no salen", !linea.includes("ana.garcia") && !linea.includes("{ correo") && linea.includes("{…}"), linea);
    check("Registro de errores: no vuelca el objeto del error (keyValue, errorResponse, comando ni hash de contraseña)", !linea.includes("keyValue") && !linea.includes("errorResponse") && !linea.includes("hashsecreto"));
    const conSecretos = mensajeSeguro(new Error("falló mongodb+srv://usuario:clave@cluster0.abc.mongodb.net/?x=1 con el token eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.firmaFirma y el correo a@b.es"));
    check("Registro de errores: oculta cadenas de conexión, tokens JWT y correos del mensaje", !/usuario:clave|eyJ|a@b\.es/.test(conSecretos) && conSecretos.includes("[uri]") && conSecretos.includes("[token]") && conSecretos.includes("[correo]"), conSecretos);
    check("Registro de errores: el mensaje se recorta (no vuelca textos enormes)", mensajeSeguro(new Error("x".repeat(5000))).length <= 300);
    const capturadas = [];
    const consolaError = console.error;
    console.error = (...args) => capturadas.push(args);
    try {
        registrarError("Contexto:", new Error("fallo"));
        registrarError("Otro contexto", "cadena suelta");
        registrarError("Sin error", undefined);
    } finally {
        console.error = consolaError;
    }
    check("registrarError escribe una sola cadena por error (nunca el objeto)", capturadas.length === 3 && capturadas.every((a) => a.length === 1 && typeof a[0] === "string") && capturadas[0][0].startsWith("Contexto |"), JSON.stringify(capturadas));

    // ---------------------------------------------------------------- Las citas vencidas se ponen al día al arrancar (instancia que despierta)
    const servicio = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte", precio: 15, duracion: 30, createdAt: new Date() };
    const adminB = usuarioBase({ _id: new ObjectId(), nombre: "Dueño", apellido: "Arranque", correo: "dueno.arranque@prueba.test", usuario: "dueno_arranque", rol: "admin", pw: hash });
    const barberoB = usuarioBase({ _id: new ObjectId(), nombre: "Barbero", apellido: "Arranque", correo: "barbero.arranque@prueba.test", usuario: "barbero_arranque", rol: "barbero", cargo: "Barbero", pw: hash });
    const clienteB = usuarioBase({ _id: new ObjectId(), nombre: "Cliente", apellido: "Arranque", correo: "cliente.arranque@prueba.test", usuario: "cliente_arranque", rol: "cliente", ciudad: "Madrid", barberiaId: null, pw: hash });
    const barberiaB = crearBarberia("Barbería Arranque", "Madrid", adminB._id, [barberoB._id], servicio);
    adminB.barberiaId = barberoB.barberiaId = barberiaB._id;
    await usuarios.insertMany([adminB, barberoB, clienteB]);
    await bd.collection("Barberias").insertOne(barberiaB);
    const base = { barberia: barberiaB, barbero: barberoB, cliente: clienteB, servicio };
    const caducada = { ...crearCita({ ...base, fecha: fechaRelativa(30), horaInicio: "10:00", horaFin: "10:30", estado: "pendiente" }), expiraEn: new Date(Date.now() - 3600_000) };
    const vigente = { ...crearCita({ ...base, fecha: fechaRelativa(31), horaInicio: "10:00", horaFin: "10:30", estado: "pendiente" }), expiraEn: new Date(Date.now() + 3600_000) };
    const sinCerrar = crearCita({ ...base, fecha: fechaRelativa(-5), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" });
    await citas.insertMany([caducada, vigente, sinCerrar]);

    const conTareas = lanzarServidor({ puerto: 5088, nombreBD: entorno.nombreBD, variables: { TAREAS_CITAS: "on" } });
    try {
        await conTareas.listo;
        // Sin ninguna petición previa: la puesta al día ocurre antes de abrir el puerto
        const [c, v, s] = await Promise.all([caducada, vigente, sinCerrar].map((x) => citas.findOne({ _id: x._id })));
        check("Arranque: la reserva pendiente que caducó mientras la instancia dormía ya está cancelada, con su aviso, al abrir el puerto",
            c.estado === "cancelada" && c.motivoCancelacion === "expirada" && c.avisoCliente?.tipo === "expirada", `${c.estado} ${c.motivoCancelacion}`);
        check("Arranque: la reserva pendiente todavía vigente no se toca", v.estado === "pendiente");
        check("Arranque: la cita confirmada hace 5 días sin asistencia registrada ya está completada automáticamente", s.estado === "completada" && s.asistenciaAutomatica === true, `${s.estado}`);
    } finally {
        await conTareas.detener();
    }

    // ---------------------------------------------------------------- Prueba de humo (solo lectura)
    const api = lanzarServidor({ puerto: 5088, nombreBD: entorno.nombreBD, variables: { AUTH_RATE_LIMIT_MAX: "1000" } });
    try {
        await api.listo;
        const antes = await Promise.all(["Usuarios", "Barberias", "Citas", "Solicitudes", "Invitaciones", "AgendaBloqueos"].map((c) => bd.collection(c).countDocuments()));
        const humo = ejecutarScript("humo.mjs", ["http://localhost:5088", "http://localhost:4200"], { HUMO_CORREO: clienteB.correo, HUMO_PW: PW });
        check("Humo: contra una API sana termina con código 0 y sin ningún FALLO", humo.codigo === 0 && !/^FALLO/m.test(humo.salida), `código ${humo.codigo}\n${humo.salida}`);
        check("Humo: comprueba estado, CORS, listado, limitador, inicio de sesión y errores", ["Estado de la API", "CORS: la web puede leer", "petición previa", "NO recibe permiso", "Listado de barberías", "Limitador", "TRUST_PROXY", "Inicio de sesión", "Errores:"].every((t) => humo.salida.includes(t)), humo.salida.slice(0, 200));
        const despues = await Promise.all(["Usuarios", "Barberias", "Citas", "Solicitudes", "Invitaciones", "AgendaBloqueos"].map((c) => bd.collection(c).countDocuments()));
        check("Humo: no escribe nada en la base de datos (mismo número de documentos en todas las colecciones)", JSON.stringify(antes) === JSON.stringify(despues), `${antes} -> ${despues}`);
        const malOrigen = ejecutarScript("humo.mjs", ["http://localhost:5088", "https://origen-no-registrado.example"], { HUMO_CORREO: clienteB.correo, HUMO_PW: PW });
        check("Humo: si el origen de la web no está permitido por CORS falla (código 1)", malOrigen.codigo === 1 && /FALLO\s+CORS: la web puede leer/.test(malOrigen.salida), `código ${malOrigen.codigo}`);
        const malaCuenta = ejecutarScript("humo.mjs", ["http://localhost:5088", "http://localhost:4200"], { HUMO_CORREO: clienteB.correo, HUMO_PW: "no-es-la-contraseña-1" });
        check("Humo: con una contraseña de prueba incorrecta falla el inicio de sesión (código 1)", malaCuenta.codigo === 1 && /FALLO\s+Inicio de sesión/.test(malaCuenta.salida), `código ${malaCuenta.codigo}`);
        const sinCredenciales = ejecutarScript("humo.mjs", ["http://localhost:5088", "http://localhost:4200"], { HUMO_CORREO: "", HUMO_PW: "" });
        check("Humo: sin cuenta de prueba omite el inicio de sesión (y lo dice) sin fallar", sinCredenciales.codigo === 0 && /OMITIDO\s+Inicio de sesión/.test(sinCredenciales.salida), sinCredenciales.salida.slice(-300));
        const sinArgumentos = ejecutarScript("humo.mjs", []);
        check("Humo: sin URL ni origen explica el uso y sale con código 2", sinArgumentos.codigo === 2 && /Uso:/.test(sinArgumentos.salida));
        const apiMuerta = ejecutarScript("humo.mjs", ["http://localhost:5087", "http://localhost:4200"]);
        check("Humo: contra una API que no responde falla (código 1)", apiMuerta.codigo === 1 && /FALLO/.test(apiMuerta.salida), `código ${apiMuerta.codigo}`);
    } finally {
        await api.detener();
    }

    // ---------------------------------------------------------------- Limpieza de participantes
    // Escenario: yo (admin, barbero y cliente propios, creados ANTES de las pruebas y uno DURANTE ellas con correo en la lista
    // a conservar) y tres participantes: un cliente, un barbero de mi barbería y un dueño con su barbería
    const corte = new Date();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const antiguo = new Date(corte.getTime() - 30 * 86400000);
    const nuevo = (datos) => usuarioBase({ _id: new ObjectId(), pw: hash, ...datos });
    const miAdmin = nuevo({ nombre: "Mi", apellido: "Admin", correo: "mi.admin@prueba.test", usuario: "mi_admin", rol: "admin", createdAt: antiguo });
    const miBarbero = nuevo({ nombre: "Mi", apellido: "Barbero", correo: "mi.barbero@prueba.test", usuario: "mi_barbero", rol: "barbero", cargo: "Barbero", createdAt: antiguo });
    const miClienteNuevo = nuevo({ nombre: "Mi", apellido: "ClientePrueba", correo: "mi.cliente.nuevo@prueba.test", usuario: "mi_cliente_nuevo", rol: "cliente", ciudad: "Madrid", barberiaId: null, createdAt: new Date() });
    const p1 = nuevo({ nombre: "Part", apellido: "Cliente", correo: "p1.cliente@prueba.test", usuario: "p1_cliente", rol: "cliente", ciudad: "Madrid", barberiaId: null, createdAt: new Date() });
    const p2 = nuevo({ nombre: "Part", apellido: "Barbero", correo: "p2.barbero@prueba.test", usuario: "p2_barbero", rol: "barbero", cargo: "Barbero", createdAt: new Date() });
    const p3 = nuevo({ nombre: "Part", apellido: "Dueno", correo: "p3.dueno@prueba.test", usuario: "p3_dueno", rol: "admin", createdAt: new Date() });
    const mia = crearBarberia("Barbería Mía (se conserva)", "Madrid", miAdmin._id, [miBarbero._id, p2._id], servicio);
    const deP3 = crearBarberia("Barbería de un participante (se borra)", "Madrid", p3._id, [], servicio);
    Object.assign(miAdmin, { barberiaId: mia._id });
    Object.assign(miBarbero, { barberiaId: mia._id });
    Object.assign(p2, { barberiaId: mia._id });
    Object.assign(p3, { barberiaId: deP3._id });
    const hoy = { servicio };
    const citasLimpieza = {
        entreMios: crearCita({ ...hoy, barberia: mia, barbero: miBarbero, cliente: miClienteNuevo, fecha: fechaRelativa(3), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" }),
        participanteConMiBarbero: crearCita({ ...hoy, barberia: mia, barbero: miBarbero, cliente: p1, fecha: fechaRelativa(3), horaInicio: "11:00", horaFin: "11:30", estado: "confirmada" }),
        miClienteConBarberoParticipante: crearCita({ ...hoy, barberia: mia, barbero: p2, cliente: miClienteNuevo, fecha: fechaRelativa(4), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" }),
        participanteEnBarberiaAjena: crearCita({ ...hoy, barberia: deP3, barbero: p3, cliente: p1, fecha: fechaRelativa(5), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" }),
        miClienteEnBarberiaDeParticipante: crearCita({ ...hoy, barberia: deP3, barbero: p3, cliente: miClienteNuevo, fecha: fechaRelativa(6), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" })
    };
    await usuarios.insertMany([miAdmin, miBarbero, miClienteNuevo, p1, p2, p3]);
    await bd.collection("Barberias").insertMany([mia, deP3]);
    await citas.insertMany(Object.values(citasLimpieza));
    await bd.collection("Solicitudes").insertMany([
        { barberoId: p2._id, barberiaId: mia._id, tipo: "dia_libre", estado: "pendiente", createdAt: new Date() },
        { barberoId: miBarbero._id, barberiaId: mia._id, tipo: "dia_libre", estado: "pendiente", createdAt: new Date() }
    ]);
    await bd.collection("Invitaciones").insertMany([
        { barberiaId: mia._id, nombre: "Invitado", apellido: "Participante", cargo: "Barbero", codigoHash: "limpieza-nueva", estado: "usada", usadaPor: p2._id, createdAt: new Date() },
        { barberiaId: mia._id, nombre: "Invitada", apellido: "Antigua", cargo: "Barbero", codigoHash: "limpieza-antigua", estado: "usada", usadaPor: miBarbero._id, createdAt: antiguo }
    ]);
    await bd.collection("AgendaBloqueos").insertMany([
        { _id: `${p2._id}:${fechaRelativa(4)}`, version: 1 }, { _id: `${miBarbero._id}:${fechaRelativa(3)}`, version: 1 }, { _id: `${p3._id}:${fechaRelativa(5)}`, version: 1 }
    ]);

    const argsLimpieza = [`--bd=${entorno.nombreBD}`, `--desde=${corte.toISOString()}`, `--conservar=mi.cliente.nuevo@prueba.test,MI.ADMIN@prueba.test`];
    const entornoLimpieza = { LIMPIEZA_ATLAS_URI: URI_PRUEBAS };
    const contar = async () => ({
        usuarios: await usuarios.countDocuments(), barberias: await bd.collection("Barberias").countDocuments(), citas: await citas.countDocuments(),
        solicitudes: await bd.collection("Solicitudes").countDocuments(), invitaciones: await bd.collection("Invitaciones").countDocuments(), agenda: await bd.collection("AgendaBloqueos").countDocuments()
    });

    const falta = (args, env = entornoLimpieza) => ejecutarScript("limpiar-participantes.mjs", args, env);
    check("Limpieza: sin --bd se niega (código 2) y no toca nada", falta(argsLimpieza.slice(1)).codigo === 2);
    check("Limpieza: sin --desde se niega (código 2)", falta([argsLimpieza[0], argsLimpieza[2]]).codigo === 2);
    check("Limpieza: sin --conservar se niega (sin esa lista no sabe qué cuentas son tuyas)", falta(argsLimpieza.slice(0, 2)).codigo === 2);
    check("Limpieza: con una fecha inválida se niega", falta([argsLimpieza[0], "--desde=ayer-por-la-tarde", argsLimpieza[2]]).codigo === 2);
    check("Limpieza: sin LIMPIEZA_ATLAS_URI se niega (no usa la conexión de la API)", falta(argsLimpieza, { LIMPIEZA_ATLAS_URI: "" }).codigo === 2);

    const inicial = await contar();
    const simulacion = falta(argsLimpieza);
    check("Limpieza: por defecto SIMULA, termina bien y lo anuncia", simulacion.codigo === 0 && /SIMULACIÓN/.test(simulacion.salida) && !/BORRADO REAL/.test(simulacion.salida), simulacion.salida.slice(0, 200));
    check("Limpieza (simulación): no modifica absolutamente nada en la base de datos", JSON.stringify(await contar()) === JSON.stringify(inicial), `${JSON.stringify(inicial)}`);
    const filasParticipantes = simulacion.salida.split("\n").filter((l) => /^ {2}(cliente|barbero|admin) /.test(l));
    check("Limpieza (simulación): lista exactamente a los 3 participantes, nunca a las cuentas conservadas ni a las anteriores a la fecha",
        filasParticipantes.length === 3 && ["p1.cliente@prueba.test", "p2.barbero@prueba.test", "p3.dueno@prueba.test"].every((c) => filasParticipantes.some((f) => f.includes(c))), filasParticipantes.join(" | "));
    check("Limpieza (simulación): explica qué borraría (3 cuentas, 1 barbería, 4 citas, 1 solicitud, 2 invitaciones, 2 agendas) y cómo borrar de verdad",
        /cuentas\s+3/.test(simulacion.salida) && /barberias\s+1/.test(simulacion.salida) && /citas\s+4/.test(simulacion.salida) && /solicitudes\s+1/.test(simulacion.salida)
        && /invitaciones\s+1/.test(simulacion.salida) && /agenda\s+2/.test(simulacion.salida) && /--borrar/.test(simulacion.salida), simulacion.salida);

    const real = falta([...argsLimpieza, "--borrar"]);
    check("Limpieza con --borrar: termina bien", real.codigo === 0 && /BORRADO REAL/.test(real.salida) && /Borrado completado/.test(real.salida), real.salida.slice(-300));
    const existe = async (u) => Boolean(await usuarios.findOne({ _id: u._id }));
    check("Limpieza: se borran las 3 cuentas de participantes", !(await existe(p1)) && !(await existe(p2)) && !(await existe(p3)));
    check("Limpieza: se conservan tus cuentas (la anterior a la fecha y las de la lista, aunque sean posteriores)", await existe(miAdmin) && await existe(miBarbero) && await existe(miClienteNuevo));
    check("Limpieza: se conserva tu barbería (con tu barbero) y se quita de su equipo al participante",
        Boolean(await bd.collection("Barberias").findOne({ _id: mia._id, barberos: miBarbero._id })) && !(await bd.collection("Barberias").findOne({ _id: mia._id })).barberos.some((id) => id.equals(p2._id)));
    check("Limpieza: se borra la barbería del participante", !(await bd.collection("Barberias").findOne({ _id: deP3._id })));
    check("Limpieza: se conserva la cita que solo implica a cuentas tuyas y se borran las 4 en las que interviene un participante o una barbería borrada",
        Boolean(await citas.findOne({ _id: citasLimpieza.entreMios._id })) && (await Promise.all(["participanteConMiBarbero", "miClienteConBarberoParticipante", "participanteEnBarberiaAjena", "miClienteEnBarberiaDeParticipante"].map((k) => citas.findOne({ _id: citasLimpieza[k]._id })))).every((c) => c === null));
    check("Limpieza: se borran la solicitud del participante y su invitación, pero no tu solicitud ni tu invitación anterior a las pruebas",
        await bd.collection("Solicitudes").countDocuments({ barberoId: p2._id }) === 0 && await bd.collection("Solicitudes").countDocuments({ barberoId: miBarbero._id }) === 1
        && await bd.collection("Invitaciones").countDocuments({ codigoHash: "limpieza-nueva" }) === 0 && await bd.collection("Invitaciones").countDocuments({ codigoHash: "limpieza-antigua" }) === 1);
    check("Limpieza: se borra la agenda de los participantes y se conserva la tuya", await bd.collection("AgendaBloqueos").countDocuments({ _id: new RegExp(`^(${p2._id}|${p3._id}):`) }) === 0 && await bd.collection("AgendaBloqueos").countDocuments({ _id: new RegExp(`^${miBarbero._id}:`) }) === 1);
    const otra = falta([...argsLimpieza, "--borrar"]);
    check("Limpieza: repetirla no hace nada más y no falla", otra.codigo === 0 && /No hay nada que borrar/.test(otra.salida), otra.salida.slice(-200));

    // ---------------------------------------------------------------- Guardián del build de la web (BarberPlanApp/scripts/comprobar-entorno.mjs)
    const guardian = path.join(RAIZ_API, "..", "BarberPlanApp", "scripts", "comprobar-entorno.mjs");
    const proyecto = fs.mkdtempSync(path.join(os.tmpdir(), "barberplan-web-"));
    const escribir = (apiUrl, hosting) => {
        fs.mkdirSync(path.join(proyecto, "src", "environments"), { recursive: true });
        fs.mkdirSync(path.join(proyecto, "src", "app", "pages", "privacidad"), { recursive: true });
        fs.writeFileSync(path.join(proyecto, "src", "environments", "environment.prod.ts"),
            `// [COMENTARIO EN MAYÚSCULAS] no cuenta\nexport const environment = {\n  production: true,\n  apiUrl: '${apiUrl}',\n  privacidad: { responsable: 'Ana Pérez', correoContacto: 'ana@ejemplo.es' }\n};\n`);
        fs.writeFileSync(path.join(proyecto, "src", "app", "pages", "privacidad", "privacidad.page.html"), `<p>Proveedor: ${hosting}</p>\n<!-- [OTRO COMENTARIO HTML] -->\n`);
    };
    const correrGuardian = (env = {}) => {
        const resultado = spawnSync(process.execPath, [guardian, `--raiz=${proyecto}`], { env: { ...process.env, PERMITIR_MARCADORES: "", ...env }, encoding: "utf8" });
        return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
    };
    try {
        escribir("https://[URL-DE-LA-API]", "Render, Frankfurt");
        let g = correrGuardian();
        check("Guardián del build: la URL de la API con marcador (https://[URL-DE-LA-API]) impide compilar, y no se confunde el // de https con un comentario",
            g.codigo === 1 && /environment\.prod\.ts:4\s+falta rellenar \[URL-DE-LA-API\]/.test(g.salida), g.salida);
        check("Guardián del build: los marcadores dentro de comentarios no cuentan", !/COMENTARIO/.test(g.salida));
        escribir("https://barberplan-api.onrender.com", "[PROVEEDOR DE HOSTING Y REGIÓN]");
        g = correrGuardian();
        check("Guardián del build: un marcador en la política de privacidad también impide compilar", g.codigo === 1 && /privacidad\.page\.html:1\s+falta rellenar \[PROVEEDOR DE HOSTING Y REGIÓN\]/.test(g.salida), g.salida);
        escribir("http://api.ejemplo.es", "Render, Frankfurt");
        g = correrGuardian();
        check("Guardián del build: una API sin HTTPS impide compilar", g.codigo === 1 && /https:\/\//.test(g.salida), g.salida);
        escribir("https://barberplan-api.onrender.com", "Render, Frankfurt");
        g = correrGuardian();
        check("Guardián del build: con todo relleno y HTTPS deja compilar (código 0)", g.codigo === 0 && /sin marcadores/.test(g.salida), g.salida);
        escribir("https://[URL-DE-LA-API]", "[PROVEEDOR DE HOSTING Y REGIÓN]");
        g = correrGuardian({ PERMITIR_MARCADORES: "1" });
        check("Guardián del build: PERMITIR_MARCADORES=1 deja compilar para probar en local, avisando", g.codigo === 0 && /Aviso: se compila con \d+ valor/.test(g.salida), g.salida);
    } finally {
        fs.rmSync(proyecto, { recursive: true, force: true });
    }
};
