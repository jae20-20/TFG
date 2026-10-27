// Batería de integración: índices de MongoDB, unicidad de correo y usuario bajo concurrencia,
// normalización del correo y migración. Levanta su propia API (puerto 5098) sobre la BD desechable
// BarberPlan_test y la borra al terminar. Se niega a ejecutarse contra la BD de desarrollo.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { RAIZ_API, crearCliente, crearComprobador, crearEntorno, lanzarServidor } from "./entorno.mjs";
import { sembrarDatos } from "./semilla.mjs";

const { check, terminar } = crearComprobador("integración");
const entorno = await crearEntorno({ puerto: 5098 });
const { bd } = entorno;
const req = crearCliente(entorno.api);

// El código de src/ se importa DESPUÉS de fijar DB_NAME: connection.js lo lee al cargarse
process.env.DB_NAME = entorno.nombreBD;
const { client, connectDB, db } = await import("../src/db/connection.js");
const { INDICES, crearIndices } = await import("../src/db/indices.js");
const { campoDuplicado, createUser, normalizarCorreo } = await import("../src/models/userModel.js");
const { createInvitacion } = await import("../src/models/invitacionModel.js");
const reglasServidor = await import("../src/middleware/validateMiddleware.js");
// Copia de las reglas en la app (TypeScript; Node 22 la importa eliminando los tipos)
const reglasApp = await import(pathToFileURL(path.join(RAIZ_API, "..", "BarberPlanApp", "src", "app", "services", "validacion-credenciales.util.ts")).href);
const M = reglasServidor.MENSAJES_CREDENCIALES;

const PW = "password123";
const MSG_CORREO = "El correo ya está registrado";
const MSG_USUARIO = "El nombre de usuario ya está en uso";

const registroCliente = (correo, usuario) => req("POST", "/usuarios/registro", {
    body: { nombre: "Test", apellido: "Prueba", correo, pw: PW, usuario, rol: "cliente", ciudad: "Madrid" }
});
const registroBarberia = (correo, usuario, nombreBarberia) => req("POST", "/barberias/registro", {
    body: { nombreBarberia, direccion: "Calle de prueba 1", ciudad: "Madrid", nombre: "Admin", apellido: "Prueba", correo, pw: PW, usuario }
});
const login = (correo, pw = PW) => req("POST", "/usuarios/login", { body: { correo, pw } });
const estados = (respuestas) => respuestas.map((r) => r.status).sort((a, b) => a - b);
const soloUnaCreada = (respuestas) => JSON.stringify(estados(respuestas)) === "[201,409]";
const perdedora = (respuestas) => respuestas.find((r) => r.status === 409);
const firmar = (usuario) => jwt.sign({ id: usuario._id.toString(), rol: usuario.rol, barberiaId: null }, process.env.JWT_SECRET, { expiresIn: "5m" });

const ejecutarMigracion = (...args) => spawnSync(process.execPath, ["scripts/normalizar-correos.mjs", ...args], {
    cwd: RAIZ_API,
    env: { ...process.env, DB_NAME: entorno.nombreBD },
    encoding: "utf8"
});

