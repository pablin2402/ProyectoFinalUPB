const OrderPay = require("../models/OrderPay");
const mongoose = require("mongoose");
const Order = require("../models/Order");

const getOrderPay = async (req, res) => {
  try {
    const page = req.body.page || 1;
    const limit = req.body.limit || 0;
    let filter = { id_owner: String(req.body.id_owner) };
    const pipeline = [];
    if (req.body.startDate && req.body.endDate) {  
  
      pipeline.push(
        {
          $addFields: {
            creationDateLocal: {
              $dateSubtract: {
                startDate: "$creationDate",
                unit: "hour",
                amount: 4, 
              },
            },
          },
        },
        {
          $match: {
            creationDateLocal: {
              $gte: new Date(`${req.body.startDate}T00:00:00Z`),
              $lte: new Date(`${req.body.endDate}T23:59:59Z`),
            },
          },
        }
      );
    } else {
      pipeline.push({ $match: filter });
    }

    if (req.body.status) {
      filter.paymentStatus = req.body.status;
    }
    if (req.body.id_client) {
      filter.id_client = req.body.id_client;
    }

    const allPaymentsRaw = await OrderPay.aggregate(pipeline) 
    await Order.populate(allPaymentsRaw, [
      { path: "id_client" } ,
      { path: "sales_id", model: "SalesMan" },  
      { path: "orderId" } ,
      { path: "delivery_id" , model: "Delivery"} 

    ]);
    let filteredPayments = allPaymentsRaw;
    if (req.body.clientName) {
      const clientNameLower = req.body.clientName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      filteredPayments = allPaymentsRaw.filter(p => {
        const name = (p.id_client?.name || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        const lastName = (p.id_client?.lastName || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        return name.includes(clientNameLower) || lastName.includes(clientNameLower);
      });
    }

    const totalRecords = filteredPayments.length;
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 1;
    const paginatedPayments = limit > 0
      ? filteredPayments.slice((page - 1) * limit, page * limit)
      : filteredPayments;

    const orderIds = paginatedPayments.map(p => p.orderId?._id).filter(Boolean);
    const allPayments = await OrderPay.find({ orderId: { $in: orderIds } }).lean();

    const paymentsWithDebt = paginatedPayments.map(payment => {
      const orderTotal = payment.orderId?.totalAmount || 0;
      const totalPaid = allPayments
        .filter(p => p.orderId?.toString() === payment.orderId?._id.toString())
        .reduce((sum, p) => sum + (p.total || 0), 0);
      const debt = orderTotal - totalPaid;
      return {
        ...payment,
        totalPaid,
        debt: debt > 0 ? debt : 0,
      };
    });

    res.json({
      data: paymentsWithDebt,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener pagos" });
  }
};

const getOrderPayBySales = async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 0;
    let filter = { id_owner: String(req.body.id_owner) };
    if (req.body.startDate && req.body.endDate) {
      const startUTC = new Date(`${req.body.startDate}T00:00:00.000Z`);
      startUTC.setHours(startUTC.getHours() + 4);
      const endUTC = new Date(`${req.body.endDate}T23:59:59.999Z`);
      endUTC.setHours(endUTC.getHours() + 4);
      filter.creationDate = {
        $gte: startUTC,
        $lte: endUTC,
      };
    }

    if (req.body.status) {
      filter.paymentStatus = req.body.status;
    }

    if (req.body.sales_id) {
      filter.sales_id = mongoose.Types.ObjectId(req.body.sales_id);
    }

    if (req.body.delivery_id) {
      filter.delivery_id = mongoose.Types.ObjectId(req.body.delivery_id);
    }

    let payments = await OrderPay.find(filter)
      .populate({
        path: "orderId",
        populate: {
          path: "id_client",
        },
      })
      .populate("sales_id")
      .populate("id_client")
      .populate("delivery_id")
      .sort({ creationDate: -1 }) 
      .lean();

    if (req.body.clientName) {
      const searchTerm = req.body.clientName.toLowerCase();
      payments = payments.filter(item => {
        const client = item.orderId?.id_client;
        if (!client) return false;
        const fullName = `${client.name} ${client.lastName}`.toLowerCase();
        return fullName.includes(searchTerm);
      });
    }

    if (!req.body.startDate && !req.body.endDate && limit === 0) {
      payments = payments.slice(0, 10); 
    }

    const totalRecords = payments.length;
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 1;

    const paginatedData = limit > 0
      ? payments.slice((page - 1) * limit, page * limit)
      : payments;

    res.json({
      data: paginatedData,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    console.error("Error en getOrderPayBySales:", error);
    res.status(500).json({ message: "Error al obtener pagos" });
  }
};

const getOrderPayId = async (req, res) => {
    try {
        const payments = await OrderPay.find({ 
            id_owner: String(req.body.id_owner), 
            id_client: String(req.body.id_client),
            orderId: mongoose.Types.ObjectId(req.body.orderId),
        })
        .populate("orderId")
        .populate("sales_id")
        .populate("id_client")
        .populate("delivery_id")
        .lean(); 
        if (payments.length === 0) {
            return res.json([]);
        }
        const orderIds = payments.map(p => p.orderId?._id).filter(Boolean);
        const allPayments = await OrderPay.find({ orderId: { $in: orderIds } }).lean();

        const paymentsWithDebt = payments.map(payment => {
            const orderTotal = payment.orderId?.totalAmount || 0;

            const totalPaid = allPayments
                .filter(p => p.orderId?.toString() === payment.orderId?._id.toString())
                .reduce((sum, p) => sum + (p.total || 0), 0);

            const debt = orderTotal - totalPaid;

            return {
                ...payment,
                totalPaid,
                debt: debt > 0 ? debt : 0 
            };
        });

        res.json(paymentsWithDebt);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener pagos" });
    }
};
const postOrderPay = async (req, res) => {
  try {
    const {
      saleImage,
      total,
      note,
      orderId,
      numberOrden,
      paymentStatus,
      id_client,
      sales_id,
      delivery_id,
      id_owner,
      reviewer,
      paymentType,
      network,
      txHash,
      blockNumber,
      contractAddress,
    } = req.body;

    const newOrderPay = new OrderPay({
      saleImage,
      total: Number(total),
      note,
      orderId: new mongoose.Types.ObjectId(orderId),
      numberOrden,
      paymentStatus,
      id_client: new mongoose.Types.ObjectId(id_client),
      sales_id: sales_id ? new mongoose.Types.ObjectId(sales_id) : null,
      delivery_id: delivery_id ? new mongoose.Types.ObjectId(delivery_id) : null,
      id_owner,
      reviewer,
      paymentType: paymentType || "cash",
      network: network || null,
      txHash: txHash || null,
      blockNumber: blockNumber ? Number(blockNumber) : null,
      contractAddress: contractAddress || null,
      blockchainRegisteredAt: txHash ? new Date() : null,
    });

    const savedOrderPay = await newOrderPay.save();

    const allPays = await OrderPay.find({ orderId: savedOrderPay.orderId });
    const totalPagado = allPays.reduce((acc, pago) => acc + pago.total, 0);

    const order = await Order.findById(savedOrderPay.orderId);
    if (!order) {
      return res.status(404).send({ message: "Orden no encontrada" });
    }

    if (totalPagado >= order.totalAmount) {
      order.payStatus = "Pagado";
      await order.save();
    }

    res.status(200).send({
      _id: savedOrderPay._id,
      saleImage: savedOrderPay.saleImage,
      total: savedOrderPay.total,
      note: savedOrderPay.note,
      orderId: savedOrderPay.orderId,
      numberOrden: savedOrderPay.numberOrden,
      paymentStatus: savedOrderPay.paymentStatus,
      id_client: savedOrderPay.id_client,
      sales_id: savedOrderPay.sales_id,
      delivery_id: savedOrderPay.delivery_id,
      id_owner: savedOrderPay.id_owner,
      reviewer: savedOrderPay.reviewer,
      paymentType: savedOrderPay.paymentType,
      network: savedOrderPay.network,
      txHash: savedOrderPay.txHash,
      blockNumber: savedOrderPay.blockNumber,
      contractAddress: savedOrderPay.contractAddress,
      blockchainRegisteredAt: savedOrderPay.blockchainRegisteredAt,
    });
  } catch (e) {
    console.error("Error en postOrderPay:", e);
    res.status(500).send({ message: "Error al guardar la orden de pago", error: e.message });
  }
};
const getOrderPayByCalendar = async (req, res) => {
  try {
    const page = req.body.page || 1;
    const limit = req.body.limit || 0;
    let filter = { id_owner: String(req.body.id_owner) };
    const pipeline = [];

    if (typeof req.body.month === "number" && typeof req.body.year === "number") {
      const { month, year } = req.body;
      const adjustedMonth = month - 1;

      const startDate = new Date(year, adjustedMonth, 1, 0, 0, 0, 0);
      const endDate = new Date(year, adjustedMonth + 1, 0, 23, 59, 59, 999);

      let endUTC4 = new Date(endDate.getTime() - 4 * 60 * 60 * 1000);
      endUTC4.setDate(endUTC4.getDate() + 1);

      pipeline.push(
        {
          $addFields: {
            creationDateLocal: {
              $dateSubtract: {
                startDate: "$creationDate",
                unit: "hour",
                amount: 4,
              },
            },
          },
        },
        {
          $match: {
            creationDateLocal: {
              $gte: startDate,
              $lte: endUTC4,
            },
          },
        }
      );
    } else {
      pipeline.push({ $match: filter });
    }
    if (req.body.status) {
      filter.paymentStatus = req.body.status;
    }
    if (req.body.id_client) {
      filter.id_client = req.body.id_client;
    }

    const allPaymentsRaw = await OrderPay.aggregate(pipeline);
    await Order.populate(allPaymentsRaw, [
      { path: "id_client" },
      { path: "sales_id", model: "SalesMan" },
      { path: "orderId" },
    ]);
    
    let filteredPayments = allPaymentsRaw;
    if (req.body.clientName) {
      const clientNameLower = req.body.clientName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      filteredPayments = allPaymentsRaw.filter((p) => {
        const name = (p.id_client?.name || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();

        const lastName = (p.id_client?.lastName || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();

        return name.includes(clientNameLower) || lastName.includes(clientNameLower);
      });
    }

    const totalRecords = filteredPayments.length;
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 1;
    const paginatedPayments =
      limit > 0 ? filteredPayments.slice((page - 1) * limit, page * limit) : filteredPayments;

    const orderIds = paginatedPayments.map((p) => p.orderId?._id).filter(Boolean);
    const allPayments = await OrderPay.find({ orderId: { $in: orderIds } }).lean();

    const paymentsWithDebt = paginatedPayments.map((payment) => {
      const orderTotal = payment.orderId?.totalAmount || 0;
      const totalPaid = allPayments
        .filter((p) => p.orderId?.toString() === payment.orderId?._id.toString())
        .reduce((sum, p) => sum + (p.total || 0), 0);
      const debt = orderTotal - totalPaid;
      return {
        ...payment,
        totalPaid,
        debt: debt > 0 ? debt : 0,
      };
    });

    res.json({
      data: paymentsWithDebt,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener pagos" });
  }
};
const updateOrderPayStatus = async (req, res) => {
  try {
    const { _id, paymentStatus, reviewer } = req.body;
    const updatedOrderPay = await OrderPay.findByIdAndUpdate(
      _id,
      {
        paymentStatus,
        reviewer,
      },
      { new: true }
    );
    if (!updatedOrderPay) {
      return res.status(404).send({ message: "Orden de pago no encontrada" });
    }
    res.status(200).send({
      message: "Estado de pago actualizado correctamente",
      orderPay: updatedOrderPay,
    });
  } catch (error) {
    console.error("Error al actualizar el estado de pago:", error);
    res.status(500).send({ message: "Error del servidor" });
  }
};

module.exports = {
    getOrderPay,
    postOrderPay,
    getOrderPayId,
    getOrderPayBySales,
    getOrderPayByCalendar,
    updateOrderPayStatus
};
