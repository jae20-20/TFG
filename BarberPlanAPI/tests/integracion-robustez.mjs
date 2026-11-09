// Bloque de la batería de integración: si MongoDB no está disponible (conexión caída o tiempo agotado), la API responde
// 503 con un mensaje comprensible y sin detalles internos, en lugar de un 500 genérico.
//   1. Clasificación de errores del driver y respuestas de los manejadores (sin red).
//   2. De extremo a extremo: la API se conecta a la base de datos a través de un proxy TCP que el test corta y reabre.
// Lo ejecuta tests/integracion.mjs sobre la misma BD desechable.
import jwt from "jsonwebtoken";
import {
    MongoError,
    MongoNetworkError,
    MongoNetworkTimeoutError,
    MongoNotConnectedError,
    MongoServerError,
    MongoServerSelectionError,
    ObjectId
} from "mongodb";
import dns from "node:dns";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { crearCliente, lanzarServidor } from "./entorno.mjs";

const CAMPOS_PROHIBIDOS = /mongo|atlas|ECONN|ETIMEDOUT|server ?selection|topology|socket|cluster|shard|\.net\b|stack|at .*\(/i;

// Respuesta falsa de Express: guarda lo que se le pide
const respuestaFalsa = () => {
    const res = { cabeceras: {}, estado: null, cuerpo: null };
    res.set = (clave, valor) => { res.cabeceras[clave] = valor; return res; };
    res.status = (codigo) => { res.estado = codigo; return res; };
    res.json = (cuerpo) => { res.cuerpo = cuerpo; return res; };
    return res;
};

// Proxy TCP transparente que escucha en 127.0.0.1:puertoLocal y reenvía a ipDestino:puerto. Se puede cortar (cierra todo
// y deja de aceptar) y reabrir
const crearProxy = ({ ipDestino, puerto, puertoLocal }) => {
    const sockets = new Set();
    let servidor = null;
    const abrir = () => new Promise((resolve, reject) => {
        servidor = net.createServer((entrada) => {
            const salida = net.connect(Number(puerto), ipDestino);
            for (const socket of [entrada, salida]) {
                sockets.add(socket);
                socket.on("close", () => { sockets.delete(socket); });
                socket.on("error", () => { entrada.destroy(); salida.destroy(); });
            }
            entrada.pipe(salida);
            salida.pipe(entrada);
        });
        servidor.once("error", reject);
        servidor.listen(puertoLocal, "127.0.0.1", () => { puertoLocal = servidor.address().port; resolve(puertoLocal); });
    });
    const cortar = () => new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        servidor.close(() => resolve());
    });
    return { abrir, cortar, puerto: () => puertoLocal };
};

