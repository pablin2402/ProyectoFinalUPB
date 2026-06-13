const mongoose = require("mongoose");
const CurrentLocation = require("../models/CurrentLocation");

const postCurrentLocation = (req, res) => {
    try {
        const client = new CurrentLocation({
            salesManId: req.body.salesManId ? new mongoose.Types.ObjectId(req.body.salesManId) : null,
            delivery: req.body.delivery ? new mongoose.Types.ObjectId(req.body.delivery) : null,
            longitud: req.body.longitud,
            latitud: req.body.latitud,
            Timestamp: req.body.Timestamp,
            id_owner: req.body.id_owner,
            longitudDestiny: req.body.longitudDestiny,
            latitudDestiny: req.body.latitudDestiny,
            deliveryInWay: req.body.deliveryInWay
        });
        client.save((err, client) => {
            if (err) {
                console.error("Error al guardar delivery:", err);
                return res.status(500).send({ message: err.message });
            }
            res.status(201).send({
                salesManId: client.salesManId,
                delivery: client.delivery,
                longitud: client.longitud,
                latitud: client.latitud,
                Timestamp: client.Timestamp,
                id_owner: client.id_owner,
                longitudDestiny: client.longitudDestiny,
                latitudDestiny: client.latitudDestiny,
                deliveryInWay: client.deliveryInWay
            });
        });
    } catch (e) {
        console.error("Error en postNewDelivery:", e);
        res.status(500).send({ message: "Error interno en servidor", error: e.message });
    }
};
const getLastLocation = async (req, res) => {
    try {
        const { id_owner } = req.body;
        if (!id_owner) return res.status(400).json({ message: "Falta id_owner" });

        const results = await CurrentLocation.aggregate([
            { $match: { id_owner } },
            { $sort: { Timestamp: -1 } },
            {
                $group: {
                    _id: "$delivery",
                    doc: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$doc" }
            },
            {
                $lookup: {
                    from: "deliveries",
                    localField: "delivery",
                    foreignField: "_id",
                    as: "delivery"
                }
            },
            {
                $unwind: {
                    path: "$delivery",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "salesmen",
                    localField: "salesManId",
                    foreignField: "_id",
                    as: "salesManId"
                }
            },
            {
                $unwind: {
                    path: "$salesManId",
                    preserveNullAndEmptyArrays: true
                }
            }
        ]);

        res.json(results);
    } catch (e) {
        console.error("Error al obtener ubicaciones:", e);
        res.status(500).json({ message: "Error interno", error: e.message });
    }
};
const getLocationsByDayGrouped = async (req, res) => {
    try {
      const { id_owner } = req.body;
      if (!id_owner) return res.status(400).json({ message: "Falta id_owner" });
  
      const start = new Date();
      start.setHours(0, 0, 0, 0);
  
      const end = new Date();
      end.setHours(23, 59, 59, 999);
  
      const results = await CurrentLocation.aggregate([
        {
          $match: {
            id_owner,
            Timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $sort: { Timestamp: 1 } 
        },
        {
          $group: {
            _id: "$delivery",       
            path: { $push: "$$ROOT" } 
          }
        },
        {
          $lookup: {
            from: "deliveries",
            localField: "_id",
            foreignField: "_id",
            as: "delivery"
          }
        },
        {
          $unwind: {
            path: "$delivery",
            preserveNullAndEmptyArrays: true
          }
        }
      ]);
  
      res.json(results);
    } catch (e) {
      console.error("Error al obtener ubicaciones agrupadas:", e);
      res.status(500).json({ message: "Error interno", error: e.message });
    }
  };
  


module.exports = {
    postCurrentLocation, getLastLocation, getLocationsByDayGrouped
};
