const Administrator = require("../models/Administrators");
const mongoose = require("mongoose");

const postNewAccount = (req, res) => {
  try {
   const client = new Administrator({
        active: req.body.active,
        id_owner: req.body.id_owner,
        salesId: new mongoose.Types.ObjectId(req.body.salesId)
    });
    client.save((err,client) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }
      res.status(200, 204).send({
        id_owner: client.id_owner,
        salesId: client.salesId
      });
    });
  } catch (e) {
    myConsole.log(e);
  }
};
const getClientsList = async (req, res) => {
    try {
      const clients = await Administrator.find({ id_owner: String(req.body.id_owner) })
        .populate("salesId"); 
  
      res.json(clients);
    } catch (error) {
      console.error("Error al obtener la lista de clientes:", error);
      res.status(500).json({ message: "Error al obtener los clientes." });
    }
  };
  
module.exports = {
    postNewAccount,
    getClientsList
};
  