const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderSchema = new Schema({
  orderId: { type: Schema.ObjectId, ref: "Order" },
  sales_id: { type: Schema.ObjectId, ref: "SalesMan" },
  delivery_id: { type: Schema.ObjectId, ref: "Delivery" },
  saleImage: { type: String, require: true },
  total: { type: Number, require: true },
  note: { type: String, require: true },
  creationDate: { type: Date, default: Date.now },
  id_owner: { type: String, require: true },
  numberOrden: { type: String, require: true },
  paymentStatus: { type: String, require: true },
  id_client: { type: Schema.ObjectId, ref: "User" },
  reviewer: { type: String, require: true },
  paymentType: {
    type: String,
    enum: ["cash", "transfer", "qr", "deposit", "crypto"],
    default: "cash",
  },
  network: {
    type: String,
    default: null,
  },
  txHash: {
    type: String,
    default: null,
    index: true, 
  }, 
  blockNumber: {
    type: Number,
    default: null,
  },
  contractAddress: {
    type: String,
    default: null,
  },
  blockchainRegisteredAt: {
    type: Date,
    default: null,
  },

});

module.exports = mongoose.model("OrderPay", orderSchema);
