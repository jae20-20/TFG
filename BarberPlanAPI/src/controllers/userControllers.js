//manejar http request - Usuarios
import { registrarError } from "../utils/registrarError.js";
import { responderErrorInterno } from "../middleware/errorMiddleware.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { POLITICA_VERSION, config } from "../config.js";
import {
    CAMPOS_TEXTO_PERSONA,
    MENSAJES_CREDENCIALES,
    MENSAJES_DUPLICADO,
    errorCamposTexto,
    errorConsentimiento,
    errorCuerpoNoObjeto,
    errorImagen,
    validarCorreo,
    validarPasswordNueva
} from "../middleware/validateMiddleware.js";
import {
    eliminarCuentaAdmin,
    eliminarCuentaBarbero,
    eliminarCuentaCliente,
    resumenBarberiaDelDuenio
} from "../models/cuentaModel.js";

import {
    addBarberoToBarberia,
    getBarberiaByAdminId,
    isUserAdminOfBarberia
} from "../models/barbershopModel.js";
import {
    consumeInvitacion,
    getInvitacionPendienteByHash,
    hashInvitationCode,
    normalizeInvitationCode
} from "../models/invitacionModel.js";
import {
    campoDuplicado,
    createUser,
    deleteUser,
    getUserByEmail,
    getUserById,
    getUserByUsername,
    getUsersByBarberiaId,
    normalizarCorreo,
    quitarServicioBloqueado,
    updateUserPassword,
    updateUserProfile,
    updateUser
} from "../models/userModel.js";

// Roles que se pueden elegir en el registro público. Los admin solo se crean
// junto a su barbería en POST /barberias/registro.
const ROLES_REGISTRO = ["cliente", "barbero"];

// Campos del barbero que gestiona el admin; el barbero los pide mediante solicitudes
const CAMPOS_SOLO_ADMIN = ["horarioPersonal", "diasLibres", "vacaciones", "serviciosBloqueados", "cargo"];

const esTextoNoVacio = (valor) => typeof valor === "string" && valor.trim().length > 0;

// Fecha "YYYY-MM-DD" y hora "HH:MM" actuales en Madrid (las citas se guardan en esa zona)
const momentoMadrid = (ahora) => ({
    fecha: ahora.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }),
    hora: ahora.toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false })
});

const firmarToken = (user) => jwt.sign(
    { id: user._id, correo: user.correo, rol: user.rol, barberiaId: user.barberiaId || null },
    config.jwtSecret,
    { expiresIn: config.jwtExpiracion }
);

// Admin de la barbería a la que pertenece el usuario objetivo (comprobado en BD, no en el JWT)
const esAdminDeLaBarberiaDe = async (reqUser, usuarioObjetivo) => {
    if (reqUser.rol !== "admin" || !usuarioObjetivo.barberiaId) return false;
    return await isUserAdminOfBarberia(reqUser.id, usuarioObjetivo.barberiaId.toString());
};

//****OBTENER USUARIOS *****

// Listar los usuarios de la barbería del admin autenticado
export const getUsers = async (req, res) => {
    try {
        const barberia = await getBarberiaByAdminId(req.user.id);
        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const users = await getUsersByBarberiaId(barberia._id);
        res.json(users);
    } catch (error) {
        registrarError("Error al obtener usuarios:", error);
        responderErrorInterno(res, error, "Error al obtener usuarios");
    }
};

// Obtener usuario por ID (el propio usuario o el admin de su barbería)
export const getUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await getUserById(id);

        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const esDuenio = user._id.toString() === req.user.id;
        const esAdminDeSuBarberia = await esAdminDeLaBarberiaDe(req.user, user);

        if (!esDuenio && !esAdminDeSuBarberia) {
            return res.status(403).json({ error: "No tienes permiso para ver este usuario" });
        }

        const { pw, ...userWithoutPw } = user;
        res.json(userWithoutPw);
    } catch (error) {
        registrarError("Error al obtener usuario:", error);
        responderErrorInterno(res, error, "Error al obtener usuario");
    }
};

