// Batería de seguridad: autorización entre barberías (IDOR), inyección NoSQL, exposición de datos,
// validación de entradas y CORS. Levanta su propia API (puerto 5099) sobre la BD desechable
// BarberPlan_test sembrada con tests/semilla.mjs, y la borra al terminar. Solo hace lecturas o
// peticiones que el servidor rechaza antes de escribir. Las rutas de escritura comprueban que la
// cuenta del token exista, así que los atacantes de las pruebas son cuentas reales (sembradas aquí):
// un admin que no administra nada y un cliente.
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { crearCliente, crearComprobador, crearEntorno } from "./entorno.mjs";
import { sembrarDatos, usuarioBase } from "./semilla.mjs";

const { check, terminar } = crearComprobador("seguridad");
const ID_ADMIN_AJENO = new ObjectId();
const ID_CLIENTE_FALSO = new ObjectId();
const entorno = await crearEntorno({
    puerto: 5099,
    sembrar: async (bd) => {
        await sembrarDatos(bd);
        await bd.collection("Usuarios").insertMany([
            usuarioBase({ _id: ID_ADMIN_AJENO, nombre: "Ajeno", apellido: "Admin", correo: "admin.ajeno@prueba.test", usuario: "admin_ajeno", rol: "admin", barberiaId: null }),
            usuarioBase({ _id: ID_CLIENTE_FALSO, nombre: "Falso", apellido: "Cliente", correo: "cliente.falso@prueba.test", usuario: "cliente_falso", rol: "cliente", ciudad: "Madrid", barberiaId: null })
        ]);
    }
});
const req = crearCliente(entorno.api);
const firmar = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m" });

