const Client = require("../models/Client");
const User = require("../models/User");
const Message = require("../models/Message");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET no está definido en las variables de entorno");
  process.exit(1);
}

const TOKEN_EXPIRY = "24h";

const normalizeEmail = (email) => (email || "").trim().toLowerCase();

const validatePassword = (password) => {
  if (!password || password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(password)) return "Debe contener al menos una mayúscula";
  if (!/[0-9]/.test(password)) return "Debe contener al menos un número";
  return null;
};

const buildToken = (user) => jwt.sign(
  { sub: user._id.toString(), role: user.role, id_owner: user.id_owner, salesMan: user.salesMan },
  JWT_SECRET,
  { expiresIn: TOKEN_EXPIRY }
);

const loginFailedMsg = { message: "Credenciales inválidas" };

const getClientsList = async (req, res) => {
  try {
    const clients = await Client.find({ id_owner: String(req.body.id_owner) }).populate("salesMan");
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener los clientes." });
  }
};

const postNewAccountUser = async (req, res) => {
  try {
    const { email, password, role, id_owner, active, region, salesMan } = req.body;

    if (!email || !password) return res.status(400).json({ message: "Email y contraseña son requeridos" });

    const passError = validatePassword(password);
    if (passError) return res.status(400).json({ message: passError });

    const normalized = normalizeEmail(email);
    const exists = await Client.findOne({ email: normalized });
    if (exists) return res.status(409).json({ message: "El correo ya está registrado" });

    const client = new Client({
      email: normalized,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      role: role || "SALES",
      id_owner,
      active: active !== undefined ? active : true,
      region,
      salesMan: salesMan ? new mongoose.Types.ObjectId(salesMan) : undefined,
    });

    const saved = await client.save();
    res.status(201).json({
      id: saved._id,
      email: saved.email,
      active: saved.active,
      role: saved.role,
      region: saved.region,
      id_owner: saved.id_owner,
      salesMan: saved.salesMan,
    });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "El correo ya está registrado" });
    res.status(500).json({ message: "Error al crear la cuenta" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email y contraseña requeridos" });

    const user = await Client.findOne({ email: normalizeEmail(email) }).populate("salesMan");
    if (!user) return res.status(401).json(loginFailedMsg);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json(loginFailedMsg);

    const token = buildToken(user);
    res.json({ message: "Login successful", user, token });
  } catch (error) {
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

const getUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email y contraseña requeridos" });

    const user = await Client.findOne({ email: normalizeEmail(email) });
    if (!user) return res.status(401).json(loginFailedMsg);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json(loginFailedMsg);

    const token = buildToken(user);
    res.json({
      usuarioDB: { _id: user._id, id_owner: user.id_owner, salesMan: user.salesMan, role: user.role, email: user.email },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: "Datos incompletos" });

    const passError = validatePassword(newPassword);
    if (passError) return res.status(400).json({ message: passError });

    const user = await Client.findOne({ email: normalizeEmail(email) });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (oldPassword) {
      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match) return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }

    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error del servidor" });
  }
};

function auth(req, res, next) {
  const header = req.header("Authorization") || req.header("x-auth-token");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) return res.status(401).json({ message: "Acceso denegado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (ex) {
    res.status(401).json({ message: "Token inválido o expirado" });
  }
}