// Obtener perfil del usuario autenticado
export const getProfile = async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        
        const { pw, ...userWithoutPw } = user;
        res.json(userWithoutPw);
    } catch (error) {
        registrarError("Error al obtener perfil:", error);
        responderErrorInterno(res, error, "Error al obtener perfil");
    }
};

// REGISTRO DE USUARIOS 

export const addUser = async (req, res) => {
    try {
        const { nombre, pw, apellido, usuario, rol, code, ciudad } = req.body;

        if (![nombre, req.body.correo, pw, apellido, usuario].every(esTextoNoVacio)) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        if (!ROLES_REGISTRO.includes(rol)) {
            return res.status(400).json({ error: "Rol no válido" });
        }

        if (rol === "cliente" && !esTextoNoVacio(ciudad)) {
            return res.status(400).json({ error: "La ciudad es obligatoria para el registro de clientes" });
        }

        const correo = normalizarCorreo(req.body.correo);

        const errorCredenciales = validarCorreo(correo) || validarPasswordNueva(pw) || errorConsentimiento(req.body);
        if (errorCredenciales) {
            return res.status(400).json({ error: errorCredenciales });
        }

        // Comprobación previa solo para responder rápido: la garantía real son los índices únicos (ver catch)
        const existingEmail = await getUserByEmail(correo);
        if (existingEmail) {
            return res.status(409).json({ error: MENSAJES_DUPLICADO.correo });
        }

        const existingUsername = await getUserByUsername(usuario);
        if (existingUsername) {
            return res.status(409).json({ error: MENSAJES_DUPLICADO.usuario });
        }

        let invitacion = null;
        let codigoHash = null;

        // Si es barbero → validar la invitación del admin (código de un solo uso)
        if (rol === "barbero") {
            const codigoNormalizado = normalizeInvitationCode(code);
            if (!codigoNormalizado) {
                return res.status(400).json({ error: "El código de invitación es obligatorio" });
            }

            codigoHash = hashInvitationCode(codigoNormalizado);
            invitacion = await getInvitacionPendienteByHash(codigoHash);

            if (!invitacion || invitacion.expiresAt < new Date()) {
                return res.status(404).json({ error: "Código de invitación inválido o caducado" });
            }
        }

        // Encriptar contraseña
        const salt = await bcrypt.genSalt(config.bcryptRondas);
        const hashedPassword = await bcrypt.hash(pw, salt);

        // El puesto ("cargo") nunca lo decide quien se registra: siempre viene
        // de la invitación creada por el admin, para que no pueda falsificarse.
        const newUser = await createUser({
            nombre,
            correo,
            pw: hashedPassword,
            apellido,
            usuario,
            rol,
            ciudad: rol === "cliente" ? ciudad : null,
            cargo: rol === "barbero" ? invitacion.cargo : null,
            barberiaId: invitacion ? invitacion.barberiaId : null,
            // Qué texto de la política se aceptó y cuándo (la versión la fija el servidor, no el cliente)
            consentimiento: { aceptadoEn: new Date(), version: POLITICA_VERSION },
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Si es barbero → consumir la invitación (de forma atómica) y añadirlo a la barbería
        if (rol === "barbero") {
            const invitacionConsumida = await consumeInvitacion(codigoHash, newUser.insertedId);

            if (!invitacionConsumida) {
                // La invitación se usó (o fue revocada) en la fracción de segundo
                // entre la validación y este punto: deshacemos la cuenta creada.
                await deleteUser(newUser.insertedId);
                return res.status(409).json({ error: "El código de invitación ya no está disponible" });
            }

            await addBarberoToBarberia(invitacion.barberiaId, newUser.insertedId);
        }

        res.status(201).json({ message: "Usuario creado correctamente" });

    } catch (error) {
        const duplicado = campoDuplicado(error);
        if (duplicado) {
            return res.status(409).json({ error: MENSAJES_DUPLICADO[duplicado] });
        }
        registrarError("Error al crear usuario:", error);
        responderErrorInterno(res, error, "Error al crear usuario");
    }
};

// LOGIN

export const loginUser = async (req, res) => {
    try {
        // Solo se aceptan strings: un objeto como {"$regex": "^a"} nunca llega a la consulta
        const correo = typeof req.body.correo === "string" ? normalizarCorreo(req.body.correo) : "";
        const pw = typeof req.body.pw === "string" ? req.body.pw : "";

        if (!correo || !pw) {
            return res.status(400).json({ error: "Formato de credenciales inválido" });
        }

        const user = await getUserByEmail(correo);
        const isPasswordValid = user ? await bcrypt.compare(pw, user.pw) : false;

        // Mismo mensaje en ambos casos para no revelar qué correos están registrados
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Correo o contraseña incorrectos" });
        }

        res.json({
            message: "Login exitoso",
            token: firmarToken(user),
            user: { 
                id: user._id,
                correo: user.correo,
                nombre: user.nombre,
                apellido: user.apellido,
                usuario: user.usuario,
                rol: user.rol,
                ciudad: user.ciudad || null,
                barberiaId: user.barberiaId || null
            },
        });

    } catch (error) {
        registrarError("Error en loginUser:", error);
        responderErrorInterno(res, error, "Error al iniciar sesión");
    }
};

// ACTUALIZAR PERFIL

export const editProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const errorCuerpo = errorCuerpoNoObjeto(req.body);
        if (errorCuerpo) {
            return res.status(400).json({ error: errorCuerpo });
        }

        // Solo texto: un objeto, un array o un número no llega a guardarse. Las cadenas vacías sirven para
        // borrar teléfono, avatar o ciudad; el nombre de usuario, como en el registro, no puede quedar vacío
        const errorTexto = errorCamposTexto(req.body, [...CAMPOS_TEXTO_PERSONA, "ciudad"]);
        if (errorTexto) {
            return res.status(400).json({ error: errorTexto });
        }

        const { nombre, apellido, usuario, telefono, avatar, ciudad } = req.body;
        if (usuario !== undefined && !esTextoNoVacio(usuario)) {
            return res.status(400).json({ error: "Nombre de usuario no válido" });
        }
        const errorAvatar = errorImagen(avatar, "avatar");
        if (errorAvatar) {
            return res.status(400).json({ error: errorAvatar });
        }

        // Comprobación previa solo para responder rápido: la garantía real es el índice único (ver catch)
        if (usuario) {
            const existingUser = await getUserByUsername(usuario);
            if (existingUser && existingUser._id.toString() !== userId) {
                return res.status(409).json({ error: MENSAJES_DUPLICADO.usuario });
            }
        }

        await updateUserProfile(userId, { nombre, apellido, usuario, telefono, avatar, ciudad });
        
        const updatedUser = await getUserById(userId);
        const { pw, ...userWithoutPw } = updatedUser;
        
        res.json({ message: "Perfil actualizado correctamente", user: userWithoutPw });
    } catch (error) {
        if (campoDuplicado(error) === "usuario") {
            return res.status(409).json({ error: MENSAJES_DUPLICADO.usuario });
        }
        registrarError("Error al actualizar perfil:", error);
        responderErrorInterno(res, error, "Error al actualizar perfil");
    }
};