try {
    // Admin falso: rol admin pero no administra ninguna barbería (atacante de otro tenant)
    const adminAjeno = firmar({ id: ID_ADMIN_AJENO.toString(), rol: "admin", barberiaId: new ObjectId().toString() });
    const clienteFalso = firmar({ id: ID_CLIENTE_FALSO.toString(), rol: "cliente", barberiaId: null });
    // Token válido de una cuenta que no existe (borrada): las rutas de escritura la rechazan
    const cuentaBorrada = firmar({ id: new ObjectId().toString(), rol: "cliente", barberiaId: null });

    // --- NoSQL injection en login
    let r = await req("POST", "/usuarios/login", { body: { correo: { $regex: "^a" }, pw: "x" } });
    check("Login con operador $regex en correo -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("POST", "/usuarios/login", { body: { correo: { $ne: null }, pw: { $ne: null } } });
    check("Login con $ne en correo y pw -> 400", r.status === 400, `${r.status}`);
    r = await req("POST", "/usuarios/login", { body: { correo: "no-existe-" + Date.now() + "@x.com", pw: "x" } });
    check("Login correo inexistente -> 401 genérico (sin enumeración)", r.status === 401 && r.data?.error === "Correo o contraseña incorrectos", `${r.status} ${JSON.stringify(r.data)}`);

    // --- Exposición masiva GET /usuarios/
    r = await req("GET", "/usuarios/");
    check("GET /usuarios/ sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("GET", "/usuarios/", { token: clienteFalso });
    check("GET /usuarios/ como cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", "/usuarios/", { token: adminAjeno });
    check("GET /usuarios/ como admin sin barbería -> 404 (no lista global)", r.status === 404, `${r.status}`);

    // Datos reales públicos para usar como objetivos
    const barberias = (await req("GET", "/barberias")).data || [];
    check("Hay barberías para probar", barberias.length > 0, `${barberias.length}`);
    const barberia = barberias[0];

    // --- Listado público de barberos sin PII
    r = await req("GET", `/barberias/${barberia._id}/barberos`);
    const barberos = r.data || [];
    const camposPrivados = ["correo", "telefono", "pw", "vacaciones", "diasLibres", "horarioPersonal"];
    const filtrados = barberos.filter((b) => camposPrivados.some((c) => c in b));
    check("Barberos públicos sin correo/teléfono/horarios", r.status === 200 && barberos.length > 0 && filtrados.length === 0,
        `${barberos.length} barberos, campos: ${Object.keys(barberos[0] || {}).join(",")}`);
    r = await req("GET", `/barberias/${barberia._id}/barberos`, { token: adminAjeno });
    check("Admin ajeno también recibe solo datos públicos", (r.data || []).every((b) => !("correo" in b)), `${r.status}`);

    const barbero = barberos.find((b) => b.rol === "barbero") || barberos[0];

    // --- IDOR GET /usuarios/:id
    r = await req("GET", `/usuarios/${barbero._id}`, { token: clienteFalso });
    check("GET /usuarios/:id de otro usuario como cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `/usuarios/${barbero._id}`, { token: adminAjeno });
    check("GET /usuarios/:id como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `/usuarios/${new ObjectId()}`, { token: adminAjeno });
    check("GET /usuarios/:id inexistente -> 404", r.status === 404, `${r.status}`);
    const propioToken = firmar({ id: barbero._id, rol: barbero.rol, barberiaId: barberia._id });
    r = await req("GET", `/usuarios/${barbero._id}`, { token: propioToken });
    check("GET /usuarios/:id del propio usuario -> 200 sin pw", r.status === 200 && !("pw" in (r.data || {})), `${r.status}`);

    // --- Citas de otra barbería
    r = await req("GET", `/citas/barberia/${barberia._id}`, { token: adminAjeno });
    check("GET /citas/barberia/:id como admin ajeno -> 403", r.status === 403, `${r.status}`);

    // --- Camino legítimo: el admin real de la barbería conserva su acceso
    // GET /barberias/:id ya no expone adminId: el admin aparece en el equipo público con rol "admin"
    const adminDe = async (barberiaId) =>
        ((await req("GET", `/barberias/${barberiaId}/barberos`)).data || []).find((b) => b.rol === "admin")?._id;
    const detalle = (await req("GET", `/barberias/${barberia._id}`)).data;
    check("GET /barberias/:id público sin adminId", detalle && !("adminId" in detalle), `${Object.keys(detalle || {}).join(",")}`);
    const adminReal = firmar({ id: await adminDe(barberia._id), rol: "admin", barberiaId: barberia._id });
    r = await req("GET", `/barberias/${barberia._id}/barberos`, { token: adminReal });
    check("Admin propio recibe barberos completos (correo incluido)", r.status === 200 && (r.data || []).some((b) => "correo" in b), `${r.status}`);
    r = await req("GET", `/usuarios/${barbero._id}`, { token: adminReal });
    check("Admin propio: GET /usuarios/:id de su barbero -> 200", r.status === 200, `${r.status}`);
    r = await req("GET", `/citas/barberia/${barberia._id}`, { token: adminReal });
    check("Admin propio: GET /citas/barberia/:id -> 200", r.status === 200, `${r.status}`);
    const citasReales = r.data || [];

    // --- Ciclo de vida de citas. Solo peticiones que se rechazan antes de escribir:
    // nunca se lanza una transición válida con un token legítimo contra datos reales.
    const ACCIONES_CITA = ["confirmar", "rechazar", "completar", "no-presentada", "cancelar", "pago"];
    const citaObjetivo = citasReales[0];
    if (citaObjetivo) {
        const otroBarbero = barberos.find((b) => b.rol === "barbero" && b._id !== citaObjetivo.barberoId?.toString());
        const barberoNoAsignado = otroBarbero
            ? firmar({ id: otroBarbero._id, rol: "barbero", barberiaId: barberia._id })
            : firmar({ id: new ObjectId().toString(), rol: "barbero", barberiaId: barberia._id });
        for (const accion of ACCIONES_CITA) {
            r = await req("PUT", `/citas/${citaObjetivo._id}/${accion}`, { token: adminAjeno, body: { pagado: true } });
            check(`PUT /citas/:id/${accion} como admin de otra barbería -> 403`, r.status === 403, `${r.status}`);
            r = await req("PUT", `/citas/${citaObjetivo._id}/${accion}`, { token: barberoNoAsignado, body: { pagado: true } });
            check(`PUT /citas/:id/${accion} como barbero no asignado -> 403`, r.status === 403, `${r.status}`);
        }
        r = await req("PUT", `/citas/${citaObjetivo._id}/confirmar`, { token: clienteFalso });
        check("Cliente intenta aceptar una reserva -> 403", r.status === 403, `${r.status}`);
        r = await req("PUT", `/citas/${citaObjetivo._id}/cancelar`, { token: clienteFalso });
        check("Cliente ajeno cancela una cita -> 403", r.status === 403, `${r.status}`);
        r = await req("GET", `/citas/${citaObjetivo._id}`, { token: barberoNoAsignado });
        check("GET /citas/:id como barbero no asignado -> 403", r.status === 403, `${r.status}`);
    }

    // Citas de todas las barberías, cada una con el token de su admin real
    const citasConAdmin = [];
    for (const b of barberias) {
        const tokenAdminB = firmar({ id: await adminDe(b._id), rol: "admin", barberiaId: b._id });
        const citasB = (await req("GET", `/citas/barberia/${b._id}`, { token: tokenAdminB })).data || [];
        citasB.forEach((cita) => citasConAdmin.push({ cita, tokenAdminB }));
    }

    const finalConAdmin = citasConAdmin.find(({ cita }) => cita.estado === "cancelada") || citasConAdmin.find(({ cita }) => cita.estado === "completada");
    if (finalConAdmin) {
        const { cita: citaFinal, tokenAdminB } = finalConAdmin;
        for (const accion of ["confirmar", "rechazar", "completar", "no-presentada", "cancelar"]) {
            r = await req("PUT", `/citas/${citaFinal._id}/${accion}`, { token: tokenAdminB });
            check(`Transición inválida: ${accion} sobre cita ${citaFinal.estado} -> 409`, r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
        }
        if (citaFinal.estado === "cancelada") {
            r = await req("PUT", `/citas/${citaFinal._id}/pago`, { token: tokenAdminB, body: { pagado: true } });
            check("Registrar el pago de una cita cancelada -> 409", r.status === 409, `${r.status}`);
            if (citaFinal.clienteId) {
                const clienteDueno = firmar({ id: citaFinal.clienteId, rol: "cliente", barberiaId: null });
                r = await req("POST", `/citas/${citaFinal._id}/resena`, { token: clienteDueno, body: { valoracion: 5 } });
                check("Reseña sobre una cita cancelada -> 409", r.status === 409, `${r.status}`);
            }
        }
    } else {
        console.log("SKIP  Transiciones desde estado final (no hay citas canceladas ni completadas)");
    }

    const ahoraMadrid = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).slice(0, 16).replace(" ", "T");
    const futuraConAdmin = citasConAdmin.find(({ cita }) => cita.estado === "confirmada" && `${cita.fecha}T${cita.horaInicio}` > ahoraMadrid);
    if (futuraConAdmin) {
        const { cita: citaFutura, tokenAdminB } = futuraConAdmin;
        r = await req("PUT", `/citas/${citaFutura._id}/completar`, { token: tokenAdminB });
        check("Completar una cita antes de su hora -> 409", r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("PUT", `/citas/${citaFutura._id}/no-presentada`, { token: tokenAdminB });
        check("Marcar no presentada antes de su hora -> 409", r.status === 409, `${r.status}`);
        r = await req("PUT", `/citas/${citaFutura._id}/confirmar`, { token: tokenAdminB });
        check("Aceptar una cita ya confirmada -> 409", r.status === 409, `${r.status}`);
        if (citaFutura.clienteId) {
            const clienteDueno = firmar({ id: citaFutura.clienteId, rol: "cliente", barberiaId: null });
            r = await req("POST", `/citas/${citaFutura._id}/resena`, { token: clienteDueno, body: { valoracion: 5 } });
            check("Reseña sobre una cita no completada -> 409", r.status === 409, `${r.status}`);
        }
    } else {
        console.log("SKIP  Asistencia prematura (no hay citas confirmadas futuras)");
    }

    r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberia._id}&incluirEnCurso[$ne]=x`);
    check("Disponibilidad con operador en incluirEnCurso -> se ignora (200)", r.status === 200, `${r.status}`);

    r = await req("PUT", "/citas/abc/rechazar", { token: adminReal });
    check("PUT /citas/abc/rechazar -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", "/citas/abc/no-presentada", { token: adminReal });
    check("PUT /citas/abc/no-presentada -> 400", r.status === 400, `${r.status}`);

    // --- Analíticas ---
    const rutaAnaliticas = `/citas/barberia/${barberia._id}/analiticas`;
    r = await req("GET", rutaAnaliticas);
    check("Analíticas sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("GET", rutaAnaliticas, { token: clienteFalso });
    check("Analíticas como cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", rutaAnaliticas, { token: adminAjeno });
    check("Analíticas como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=anio`, { token: adminReal });
    check("Analíticas con periodo inválido -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=mes&fecha=2026-02-30`, { token: adminReal });
    check("Analíticas con fecha imposible -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo[$ne]=x`, { token: adminReal });
    check("Analíticas con operador en query -> se ignora (periodo por defecto)", r.status === 200 && r.data?.periodo === "mes", `${r.status} ${r.data?.periodo}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=mes&periodo=dia`, { token: adminReal });
    check("Analíticas con periodo repetido (array) -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=semana&fecha=2026-09-29`, { token: adminReal });
    check("Admin propio: analíticas semanales -> 200 sin pw ni correo",
        r.status === 200 && r.data?.desde === "2026-09-28" && r.data?.hasta === "2026-10-04" && r.data?.serie?.length === 7
        && !/"pw"|"correo"/.test(JSON.stringify(r.data)),
        `${r.status} ${r.data?.desde}..${r.data?.hasta}`);
    for (const b of barberias) {
        const adminB = firmar({ id: await adminDe(b._id), rol: "admin", barberiaId: b._id });
        r = await req("GET", `/citas/barberia/${b._id}/analiticas?periodo=mes`, { token: adminB });
        check(`Analíticas mensuales de ${b.nombre} -> 200 (incluye cálculo de clientes recurrentes)`, r.status === 200, `${r.status} ${JSON.stringify(r.data?.error ?? "")}`);
    }
    // --- Etiquetas de estilo (tags) de la tarjeta de barbería ---
    const rutaBarberia = `/barberias/${barberia._id}`;
    r = await req("PUT", rutaBarberia, { body: { tags: ["urbana"] } });
    check("PUT /barberias/:id sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: ["urbana"] }, token: adminAjeno });
    check("PUT /barberias/:id como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: "urbana" }, token: adminReal });
    check("Tags como string (no array) -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: [{ $ne: null }] }, token: adminReal });
    check("Tags con operador Mongo dentro del array -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: Array(9).fill("estilo") }, token: adminReal });
    check("Tags con más de 8 elementos -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: ["a".repeat(25)] }, token: adminReal });
    check("Tag de más de 24 caracteres -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: ["<script>alert(1)</script>"] }, token: adminReal });
    check("Tag con HTML/script -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { modoConfirmacion: "siempre" }, token: adminReal });
    check("Modo de confirmación inventado -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { modoConfirmacion: { $ne: null } }, token: adminReal });
    check("Modo de confirmación con operador Mongo -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { modoConfirmacion: "manual" }, token: adminAjeno });
    check("Cambiar el modo de confirmación de otra barbería -> 403", r.status === 403, `${r.status}`);

    // --- Imágenes de la barbería: solo data URL de imagen y dentro de los límites (se rechazan antes de escribir)
    for (const [descripcion, cuerpo] of [
        ["logoUrl con javascript:", { logoUrl: "javascript:alert(1)" }],
        ["logoUrl con un SVG", { logoUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }],
        ["logoUrl con un enlace externo", { portadaUrl: "https://sitio-externo.example/p.png" }],
        ["logoUrl con operador $ne", { logoUrl: { $ne: null } }],
        ["galeriaTrabajos con operador $where", { galeriaTrabajos: { $where: "1" } }],
        ["galeriaTrabajos con 7 imágenes", { galeriaTrabajos: Array(7).fill("data:image/png;base64,AAAA") }],
        ["galeriaTrabajos con un elemento que no es imagen", { galeriaTrabajos: ["data:image/png;base64,AAAA", { $gt: "" }] }]
    ]) {
        r = await req("PUT", rutaBarberia, { body: cuerpo, token: adminReal });
        check(`Imágenes: el dueño envía ${descripcion} -> 400`, r.status === 400 && typeof r.data?.error === "string", `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("PUT", rutaBarberia, { body: { logoUrl: "data:image/png;base64,AAAA" }, token: adminAjeno });
    check("Imágenes: el dueño de otra barbería no puede cambiar el logo (IDOR) -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { logoUrl: "data:image/png;base64,AAAA" } });
    check("Imágenes: sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("PUT", "/usuarios/perfil", { token: propioToken, body: { avatar: "javascript:alert(1)" } });
    check("Imágenes: un avatar que no es una imagen -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", "/barberias");
    check("Listado público: ninguna barbería expone su galería ni su adminId", r.status === 200 && (r.data || []).every((b) => !("galeriaTrabajos" in b) && !("adminId" in b)), `${r.status}`);

    r = await req("GET", "/usuarios/", { token: adminReal });
    const ajenos = (r.data || []).filter((u) => u.barberiaId?.toString() !== barberia._id);
    check("Admin propio: GET /usuarios/ solo usuarios de su barbería", r.status === 200 && r.data.length > 0 && ajenos.length === 0 && r.data.every((u) => !("pw" in u)),
        `${r.status}, ${r.data?.length} usuarios, ${ajenos.length} ajenos`);

    // --- Escalada de privilegios en registro (se rechaza antes de tocar la BD)
    r = await req("POST", "/usuarios/registro", { body: { nombre: "x", apellido: "x", correo: "x@x.x", pw: "x", usuario: "x", rol: "admin" } });
    check("Registro con rol admin -> 400", r.status === 400 && r.data?.error === "Rol no válido", `${r.status} ${JSON.stringify(r.data)}`);

    // --- Activar o desactivar barberos (se rechaza antes de escribir)
    const rutaEstadoBarbero = `/barberias/${barberia._id}/barberos/${barbero._id}/estado`;
    r = await req("PUT", rutaEstadoBarbero, { body: { activo: false } });
    check("Desactivar barbero sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("PUT", rutaEstadoBarbero, { token: adminAjeno, body: { activo: false } });
    check("Desactivar barbero como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", rutaEstadoBarbero, { token: propioToken, body: { activo: false } });
    check("Desactivar barbero con rol barbero -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", rutaEstadoBarbero, { token: clienteFalso, body: { activo: false } });
    check("Desactivar barbero con rol cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", rutaEstadoBarbero, { token: adminReal, body: { activo: { $ne: null } } });
    check("Desactivar barbero con operador Mongo en activo -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("PUT", `/barberias/${barberia._id}/barberos/abc/estado`, { token: adminReal, body: { activo: false } });
    check("Desactivar barbero con id mal formado -> 400", r.status === 400, `${r.status}`);

    // --- Cambio de contraseña (se rechaza antes de escribir)
    r = await req("POST", "/usuarios/cambiar-contrasena", { body: { currentPassword: "x", newPassword: "NuevaClave1" } });
    check("Cambiar contraseña sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("POST", "/usuarios/cambiar-contrasena", { token: propioToken, body: { currentPassword: { $ne: null }, newPassword: "NuevaClave1" } });
    check("Cambiar contraseña con operador Mongo en la actual -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("POST", "/usuarios/cambiar-contrasena", { token: cuentaBorrada, body: { currentPassword: "Cualquiera1", newPassword: "NuevaClave1" } });
    check("Cambiar contraseña con token de una cuenta que ya no existe -> 401", r.status === 401 && r.data?.error === "La cuenta ya no existe", `${r.status} ${JSON.stringify(r.data)}`);

    // --- Cuenta eliminada: su token sigue firmado 24 h, pero ninguna ruta de escritura lo acepta
    const rutasEscritura = [
        ["POST", "/citas"], ["PUT", "/citas/avisos/leidos"], ["POST", "/citas/manual"], ["PUT", `/citas/${new ObjectId()}/cancelar`],
        ["PUT", "/usuarios/perfil"], ["DELETE", "/usuarios/perfil"], ["POST", "/solicitudes"], ["PUT", `/barberos/${new ObjectId()}`],
        ["POST", `/barberias/${new ObjectId()}/servicios`], ["PUT", "/barberias/mi/horario"], ["POST", "/barberias/invitaciones"]
    ];
    for (const [metodo, ruta] of rutasEscritura) {
        r = await req(metodo, ruta, { token: cuentaBorrada, body: {} });
        check(`Cuenta eliminada: ${metodo} ${ruta.replace(/[a-f0-9]{24}/g, ":id")} -> 401`, r.status === 401 && r.data?.error === "La cuenta ya no existe", `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("GET", "/barberias");
    check("Cuenta eliminada: las lecturas públicas siguen funcionando para todos -> 200", r.status === 200, `${r.status}`);

    // --- Eliminar la propia cuenta (RGPD): se rechaza antes de borrar nada
    const hayBarbero = async () => Boolean(await entorno.bd.collection("Usuarios").findOne({ _id: new ObjectId(barbero._id) }));
    r = await req("DELETE", "/usuarios/perfil", { body: { pw: "Cualquiera1" } });
    check("Eliminar cuenta sin token -> 401", r.status === 401, `${r.status}`);
    for (const [descripcion, cuerpo] of [
        ["sin contraseña", {}],
        ["con contraseña vacía", { pw: "" }],
        ["con operador $ne en pw", { pw: { $ne: null } }],
        ["con operador $gt en pw", { pw: { $gt: "" } }],
        ["con un array en pw", { pw: ["Cualquiera1"] }],
        ["con un número en pw", { pw: 12345678 }]
    ]) {
        r = await req("DELETE", "/usuarios/perfil", { token: propioToken, body: cuerpo });
        check(`Eliminar cuenta ${descripcion} -> 400 y la cuenta sigue existiendo`, r.status === 400 && await hayBarbero(), `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("DELETE", "/usuarios/perfil", { token: propioToken, body: { pw: "no-es-la-mia" } });
    check("Eliminar cuenta con contraseña incorrecta -> 401 y la cuenta sigue existiendo", r.status === 401 && await hayBarbero(), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("GET", "/usuarios/perfil/eliminacion");
    check("Resumen de eliminación sin token -> 401", r.status === 401, `${r.status}`);

    // DELETE /usuarios/:id solo lo usa el admin para dar de baja a un barbero de su equipo
    r = await req("DELETE", `/usuarios/${barbero._id}`, { token: propioToken });
    check("DELETE /usuarios/:id sobre uno mismo -> 403 (la cuenta propia se elimina desde el perfil)", r.status === 403 && await hayBarbero(), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("DELETE", `/usuarios/${barbero._id}`, { token: clienteFalso });
    check("DELETE /usuarios/:id de un barbero como cliente -> 403", r.status === 403 && await hayBarbero(), `${r.status}`);
    r = await req("DELETE", `/usuarios/${barbero._id}`, { token: adminAjeno });
    check("DELETE /usuarios/:id de un barbero como admin de otra barbería -> 403", r.status === 403 && await hayBarbero(), `${r.status}`);
    r = await req("DELETE", `/usuarios/${ID_CLIENTE_FALSO}`, { token: adminReal });
    check("DELETE /usuarios/:id de un cliente como admin -> 403 (solo se da de baja a barberos del equipo)", r.status === 403, `${r.status}`);
    r = await req("DELETE", `/usuarios/${ID_ADMIN_AJENO}`, { token: adminReal });
    check("DELETE /usuarios/:id de otro admin -> 403", r.status === 403, `${r.status}`);
    r = await req("DELETE", `/usuarios/${jwt.decode(adminReal).id}`, { token: adminReal });
    check("DELETE /usuarios/:id del propio admin -> 403", r.status === 403, `${r.status}`);

    // --- Avisos al cliente (RF12)
    r = await req("PUT", "/citas/avisos/leidos");
    check("Marcar avisos como leídos sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("PUT", "/citas/avisos/leidos", { token: propioToken });
    check("Marcar avisos como leídos como barbero -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", "/citas/avisos/leidos", { token: adminReal });
    check("Marcar avisos como leídos como admin -> 403", r.status === 403, `${r.status}`);

    // --- Consentimiento en el registro (RGPD): booleano estricto, rechazado antes de tocar la BD
    const clienteValido = { nombre: "x", apellido: "x", correo: "consent@x.test", pw: "abcdefg1", usuario: "consent_x", rol: "cliente", ciudad: "Madrid" };
    const MSG_CONSENT = "Debes aceptar la política de privacidad para registrarte";
    const sinUsuario = async (usuario) => (await entorno.bd.collection("Usuarios").countDocuments({ usuario })) === 0;
    for (const [descripcion, valor] of [["un operador $ne", { $ne: null }], ["el texto \"true\"", "true"], ["el número 1", 1]]) {
        r = await req("POST", "/usuarios/registro", { body: { ...clienteValido, aceptaPrivacidad: valor } });
        check(`Registro con aceptaPrivacidad = ${descripcion} -> 400 y no se crea la cuenta`, r.status === 400 && r.data?.error === MSG_CONSENT && await sinUsuario("consent_x"), `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("POST", "/barberias/registro", { body: { nombreBarberia: "Consent", direccion: "x", nombre: "x", apellido: "x", correo: "consent2@x.test", pw: "abcdefg1", usuario: "consent_b", aceptaPrivacidad: { $ne: null } } });
    check("Registro de barbería con aceptaPrivacidad = operador $ne -> 400 y no se crea nada",
        r.status === 400 && r.data?.error === MSG_CONSENT && await sinUsuario("consent_b") && await entorno.bd.collection("Barberias").countDocuments({ nombre: "Consent" }) === 0, `${r.status} ${JSON.stringify(r.data)}`);

    // --- Edición de perfil (se rechaza antes de escribir)
    r = await req("PUT", "/usuarios/perfil", { body: { nombre: "x" } });
    check("Editar perfil sin token -> 401", r.status === 401, `${r.status}`);
    const leerBarbero = () => entorno.bd.collection("Usuarios").findOne({ _id: new ObjectId(barbero._id) });
    const barberoAntes = JSON.stringify(await leerBarbero());
    for (const campo of ["usuario", "nombre", "apellido", "telefono", "avatar", "ciudad"]) {
        for (const operador of [{ $ne: null }, { $gt: "" }, { $where: "1" }]) {
            r = await req("PUT", "/usuarios/perfil", { token: propioToken, body: { [campo]: operador } });
            check(`Editar perfil con ${Object.keys(operador)[0]} en ${campo} -> 400 con el campo error`, r.status === 400 && typeof r.data?.error === "string", `${r.status} ${JSON.stringify(r.data)}`);
        }
        r = await req("PUT", "/usuarios/perfil", { token: propioToken, body: { [campo]: [{ $ne: null }] } });
        check(`Editar perfil con un array de operadores en ${campo} -> 400`, r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("PUT", "/usuarios/perfil", { token: propioToken, body: { usuario: "" } });
    check("Editar perfil con usuario vacío -> 400", r.status === 400 && r.data?.error === "Nombre de usuario no válido", `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("PUT", "/usuarios/perfil", { token: propioToken, body: { nombre: 123, telefono: { a: 1 } } });
    check("Editar perfil con nombre numérico y teléfono objeto -> 400", r.status === 400 && typeof r.data?.error === "string", `${r.status} ${JSON.stringify(r.data)}`);
    check("Editar perfil: los intentos rechazados no cambian nada en la BD", JSON.stringify(await leerBarbero()) === barberoAntes);

    // --- Datos personales del barbero (se rechaza antes de escribir)
    r = await req("PUT", `/barberos/${barbero._id}`, { body: { nombre: "x" } });
    check("PUT /barberos/:id sin token -> 401", r.status === 401, `${r.status}`);
    for (const campo of ["nombre", "apellido", "telefono", "avatar"]) {
        for (const operador of [{ $ne: null }, { $gt: "" }, { $where: "1" }]) {
            r = await req("PUT", `/barberos/${barbero._id}`, { token: propioToken, body: { [campo]: operador } });
            check(`PUT /barberos/:id con ${Object.keys(operador)[0]} en ${campo} -> 400 con el campo error`, r.status === 400 && typeof r.data?.error === "string", `${r.status} ${JSON.stringify(r.data)}`);
        }
    }
    r = await req("PUT", `/barberos/${barbero._id}`, { token: adminReal, body: { nombre: 123, telefono: { a: 1 } } });
    check("PUT /barberos/:id como dueño con nombre numérico y teléfono objeto -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("PUT", `/barberos/${barbero._id}`, { token: adminAjeno, body: { nombre: 123 } });
    check("PUT /barberos/:id como admin de otra barbería -> 403 antes de validar el cuerpo", r.status === 403, `${r.status}`);
    r = await req("PUT", `/barberos/${barbero._id}`, { token: propioToken, body: { nombre: "" } });
    check("PUT /barberos/:id con nombre vacío -> 400", r.status === 400 && r.data?.error === "El campo nombre no puede estar vacío", `${r.status} ${JSON.stringify(r.data)}`);
    check("PUT /barberos/:id: los intentos rechazados no cambian nada en la BD", JSON.stringify(await leerBarbero()) === barberoAntes);

    // --- IDs mal formados -> 400 (antes 500)
    r = await req("GET", "/usuarios/abc", { token: adminReal });
    check("GET /usuarios/abc -> 400", r.status === 400, `${r.status}`);
    r = await req("DELETE", "/usuarios/123", { token: adminReal });
    check("DELETE /usuarios/123 -> 400 sin llegar a BD", r.status === 400, `${r.status}`);
    r = await req("GET", "/barberias/no-es-un-id");
    check("GET /barberias/no-es-un-id -> 400", r.status === 400, `${r.status}`);

    // --- Contraseña mínima (se rechaza antes de tocar la BD)
    r = await req("POST", "/usuarios/registro", { body: { nombre: "x", apellido: "x", correo: "x@x.x", pw: "1234", usuario: "x", rol: "cliente", ciudad: "x" } });
    check("Registro con contraseña de 4 caracteres -> 400", r.status === 400 && /al menos 8/.test(r.data?.error), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("POST", "/usuarios/registro", { body: { nombre: "x", apellido: "x", correo: "x@x.xx", pw: "a1".repeat(50000), usuario: "x", rol: "cliente", ciudad: "x" } });
    check("Registro con contraseña de 100 KB -> 400 sin llegar a bcrypt ni a la BD", r.status === 400 && /demasiado larga/.test(r.data?.error), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("POST", "/barberias/registro", { body: { nombreBarberia: "x", direccion: "x", nombre: "x", apellido: "x", correo: "<script>@x", pw: "abcdefg1", usuario: "x" } });
    check("Registro de barbería con correo malformado -> 400 con mensaje fijo", r.status === 400 && JSON.stringify(r.data) === JSON.stringify({ error: "El correo electrónico no tiene un formato válido" }), `${r.status} ${JSON.stringify(r.data)}`);

    // --- Disponibilidad: barbero de otra barbería
    if (barberias.length > 1) {
        r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberias[1]._id}`);
        check("Disponibilidad con barbero de otra barbería -> 404", r.status === 404, `${r.status}`);
    }

    // --- Reserva fuera de horario (nunca se crea: la hora no está entre los huecos libres)
    const servicios = (await req("GET", `/barberias/${barberia._id}/servicios`)).data || [];
    // Siempre futura: con una fecha fija la reserva se rechazaría por fecha pasada antes de mirar el horario
    const fechaPrueba = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const dispo = (await req("GET", `/citas/disponibilidad/${barbero._id}/${fechaPrueba}?barberiaId=${barberia._id}`)).data;
    if (servicios.length && !dispo.horariosDisponibles.includes("03:00")) {
        r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioId: servicios[0]._id, fecha: fechaPrueba, horaInicio: "03:00" } });
        check("Reserva a las 03:00 (fuera de horario) -> 409", r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioId: "x", fecha: fechaPrueba, horaInicio: "10:00" } });
    check("Reserva con servicioId inválido -> 400", r.status === 400, `${r.status}`);
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioId: servicios[0]?._id, fecha: "mañana", horaInicio: "25:99" } });
    check("Reserva con fecha/hora mal formadas -> 400", r.status === 400, `${r.status}`);

    // --- Solicitudes con datos no válidos (se rechazan antes de insertar)
    const barberoToken = firmar({ id: barbero._id, rol: "barbero", barberiaId: barberia._id });
    if (barbero.rol === "barbero") {
        r = await req("POST", "/solicitudes", { token: barberoToken, body: { tipo: "hack", fechaInicio: "2026-10-05", fechaFin: "2026-10-05" } });
        check("Solicitud con tipo inventado -> 400", r.status === 400, `${r.status}`);
        r = await req("POST", "/solicitudes", { token: barberoToken, body: { tipo: "vacaciones", fechaInicio: "2020-01-01", fechaFin: "2035-01-01" } });
        check("Solicitud de 15 años de vacaciones -> 400", r.status === 400, `${r.status}`);
        r = await req("POST", "/solicitudes", { token: barberoToken, body: { tipo: "bloqueo_servicio", fechaInicio: "2026-10-05", fechaFin: "2026-10-05", servicioId: new ObjectId().toString() } });
        check("Bloqueo de servicio inexistente -> 400", r.status === 400, `${r.status}`);
        r = await req("PUT", `/barberos/${barbero._id}`, { token: barberoToken, body: { serviciosBloqueados: [] } });
        check("Barbero se auto-desbloquea servicios -> 403", r.status === 403, `${r.status}`);
    }

    // --- Citas con varios servicios y desbloqueo de servicios (solo validaciones, sin escrituras)
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberia._id}&duracion=abc`);
    check("Disponibilidad con duracion no numérica -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberia._id}&duracion[$gt]=0`);
    check("Disponibilidad con operador en duracion -> no 500", r.status !== 500, `${r.status}`);
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioIds: { $ne: null }, fecha: "2030-01-01", horaInicio: "10:00" } });
    check("Reserva con servicioIds como objeto -> 400", r.status === 400, `${r.status}`);
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioIds: ["abc"], fecha: "2030-01-01", horaInicio: "10:00" } });
    check("Reserva con servicioIds mal formados -> 400", r.status === 400, `${r.status}`);
    r = await req("DELETE", `/barberos/mi/servicios-bloqueados/${new ObjectId()}`, { token: clienteFalso });
    check("Desbloqueo de servicio con rol cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("DELETE", `/barberos/mi/servicios-bloqueados/${new ObjectId()}`, { token: adminAjeno });
    check("Desbloqueo de servicio con rol admin -> 403", r.status === 403, `${r.status}`);
    r = await req("DELETE", "/barberos/mi/servicios-bloqueados/abc", { token: propioToken });
    check("Desbloqueo de servicio con id mal formado -> 400", r.status === 400, `${r.status}`);

    // Días disponibles del mes: validaciones públicas (solo lecturas)
    const mesActualTexto = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }).slice(0, 7);
    for (const [mes, esperado] of [["2026-13", 400], ["abc", 400], ["2000-01", 400], ["2999-01", 400], [mesActualTexto, 200]]) {
        r = await req("GET", `/citas/disponibilidad/${barbero._id}/mes/${mes}?barberiaId=${barberia._id}`);
        check(`Días del mes con mes=${mes} -> ${esperado}`, r.status === esperado, `${r.status}`);
    }
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/mes/${mesActualTexto}?barberiaId=${barberia._id}&duracion=999999`);
    check("Días del mes con duración enorme -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/mes/${mesActualTexto}?barberiaId[$ne]=x`);
    check("Días del mes con operador en barberiaId -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/disponibilidad/abc/mes/${mesActualTexto}?barberiaId=${barberia._id}`);
    check("Días del mes con barbero mal formado -> 400", r.status === 400, `${r.status}`);

    // --- CORS
    r = await req("GET", "/barberias", { origin: "https://evil.example" });
    check("CORS: origen no permitido sin cabecera ACAO", !r.headers.get("access-control-allow-origin"), `${r.headers.get("access-control-allow-origin")}`);
    r = await req("GET", "/barberias", { origin: "http://localhost:4200" });
    check("CORS: localhost:4200 permitido", r.headers.get("access-control-allow-origin") === "http://localhost:4200", `${r.headers.get("access-control-allow-origin")}`);
    r = await req("GET", "/barberias", { origin: "capacitor://localhost" });
    check("CORS: capacitor://localhost permitido", r.headers.get("access-control-allow-origin") === "capacitor://localhost");
} finally {
    await entorno.cerrar();
}

terminar();