export const pruebasRobustez = async ({ check, entorno, client }) => {
    const { MENSAJE_SERVICIO_NO_DISPONIBLE, esErrorDeBaseDeDatosNoDisponible, responderErrorInterno, manejadorErrores } =
        await import("../src/middleware/errorMiddleware.js");

    // ---------------------------------------------------------------- 1. Clasificación y manejadores
    const conEtiqueta = (etiqueta) => { const e = new MongoError("transacción"); e.addErrorLabel(etiqueta); return e; };
    const servidorConCodigo = (code) => new MongoServerError({ message: "error del servidor", code });
    const dehechoNoDisponible = [
        ["MongoNetworkError (conexión caída)", new MongoNetworkError("connect ECONNREFUSED 10.0.0.1:27017")],
        ["MongoNetworkTimeoutError (socket sin respuesta)", new MongoNetworkTimeoutError("connection timed out")],
        ["MongoServerSelectionError (no hay servidor)", new MongoServerSelectionError("Server selection timed out after 10000 ms", { type: "ReplicaSetNoPrimary", servers: new Map() })],
        // El driver no exporta esta clase; el error que lanza se reconoce por su name
        ["MongoWaitQueueTimeoutError (pool agotado)", Object.assign(new Error("Timed out while checking out a connection from connection pool"), { name: "MongoWaitQueueTimeoutError" })],
        ["MongoNotConnectedError", new MongoNotConnectedError("Client must be connected before running operations")],
        ["MongoServerError 50 (MaxTimeMSExpired)", servidorConCodigo(50)],
        ["MongoServerError 89 (NetworkTimeout)", servidorConCodigo(89)],
        ["MongoServerError 91 (ShutdownInProgress)", servidorConCodigo(91)],
        ["MongoServerError 189 (PrimarySteppedDown)", servidorConCodigo(189)],
        ["MongoServerError 10107 (NotWritablePrimary)", servidorConCodigo(10107)],
        ["transacción con etiqueta TransientTransactionError (reintentos agotados)", conEtiqueta("TransientTransactionError")],
        ["transacción con etiqueta UnknownTransactionCommitResult", conEtiqueta("UnknownTransactionCommitResult")],
        ["error envuelto: Error con cause = MongoNetworkError", new Error("fallo al leer", { cause: new MongoNetworkError("socket cerrado") })]
    ];
    for (const [descripcion, error] of dehechoNoDisponible) {
        check(`Clasificación: ${descripcion} -> base de datos no disponible`, esErrorDeBaseDeDatosNoDisponible(error) === true);
    }
    const noSonDeConexion = [
        ["Error genérico", new Error("algo ha fallado")],
        ["TypeError de código", new TypeError("Cannot read properties of undefined")],
        ["clave duplicada (11000)", servidorConCodigo(11000)],
        ["fallo de validación del documento (121)", servidorConCodigo(121)],
        ["MongoServerError sin código", new MongoServerError({ message: "otro" })],
        ["null", null],
        ["una cadena", "error"]
    ];
    for (const [descripcion, error] of noSonDeConexion) {
        check(`Clasificación: ${descripcion} -> NO es de conexión (sigue siendo 500)`, esErrorDeBaseDeDatosNoDisponible(error) === false);
    }
    const bucle = new Error("a"); bucle.cause = bucle;
    check("Clasificación: una cadena de causas circular no cuelga el servidor", esErrorDeBaseDeDatosNoDisponible(bucle) === false);

    let res = respuestaFalsa();
    responderErrorInterno(res, new MongoNetworkError("connect ECONNREFUSED atlas-shard-00-00.abc.mongodb.net:27017"), "Error al obtener barberías");
    check("responderErrorInterno con un error de red -> 503 con el mensaje fijo y Retry-After",
        res.estado === 503 && JSON.stringify(res.cuerpo) === JSON.stringify({ error: MENSAJE_SERVICIO_NO_DISPONIBLE }) && Number(res.cabeceras["Retry-After"]) > 0, JSON.stringify(res));
    check("El mensaje del 503 no filtra detalles internos (host, driver, Mongo, pila)", !CAMPOS_PROHIBIDOS.test(JSON.stringify(res.cuerpo)), JSON.stringify(res.cuerpo));
    res = respuestaFalsa();
    responderErrorInterno(res, new Error("fallo cualquiera"), "Error al obtener barberías");
    check("responderErrorInterno con otro error -> 500 con el mensaje de la ruta, sin Retry-After",
        res.estado === 500 && JSON.stringify(res.cuerpo) === JSON.stringify({ error: "Error al obtener barberías" }) && !("Retry-After" in res.cabeceras), JSON.stringify(res));

    const consolaError = console.error;
    console.error = () => {};
    try {
        res = respuestaFalsa();
        manejadorErrores(new MongoServerSelectionError("Server selection timed out", { type: "Unknown", servers: new Map() }), {}, res, () => {});
        check("manejadorErrores (middleware de rutas de escritura) con Mongo caído -> 503", res.estado === 503 && res.cuerpo.error === MENSAJE_SERVICIO_NO_DISPONIBLE && Number(res.cabeceras["Retry-After"]) > 0);
        res = respuestaFalsa();
        manejadorErrores(new Error("excepción cualquiera"), {}, res, () => {});
        check("manejadorErrores con una excepción no relacionada -> 500 genérico", res.estado === 500 && res.cuerpo.error === "Error interno del servidor");
        res = respuestaFalsa();
        manejadorErrores(Object.assign(new Error("json"), { type: "entity.parse.failed" }), {}, res, () => {});
        check("manejadorErrores sigue devolviendo 400 para un JSON mal formado", res.estado === 400);
    } finally {
        console.error = consolaError;
    }

    // ---------------------------------------------------------------- 2. De extremo a extremo con un proxy que corta la conexión
    // La API se conecta con el nombre real del primario, pero ese nombre resuelve a 127.0.0.1 (shim-dns.cjs, solo en su
    // proceso) y allí escucha el proxy, que reenvía a la IP real. Al cortarlo, Mongo «desaparece» sin tocar nada más
    const hello = await client.db("admin").command({ hello: 1 });
    const [hostPrimario, puertoPrimario = "27017"] = (hello.primary || hello.me).split(":");
    const ipPrimario = (await dns.promises.lookup(hostPrimario)).address;
    const uriOriginal = new URL(process.env.ATLAS_URI);
    const usaTls = uriOriginal.protocol === "mongodb+srv:" || uriOriginal.searchParams.get("tls") === "true" || uriOriginal.searchParams.get("ssl") === "true";
    // Con una réplica local el primario ya ocupa su puerto en 127.0.0.1: el proxy usa un puerto libre y la API se conecta a él
    const primarioLocal = /^(127\.|::1$)/.test(ipPrimario);
    const proxy = crearProxy({ ipDestino: ipPrimario, puerto: puertoPrimario, puertoLocal: primarioLocal ? 0 : Number(puertoPrimario) });
    const puertoProxy = await proxy.abrir();
    const credenciales = uriOriginal.username ? `${uriOriginal.username}:${uriOriginal.password}@` : "";
    const uriProxy = primarioLocal
        ? `mongodb://${credenciales}127.0.0.1:${puertoProxy}/?directConnection=true${credenciales ? "&authSource=admin" : ""}`
        : `mongodb://${credenciales}${hostPrimario}:${puertoPrimario}/?directConnection=true&authSource=admin${usaTls ? "&tls=true" : ""}`;

    const api = lanzarServidor({
        puerto: 5084, nombreBD: entorno.nombreBD,
        variables: {
            ATLAS_URI: uriProxy,
            ...(primarioLocal ? {} : {
                NODE_OPTIONS: `--require "${fileURLToPath(new URL("./shim-dns.cjs", import.meta.url)).replaceAll("\\", "/")}"`,
                SHIM_DNS_HOST: hostPrimario
            }),
            MONGO_SERVER_SELECTION_TIMEOUT_MS: "2000",
            MONGO_SOCKET_TIMEOUT_MS: "3000"
        }
    });
    try {
        await api.listo;
        const req = crearCliente("http://localhost:5084");
        const firmar = (rol) => jwt.sign({ id: new ObjectId().toString(), rol, barberiaId: null }, process.env.JWT_SECRET, { expiresIn: "5m" });
        const medir = async (llamada) => { const inicio = Date.now(); const r = await llamada(); return { ...r, ms: Date.now() - inicio }; };

        let r = await req("GET", "/barberias");
        check("Extremo a extremo: con la base de datos disponible GET /barberias -> 200", r.status === 200 && Array.isArray(r.data), `${r.status}`);

        await proxy.cortar();

        r = await medir(() => req("GET", "/barberias"));
        const cuerpo503 = JSON.stringify(r.data);
        check("Mongo caído: GET /barberias -> 503 con el mensaje comprensible",
            r.status === 503 && r.data?.error === MENSAJE_SERVICIO_NO_DISPONIBLE, `${r.status} ${cuerpo503}`);
        check("Mongo caído: el 503 lleva Retry-After y ningún detalle interno (host, driver, pila)",
            Number(r.headers.get("retry-after")) > 0 && !CAMPOS_PROHIBIDOS.test(cuerpo503) && Object.keys(r.data).join() === "error", cuerpo503);
        check("Mongo caído: responde dentro del plazo configurado (no se queda esperando 30 s)", r.ms < 15000, `${r.ms} ms`);

        r = await req("GET", "/usuarios/perfil", { token: firmar("cliente") });
        check("Mongo caído: otra lectura con sesión (GET /usuarios/perfil) -> 503", r.status === 503 && r.data?.error === MENSAJE_SERVICIO_NO_DISPONIBLE, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("GET", `/barberias/${new ObjectId()}`);
        check("Mongo caído: GET /barberias/:id -> 503 (no un 404 ni un 500)", r.status === 503, `${r.status}`);
        r = await req("PUT", "/usuarios/perfil", { token: firmar("cliente"), body: { nombre: "Nuevo" } });
        check("Mongo caído: una ruta de escritura (comprobación de la cuenta antes de escribir) -> 503", r.status === 503 && r.data?.error === MENSAJE_SERVICIO_NO_DISPONIBLE, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("POST", "/citas", { token: firmar("cliente"), body: { barberiaId: new ObjectId().toString() } });
        check("Mongo caído: POST /citas (la ruta del 500 observado) -> 503", r.status === 503 && r.data?.error === MENSAJE_SERVICIO_NO_DISPONIBLE, `${r.status} ${JSON.stringify(r.data)}`);

        r = await req("POST", "/usuarios/login", { body: { correo: { $ne: null }, pw: "x" } });
        check("Mongo caído: lo que se rechaza antes de tocar la BD sigue dando su 400", r.status === 400, `${r.status}`);
        r = await req("GET", "/ruta-que-no-existe");
        check("Mongo caído: una ruta inexistente sigue dando 404", r.status === 404, `${r.status}`);
        r = await req("GET", "/usuarios/perfil");
        check("Mongo caído: sin token sigue dando 401 (la autenticación no necesita la BD)", r.status === 401, `${r.status}`);

        // Recuperación: al volver Mongo, el driver reconecta solo y la API vuelve a responder sin reiniciarse
        await proxy.abrir();
        let recuperada = false;
        for (let intento = 0; intento < 20 && !recuperada; intento++) {
            r = await req("GET", "/barberias");
            recuperada = r.status === 200;
            if (!recuperada) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        check("Mongo vuelve: la API se recupera sola (GET /barberias -> 200) sin reiniciarse", recuperada, `${r.status}`);
    } finally {
        await api.detener();
        await proxy.cortar().catch(() => {});
    }
};