// CAMBIAR CONTRASEÑA

export const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!esTextoNoVacio(currentPassword) || !esTextoNoVacio(newPassword)) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        const user = await getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const errorPassword = validarPasswordNueva(newPassword);
        if (errorPassword) {
            return res.status(400).json({ error: errorPassword });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.pw);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Contraseña actual incorrecta" });
        }

        // La actual ya está verificada: basta comparar los dos textos recibidos
        if (newPassword === currentPassword) {
            return res.status(400).json({ error: MENSAJES_CREDENCIALES.pwIgualActual });
        }

        const salt = await bcrypt.genSalt(config.bcryptRondas);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await updateUserPassword(userId, hashedPassword);

        // Las sesiones anteriores al cambio dejan de valer en las rutas de escritura: se devuelve un token
        // nuevo para que quien cambia la contraseña siga con su sesión
        res.json({ message: "Contraseña actualizada correctamente", token: firmarToken(user) });
    } catch (error) {
        registrarError("Error al cambiar contraseña:", error);
        responderErrorInterno(res, error, "Error al cambiar contraseña");
    }
};

// ELIMINAR USUARIO

// DELETE /usuarios/:id solo sirve para que el admin dé de baja a un barbero de su equipo.
// Cada persona elimina su propia cuenta con DELETE /usuarios/perfil (que pide la contraseña)
export const deleteUserAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await getUserById(id);

        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        if (user._id.toString() === req.user.id) {
            return res.status(403).json({ error: "Elimina tu propia cuenta desde tu perfil" });
        }

        // Comprobado en la BD: solo el admin de la barbería a la que pertenece el barbero
        if (user.rol !== "barbero" || !(await esAdminDeLaBarberiaDe(req.user, user))) {
            return res.status(403).json({ error: "No tienes permiso para eliminar este usuario" });
        }

        const ahora = new Date();
        const { citasCanceladas } = await eliminarCuentaBarbero(id, ahora, momentoMadrid(ahora));
        res.json({ message: "Usuario eliminado correctamente", citasCanceladas });
    } catch (error) {
        registrarError("Error al eliminar usuario:", error);
        responderErrorInterno(res, error, "Error al eliminar usuario");
    }
};

