const mongoose = require("mongoose");
const { Schema } = mongoose;
const userLocationSchema = new Schema({
    salesManId: { type: Schema.ObjectId, ref:"SalesMan" },
    delivery: { type: Schema.ObjectId, ref:"Delivery" },
    longitud: { type: Number, default: true },
    latitud: { type: Number, default: true },
    Timestamp:{type:Date, default: true},
    id_owner: { type: String, require: true },
    longitudDestiny: { type: Number, default: true },
    latitudDestiny: { type: Number, default: true },
    deliveryInWay: { type: Boolean, default: true },
});

module.exports = mongoose.model("CurrentLocation", userLocationSchema);
