const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    index: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "DETECTED", "PAID"], default: "PENDING" },
    txHash: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);
