//manejar http request - Usuarios
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
    CAMPOS_TEXTO_PERSONA,
    MENSAJES_CREDENCIALES,
    MENSAJES_DUPLICADO,
    errorCamposTexto,
    errorCuerpoNoObjeto,
    validarCorreo,
    validarPasswordNueva
} from "../middleware/validateMiddleware.js";

import {
    addBarberoToBarberia,
    getBarberiaByAdminId,
    isUserAdminOfBarberia,
    removeBarberoFromBarberia
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
        console.error("Error al obtener usuarios:", error);
        res.status(500).json({ error: "Error al obtener usuarios" });
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
        console.error("Error al obtener usuario:", error);
        res.status(500).json({ error: "Error al obtener usuario" });
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
        console.error("Error al obtener perfil:", error);
        res.status(500).json({ error: "Error al obtener perfil" });
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

        const errorCredenciales = validarCorreo(correo) || validarPasswordNueva(pw);
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
        const salt = await bcrypt.genSalt(10);
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
        console.error("Error al crear usuario:", error);
        res.status(500).json({ error: "Error al crear usuario" });
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

        // Generar el token JWT
        const token = jwt.sign(
            { 
                id: user._id,
                correo: user.correo,
                rol: user.rol,
                barberiaId: user.barberiaId || null
            },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            message: "Login exitoso",
            token,
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
        console.error("Error en loginUser:", error);
        res.status(500).json({ error: "Error al iniciar sesión" });
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
        console.error("Error al actualizar perfil:", error);
        res.status(500).json({ error: "Error al actualizar perfil" });
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

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await updateUserPassword(userId, hashedPassword);

        res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
        console.error("Error al cambiar contraseña:", error);
        res.status(500).json({ error: "Error al cambiar contraseña" });
    }
};

// ELIMINAR USUARIO

export const deleteUserAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await getUserById(id);

        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        // El propio usuario, o el admin de su barbería (nunca sobre otro admin)
        const esDuenio = user._id.toString() === req.user.id;
        const esAdminDeSuBarberia = user.rol !== "admin" && await esAdminDeLaBarberiaDe(req.user, user);

        if (!esDuenio && !esAdminDeSuBarberia) {
            return res.status(403).json({ error: "No tienes permiso para eliminar este usuario" });
        }

        // Borrar al admin dejaría su barbería sin nadie que pueda gestionarla
        if (user.rol === "admin" && await getBarberiaByAdminId(id)) {
            return res.status(409).json({ error: "No puedes eliminar la cuenta mientras administres una barbería" });
        }

        if (user.rol === "barbero" && user.barberiaId) {
            await removeBarberoFromBarberia(user.barberiaId, user._id);
        }

        await deleteUser(id);
        res.json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ error: "Error al eliminar usuario" });
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
        console.error("Error al actualizar horario del barbero:", error);
        res.status(500).json({ error: "Error al actualizar horario del barbero" });
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
        console.error("Error al desbloquear servicio:", error);
        res.status(500).json({ error: "Error al desbloquear el servicio" });
    }
};