// Resumen de lo que se borraría al eliminar la cuenta (para el aviso previo de la app). Solo el dueño de una barbería
// tiene algo que avisar; el resto de roles recibe un resumen vacío
export const getResumenEliminacion = async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        const barberia = user.rol === "admin" ? await getBarberiaByAdminId(user._id) : null;
        res.json({ rol: user.rol, ...(barberia ? await resumenBarberiaDelDuenio(barberia, momentoMadrid(new Date())) : {}) });
    } catch (error) {
        registrarError("Error al preparar la eliminación de la cuenta:", error);
        responderErrorInterno(res, error, "Error al preparar la eliminación de la cuenta");
    }
};

// ELIMINAR MI CUENTA (RGPD, derecho de supresión). Pide la contraseña actual
// - Cliente: cancela sus citas futuras, anonimiza las pasadas y deja solo la puntuación de sus reseñas
// - Barbero: cancela sus citas futuras (avisando al cliente) y se le retira de la barbería
// - Dueño: elimina también su barbería; exige confirmarBarberia: true tras el aviso de la app
export const deleteMyAccount = async (req, res) => {
    try {
        const { pw, confirmarBarberia } = req.body ?? {};
        // Solo texto: un objeto como {"$ne": ""} no llega a bcrypt ni a ninguna consulta
        if (!esTextoNoVacio(pw)) {
            return res.status(400).json({ error: "Debes indicar tu contraseña actual" });
        }

        const user = await getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        if (!(await bcrypt.compare(pw, user.pw))) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        const ahora = new Date();
        const momento = momentoMadrid(ahora);

        if (user.rol === "admin") {
            const barberia = await getBarberiaByAdminId(user._id);
            if (barberia && confirmarBarberia !== true) {
                return res.status(400).json({ error: "Eliminar tu cuenta también elimina tu barbería. Confirma que lo entiendes" });
            }
            const resultado = barberia
                ? await eliminarCuentaAdmin(user._id, barberia, ahora, momento)
                : await eliminarCuentaBarbero(user._id, ahora, momento);
            return res.json({ message: "Cuenta eliminada correctamente", ...resultado });
        }

        const resultado = user.rol === "barbero"
            ? await eliminarCuentaBarbero(user._id, ahora, momento)
            : await eliminarCuentaCliente(user._id, ahora, momento);
        res.json({ message: "Cuenta eliminada correctamente", ...resultado });
    } catch (error) {
        registrarError("Error al eliminar la cuenta:", error);
        responderErrorInterno(res, error, "Error al eliminar la cuenta");
    }
};

