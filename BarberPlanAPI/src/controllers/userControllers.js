//manejar http request
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { createUser, getAllUsers } from "../models/userModel.js";

export const getUsers = async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener usuarios" });
    }
};

export const addUser = async (req, res) => {
    try {
        const { nombre, correo, pw, apellido, usuario } = req.body;

        if (!nombre || !correo || !pw || !apellido || !usuario) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }
        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pw, salt);
        
        const newUser = await createUser({
            nombre,
            correo,
            pw: hashedPassword,
            apellido,
            usuario
        });
            
        res.status(201).json({ message: "Usuario creado", id: newUser.insertedId });
    } catch (error) {
        res.status(400).json({ error: "Error al crear usuario" });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { correo, pw } = req.body;

        console.log("Datos recibidos:", { correo, pw }); 

        // Validar que se envíen las credenciales
        if (!correo || !pw) {
            console.error("Error: Campos obligatorios faltantes");
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        // Buscar al usuario por correo
        const users = await getAllUsers();
        console.log("Usuarios obtenidos de la base de datos:", users);

        const user = users.find(u => u.correo === correo);
        console.log("Usuario encontrado:", user);

        if (!user) {
            console.error("Error: Usuario no encontrado");
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        // Comparar contraseñas
        const isPasswordValid = await bcrypt.compare(pw, user.pw);
        console.log("¿Contraseña válida?:", isPasswordValid);

        if (!isPasswordValid) {
            console.error("Error: Contraseña incorrecta");
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        // Generar un token JWT
        const token = jwt.sign({ id: user._id, correo: user.correo }, process.env.JWT_SECRET, {
            expiresIn: "1h",
        });
        console.log("Token generado:", token); 

        // Responder con éxito
        res.json({ message: "Login exitoso", token });
    } catch (error) {
        console.error("Error en loginUser:", error);
        res.status(500).json({ error: "Error al iniciar sesión" });
    }
};