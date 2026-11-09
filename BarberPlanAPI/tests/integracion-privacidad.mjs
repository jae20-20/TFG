// Bloque de la batería de integración: configuración por entorno (RNF17), consentimiento y eliminación de
// cuenta (RNF6, RF1), sesiones de cuentas eliminadas o con contraseña cambiada, y avisos al cliente (RF12).
// Lo ejecuta tests/integracion.mjs sobre la misma BD desechable; levanta sus propias APIs para tener
// contadores de límites limpios. Requiere que el código de src/ se haya importado ya con DB_NAME fijado.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ_API, crearCliente, lanzarServidor } from "./entorno.mjs";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "./semilla.mjs";

const PW = "password123";
const MSG_CONSENT = "Debes aceptar la política de privacidad para registrarte";
const MSG_CUENTA = "La cuenta ya no existe";

export const pruebasPrivacidad = async ({ check, entorno }) => {
    const { bd } = entorno;
    const { POLITICA_VERSION } = await import("../src/config.js");
    const { procesarCitasVencidas } = await import("../src/jobs/citaJobs.js");
    const politicaApp = await import(pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", "privacidad.util.ts")).href);

    const hash = await bcrypt.hash(PW, 4);
    const firmar = (usuario, extra = {}) => jwt.sign(
        { id: usuario._id.toString(), rol: usuario.rol, barberiaId: usuario.barberiaId?.toString() ?? null }, process.env.JWT_SECRET, { expiresIn: "5m", ...extra });
    const usuarios = bd.collection("Usuarios");
    const citas = bd.collection("Citas");

    // ---------------------------------------------------------------- Configuración por entorno (RNF17)
    // Sin JWT_SECRET, con una clave corta o sin CORS_ORIGINS, en producción el servidor no llega a abrir el puerto
    const arranqueProduccion = async (variables, quitar = []) => {
        const servidor = lanzarServidor({ puerto: 5090, nombreBD: entorno.nombreBD, variables: { NODE_ENV: "production", TRUST_PROXY: "1", ...variables }, quitar });
        // Si por error arrancara, no saldría nunca: se para pasado un tiempo y la comprobación falla
        const codigo = await Promise.race([servidor.salio, new Promise((resolve) => setTimeout(() => resolve("sigue vivo"), 30000))]);
        if (codigo === "sigue vivo") await servidor.detener();
        return { codigo, salida: servidor.salida() };
    };
    const CLAVE_LARGA = "k".repeat(48);
    const CORS_PROD = "https://barberplan.example";
    let arranque = await arranqueProduccion({ CORS_ORIGINS: CORS_PROD }, ["JWT_SECRET"]);
    check("Producción sin JWT_SECRET: el servidor no arranca y sale con código 1",
        arranque.codigo === 1 && /JWT_SECRET/.test(arranque.salida) && !arranque.salida.includes("Servidor corriendo"), `código ${arranque.codigo}`);
    arranque = await arranqueProduccion({ JWT_SECRET: "corta", CORS_ORIGINS: CORS_PROD });
    check("Producción con una JWT_SECRET de menos de 32 caracteres: no arranca", arranque.codigo === 1 && /demasiado corta/.test(arranque.salida), `código ${arranque.codigo}`);
    arranque = await arranqueProduccion({ JWT_SECRET: CLAVE_LARGA }, ["CORS_ORIGINS"]);
    check("Producción sin CORS_ORIGINS: no arranca (no se admiten por defecto los orígenes de desarrollo)", arranque.codigo === 1 && /CORS_ORIGINS/.test(arranque.salida), `código ${arranque.codigo}`);
    arranque = await arranqueProduccion({ JWT_SECRET: CLAVE_LARGA, CORS_ORIGINS: CORS_PROD }, ["ATLAS_URI"]);
    check("Sin ATLAS_URI el servidor no arranca y lo dice (no un error interno del driver)", arranque.codigo === 1 && /ATLAS_URI/.test(arranque.salida), `código ${arranque.codigo}`);

    // Producción bien configurada: arranca con lo que dicen las variables (clave, CORS, proxy y límites)
    const prod = lanzarServidor({
        puerto: 5090, nombreBD: entorno.nombreBD,
        variables: { NODE_ENV: "production", JWT_SECRET: CLAVE_LARGA, CORS_ORIGINS: CORS_PROD, TRUST_PROXY: "1", AUTH_RATE_LIMIT_MAX: "2", INVITATION_RATE_LIMIT_MAX: "2" }
    });
    try {
        await prod.listo;
        const reqProd = crearCliente("http://localhost:5090");
        const intentos = (ip) => reqProd("POST", "/usuarios/login", { body: { correo: "nadie@priv.test", pw: "x" }, cabeceras: { "X-Forwarded-For": ip } });
        let r = await reqProd("GET", "/barberias", { origin: CORS_PROD });
        check("Producción: CORS permite el origen de CORS_ORIGINS", r.headers.get("access-control-allow-origin") === CORS_PROD, `${r.headers.get("access-control-allow-origin")}`);
        r = await reqProd("GET", "/barberias", { origin: "http://localhost:4200" });
        check("Producción: CORS rechaza localhost si no está en CORS_ORIGINS", !r.headers.get("access-control-allow-origin"), `${r.headers.get("access-control-allow-origin")}`);

        const estadosA = [(await intentos("10.0.0.1")).status, (await intentos("10.0.0.1")).status, (await intentos("10.0.0.1")).status];
        const otraIp = (await intentos("10.0.0.2")).status;
        check("AUTH_RATE_LIMIT_MAX=2: dos intentos de login por IP y el tercero 429", JSON.stringify(estadosA) === "[401,401,429]", JSON.stringify(estadosA));
        check("TRUST_PROXY=1: cada IP de X-Forwarded-For tiene su propio contador (otra IP sigue pudiendo intentar)", otraIp === 401, `${otraIp}`);

        const validar = () => reqProd("POST", "/barberias/invitaciones/validar", { body: { code: "AAAA-BBBB" } });
        const estadosInv = [(await validar()).status, (await validar()).status, (await validar()).status];
        check("INVITATION_RATE_LIMIT_MAX=2: dos validaciones de código y la tercera 429", estadosInv[0] !== 429 && estadosInv[1] !== 429 && estadosInv[2] === 429, JSON.stringify(estadosInv));
    } finally {
        await prod.detener();
    }

    // Sin TRUST_PROXY se ignora X-Forwarded-For: no se puede esquivar el límite cambiando esa cabecera
    const sinProxy = lanzarServidor({ puerto: 5090, nombreBD: entorno.nombreBD, variables: { AUTH_RATE_LIMIT_MAX: "2" }, quitar: ["TRUST_PROXY"] });
    try {
        await sinProxy.listo;
        const reqSin = crearCliente("http://localhost:5090");
        const estados = [];
        for (const ip of ["10.0.1.1", "10.0.1.2", "10.0.1.3"]) {
            estados.push((await reqSin("POST", "/usuarios/login", { body: { correo: "nadie@priv.test", pw: "x" }, cabeceras: { "X-Forwarded-For": ip } })).status);
        }
        check("Sin TRUST_PROXY: X-Forwarded-For se ignora y el límite no se esquiva cambiando de IP", JSON.stringify(estados) === "[401,401,429]", JSON.stringify(estados));
    } finally {
        await sinProxy.detener();
    }

    // ---------------------------------------------------------------- API para el resto de bloques
    // AUTH_RATE_LIMIT_MAX alto: aquí se hacen muchos registros y logins desde una IP
    const servidor = lanzarServidor({ puerto: 5094, nombreBD: entorno.nombreBD, variables: { AUTH_RATE_LIMIT_MAX: "1000" } });
    await servidor.listo;
    const req = crearCliente("http://localhost:5094");
    try {
        // ------------------------------------------------------------ Consentimiento (RNF6)
        const clienteNuevo = (usuario, extra = {}) => ({ nombre: "Priv", apellido: "Prueba", correo: `${usuario}@priv.test`, pw: PW, usuario, rol: "cliente", ciudad: "Madrid", ...extra });
        const existe = async (usuario) => Boolean(await usuarios.findOne({ usuario }));

        for (const [descripcion, extra] of [
            ["ausente", {}],
            ["false", { aceptaPrivacidad: false }],
            ["el texto \"true\"", { aceptaPrivacidad: "true" }],
            ["el número 1", { aceptaPrivacidad: 1 }],
            ["un objeto con operador", { aceptaPrivacidad: { $ne: null } }]
        ]) {
            const r = await req("POST", "/usuarios/registro", { body: clienteNuevo("priv_sin", extra) });
            check(`Consentimiento: registro de cliente con aceptaPrivacidad ${descripcion} -> 400 y no se crea la cuenta`,
                r.status === 400 && r.data?.error === MSG_CONSENT && !(await existe("priv_sin")), `${r.status} ${JSON.stringify(r.data)}`);
        }

        let r = await req("POST", "/usuarios/registro", {
            body: clienteNuevo("priv_ok", { aceptaPrivacidad: true, consentimiento: { version: "falsa", aceptadoEn: "2000-01-01T00:00:00Z" } })
        });
        const ok = await usuarios.findOne({ usuario: "priv_ok" });
        check("Consentimiento: registro de cliente aceptando la política -> 201",
            r.status === 201 && Boolean(ok), `${r.status} ${JSON.stringify(r.data)}`);
        check("Consentimiento: se guardan la fecha y la versión de la política que fija el servidor",
            ok?.consentimiento?.version === POLITICA_VERSION && Math.abs(Date.now() - new Date(ok.consentimiento.aceptadoEn).getTime()) < 60000,
            JSON.stringify(ok?.consentimiento));
        check("Consentimiento: el cliente no puede imponer la versión ni la fecha, ni se guarda el campo aceptaPrivacidad",
            ok?.consentimiento?.version !== "falsa" && !("aceptaPrivacidad" in (ok || {})) && Object.keys(ok?.consentimiento || {}).sort().join() === "aceptadoEn,version");
        check("Consentimiento: la versión de la política es la misma en el servidor y en la app", politicaApp.POLITICA_VERSION === POLITICA_VERSION, `${politicaApp.POLITICA_VERSION}/${POLITICA_VERSION}`);
        check("Consentimiento: el mensaje de falta de consentimiento es el mismo en el servidor y en la app", politicaApp.MENSAJE_SIN_CONSENTIMIENTO === MSG_CONSENT, politicaApp.MENSAJE_SIN_CONSENTIMIENTO);

        // Barbero: la invitación no se consume si falta el consentimiento
        const adminInv = usuarioBase({ _id: new ObjectId(), nombre: "Inv", apellido: "Admin", correo: "inv.admin@priv.test", usuario: "priv_inv_admin", rol: "admin", pw: hash });
        const servInv = { _id: new ObjectId(), nombre: "Corte", precio: 15, duracion: 30 };
        const barberiaInv = crearBarberia("Barbería Invitación", "Madrid", adminInv._id, [], servInv);
        adminInv.barberiaId = barberiaInv._id;
        await usuarios.insertOne(adminInv);
        await bd.collection("Barberias").insertOne(barberiaInv);
        const { hashInvitationCode } = await import("../src/models/invitacionModel.js");
        const codigo = "PRIV-CODE";
        await bd.collection("Invitaciones").insertOne({
            barberiaId: barberiaInv._id, nombre: "Nuevo", apellido: "Barbero", cargo: "Barbero", codigoHash: hashInvitationCode(codigo),
            estado: "pendiente", expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(), updatedAt: new Date()
        });
        const barberoNuevo = (extra = {}) => clienteNuevo("priv_barbero", { rol: "barbero", ciudad: undefined, code: codigo, ...extra });
        r = await req("POST", "/usuarios/registro", { body: barberoNuevo() });
        check("Consentimiento: registro de barbero sin aceptar -> 400, no se crea la cuenta y la invitación sigue pendiente",
            r.status === 400 && r.data?.error === MSG_CONSENT && !(await existe("priv_barbero"))
            && (await bd.collection("Invitaciones").findOne({ codigoHash: hashInvitationCode(codigo) })).estado === "pendiente", `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("POST", "/usuarios/registro", { body: barberoNuevo({ aceptaPrivacidad: true }) });
        const barberoReg = await usuarios.findOne({ usuario: "priv_barbero" });
        check("Consentimiento: registro de barbero aceptando -> 201 con fecha y versión guardadas",
            r.status === 201 && barberoReg?.consentimiento?.version === POLITICA_VERSION && barberoReg.consentimiento.aceptadoEn instanceof Date, `${r.status} ${JSON.stringify(r.data)}`);

        // Barbería (crea también al admin)
        const barberiaNueva = (extra = {}) => ({ nombreBarberia: "Barbería Privacidad", direccion: "Calle 1", ciudad: "Madrid", nombre: "Dueño", apellido: "Priv", correo: "priv.dueno@priv.test", pw: PW, usuario: "priv_dueno", ...extra });
        r = await req("POST", "/barberias/registro", { body: barberiaNueva() });
        check("Consentimiento: registro de barbería sin aceptar -> 400 y no se crea ni el admin ni la barbería",
            r.status === 400 && r.data?.error === MSG_CONSENT && !(await existe("priv_dueno")) && await bd.collection("Barberias").countDocuments({ nombre: "Barbería Privacidad" }) === 0, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("POST", "/barberias/registro", { body: barberiaNueva({ aceptaPrivacidad: "true" }) });
        check("Consentimiento: registro de barbería con aceptaPrivacidad como texto -> 400", r.status === 400 && r.data?.error === MSG_CONSENT, `${r.status}`);
        r = await req("POST", "/barberias/registro", { body: barberiaNueva({ aceptaPrivacidad: true }) });
        const dueno = await usuarios.findOne({ usuario: "priv_dueno" });
        check("Consentimiento: registro de barbería aceptando -> 201 y el admin guarda fecha y versión",
            r.status === 201 && dueno?.consentimiento?.version === POLITICA_VERSION && dueno.consentimiento.aceptadoEn instanceof Date, `${r.status} ${JSON.stringify(r.data)}`);

        // ------------------------------------------------------------ Escenario para eliminar cuentas
        const MOMENTO_FUTURO = 7;
        const crearUsuario = (usuario, rol, extra = {}) => usuarioBase({
            _id: new ObjectId(), nombre: usuario, apellido: "Prueba", correo: `${usuario}@priv.test`, usuario, rol, pw: hash, ...extra });
        const escenario = async (p) => {
            const servicio = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte", precio: 15, duracion: 30, createdAt: new Date() };
            const admin = crearUsuario(`${p}_admin`, "admin");
            const b1 = crearUsuario(`${p}_b1`, "barbero", { cargo: "Barbero" });
            const b2 = crearUsuario(`${p}_b2`, "barbero", { cargo: "Barbero" });
            const c1 = crearUsuario(`${p}_c1`, "cliente", { ciudad: "Madrid", telefono: "+34600000001", barberiaId: null });
            const c2 = crearUsuario(`${p}_c2`, "cliente", { ciudad: "Madrid", barberiaId: null });
            const barberia = crearBarberia(`Barbería ${p}`, "Madrid", admin._id, [b1._id, b2._id], servicio);
            for (const u of [admin, b1, b2]) u.barberiaId = barberia._id;
            const base = { barberia, servicio };
            const futuraConfirmada = crearCita({ ...base, barbero: b1, cliente: c1, fecha: fechaRelativa(MOMENTO_FUTURO), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" });
            const futuraPendiente = { ...crearCita({ ...base, barbero: b1, cliente: c1, fecha: fechaRelativa(MOMENTO_FUTURO + 1), horaInicio: "11:00", horaFin: "11:30", estado: "pendiente" }), expiraEn: new Date(Date.now() + 86400000) };
            const pasadaConResena = { ...crearCita({ ...base, barbero: b2, cliente: c1, fecha: fechaRelativa(-5), horaInicio: "12:00", horaFin: "12:30", estado: "completada" }),
                comentario: "nota privada del cliente",
                resena: { valoracion: 4, comentario: "Muy buen corte", imagen: "data:image/png;base64,AAAA", createdAt: new Date() } };
            const pasadaCancelada = crearCita({ ...base, barbero: b1, cliente: c1, fecha: fechaRelativa(-3), horaInicio: "09:00", horaFin: "09:30", estado: "cancelada" });
            const ajenaFutura = crearCita({ ...base, barbero: b1, cliente: c2, fecha: fechaRelativa(MOMENTO_FUTURO), horaInicio: "11:00", horaFin: "11:30", estado: "confirmada" });
            const ajenaPasada = { ...crearCita({ ...base, barbero: b2, cliente: c2, fecha: fechaRelativa(-4), horaInicio: "13:00", horaFin: "13:30", estado: "completada" }),
                resena: { valoracion: 5, comentario: "Genial", imagen: null, createdAt: new Date() } };
            const todas = [futuraConfirmada, futuraPendiente, pasadaConResena, pasadaCancelada, ajenaFutura, ajenaPasada];
            await usuarios.insertMany([admin, b1, b2, c1, c2]);
            await bd.collection("Barberias").insertOne(barberia);
            await citas.insertMany(todas);
            await bd.collection("AgendaBloqueos").insertMany([
                { _id: `${b1._id}:${futuraConfirmada.fecha}`, version: 1 }, { _id: `${b2._id}:${pasadaConResena.fecha}`, version: 1 }, { _id: `${admin._id}:${futuraConfirmada.fecha}`, version: 1 }]);
            await bd.collection("Solicitudes").insertMany([
                { barberoId: b1._id, barberiaId: barberia._id, tipo: "dia_libre", estado: "pendiente", createdAt: new Date() },
                { barberoId: b2._id, barberiaId: barberia._id, tipo: "dia_libre", estado: "pendiente", createdAt: new Date() }]);
            await bd.collection("Invitaciones").insertMany([
                { barberiaId: barberia._id, nombre: b1.nombre, apellido: "Prueba", cargo: "Barbero", codigoHash: `h-${p}-1`, estado: "usada", usadaPor: b1._id },
                { barberiaId: barberia._id, nombre: b2.nombre, apellido: "Prueba", cargo: "Barbero", codigoHash: `h-${p}-2`, estado: "usada", usadaPor: b2._id },
                { barberiaId: barberia._id, nombre: "Pendiente", apellido: "Prueba", cargo: "Barbero", codigoHash: `h-${p}-3`, estado: "pendiente", expiresAt: new Date(Date.now() + 86400000) }]);
            return { p, servicio, admin, b1, b2, c1, c2, barberia, futuraConfirmada, futuraPendiente, pasadaConResena, pasadaCancelada, ajenaFutura, ajenaPasada };
        };
        const eliminar = (usuario, pw, extra = {}, token = firmar(usuario)) => req("DELETE", "/usuarios/perfil", { token, body: { pw, ...extra } });
        const citaDe = (cita) => citas.findOne({ _id: cita._id });
        const huecos = async (e, barbero, fecha) => (await req("GET", `/citas/disponibilidad/${barbero._id}/${fecha}?barberiaId=${e.barberia._id}`)).data?.horariosDisponibles || [];

        // ------------------------------------------------------------ Eliminar la cuenta de un cliente
        const e = await escenario("del");
        check("Eliminar cuenta (cliente): antes de borrar, la cita futura confirmada ocupa el hueco de las 10:00",
            !(await huecos(e, e.b1, e.futuraConfirmada.fecha)).includes("10:00"));
        r = await req("DELETE", "/usuarios/perfil", { body: { pw: PW } });
        check("Eliminar cuenta sin token -> 401", r.status === 401, `${r.status}`);
        r = await eliminar(e.c1, "");
        check("Eliminar cuenta con contraseña vacía -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
        r = await eliminar(e.c1, { $ne: null });
        check("Eliminar cuenta con un operador Mongo en pw -> 400 y la cuenta sigue", r.status === 400 && await existe(e.c1.usuario), `${r.status}`);
        r = await eliminar(e.c1, "ContraseñaErronea1");
        check("Eliminar cuenta con la contraseña incorrecta -> 401 y no se borra nada",
            r.status === 401 && await existe(e.c1.usuario) && (await citaDe(e.futuraConfirmada)).estado === "confirmada", `${r.status} ${JSON.stringify(r.data)}`);
        r = await eliminar(e.c1, PW);
        const futuraConf = await citaDe(e.futuraConfirmada), futuraPend = await citaDe(e.futuraPendiente);
        check("Eliminar cuenta (cliente) con la contraseña correcta -> 200 y la cuenta desaparece",
            r.status === 200 && !(await existe(e.c1.usuario)) && r.data?.citasCanceladas === 2, `${r.status} ${JSON.stringify(r.data)}`);
        check("Cliente eliminado: sus citas futuras (confirmada y pendiente) quedan canceladas y anonimizadas",
            futuraConf.estado === "cancelada" && futuraPend.estado === "cancelada" && futuraConf.motivoCancelacion === "cliente" && futuraConf.clienteId === null && futuraConf.clienteNombre === "Cliente eliminado");
        check("Cliente eliminado: el hueco de la cita cancelada vuelve a ofrecerse", (await huecos(e, e.b1, e.futuraConfirmada.fecha)).includes("10:00"));
        const pasada = await citaDe(e.pasadaConResena);
        check("Cliente eliminado: la cita pasada se conserva anonimizada y sin su nota privada",
            pasada.estado === "completada" && pasada.clienteId === null && pasada.clienteNombre === "Cliente eliminado" && !("comentario" in pasada), JSON.stringify({ c: pasada.clienteNombre, n: pasada.comentario }));
        check("Cliente eliminado: de la reseña solo queda la puntuación (sin comentario ni imagen)",
            pasada.resena?.valoracion === 4 && pasada.resena.comentario === "" && pasada.resena.imagen === null, JSON.stringify(pasada.resena));
        const resenas = (await req("GET", `/barberias/${e.barberia._id}/resenas`)).data || [];
        const resenaPublica = resenas.find((x) => x._id === e.pasadaConResena._id.toString());
        check("Cliente eliminado: la reseña pública sigue contando y muestra «Cliente eliminado»",
            resenaPublica?.resena?.valoracion === 4 && resenaPublica.clienteNombre === "Cliente eliminado" && !resenaPublica.cliente, JSON.stringify(resenaPublica));
        const ajena = await citaDe(e.ajenaFutura);
        check("Cliente eliminado: las citas y reseñas de otros clientes no se tocan",
            ajena.estado === "confirmada" && ajena.clienteId?.toString() === e.c2._id.toString() && (await citaDe(e.ajenaPasada)).resena.comentario === "Genial");
        check("Cliente eliminado: la cita ya cancelada no se modifica salvo la anonimización", (await citaDe(e.pasadaCancelada)).motivoCancelacion === undefined);
        r = await req("POST", "/usuarios/login", { body: { correo: e.c1.correo, pw: PW } });
        check("Cliente eliminado: ya no puede iniciar sesión -> 401", r.status === 401, `${r.status}`);
        const tokenViejo = firmar(e.c1);
        r = await req("POST", "/citas", { token: tokenViejo, body: { barberiaId: e.barberia._id.toString(), barberoId: e.b1._id.toString(), servicioIds: [e.servicio._id.toString()], fecha: fechaRelativa(20), horaInicio: "10:00" } });
        check("Cliente eliminado: su token (aún sin caducar) no sirve para reservar -> 401", r.status === 401 && r.data?.error === MSG_CUENTA && await citas.countDocuments({ fecha: fechaRelativa(20), barberoId: e.b1._id }) === 0, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("PUT", "/usuarios/perfil", { token: tokenViejo, body: { nombre: "Fantasma" } });
        check("Cliente eliminado: su token tampoco sirve para editar el perfil ni crea el usuario -> 401", r.status === 401 && !(await existe(e.c1.usuario)), `${r.status}`);
        r = await eliminar(e.c1, PW, {}, tokenViejo);
        check("Eliminar la cuenta dos veces: la segunda -> 401 (cuenta inexistente)", r.status === 401, `${r.status}`);

        // ------------------------------------------------------------ Límite de intentos al eliminar la cuenta
        const limite = crearUsuario("del_limite", "cliente", { ciudad: "Madrid", barberiaId: null });
        await usuarios.insertOne(limite);
        const fallos = [];
        for (let i = 0; i < 5; i++) fallos.push((await eliminar(limite, "Erronea123")).status);
        r = await eliminar(limite, PW);
        check("Límite: 5 contraseñas erróneas al eliminar la cuenta dan 401 y la sexta, incluso correcta, 429 sin borrar nada",
            JSON.stringify(fallos) === "[401,401,401,401,401]" && r.status === 429 && await existe("del_limite"), `${JSON.stringify(fallos)} ${r.status}`);
        const otro = crearUsuario("del_limite_otro", "cliente", { ciudad: "Madrid", barberiaId: null });
        await usuarios.insertOne(otro);
        r = await eliminar(otro, PW);
        check("Límite por usuario, no por IP: otro usuario desde la misma IP sí puede eliminar su cuenta -> 200", r.status === 200 && !(await existe("del_limite_otro")), `${r.status}`);

        // ------------------------------------------------------------ Dar de baja a un barbero (admin) y eliminar la cuenta propia de un barbero
        // DELETE /usuarios/:id: solo el admin del equipo, y sobre barberos
        r = await req("DELETE", `/usuarios/${e.b1._id}`, { token: firmar(e.c2) });
        check("DELETE /usuarios/:id de un barbero como cliente -> 403", r.status === 403 && await existe(e.b1.usuario), `${r.status}`);
        r = await req("DELETE", `/usuarios/${e.b1._id}`, { token: firmar(e.b2) });
        check("DELETE /usuarios/:id de un compañero como barbero -> 403", r.status === 403 && await existe(e.b1.usuario), `${r.status}`);
        r = await req("DELETE", `/usuarios/${e.b1._id}`, { token: firmar(e.b1) });
        check("DELETE /usuarios/:id sobre sí mismo -> 403 (se elimina desde el perfil con la contraseña)", r.status === 403 && await existe(e.b1.usuario), `${r.status}`);
        r = await req("DELETE", `/usuarios/${e.admin._id}`, { token: firmar(e.admin) });
        check("DELETE /usuarios/:id sobre el propio admin -> 403 y la barbería sigue", r.status === 403 && await existe(e.admin.usuario), `${r.status}`);
        r = await req("DELETE", `/usuarios/${e.b1._id}`, { token: firmar(adminInv) });
        check("DELETE /usuarios/:id de un barbero ajeno como admin de otra barbería -> 403 (sin IDOR)", r.status === 403 && await existe(e.b1.usuario), `${r.status}`);
        r = await req("DELETE", `/usuarios/${e.c2._id}`, { token: firmar(e.admin) });
        check("DELETE /usuarios/:id de un cliente como admin -> 403", r.status === 403 && await existe(e.c2.usuario), `${r.status}`);

        const hayAvisos = async (cita) => (await citaDe(cita)).avisoCliente;
        r = await req("DELETE", `/usuarios/${e.b1._id}`, { token: firmar(e.admin) });
        check("Admin da de baja a un barbero de su equipo -> 200 y la cuenta desaparece", r.status === 200 && !(await existe(e.b1.usuario)), `${r.status} ${JSON.stringify(r.data)}`);
        const ajenaTrasBaja = await citaDe(e.ajenaFutura);
        check("Barbero eliminado: sus citas futuras se cancelan por la barbería y se avisa al cliente",
            ajenaTrasBaja.estado === "cancelada" && ajenaTrasBaja.motivoCancelacion === "barberia" && ajenaTrasBaja.avisoCliente?.tipo === "cancelada" && Boolean(ajenaTrasBaja.avisoCliente.creadoEn),
            JSON.stringify({ e: ajenaTrasBaja.estado, m: ajenaTrasBaja.motivoCancelacion, a: ajenaTrasBaja.avisoCliente }));
        check("Barbero eliminado: sus citas pasadas se conservan en el historial del cliente",
            (await citaDe(e.pasadaCancelada)).estado === "cancelada" && Boolean(await citaDe(e.pasadaConResena)));
        check("Barbero eliminado: sale de la lista de la barbería, y se borran sus solicitudes, su invitación usada y su agenda",
            !(await bd.collection("Barberias").findOne({ _id: e.barberia._id })).barberos.some((id) => id.equals(e.b1._id))
            && await bd.collection("Solicitudes").countDocuments({ barberoId: e.b1._id }) === 0
            && await bd.collection("Invitaciones").countDocuments({ usadaPor: e.b1._id }) === 0
            && await bd.collection("AgendaBloqueos").countDocuments({ _id: new RegExp(`^${e.b1._id}:`) }) === 0);
        check("Barbero eliminado: no toca a su compañero ni a la barbería",
            await existe(e.b2.usuario) && Boolean(await bd.collection("Barberias").findOne({ _id: e.barberia._id }))
            && await bd.collection("Solicitudes").countDocuments({ barberoId: e.b2._id }) === 1 && await bd.collection("AgendaBloqueos").countDocuments({ _id: new RegExp(`^${e.b2._id}:`) }) === 1);
        r = await req("POST", "/solicitudes", { token: firmar(e.b1), body: { tipo: "dia_libre", fechaInicio: fechaRelativa(30), fechaFin: fechaRelativa(30) } });
        check("Barbero eliminado: su token no sirve para crear solicitudes -> 401", r.status === 401, `${r.status}`);

        // Barbero que elimina su propia cuenta
        const eb = await escenario("delb");
        r = await eliminar(eb.b2, "Erronea123");
        check("Eliminar cuenta (barbero) con contraseña incorrecta -> 401", r.status === 401 && await existe(eb.b2.usuario), `${r.status}`);
        r = await eliminar(eb.b1, PW);
        check("Eliminar cuenta (barbero) -> 200 y cancela sus 3 citas futuras (2 de c1 y 1 de c2)", r.status === 200 && r.data?.citasCanceladas === 3 && !(await existe(eb.b1.usuario)), `${r.status} ${JSON.stringify(r.data)}`);
        check("Eliminar cuenta (barbero): los clientes reciben el aviso de cancelación",
            (await hayAvisos(eb.futuraConfirmada))?.tipo === "cancelada" && (await hayAvisos(eb.ajenaFutura))?.tipo === "cancelada");
        check("Eliminar cuenta (barbero): su compañero y las citas del compañero siguen intactos",
            await existe(eb.b2.usuario) && (await citaDe(eb.pasadaConResena)).estado === "completada");

        // ------------------------------------------------------------ Eliminar la cuenta del dueño de una barbería (cascada)
        const ea = await escenario("dela");
        const resumen = await req("GET", "/usuarios/perfil/eliminacion", { token: firmar(ea.admin) });
        check("Resumen de eliminación del dueño: nombre de la barbería, citas futuras (3) y barberos (2)",
            resumen.status === 200 && resumen.data?.rol === "admin" && resumen.data.barberiaNombre === ea.barberia.nombre && resumen.data.citasFuturas === 3 && resumen.data.barberos === 2, JSON.stringify(resumen.data));
        const resumenCliente = await req("GET", "/usuarios/perfil/eliminacion", { token: firmar(ea.c1) });
        check("Resumen de eliminación de un cliente: solo el rol", resumenCliente.status === 200 && resumenCliente.data?.rol === "cliente" && !("barberiaNombre" in resumenCliente.data), JSON.stringify(resumenCliente.data));

        r = await eliminar(ea.admin, PW);
        check("Eliminar cuenta del dueño sin confirmar el borrado de la barbería -> 400 y no se borra nada",
            r.status === 400 && await existe(ea.admin.usuario) && Boolean(await bd.collection("Barberias").findOne({ _id: ea.barberia._id })), `${r.status} ${JSON.stringify(r.data)}`);
        r = await eliminar(ea.admin, PW, { confirmarBarberia: "true" });
        check("Eliminar cuenta del dueño con confirmarBarberia como texto -> 400", r.status === 400 && await existe(ea.admin.usuario), `${r.status}`);
        r = await eliminar(ea.admin, "Erronea123", { confirmarBarberia: true });
        check("Eliminar cuenta del dueño con contraseña incorrecta -> 401 y la barbería sigue", r.status === 401 && Boolean(await bd.collection("Barberias").findOne({ _id: ea.barberia._id })), `${r.status}`);
        r = await eliminar(e.b2, PW, { confirmarBarberia: true });
        check("confirmarBarberia en la cuenta de un barbero se ignora: no elimina ninguna barbería", r.status === 200 && !(await existe(e.b2.usuario)) && Boolean(await bd.collection("Barberias").findOne({ _id: e.barberia._id })), `${r.status}`);

        r = await eliminar(ea.admin, PW, { confirmarBarberia: true });
        check("Eliminar cuenta del dueño confirmando -> 200, borra su cuenta y su barbería, y cancela las 3 citas futuras",
            r.status === 200 && r.data?.citasCanceladas === 3 && !(await existe(ea.admin.usuario)) && !(await bd.collection("Barberias").findOne({ _id: ea.barberia._id })), `${r.status} ${JSON.stringify(r.data)}`);
        check("Dueño eliminado: se borran sus invitaciones, solicitudes y la agenda de todo su equipo",
            await bd.collection("Invitaciones").countDocuments({ barberiaId: ea.barberia._id }) === 0
            && await bd.collection("Solicitudes").countDocuments({ barberiaId: ea.barberia._id }) === 0
            && await bd.collection("AgendaBloqueos").countDocuments({ _id: { $in: [`${ea.b1._id}:${ea.futuraConfirmada.fecha}`, `${ea.b2._id}:${ea.pasadaConResena.fecha}`, `${ea.admin._id}:${ea.futuraConfirmada.fecha}`] } }) === 0);
        const futurasDespues = await citas.find({ barberiaId: ea.barberia._id, motivoCancelacion: "barberia_eliminada" }).toArray();
        check("Dueño eliminado: sus citas futuras se cancelan con el motivo «barbería eliminada» y avisan al cliente",
            futurasDespues.length === 3 && futurasDespues.every((c) => c.estado === "cancelada" && c.avisoCliente?.tipo === "cancelada")
            && await citas.countDocuments({ barberiaId: ea.barberia._id, estado: { $in: ["pendiente", "confirmada"] } }) === 0, `${futurasDespues.length}`);
        check("Dueño eliminado: las citas pasadas se conservan para los clientes, con el nombre de la barbería copiado",
            (await citaDe(ea.pasadaConResena)).estado === "completada" && (await citaDe(ea.pasadaConResena)).barberiaNombre === ea.barberia.nombre);
        const barberoSuelto = await usuarios.findOne({ _id: ea.b2._id });
        check("Dueño eliminado: sus barberos conservan la cuenta, sin barbería", Boolean(barberoSuelto) && barberoSuelto.barberiaId === null);
        r = await req("GET", `/barberias/${ea.barberia._id}`);
        check("Dueño eliminado: la barbería ya no existe -> 404", r.status === 404, `${r.status}`);
        r = await req("GET", "/barberias");
        check("Dueño eliminado: la barbería no aparece en el listado público", !(r.data || []).some((b) => b._id === ea.barberia._id.toString()));
        r = await req("GET", "/citas/mis-citas", { token: firmar(ea.c1) });
        const citaHuerfana = (r.data || []).find((c) => c._id === ea.pasadaConResena._id.toString());
        check("Dueño eliminado: el cliente sigue viendo su historial (sin barbería, con el nombre copiado)",
            r.status === 200 && citaHuerfana?.barberiaNombre === ea.barberia.nombre && !citaHuerfana.barberia, JSON.stringify(citaHuerfana?.barberiaNombre));

        // Barbero desvinculado: el servidor responde sin fallar (la app lo muestra como «sin barbería»)
        const tokenSuelto = firmar(barberoSuelto);
        r = await req("POST", "/usuarios/login", { body: { correo: ea.b2.correo, pw: PW } });
        check("Barbero desvinculado: puede iniciar sesión -> 200", r.status === 200 && r.data?.user?.barberiaId === null, `${r.status}`);
        r = await req("GET", "/barberias/mi/barberia", { token: tokenSuelto });
        check("Barbero desvinculado: GET /barberias/mi/barberia -> 404 con mensaje claro", r.status === 404 && r.data?.error === "No tienes ninguna barbería asociada", `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("GET", "/barberias/mi/horario", { token: tokenSuelto });
        check("Barbero desvinculado: GET /barberias/mi/horario -> 404 con mensaje claro", r.status === 404, `${r.status}`);
        r = await req("GET", "/citas/barbero", { token: tokenSuelto });
        check("Barbero desvinculado: su agenda llega vacía, sin error -> 200 []", r.status === 200 && Array.isArray(r.data) && r.data.length === 0, `${r.status}`);
        r = await req("GET", "/solicitudes/mis-solicitudes", { token: tokenSuelto });
        check("Barbero desvinculado: sus solicitudes llegan vacías -> 200", r.status === 200 && r.data?.solicitudes?.length === 0, `${r.status}`);
        r = await req("GET", "/citas/resenas/barberia", { token: tokenSuelto });
        check("Barbero desvinculado: reseñas de la barbería -> 404 con mensaje claro", r.status === 404, `${r.status}`);
        r = await req("PUT", "/usuarios/perfil", { token: tokenSuelto, body: { nombre: "Suelto" } });
        check("Barbero desvinculado: puede editar su perfil y eliminar su cuenta", r.status === 200 && (await eliminar(barberoSuelto, PW)).status === 200 && !(await existe(ea.b2.usuario)));

        // ------------------------------------------------------------ Sesiones anteriores al cambio de contraseña
        const cambiante = crearUsuario("sesion_cambio", "cliente", { ciudad: "Madrid", barberiaId: null });
        await usuarios.insertOne(cambiante);
        // Sesión iniciada hace 2 minutos
        const sesionAnterior = jwt.sign({ id: cambiante._id.toString(), rol: "cliente", barberiaId: null, iat: Math.floor(Date.now() / 1000) - 120 }, process.env.JWT_SECRET, { expiresIn: "10m" });
        r = await req("PUT", "/usuarios/perfil", { token: sesionAnterior, body: { nombre: "Antes" } });
        check("Sesión antigua antes de cambiar la contraseña: puede escribir -> 200", r.status === 200, `${r.status}`);
        r = await req("POST", "/usuarios/cambiar-contrasena", { token: sesionAnterior, body: { currentPassword: PW, newPassword: "NuevaClave456" } });
        const tokenNuevo = r.data?.token;
        check("Cambiar contraseña -> 200 y devuelve un token nuevo para seguir con la sesión", r.status === 200 && typeof tokenNuevo === "string" && tokenNuevo !== sesionAnterior, `${r.status}`);
        check("Cambiar contraseña: se guarda passwordChangedAt", (await usuarios.findOne({ _id: cambiante._id })).passwordChangedAt instanceof Date);
        r = await req("PUT", "/usuarios/perfil", { token: sesionAnterior, body: { nombre: "Robado" } });
        check("Tras cambiar la contraseña, el token anterior no vale para escribir -> 401 y no se modifica nada",
            r.status === 401 && (await usuarios.findOne({ _id: cambiante._id })).nombre === "Antes", `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("POST", "/usuarios/cambiar-contrasena", { token: sesionAnterior, body: { currentPassword: "NuevaClave456", newPassword: "OtraClave789" } });
        check("Tras cambiar la contraseña, el token anterior tampoco vale para cambiarla otra vez -> 401", r.status === 401, `${r.status}`);
        r = await req("DELETE", "/usuarios/perfil", { token: sesionAnterior, body: { pw: "NuevaClave456" } });
        check("Tras cambiar la contraseña, el token anterior tampoco vale para eliminar la cuenta -> 401", r.status === 401 && await existe("sesion_cambio"), `${r.status}`);
        r = await req("PUT", "/usuarios/perfil", { token: tokenNuevo, body: { nombre: "Despues" } });
        check("El token nuevo devuelto al cambiar la contraseña sí escribe -> 200", r.status === 200 && (await usuarios.findOne({ _id: cambiante._id })).nombre === "Despues", `${r.status}`);
        r = await req("POST", "/usuarios/login", { body: { correo: cambiante.correo, pw: "NuevaClave456" } });
        r = await req("PUT", "/usuarios/perfil", { token: r.data?.token, body: { nombre: "Login" } });
        check("Iniciar sesión tras el cambio da un token que escribe -> 200", r.status === 200, `${r.status}`);
        r = await req("GET", "/usuarios/perfil", { token: sesionAnterior });
        check("Las lecturas no comprueban la sesión (no añaden consulta): el token anterior aún lee su perfil -> 200", r.status === 200, `${r.status}`);

        // ------------------------------------------------------------ Avisos al cliente (RF12)
        const av = await escenario("avi");
        const tokenAdmin = firmar(av.admin), tokenB1 = firmar(av.b1), tokenC1 = firmar(av.c1), tokenC2 = firmar(av.c2);
        const misCitas = async (token) => (await req("GET", "/citas/mis-citas", { token })).data || [];
        const avisoDe = async (token, cita) => (await misCitas(token)).find((c) => c._id === cita._id.toString())?.avisoCliente;

        check("Avisos: una cita recién creada no tiene aviso", await avisoDe(tokenC1, av.futuraPendiente) === undefined);
        r = await req("PUT", `/citas/${av.futuraPendiente._id}/confirmar`, { token: tokenB1 });
        let aviso = await avisoDe(tokenC1, av.futuraPendiente);
        check("Avisos: al aceptar una reserva pendiente el cliente recibe el aviso «confirmada» en sus citas",
            r.status === 200 && aviso?.tipo === "confirmada" && !Number.isNaN(new Date(aviso.creadoEn).getTime()), `${r.status} ${JSON.stringify(aviso)}`);
        check("Avisos: el aviso no llega a otro cliente", await avisoDe(tokenC2, av.futuraPendiente) === undefined);

        const pendiente2 = { ...crearCita({ barberia: av.barberia, servicio: av.servicio, barbero: av.b1, cliente: av.c1, fecha: fechaRelativa(12), horaInicio: "15:00", horaFin: "15:30", estado: "pendiente" }), expiraEn: new Date(Date.now() + 86400000) };
        await citas.insertOne(pendiente2);
        r = await req("PUT", `/citas/${pendiente2._id}/rechazar`, { token: tokenAdmin });
        aviso = await avisoDe(tokenC1, pendiente2);
        check("Avisos: al rechazar una reserva el cliente recibe el aviso «rechazada»", r.status === 200 && aviso?.tipo === "rechazada", `${r.status} ${JSON.stringify(aviso)}`);

        r = await req("PUT", `/citas/${av.futuraConfirmada._id}/cancelar`, { token: tokenB1 });
        aviso = await avisoDe(tokenC1, av.futuraConfirmada);
        check("Avisos: si el personal cancela una cita confirmada el cliente recibe el aviso «cancelada»", r.status === 200 && aviso?.tipo === "cancelada", `${r.status} ${JSON.stringify(aviso)}`);

        r = await req("PUT", `/citas/${av.ajenaFutura._id}/cancelar`, { token: tokenC2 });
        check("Avisos: si el propio cliente cancela, no se genera ningún aviso", r.status === 200 && (await citaDe(av.ajenaFutura)).estado === "cancelada" && await avisoDe(tokenC2, av.ajenaFutura) === undefined, `${r.status}`);

        const caducada = { ...crearCita({ barberia: av.barberia, servicio: av.servicio, barbero: av.b2, cliente: av.c2, fecha: fechaRelativa(14), horaInicio: "16:00", horaFin: "16:30", estado: "pendiente" }), expiraEn: new Date(Date.now() - 1000) };
        await citas.insertOne(caducada);
        const { expiradas } = await procesarCitasVencidas();
        aviso = await avisoDe(tokenC2, caducada);
        check("Avisos: la tarea que caduca reservas sin respuesta deja el aviso «expirada»", expiradas >= 1 && (await citaDe(caducada)).motivoCancelacion === "expirada" && aviso?.tipo === "expirada", `${expiradas} ${JSON.stringify(aviso)}`);

        const manual = { ...crearCita({ barberia: av.barberia, servicio: av.servicio, barbero: av.b2, cliente: av.c1, fecha: fechaRelativa(15), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" }), clienteId: null, clienteNombre: "Sin reserva" };
        await citas.insertOne(manual);
        r = await req("PUT", `/citas/${manual._id}/cancelar`, { token: tokenAdmin });
        check("Avisos: una cita manual (sin cliente registrado) se cancela sin generar aviso", r.status === 200 && !("avisoCliente" in (await citaDe(manual))), `${r.status}`);

        // Marcar como leídos: solo los del cliente autenticado
        check("Avisos: antes de marcarlos, c1 tiene 3 avisos y c2 tiene 1 (la caducada)",
            (await misCitas(tokenC1)).filter((c) => c.avisoCliente).length === 3 && (await misCitas(tokenC2)).filter((c) => c.avisoCliente).length === 1);
        r = await req("PUT", "/citas/avisos/leidos");
        check("Marcar avisos como leídos sin token -> 401", r.status === 401, `${r.status}`);
        r = await req("PUT", "/citas/avisos/leidos", { token: tokenB1 });
        check("Marcar avisos como leídos como barbero -> 403", r.status === 403, `${r.status}`);
        r = await req("PUT", "/citas/avisos/leidos", { token: tokenAdmin });
        check("Marcar avisos como leídos como admin -> 403", r.status === 403, `${r.status}`);
        check("Los intentos rechazados no borran ningún aviso", (await misCitas(tokenC1)).filter((c) => c.avisoCliente).length === 3);
        r = await req("PUT", "/citas/avisos/leidos", { token: tokenC1, body: { clienteId: av.c2._id.toString(), userId: av.c2._id.toString(), id: av.c2._id.toString() } });
        check("Marcar avisos como leídos (c1) -> 200: borra solo los suyos aunque envíe el id de otro cliente",
            r.status === 200 && r.data?.avisosLeidos === 3 && (await misCitas(tokenC1)).filter((c) => c.avisoCliente).length === 0 && (await misCitas(tokenC2)).filter((c) => c.avisoCliente).length === 1,
            `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("PUT", "/citas/avisos/leidos", { token: tokenC1 });
        check("Marcar avisos como leídos sin avisos pendientes -> 200 con 0", r.status === 200 && r.data?.avisosLeidos === 0, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("GET", "/citas/mis-citas", { token: tokenC1 });
        check("Tras marcarlos, las citas siguen en «Mis citas» con su estado y sin aviso",
            r.status === 200 && r.data.length >= 4 && r.data.every((c) => !c.avisoCliente) && r.data.some((c) => c.estado === "cancelada"), `${r.status}`);
        const fechas = r.data.map((c) => c.fecha);
        check("Mis citas llega ordenada por fecha, de la más reciente a la más antigua (el $sort lo sirve el índice clienteId_fecha)",
            new Set(fechas).size > 2 && fechas.every((f, i) => i === 0 || fechas[i - 1] >= f), fechas.join(" "));
        check("Mis citas sigue trayendo la barbería (sin adminId) y el nombre del barbero tras mover el $sort",
            r.data.every((c) => c.barberia?.nombre && !("adminId" in c.barberia) && c.barbero?.nombre && !("correo" in c.barbero)));
    } finally {
        await servidor.detener();
    }
};
