const User = require("../models/User");
const ClientLocation = require("../models/ClientLocation");
const mongoose = require("mongoose");


const escapeRegex = (str = "") =>
    String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (body) => {
    const page = Math.max(parseInt(body.page) || 1, 1);

    const limit = Math.max(
        parseInt(body.limit) || 100,
        1
    );

    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const buildSearchQuery = (nameClient) => {
    if (!nameClient || !nameClient.trim()) return null;

    const term = escapeRegex(nameClient.trim());
    const regex = { $regex: term, $options: "i" };

    return {
        $or: [
            { name: regex },
            { lastName: regex },
            { company: regex },
            { email: regex },
            { nit: regex },
            { phoneNumber: regex },
            { identification: regex },
        ],
    };
};

const SORT_FIELDS = {
    name: { name: 1, lastName: 1 },
    nameDesc: { name: -1, lastName: -1 },
    creationDate: { creationDate: -1 },
    creationDateAsc: { creationDate: 1 },
    lastOrder: { lastOrderDate: -1 },
    company: { company: 1 },
};

const getClientLocationById = async (req, res) => {
    try {
        const {
            id_owner,
            nameClient,
            salesCategory,
            userCategory,
            sortBy = "name",
            hasLocation,
            daysWithoutOrder,
            channel,
        } = req.body;

        if (!id_owner) {
            return res.status(400).json({ message: "id_owner is required" });
        }

        const { page, limit, skip } = parsePagination(req.body);

        const query = { id_owner: String(id_owner) };

        if (salesCategory && mongoose.Types.ObjectId.isValid(salesCategory)) {
            query.sales_id = new mongoose.Types.ObjectId(salesCategory);
        }

        if (userCategory && typeof userCategory === "string" && userCategory.trim()) {
            query.userCategory = userCategory.trim();
        }

        if (channel && Array.isArray(channel) && channel.length > 0) {
            query.userCategory = { $in: channel };
        }

        const searchClause = buildSearchQuery(nameClient);
        if (searchClause) {
            Object.assign(query, searchClause);
        }

        if (hasLocation === true || hasLocation === "true") {
            query.client_location = { $exists: true, $ne: null };
        }

        if (daysWithoutOrder && !isNaN(parseInt(daysWithoutOrder, 10))) {
            const days = parseInt(daysWithoutOrder, 10);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { lastOrderDate: { $lt: cutoff } },
                    { lastOrderDate: { $exists: false } },
                    { lastOrderDate: null },
                ],
            });
        }

        const sort = SORT_FIELDS[sortBy] || SORT_FIELDS.name;

        const [result] = await User.aggregate([
            { $match: query },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $sort: sort },
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: "clientlocations",
                                localField: "client_location",
                                foreignField: "_id",
                                as: "client_location",
                            },
                        },
                        { $unwind: { path: "$client_location", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "users",
                                localField: "sales_id",
                                foreignField: "_id",
                                as: "sales_id",
                            },
                        },
                        { $unwind: { path: "$sales_id", preserveNullAndEmptyArrays: true } },
                    ],
                },
            },
        ]);

        const total = result.metadata?.[0]?.total || 0;
        const users = result.data || [];

        const aggregateStats = await User.aggregate([
            { $match: { id_owner: String(id_owner) } },
            {
                $group: {
                    _id: "$userCategory",
                    count: { $sum: 1 },
                },
            },
        ]);

        const channelStats = aggregateStats.reduce((acc, item) => {
            if (item._id) acc[item._id] = item.count;
            return acc;
        }, {});

        return res.json({
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
            channelStats,
            users,
        });
    } catch (error) {
        console.error("Error al obtener clientes:", error);
        return res.status(500).json({
            message: "Error al obtener clientes",
            error: error.message,
        });
    }
};

module.exports = { getClientLocationById };
const getClientLocationByIdAndSales = async (req, res) => {
  try {
    const query = { id_owner: String(req.body.id_owner) };

    if (req.body.sales_id && mongoose.Types.ObjectId.isValid(req.body.sales_id)) {
      query.sales_id = new mongoose.Types.ObjectId(req.body.sales_id);
    }

    const nameClient = req.body.nameClient;
    if (nameClient && nameClient.trim() !== "") {
      query.$or = [
        { name: { $regex: nameClient, $options: "i" } },
        { lastName: { $regex: nameClient, $options: "i" } }
      ];
    }

    const users = await User.find(query)
      .populate("client_location")
      .populate("sales_id");

    res.json({
      total: users.length,
      users,
    });

  } catch (error) {
    res.status(500).json({ message: "Error al obtener clientes", error });
  }
};


const getClientInfoById = async (req, res) => {
  await User.find({_id:String(req.body._id)})
  .populate("client_location")
  .then(p=>  res.json(p));
};
const postClientLocation = (req, res) => {
    try {
     const clientLocation = new ClientLocation({
      
        sucursalName: req.body.sucursalName,
        longitud: req.body.longitud,
        latitud: req.body.latitud,
        iconType: req.body.iconType,
        logoColor: req.body.logoColor,
        active: req.body.active,
        client_id:req.body.client_id,
        id_owner:req.body.id_owner,
        direction:req.body.direction,
        houseNumber: req.body.houseNumber,
        city: req.body.city

      });
      clientLocation.save((err,location) => {
        if (err) {
          res.status(500).send({ message: err });
          return;
        }
        res.status(200).send({
            _id: location._id,
            sucursalName:location.sucursalName,
            longitud: location.longitud,
            latitud: location.latitud,
            iconType:location.iconType,
            logoColor:location.logoColor,
            active:location.active,
            client_id:location.client_id,
            id_owner:location.id_owner
        });
      });
    } catch (e) {
      myConsole.log(e);
    }
  };

module.exports = {
  getClientLocationById,postClientLocation,getClientInfoById,getClientLocationByIdAndSales
};
