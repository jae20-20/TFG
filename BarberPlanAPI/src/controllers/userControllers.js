//manejar http request - Usuarios
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { addBarberoToBarberia, getBarberiaByCode } from "../models/barbershopModel.js";
import {
  createUser,
  deleteUser,
  getAllUsers,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  updateUserPassword,
  updateUserProfile
} from "../models/userModel.js";

// ==================== OBTENER USUARIOS ====================

export const getUsers = async (req, res) => {
    try {
        const users = await getAllUsers();
        // Excluir contraseñas de la respuesta
        const usersWithoutPw = users.map(({ pw, ...user }) => user);
        res.json(usersWithoutPw);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener usuarios" });
    }
};

// Obtener usuario por ID
export const getUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await getUserById(id);
        
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        
        const { pw, ...userWithoutPw } = user;
        res.json(userWithoutPw);
    } catch (error) {
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
        res.status(500).json({ error: "Error al obtener perfil" });
    }
};

// ==================== REGISTRO DE USUARIOS ====================

export const addUser = async (req, res) => {
    try {
        const { nombre, correo, pw, apellido, usuario, rol, code } = req.body;

        if (!nombre || !correo || !pw || !apellido || !usuario || !rol) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        // Verificar si el correo ya existe
        const existingEmail = await getUserByEmail(correo);
        if (existingEmail) {
            return res.status(400).json({ error: "El correo ya está registrado" });
        }

        // Verificar si el usuario ya existe
        const existingUsername = await getUserByUsername(usuario);
        if (existingUsername) {
            return res.status(400).json({ error: "El nombre de usuario ya está en uso" });
        }

        let barberia = null;

        // Si es barbero → validar código
        if (rol === "barbero") {
            if (!code) {
                return res.status(400).json({ error: "El código de barbería es obligatorio" });
            }

            barberia = await getBarberiaByCode(code);
            if (!barberia) {
                return res.status(404).json({ error: "Código de barbería inválido" });
            }
        }

        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pw, salt);

        const newUser = await createUser({
            nombre,
            correo,
            pw: hashedPassword,
            apellido,
            usuario,
            rol,
            barberiaId: barberia ? barberia._id : null,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Si es barbero → añadirlo a la barbería
        if (rol === "barbero") {
            await addBarberoToBarberia(barberia._id, newUser.insertedId);
        }

        res.status(201).json({ message: "Usuario creado correctamente" });

    } catch (error) {
        console.error("Error al crear usuario:", error);
        res.status(500).json({ error: "Error al crear usuario" });
    }
};

// ==================== LOGIN ====================

export const loginUser = async (req, res) => {
    try {
        const { correo, pw } = req.body;

        if (!correo || !pw) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        const user = await getUserByEmail(correo);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const isPasswordValid = await bcrypt.compare(pw, user.pw);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
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
                barberiaId: user.barberiaId || null
            },
        });

    } catch (error) {
        console.error("Error en loginUser:", error);
        res.status(500).json({ error: "Error al iniciar sesión" });
    }
};

// ==================== ACTUALIZAR PERFIL ====================

export const editProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { nombre, apellido, usuario, telefono, avatar } = req.body;

        // Verificar si el nuevo nombre de usuario ya existe
        if (usuario) {
            const existingUser = await getUserByUsername(usuario);
            if (existingUser && existingUser._id.toString() !== userId) {
                return res.status(400).json({ error: "El nombre de usuario ya está en uso" });
            }
        }

        await updateUserProfile(userId, { nombre, apellido, usuario, telefono, avatar });
        
        const updatedUser = await getUserById(userId);
        const { pw, ...userWithoutPw } = updatedUser;
        
        res.json({ message: "Perfil actualizado correctamente", user: userWithoutPw });
    } catch (error) {
        console.error("Error al actualizar perfil:", error);
        res.status(500).json({ error: "Error al actualizar perfil" });
    }
};

// ==================== CAMBIAR CONTRASEÑA ====================

export const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        const user = await getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.pw);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Contraseña actual incorrecta" });
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

// ==================== ELIMINAR USUARIO ====================

export const deleteUserAccount = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Solo el admin o el propio usuario pueden eliminar
        if (req.user.rol !== "admin" && req.user.id !== id) {
            return res.status(403).json({ error: "No tienes permiso para eliminar este usuario" });
        }

        const result = await deleteUser(id);
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ error: "Error al eliminar usuario" });
    }
};