// ACTUALIZAR HORARIO O PERFIL ESPECÍFICO DE BARBERO
export const updateBarberoHorario = async (req, res) => {
    try {
        const { id } = req.params;

        const barbero = await getUserById(id);
        if (!barbero) {
            return res.status(404).json({ error: "Barbero no encontrado" });
        }

        // El propio barbero, o el admin de la barbería a la que pertenece
        const esDuenio = barbero._id.toString() === req.user.id;
        const esAdminDeSuBarberia = await esAdminDeLaBarberiaDe(req.user, barbero);

        if (!esDuenio && !esAdminDeSuBarberia) {
            return res.status(403).json({ error: "No tienes permiso para actualizar este barbero" });
        }

        const errorValidacion = errorCuerpoNoObjeto(req.body) || errorCamposTexto(req.body, CAMPOS_TEXTO_PERSONA);
        if (errorValidacion) {
            return res.status(400).json({ error: errorValidacion });
        }
        const { horarioPersonal, diasLibres, vacaciones, nombre, apellido, telefono, avatar, serviciosBloqueados, cargo } = req.body;

        const errorAvatar = errorImagen(avatar, "avatar");
        if (errorAvatar) {
            return res.status(400).json({ error: errorAvatar });
        }

        // Horario, ausencias, servicios y cargo los decide el admin: el barbero
        // los pide mediante solicitudes, no puede aprobárselos a sí mismo.
        if (!esAdminDeSuBarberia && CAMPOS_SOLO_ADMIN.some((campo) => req.body[campo] !== undefined)) {
            return res.status(403).json({ error: "Solo el administrador puede modificar el horario, ausencias, servicios o cargo" });
        }

        const updatedData = {};
        if (horarioPersonal !== undefined) updatedData.horarioPersonal = horarioPersonal;
        if (diasLibres !== undefined) updatedData.diasLibres = diasLibres;
        if (vacaciones !== undefined) updatedData.vacaciones = vacaciones;
        if (nombre !== undefined) updatedData.nombre = nombre;
        if (apellido !== undefined) updatedData.apellido = apellido;
        if (telefono !== undefined) updatedData.telefono = telefono;
        if (avatar !== undefined) updatedData.avatar = avatar;
        if (serviciosBloqueados !== undefined) updatedData.serviciosBloqueados = serviciosBloqueados;
        if (cargo !== undefined) updatedData.cargo = cargo;
        updatedData.updatedAt = new Date();

        await updateUser(id, updatedData);

        res.json({ message: "Datos del barbero actualizados exitosamente" });
    } catch (error) {
        registrarError("Error al actualizar horario del barbero:", error);
        responderErrorInterno(res, error, "Error al actualizar horario del barbero");
    }
};

// El barbero vuelve a ofrecer un servicio que tenía bloqueado. Bloquear sigue requiriendo solicitud al admin;
// desbloquear no, porque solo amplía lo que el barbero ofrece
export const desbloquearMiServicio = async (req, res) => {
    try {
        const { servicioId } = req.params;
        const barbero = await quitarServicioBloqueado(req.user.id, servicioId);
        if (!barbero) {
            return res.status(409).json({ error: "Este servicio no estaba bloqueado" });
        }
        res.json({
            message: "Servicio desbloqueado. Los clientes ya pueden reservarlo contigo",
            serviciosBloqueados: barbero.serviciosBloqueados || []
        });
    } catch (error) {
        registrarError("Error al desbloquear servicio:", error);
        responderErrorInterno(res, error, "Error al desbloquear el servicio");
    }
};
