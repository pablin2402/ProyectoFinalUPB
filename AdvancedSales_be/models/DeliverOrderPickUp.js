const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
    clientName:   { type: String, require: true },
    delivery: { type: Schema.ObjectId, ref:"Delivery" },
    creationDate: { type: Date, default: Date.now },
    longitud: { type: Number, default: true },
    latitud: { type: Number, default: true },
    orderId: { type: Schema.ObjectId, ref:"Order" },
    image: { type: String,require: true },
    id_owner: { type: String, require: true },

});

module.exports = mongoose.model("DeliveryOrderPickUp", userSchema);