const getClients = async (req, res) => {
  try {
    const { id_owner, sales_id, region, clientName, page, limit } = req.body;
    let filter = { id_owner };
    if (sales_id) filter.sales_id = sales_id;
    if (region) filter.region = region;
    let clientList = await User.find(filter).populate("sales_id").populate("client_location");
    if (clientName) {
      const q = clientName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      clientList = clientList.filter((c) => {
        const n = (c.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const l = (c.lastName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return n.includes(q) || l.includes(q);
      });
    }
    const start = (page - 1) * limit;
    const paginated = limit > 0 ? clientList.slice(start, start + limit) : clientList;
    res.json({ clients: paginated, totalPages: limit > 0 ? Math.ceil(clientList.length / limit) : 1, currentPage: page, totalItems: clientList.length });
  } catch (error) {
    res.status(500).json({ message: "Error al obtener clientes" });
  }
};

const getClientsArchived = async (req, res) => {
  try {
    const clientList = await User.find({ id_owner: String(req.body.id_owner), status: "ARCHIVED" }).populate("chat");
    res.json(clientList);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener archivados" });
  }
};

const getClientInfoById = async (req, res) => {
  try {
    const clientList = await User.find({ id_user: String(req.body.id_user) });
    res.json(clientList);
  } catch (error) {
    res.status(500).json({ message: "Error en la búsqueda" });
  }
};

const getClientInfoByIdAndSales = async (req, res) => {
  try {
    const { id_user, salesId, page, limit, search } = req.body;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { id_owner: String(id_user), sales_id: new mongoose.Types.ObjectId(salesId) };
    const s = String(search || "").trim();
    if (s) {
      const safe = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$expr = { $regexMatch: { input: { $concat: ["$name", " ", "$lastName"] }, regex: new RegExp(safe, "i") } };
    }
    const [clientList, totalClients] = await Promise.all([
      User.find(query).populate("client_location").skip(skip).limit(parseInt(limit)),
      User.countDocuments(query),
    ]);
    res.json({ data: clientList, totalPages: Math.ceil(totalClients / parseInt(limit)), currentPage: parseInt(page), totalClients });
  } catch (error) {
    res.status(500).json({ message: "Error al buscar clientes" });
  }
};

const postClient = async (req, res) => {
  try {
    const client = new User({
      name: req.body.name, lastName: req.body.lastName,
      profilePicture: req.body.profilePicture, icon: req.body.icon,
      directionId: "", number: req.body.number,
      identityNumber: req.body.identityNumber, company: req.body.company,
      email: req.body.email, socialNetwork: req.body.socialNetwork,
      notes: req.body.notes, id_user: req.body.id_user,
      id_owner: req.body.id_owner, status: "SHOW", chat: req.body.chat,
      userCategory: req.body.userCategory,
      client_location: new mongoose.Types.ObjectId(req.body.directionId),
      sales_id: new mongoose.Types.ObjectId(req.body.sales_id),
      region: req.body.region, identificationImage: req.body.identificationImage,
    });
    await client.save();
    res.status(201).json({ message: "Cliente registrado correctamente" });
  } catch (e) {
    res.status(500).json({ message: "Error al registrar cliente" });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const updated = await User.findOneAndUpdate({ id_user: req.body.id_user }, { status: req.body.status }, { new: true });
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Estado actualizado", user: updated });
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar estado" });
  }
};

const updateUserFile = async (req, res) => {
  try {
    const { id_user, name, lastName, number, company, email, directionId } = req.body;
    const updated = await User.findOneAndUpdate({ id_user }, { name, lastName, number, company, email, directionId }, { new: true });
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Usuario actualizado", user: updated });
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar" });
  }
};

const getMessagesById = async (req, res) => {
  try {
    const msgs = await Message.find({ id_message: String(req.body.id_message) });
    res.json(msgs);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener mensajes" });
  }
};

const deleteClient = async (req, res) => {
  try {
    const result = await User.deleteOne({ id_user: req.body.id_user });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Cliente no encontrado" });
    res.json({ message: "Cliente eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar" });
  }
};

const updateClient = async (req, res) => {
  try {
    const { _id, name, lastName, sales_id, id_owner } = req.body;
    if (!_id) return res.status(400).json({ message: "El campo _id es obligatorio" });
    const updated = await User.findByIdAndUpdate(
      { _id, id_owner },
      { $set: { name, lastName, sales_id: new mongoose.Types.ObjectId(sales_id) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Cliente no encontrado" });
    res.status(200).json({ message: "Cliente actualizado", client: updated });
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar cliente" });
  }
};

module.exports = {
  postNewAccountUser, updateClient, loginUser, resetPassword,
  getClientsList, auth, getUser, getClientInfoByIdAndSales,
  getClients, getClientsArchived, getMessagesById,
  getClientInfoById, postClient, updateUserFile,
  updateUserStatus, deleteClient,
};