try {
    await connectDB();
    check("Las pruebas usan la BD desechable, no la de desarrollo", db.databaseName === entorno.nombreBD && db.databaseName !== "BarberPlan", db.databaseName);

    // ==================== Índices creados al arrancar ====================
    for (const { coleccion, clave, opciones } of INDICES) {
        const existentes = await bd.collection(coleccion).indexes();
        const indice = existentes.find((i) => i.name === opciones.name);
        const correcto = indice && JSON.stringify(indice.key) === JSON.stringify(clave) && Boolean(indice.unique) === Boolean(opciones.unique);
        check(`Índice ${coleccion}.${opciones.name}${opciones.unique ? " (único)" : ""} creado al arrancar`, Boolean(correcto), JSON.stringify(indice?.key));
    }

    const totalAntes = (await Promise.all(["Usuarios", "Invitaciones", "Barberias", "Citas"].map((c) => bd.collection(c).indexes()))).flat().length;
    let idempotente = true;
    try {
        await crearIndices();
        await crearIndices();
    } catch {
        idempotente = false;
    }
    const totalDespues = (await Promise.all(["Usuarios", "Invitaciones", "Barberias", "Citas"].map((c) => bd.collection(c).indexes()))).flat().length;
    check("crearIndices es idempotente: ejecutarla otra vez no falla ni duplica índices", idempotente && totalAntes === totalDespues, `${totalAntes} -> ${totalDespues}`);

    // ==================== El índice es la garantía (sin pasar por la comprobación previa) ====================
    const usuarioModelo = (correo, usuario) => ({ nombre: "M", apellido: "M", correo, pw: "x", usuario, rol: "cliente" });

    let resultado = await Promise.allSettled([
        createUser(usuarioModelo("Carrera@Modelo.test", "modelo_a")),
        createUser(usuarioModelo("carrera@modelo.test", "modelo_b"))
    ]);
    const rechazadaCorreo = resultado.find((r) => r.status === "rejected");
    check("Modelo: dos createUser simultáneos con el mismo correo (otras mayúsculas): solo uno se inserta",
        resultado.filter((r) => r.status === "fulfilled").length === 1 && campoDuplicado(rechazadaCorreo?.reason) === "correo"
        && await bd.collection("Usuarios").countDocuments({ correo: "carrera@modelo.test" }) === 1);

    resultado = await Promise.allSettled([
        createUser(usuarioModelo("c1@modelo.test", "modelo_igual")),
        createUser(usuarioModelo("c2@modelo.test", "modelo_igual"))
    ]);
    check("Modelo: dos createUser simultáneos con el mismo usuario: solo uno se inserta",
        resultado.filter((r) => r.status === "fulfilled").length === 1 && campoDuplicado(resultado.find((r) => r.status === "rejected")?.reason) === "usuario");

    resultado = await Promise.allSettled([
        createInvitacion({ codigoHash: "hash-repetido", estado: "pendiente" }),
        createInvitacion({ codigoHash: "hash-repetido", estado: "pendiente" })
    ]);
    check("Modelo: dos invitaciones con el mismo codigoHash: solo una se inserta",
        resultado.filter((r) => r.status === "fulfilled").length === 1 && resultado.find((r) => r.status === "rejected")?.reason?.code === 11000);

    check("campoDuplicado ignora los errores que no son de clave duplicada", campoDuplicado(new Error("otro")) === null && campoDuplicado({ code: 11000, keyPattern: { codigoHash: 1 } }) === null);

    // ==================== Registro de usuarios ====================
    let rs = await Promise.all([registroCliente("Uno@Api.Test", "api_uno_a"), registroCliente("uno@api.test", "api_uno_b")]);
    check("Registro: dos peticiones simultáneas con el mismo correo -> solo una se crea (201 y 409)", soloUnaCreada(rs), JSON.stringify(estados(rs)));
    check("Registro: el perdedor recibe 409 con el mensaje de siempre y sin detalles internos",
        JSON.stringify(perdedora(rs)?.data) === JSON.stringify({ error: MSG_CORREO }), JSON.stringify(perdedora(rs)?.data));
    check("Registro: en la BD queda un solo usuario con ese correo, guardado en minúsculas",
        await bd.collection("Usuarios").countDocuments({ correo: "uno@api.test" }) === 1);

    let r = await registroCliente("  Mixto@Api.TEST  ", "api_mixto");
    const mixto = await bd.collection("Usuarios").findOne({ usuario: "api_mixto" });
    check("Registro: el correo se guarda sin espacios y en minúsculas", r.status === 201 && mixto?.correo === "mixto@api.test", `${r.status} ${mixto?.correo}`);

    r = await registroCliente("MIXTO@api.test", "api_mixto_2");
    check("Registro: mismo correo con otras mayúsculas -> 409 correo ya registrado", r.status === 409 && r.data?.error === MSG_CORREO, `${r.status} ${JSON.stringify(r.data)}`);
    check("Registro: el rechazo no deja ningún usuario a medias", await bd.collection("Usuarios").countDocuments({ usuario: "api_mixto_2" }) === 0);

    rs = await Promise.all([registroCliente("dos@api.test", "api_repetido"), registroCliente("tres@api.test", "api_repetido")]);
    check("Registro: dos peticiones simultáneas con el mismo nombre de usuario -> solo una se crea (201 y 409)", soloUnaCreada(rs), JSON.stringify(estados(rs)));
    check("Registro: el perdedor recibe 409 con el mensaje de usuario en uso",
        JSON.stringify(perdedora(rs)?.data) === JSON.stringify({ error: MSG_USUARIO }), JSON.stringify(perdedora(rs)?.data));
    check("Registro: en la BD queda un solo usuario con ese nombre de usuario", await bd.collection("Usuarios").countDocuments({ usuario: "api_repetido" }) === 1);

    // ==================== Inicio de sesión ====================
    r = await login("MIXTO@API.TEST");
    check("Login con el correo en mayúsculas -> 200 con token", r.status === 200 && Boolean(r.data?.token), `${r.status}`);
    check("Login: la respuesta devuelve el correo normalizado", r.data?.user?.correo === "mixto@api.test", r.data?.user?.correo);
    r = await login("  mixto@api.test ", "contraseña-incorrecta");
    check("Login con contraseña incorrecta sigue dando 401 genérico", r.status === 401 && r.data?.error === "Correo o contraseña incorrectos", `${r.status}`);

    // ==================== Edición de perfil (nombre de usuario) ====================
    const uno = await bd.collection("Usuarios").findOne({ correo: "uno@api.test" });
    r = await req("PUT", "/usuarios/perfil", { token: firmar(mixto), body: { usuario: uno.usuario } });
    check("Perfil: cambiar a un nombre de usuario ya usado -> 409", r.status === 409 && r.data?.error === MSG_USUARIO, `${r.status} ${JSON.stringify(r.data)}`);

    rs = await Promise.all([
        req("PUT", "/usuarios/perfil", { token: firmar(mixto), body: { usuario: "api_libre" } }),
        req("PUT", "/usuarios/perfil", { token: firmar(uno), body: { usuario: "api_libre" } })
    ]);
    check("Perfil: dos usuarios piden a la vez el mismo nombre libre -> uno 200 y otro 409", JSON.stringify(estados(rs)) === "[200,409]", JSON.stringify(estados(rs)));
    check("Perfil: el perdedor recibe el mensaje de usuario en uso, sin detalles internos",
        JSON.stringify(perdedora(rs)?.data) === JSON.stringify({ error: MSG_USUARIO }), JSON.stringify(perdedora(rs)?.data));
    check("Perfil: en la BD solo un usuario tiene el nombre disputado", await bd.collection("Usuarios").countDocuments({ usuario: "api_libre" }) === 1);

    // ==================== Registro de barbería (crea también al admin) ====================
    rs = await Promise.all([
        registroBarberia("Dueno@Barberia.Test", "dueno_a", "Barbería Carrera A"),
        registroBarberia("dueno@barberia.test", "dueno_b", "Barbería Carrera B")
    ]);
    check("Registro de barbería: dos peticiones simultáneas con el mismo correo -> solo una se crea (201 y 409)", soloUnaCreada(rs), JSON.stringify(estados(rs)));
    check("Registro de barbería: el perdedor recibe 409 con el mensaje de correo ya registrado",
        JSON.stringify(perdedora(rs)?.data) === JSON.stringify({ error: MSG_CORREO }), JSON.stringify(perdedora(rs)?.data));
    check("Registro de barbería: solo se crea una barbería y un administrador",
        await bd.collection("Barberias").countDocuments({ nombre: { $in: ["Barbería Carrera A", "Barbería Carrera B"] } }) === 1
        && await bd.collection("Usuarios").countDocuments({ correo: "dueno@barberia.test" }) === 1);

    r = await registroBarberia("DUENO@BARBERIA.TEST", "dueno_c", "Barbería Tres");
    check("Registro de barbería: mismo correo con otras mayúsculas -> 409", r.status === 409 && r.data?.error === MSG_CORREO, `${r.status} ${JSON.stringify(r.data)}`);
    check("Registro de barbería: el rechazo no crea una barbería huérfana", await bd.collection("Barberias").countDocuments({ nombre: "Barbería Tres" }) === 0);

    r = await registroBarberia("MIXTO@api.test", "dueno_d", "Barbería Cuatro");
    check("Registro de barbería con el correo de un cliente (otras mayúsculas) -> 409", r.status === 409 && r.data?.error === MSG_CORREO, `${r.status}`);

    rs = await Promise.all([
        registroBarberia("e1@barberia.test", "dueno_repetido", "Barbería Usuario A"),
        registroBarberia("e2@barberia.test", "dueno_repetido", "Barbería Usuario B")
    ]);
    check("Registro de barbería: dos peticiones simultáneas con el mismo nombre de usuario -> solo una se crea (201 y 409)", soloUnaCreada(rs), JSON.stringify(estados(rs)));
    check("Registro de barbería: el perdedor recibe 409 con el mensaje de usuario en uso",
        JSON.stringify(perdedora(rs)?.data) === JSON.stringify({ error: MSG_USUARIO }), JSON.stringify(perdedora(rs)?.data));

    r = await login("DUENO@Barberia.TEST");
    check("Login del administrador de la barbería con el correo en mayúsculas -> 200 (rol admin)", r.status === 200 && r.data?.user?.rol === "admin", `${r.status}`);

    // ==================== Formato de correo y contraseña ====================
    // API aparte sobre la misma BD: lo anterior ya gastó casi todos los intentos por IP de los registros y el login
    const servidorCredenciales = lanzarServidor({ puerto: 5096, nombreBD: entorno.nombreBD });
    await servidorCredenciales.listo;
    const reqCred = crearCliente("http://localhost:5096");
    try {
        const rechazado = async (nombre, ruta, body, mensaje) => {
            const respuesta = await reqCred("POST", ruta, { body });
            const creado = await bd.collection("Usuarios").countDocuments({ usuario: body.usuario });
            check(nombre, respuesta.status === 400 && respuesta.data?.error === mensaje && creado === 0, `${respuesta.status} ${JSON.stringify(respuesta.data)}`);
        };
        const cliente = (usuario, correo, pw) => ({ nombre: "Test", apellido: "Prueba", rol: "cliente", ciudad: "Madrid", usuario, correo, pw });
        const barberia = (usuario, correo, pw) => ({ nombreBarberia: `Barbería ${usuario}`, direccion: "Calle 1", nombre: "Admin", apellido: "Prueba", usuario, correo, pw });

        await rechazado("Registro: correo sin @ -> 400 formato no válido", "/usuarios/registro", cliente("cred_1", "sin-arroba.test", PW), M.correoFormato);
        await rechazado("Registro: correo de más de 254 caracteres -> 400 demasiado largo", "/usuarios/registro",
            cliente("cred_2", `${"a".repeat(60)}@${"b".repeat(190)}.test`, PW), M.correoLargo);
        await rechazado("Registro: parte local del correo de más de 64 caracteres -> 400 demasiado largo", "/usuarios/registro",
            cliente("cred_3", `${"a".repeat(65)}@prueba.test`, PW), M.correoLargo);
        await rechazado("Registro: contraseña de 7 caracteres -> 400 mínimo 8", "/usuarios/registro", cliente("cred_4", "cred4@prueba.test", "abcdef1"), M.pwCorta);
        await rechazado("Registro: contraseña sin número -> 400", "/usuarios/registro", cliente("cred_5", "cred5@prueba.test", "soloLetras"), M.pwSinNumero);
        await rechazado("Registro: contraseña sin letra -> 400", "/usuarios/registro", cliente("cred_6", "cred6@prueba.test", "12345678"), M.pwSinLetra);
        await rechazado("Registro: contraseña de 73 caracteres -> 400 demasiado larga", "/usuarios/registro",
            cliente("cred_7", "cred7@prueba.test", "a1" + "b".repeat(71)), M.pwLarga);
        await rechazado("Registro de barbero: contraseña corta -> 400 antes de mirar el código de invitación", "/usuarios/registro",
            { ...cliente("cred_8", "cred8@prueba.test", "corta1"), rol: "barbero", code: "AAAA-BBBB" }, M.pwCorta);

        await rechazado("Registro de barbería: correo sin dominio -> 400 formato no válido", "/barberias/registro", barberia("cred_9", "dueno@sin-dominio", PW), M.correoFormato);
        await rechazado("Registro de barbería: contraseña sin letra -> 400", "/barberias/registro", barberia("cred_10", "cred10@prueba.test", "123456789"), M.pwSinLetra);
        await rechazado("Registro de barbería: 37 caracteres con «ñ» ocupan 73 bytes -> 400 demasiado larga", "/barberias/registro",
            barberia("cred_11", "cred11@prueba.test", "ñ".repeat(36) + "1"), M.pwLarga);
        r = await reqCred("POST", "/barberias/registro", { body: barberia("cred_12", "  Valido.MAYUS@Prueba.TEST ", "contraseña1") });
        const valido = await bd.collection("Usuarios").findOne({ usuario: "cred_12" });
        check("Registro de barbería: correo válido con mayúsculas -> 201 y se guarda en minúsculas", r.status === 201 && valido?.correo === "valido.mayus@prueba.test", `${r.status} ${valido?.correo}`);

        // Cuenta creada con la política antigua (6 caracteres, sin número): puede entrar y cambiar su contraseña
        const antiguo = { nombre: "Antiguo", apellido: "Usuario", correo: "antiguo@prueba.test", usuario: "cred_antiguo", rol: "cliente", pw: await bcrypt.hash("abcdef", 10) };
        antiguo._id = (await bd.collection("Usuarios").insertOne(antiguo)).insertedId;
        r = await reqCred("POST", "/usuarios/login", { body: { correo: "Antiguo@Prueba.test", pw: "abcdef" } });
        check("Login con una contraseña antigua que no cumple la política nueva -> 200", r.status === 200 && Boolean(r.data?.token), `${r.status}`);

        const cambiar = (actual, nueva) => reqCred("POST", "/usuarios/cambiar-contrasena", { token: firmar(antiguo), body: { currentPassword: actual, newPassword: nueva } });
        r = await cambiar("abcdef", "abcdef");
        check("Cambiar contraseña: la nueva también debe cumplir la política -> 400", r.status === 400 && r.data?.error === M.pwCorta, `${r.status} ${JSON.stringify(r.data)}`);
        r = await cambiar("abcdef", "a1" + "b".repeat(71));
        check("Cambiar contraseña: 73 bytes -> 400 demasiado larga", r.status === 400 && r.data?.error === M.pwLarga, `${r.status}`);
        r = await cambiar("abcdef", "ñandúñandú1");
        check("Cambiar contraseña: letras con tilde y «ñ» cuentan como letra -> 200",
            r.status === 200 && await bcrypt.compare("ñandúñandú1", (await bd.collection("Usuarios").findOne({ _id: antiguo._id })).pw), `${r.status}`);
        r = await cambiar("ñandúñandú1", "a1" + "b".repeat(70));
        check("Cambiar contraseña: exactamente 72 bytes -> 200 (límite incluido)", r.status === 200, `${r.status}`);
    } finally {
        await servidorCredenciales.detener();
    }

    // ==================== Cambio de contraseña ====================
    // API aparte otra vez: necesita intentos de login limpios y su propio contador de fallos por usuario
    const servidorCambio = lanzarServidor({ puerto: 5095, nombreBD: entorno.nombreBD });
    await servidorCambio.listo;
    const reqCambio = crearCliente("http://localhost:5095");
    try {
        const crearConPassword = async (usuario, pw) => {
            const doc = { nombre: "Cambio", apellido: "Prueba", correo: `${usuario}@prueba.test`, usuario, rol: "cliente", pw: await bcrypt.hash(pw, 10) };
            doc._id = (await bd.collection("Usuarios").insertOne(doc)).insertedId;
            return doc;
        };
        const passwordGuardada = async (usuario, pw) => bcrypt.compare(pw, (await bd.collection("Usuarios").findOne({ _id: usuario._id })).pw);
        const cambio = await crearConPassword("cambio_1", "ClaveActual1");
        const victima = await crearConPassword("cambio_victima", "Victima123");
        const cambiar = (usuario, body) => reqCambio("POST", "/usuarios/cambiar-contrasena", { token: firmar(usuario), body });
        const MSG_ACTUAL = "Contraseña actual incorrecta";

        r = await cambiar(cambio, { currentPassword: "NoEsLaMia1", newPassword: "NuevaClave2" });
        check("Cambio de contraseña: actual incorrecta -> 401", r.status === 401 && r.data?.error === MSG_ACTUAL, `${r.status} ${JSON.stringify(r.data)}`);
        r = await cambiar(cambio, { currentPassword: "ClaveActual1", newPassword: "sinnumero" });
        check("Cambio de contraseña: la nueva no cumple la política -> 400", r.status === 400 && r.data?.error === M.pwSinNumero, `${r.status} ${JSON.stringify(r.data)}`);
        r = await cambiar(cambio, { currentPassword: "ClaveActual1", newPassword: "ClaveActual1" });
        check("Cambio de contraseña: la nueva igual a la actual -> 400", r.status === 400 && r.data?.error === M.pwIgualActual, `${r.status} ${JSON.stringify(r.data)}`);

        r = await cambiar(cambio, { currentPassword: "Victima123", newPassword: "Robada123", id: victima._id.toString(), userId: victima._id.toString(), _id: victima._id.toString() });
        check("Cambio de contraseña sobre otro usuario (id ajeno en el body y su contraseña) -> 401 y la víctima no cambia",
            r.status === 401 && await passwordGuardada(victima, "Victima123"), `${r.status}`);
        r = await reqCambio("POST", `/usuarios/cambiar-contrasena/${victima._id}`, { token: firmar(cambio), body: { currentPassword: "Victima123", newPassword: "Robada123" } });
        check("Cambio de contraseña con el id ajeno en la ruta -> 404 (la ruta no admite id)", r.status === 404 && await passwordGuardada(victima, "Victima123"), `${r.status}`);

        r = await cambiar(cambio, { currentPassword: "ClaveActual1", newPassword: "NuevaClave2" });
        check("Cambio de contraseña correcto -> 200 y se guarda el hash nuevo", r.status === 200 && await passwordGuardada(cambio, "NuevaClave2"), `${r.status}`);
        r = await reqCambio("POST", "/usuarios/login", { body: { correo: cambio.correo, pw: "NuevaClave2" } });
        check("Tras el cambio: login con la contraseña nueva -> 200", r.status === 200 && Boolean(r.data?.token), `${r.status}`);
        r = await reqCambio("POST", "/usuarios/login", { body: { correo: cambio.correo, pw: "ClaveActual1" } });
        check("Tras el cambio: login con la contraseña antigua -> 401", r.status === 401, `${r.status}`);

        // Llevamos 2 fallos (401). Los 400 no cuentan: el quinto fallo aún responde 401 y el sexto intento ya es 429
        const fallos = [];
        fallos.push((await cambiar(cambio, { currentPassword: "Fallo1234", newPassword: "OtraClave3" })).status);
        fallos.push((await cambiar(cambio, { currentPassword: "Fallo1234", newPassword: "OtraClave3" })).status);
        fallos.push((await cambiar(cambio, { currentPassword: "NuevaClave2", newPassword: "corta" })).status);
        fallos.push((await cambiar(cambio, { currentPassword: "Fallo1234", newPassword: "OtraClave3" })).status);
        check("Límite: los errores de formato (400) no cuentan y el quinto fallo de contraseña actual sigue siendo 401",
            JSON.stringify(fallos) === "[401,401,400,401]", JSON.stringify(fallos));
        r = await cambiar(cambio, { currentPassword: "NuevaClave2", newPassword: "OtraClave3" });
        check("Límite: tras 5 fallos, incluso con la contraseña correcta -> 429 y no cambia nada",
            r.status === 429 && r.data?.error === "Demasiados intentos, inténtalo más tarde" && await passwordGuardada(cambio, "NuevaClave2"), `${r.status} ${JSON.stringify(r.data)}`);
        r = await cambiar(victima, { currentPassword: "Victima123", newPassword: "VictimaNueva4" });
        check("Límite por usuario, no por IP: otro usuario desde la misma IP puede cambiar su contraseña -> 200", r.status === 200, `${r.status}`);
    } finally {
        await servidorCambio.detener();
    }

    // ==================== Desactivar a un barbero ====================
    // Dos barberías completas (semilla de la batería de seguridad): barbero_a1 tiene 2 citas futuras (pendiente y confirmada)
    await sembrarDatos(bd);
    const porUsuario = async (usuario) => bd.collection("Usuarios").findOne({ usuario });
    const [adminA, adminB, barberoA1, barberoA2, clienteSemilla] = await Promise.all(["admin_a", "admin_b", "barbero_a1", "barbero_a2", "cliente_1"].map(porUsuario));
    const idA = adminA.barberiaId.toString();
    const servicioA = (await bd.collection("Barberias").findOne({ _id: adminA.barberiaId })).servicios[0]._id.toString();
    const rutaEstado = (barbero) => `/barberias/${idA}/barberos/${barbero._id}/estado`;
    const estado = (token, barbero, body) => req("PUT", rutaEstado(barbero), { token, body });
    const enListaPublica = async (token) => ((await req("GET", `/barberias/${idA}/barberos`, { token })).data || []).some((b) => b._id === barberoA1._id.toString());
    const activoEnBD = async () => (await bd.collection("Usuarios").findOne({ _id: barberoA1._id })).activo;
    const fechaFutura = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const mesActual = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }).slice(0, 7);
    const disponibilidadDia = () => req("GET", `/citas/disponibilidad/${barberoA1._id}/${fechaFutura}?barberiaId=${idA}`);
    const disponibilidadMes = () => req("GET", `/citas/disponibilidad/${barberoA1._id}/mes/${mesActual}?barberiaId=${idA}`);
    const reservar = (horaInicio) => req("POST", "/citas", {
        token: firmar(clienteSemilla), body: { barberiaId: idA, barberoId: barberoA1._id.toString(), servicioIds: [servicioA], fecha: fechaFutura, horaInicio }
    });
    const citaManual = (token, horaInicio) => req("POST", "/citas/manual", {
        token, body: { barberoId: barberoA1._id.toString(), servicioIds: [servicioA], fecha: fechaFutura, horaInicio, clienteNombre: "Sin reserva" }
    });
    const citasAntes = await bd.collection("Citas").countDocuments({ barberoId: barberoA1._id });

    check("Desactivar: antes de empezar el barbero aparece en la lista pública", await enListaPublica());

    r = await estado(firmar(adminB), barberoA1, { activo: false });
    check("Desactivar: el dueño de otra barbería -> 403 y no cambia nada", r.status === 403 && await activoEnBD() === undefined, `${r.status}`);
    r = await estado(firmar(barberoA2), barberoA1, { activo: false });
    check("Desactivar: un barbero no puede desactivar a nadie -> 403", r.status === 403, `${r.status}`);
    r = await estado(firmar(clienteSemilla), barberoA1, { activo: false });
    check("Desactivar: un cliente no puede desactivar a nadie -> 403", r.status === 403, `${r.status}`);
    r = await estado(firmar(adminA), adminA, { activo: false });
    check("Desactivar: el dueño no puede desactivarse a sí mismo -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await estado(firmar(adminA), barberoA1, { activo: "false" });
    check("Desactivar: activo como texto (no booleano) -> 400", r.status === 400 && await activoEnBD() === undefined, `${r.status}`);

    r = await estado(firmar(adminA), barberoA1, { activo: false });
    check("Desactivar: el dueño de su barbería -> 200 y avisa de las 2 citas futuras sin cancelarlas",
        r.status === 200 && r.data?.activo === false && r.data?.citasFuturas === 2 && await activoEnBD() === false
        && await bd.collection("Citas").countDocuments({ barberoId: barberoA1._id, estado: "cancelada" }) === 1,
        `${r.status} ${JSON.stringify(r.data)}`);

    check("Desactivado: no aparece en la lista pública ni para un cliente", !(await enListaPublica()) && !(await enListaPublica(firmar(clienteSemilla))));
    const listaAdmin = (await req("GET", `/barberias/${idA}/barberos`, { token: firmar(adminA) })).data || [];
    check("Desactivado: el dueño lo sigue viendo en su equipo con activo: false",
        listaAdmin.some((b) => b._id === barberoA1._id.toString() && b.activo === false));
    r = await disponibilidadDia();
    check("Desactivado: huecos del día -> 404", r.status === 404, `${r.status}`);
    r = await disponibilidadMes();
    check("Desactivado: días disponibles del mes -> 404", r.status === 404, `${r.status}`);
    r = await reservar("10:00");
    check("Desactivado: un cliente no puede reservar con él por la API -> 409", r.status === 409 && r.data?.error === "Este barbero no admite citas nuevas en este momento", `${r.status} ${JSON.stringify(r.data)}`);
    r = await citaManual(firmar(adminA), "11:00");
    check("Desactivado: el dueño no puede crearle una cita manual -> 409", r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
    r = await citaManual(firmar(barberoA1), "12:00");
    check("Desactivado: el propio barbero no puede crearse una cita manual -> 409", r.status === 409, `${r.status}`);
    r = await req("GET", "/citas/barbero", { token: firmar(barberoA1) });
    check("Desactivado: el barbero sigue consultando su agenda y conserva sus citas",
        r.status === 200 && Array.isArray(r.data) && r.data.length === citasAntes
        && await bd.collection("Citas").countDocuments({ barberoId: barberoA1._id }) === citasAntes, `${r.status} ${r.data?.length}/${citasAntes}`);

    r = await estado(firmar(adminA), barberoA1, { activo: true });
    check("Reactivar: el dueño -> 200", r.status === 200 && r.data?.activo === true && await activoEnBD() === true, `${r.status}`);
    check("Reactivado: vuelve a aparecer en la lista pública", await enListaPublica());
    r = await disponibilidadDia();
    check("Reactivado: huecos del día -> 200 con horas libres", r.status === 200 && r.data?.horariosDisponibles?.includes("10:00"), `${r.status}`);
    r = await disponibilidadMes();
    check("Reactivado: días disponibles del mes -> 200", r.status === 200 && Array.isArray(r.data?.dias), `${r.status}`);
    r = await reservar("10:00");
    check("Reactivado: un cliente puede volver a reservar con él -> 201", r.status === 201, `${r.status} ${JSON.stringify(r.data)}`);

    // ==================== Reglas de la app = reglas del servidor ====================
    const constantes = ["PW_MIN_CARACTERES", "PW_MAX_BYTES", "CORREO_MAX_CARACTERES", "CORREO_LOCAL_MAX_CARACTERES"];
    check("App y servidor: mismos límites y misma regex de correo",
        constantes.every((c) => reglasApp[c] === reglasServidor[c]) && reglasApp.RE_CORREO.source === reglasServidor.RE_CORREO.source,
        constantes.map((c) => `${c}=${reglasApp[c]}/${reglasServidor[c]}`).join(" "));
    check("App y servidor: mismos mensajes", JSON.stringify(reglasApp.MENSAJES_CREDENCIALES) === JSON.stringify(M));
    const contrasenas = ["", "abc12", "abcdefgh", "12345678", "abcdefg1", "ñandúñandú1", "a1" + "b".repeat(70), "a1" + "b".repeat(71), "ñ".repeat(36) + "1"];
    const distintasPw = contrasenas.filter((pw) => reglasApp.validarPasswordNueva(pw) !== reglasServidor.validarPasswordNueva(pw));
    check("App y servidor: mismo resultado al validar contraseñas", distintasPw.length === 0, distintasPw.join(" | "));
    const correos = ["a@b.co", "  A@B.CO ", "sin-arroba", "a@b", "a b@c.de", "a@@b.co", `${"a".repeat(65)}@b.co`, `${"a".repeat(60)}@${"b".repeat(190)}.test`];
    const distintosCorreo = correos.filter((c) => reglasApp.validarCorreo(c) !== reglasServidor.validarCorreo(normalizarCorreo(c)));
    check("App y servidor: mismo resultado al validar correos", distintosCorreo.length === 0, distintosCorreo.join(" | "));

    // ==================== Migración de correos ====================
    await bd.collection("Usuarios").insertMany([
        { correo: "  Sucio@Mig.TEST ", usuario: "mig_1", rol: "cliente" },
        { correo: "Otro@mig.test", usuario: "mig_2", rol: "cliente" }
    ]);
    let ejecucion = ejecutarMigracion();
    check("Migración en simulación: informa de los correos por normalizar y termina bien", ejecucion.status === 0 && /Correos por normalizar: 2/.test(ejecucion.stdout), `código ${ejecucion.status}`);
    check("Migración en simulación: no modifica ningún dato", (await bd.collection("Usuarios").findOne({ usuario: "mig_1" })).correo === "  Sucio@Mig.TEST ");

    ejecucion = ejecutarMigracion("--aplicar");
    const migrados = await bd.collection("Usuarios").find({ usuario: /^mig_/ }).sort({ usuario: 1 }).toArray();
    check("Migración con --aplicar: deja los correos en minúsculas y sin espacios",
        ejecucion.status === 0 && migrados.map((u) => u.correo).join() === "sucio@mig.test,otro@mig.test", migrados.map((u) => u.correo).join());

    await bd.collection("Usuarios").insertMany([
        { correo: "dup@mig.test", usuario: "mig_3", rol: "cliente" },
        { correo: "DUP@mig.test", usuario: "mig_4", rol: "cliente" },
        { correo: " Sucio2@mig.test", usuario: "mig_5", rol: "cliente" }
    ]);
    ejecucion = ejecutarMigracion("--aplicar");
    const tras = await bd.collection("Usuarios").find({ usuario: { $in: ["mig_3", "mig_4", "mig_5"] } }).sort({ usuario: 1 }).toArray();
    check("Migración con duplicados: avisa, termina con código 1 y no modifica nada aunque se pida --aplicar",
        ejecucion.status === 1 && /DUPLICADO "dup@mig.test"/.test(ejecucion.stdout) && tras.map((u) => u.correo).join() === "dup@mig.test,DUP@mig.test, Sucio2@mig.test",
        `código ${ejecucion.status}`);
    await bd.collection("Usuarios").deleteMany({ usuario: /^mig_/ });

    // ==================== Arranque sin garantía de unicidad ====================
    await bd.collection("Usuarios").dropIndex("correo_unico");
    await bd.collection("Usuarios").insertMany([
        { correo: "igual@arranque.test", usuario: "arranque_1", rol: "cliente" },
        { correo: "igual@arranque.test", usuario: "arranque_2", rol: "cliente" }
    ]);
    const servidorFallido = lanzarServidor({ puerto: 5097, nombreBD: entorno.nombreBD });
    const codigoSalida = await servidorFallido.salio;
    check("Arranque: si no se puede crear un índice único el servidor no arranca y sale con código 1",
        codigoSalida === 1 && !servidorFallido.salida().includes("Servidor corriendo") && servidorFallido.salida().includes("Faltan índices únicos: Usuarios.correo_unico"),
        `código ${codigoSalida}`);
    await bd.collection("Usuarios").deleteMany({ usuario: /^arranque_/ });
    await crearIndices();
    check("Arranque: sin duplicados el índice único se vuelve a crear", Boolean((await bd.collection("Usuarios").indexes()).find((i) => i.name === "correo_unico" && i.unique)));
} finally {
    await client.close();
    await entorno.cerrar();
}

terminar();
