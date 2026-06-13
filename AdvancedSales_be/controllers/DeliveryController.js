const Delivery = require("../models/Delivery");
const mongoose = require("mongoose");
const DeliveryOrderPickUp = require("../models/DeliverOrderPickUp");

const postNewDelivery = (req, res) => {
  try {
   const client = new Delivery({
        fullName: req.body.fullName,
        lastName:req.body.lastName,
        email: req.body.email,
        id_owner: req.body.id_owner,
        phoneNumber: req.body.phoneNumber,
        client_location:  new mongoose.Types.ObjectId(req.body.client_location),
        identificationNumber: req.body.identificationNumber,
        region: req.body.region,
        identificationImage: req.body.identificationImage,
        active: true
    });
    client.save((err,client) => {
      if (err) {
        console.error("Error al guardar delivery:", err);
        return res.status(500).send({ message: err.message });
      }
      
      res.status(201).send({
        _id: client._id,
        fullName: client.fullName,
        lastName:client.lastName,
        email: client.email,
        id_owner: client.id_owner,
        phoneNumber: client.phoneNumber,
        identificationNumber: client.identificationNumber,
        client_location: client.client_location,
        identificationImage: client.identificationImage

      });
    });
  } catch (e) {
    console.error("Error en postNewDelivery:", e);
    res.status(500).send({ message: "Error interno en servidor", error: e.message });
  }
  
};
const getDeliveryOrderPickUpByOrderId = async (req, res) => {
  try {
    
    const { orderId, id_owner } = req.body;
    if (!orderId || !id_owner) {
      return res.status(400).json({ message: "Faltan campos requeridos: orderId o id_owner" });
    }

    const result = await DeliveryOrderPickUp.findOne({
      orderId: new mongoose.Types.ObjectId(orderId),
      id_owner: id_owner
    })
    .populate("delivery")
    .populate("orderId");

    if (!result) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Error al buscar delivery pick-up:", error);
    res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
};

const postDeliveryOrderPickUp = (req, res) => {
  try {
   const client = new DeliveryOrderPickUp({
        clientName:  req.body.clientName,
        delivery:  new mongoose.Types.ObjectId(req.body.delivery),
        longitud: req.body.longitud,
        latitud: req.body.latitud,
        orderId:  new mongoose.Types.ObjectId(req.body.orderId),
        image: req.body.image,
        id_owner: req.body.id_owner
    });
    client.save((err,client) => {
      if (err) {
        console.error("Error al guardar delivery:", err);
        return res.status(500).send({ message: err.message });
      }
      
      res.status(201).send({
        id_owner: client.id_owner,
        clientName:  client.clientName,
        delivery:  client.delivery,
        longitud:client.longitud,
        latitud: client.latitud,
        orderId: client.orderId,
        image: client.image,

      });
    });
  } catch (e) {
    res.status(500).send({ message: "Error interno en servidor", error: e.message });
  }
  
};
const getDelivery = async (req, res) => {
    try {
      const { id_owner, page, limit, searchTerm,active} = req.body;
  
      const matchStage = {
        id_owner: String(id_owner)
      };
      if (active === true) {
        matchStage.active = true;
      }
      const aggregatePipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userId"
          }
        },
        {
            $unwind: {
              path: "$userId",
              preserveNullAndEmptyArrays: true
            }
          }
              ];
  
      if (searchTerm && searchTerm.trim() !== "") {
        const searchRegex = new RegExp(searchTerm.trim(), "i");
        aggregatePipeline.push({
          $match: {
            $or: [
              { "userId.fullName": { $regex: searchRegex } },
              { "userId.lastName": { $regex: searchRegex } }
            ]
          }
        });
      }
      
  
      aggregatePipeline.push(
        {
          $lookup: {
            from: "clientlocations",
            localField: "client_location",
            foreignField: "_id",
            as: "client_location"
          }
        },
        {
          $unwind: {
            path: "$client_location",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $facet: {
            metadata: [
              { $count: "total" },
              {
                $addFields: {
                  page: Number(page),
                  limit: Number(limit)
                }
              }
            ],
            data: [
              { $skip: (Number(page) - 1) * Number(limit) },
              { $limit: Number(limit) }
            ]
          }
        }
      );
  
      const result = await Delivery.aggregate(aggregatePipeline);
  
      const metadata = result[0].metadata[0] || { total: 0, page: Number(page), limit: Number(limit) };
      const deliveries = result[0].data;
  
      res.json({
        data: deliveries,
        items: metadata.total,
        page: metadata.page,
        totalPages: Math.ceil(metadata.total / metadata.limit)
      });
    } catch (error) {
      console.error("Error al obtener entregas:", error);
      res.status(500).json({ message: "Error al obtener entregas", error });
    }
};
const getDeliveryById = async (req, res) => {
  try {
    const salesMan = await Delivery.findOne({
      _id: new mongoose.Types.ObjectId(req.body._id),
      id_owner: String(req.body.id_owner)
    })
    .populate("client_location")
    
    if (!salesMan) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }
    res.json(salesMan);
  } catch (error) {
    res.status(500).json({ message: "Error en la búsqueda", error });
  }
};
const getDeliveryLocation = async (req, res) => {
    await Delivery.find({id_owner:String(req.body.id_owner)}).populate("client_location").then(p=>  res.json(p));
};
const uploadDeliveryStatus = async (req, res) => {
  try {
    const salesman = await Delivery.findByIdAndUpdate(
      { _id: new mongoose.Types.ObjectId(req.body._id) },
      { active: req.body.active },
      { new: true }
    );
    if (!salesman) {
      return res.status(404).json({ message: 'Delivery no encontrado' });
    }
    res.json(salesman);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar', error });
  }
}; 

module.exports = {
    postNewDelivery,
    getDelivery,
    getDeliveryById,
    getDeliveryLocation,
    postDeliveryOrderPickUp,
    getDeliveryOrderPickUpByOrderId,
    uploadDeliveryStatus
};
  