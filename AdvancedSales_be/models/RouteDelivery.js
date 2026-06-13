const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  delivery: { type: Schema.ObjectId, ref: "Delivery" },
  creationDate: { type: Date, default: Date.now },
  details: { type: String, require: true },
  route: { type: Array, default: [] },
  status: { type: String, require: true },
  startDate: { type: Date, require: true },
  endDate: { type: Date, require: true },
  id_owner: { type: String, require: true },
  progress: { type: Number, require: true },
  startDateRouteSales: { type: Date, require: true },

  stackingPlan: { type: Schema.Types.Mixed, default: null },
  capacity: { type: Number },
  totalBoxes: { type: Number },
  fullBoxes: { type: Number },
  halfBoxes: { type: Number },
  looseBottles: { type: Number },
  totalBottles: { type: Number },
  utilization: { type: Number },
  oversized: { type: Boolean, default: false },
  optimizationMethod: { type: String },
  groupId: { type: String },
  tripNumber: { type: Number },
  totalTrips: { type: Number },
  estimatedDistance: { type: Number },
  estimatedTime: { type: Number },
  depotCoords: { type: Schema.Types.Mixed },
  truckCapacityUsed: { type: Number },
  totalAmount: { type: Number },
  clientsZones: { type: Schema.Types.Mixed },
  operationalNotes: { type: Array, default: [] },
  routeMetrics: { type: Schema.Types.Mixed },
}, { strict: false });

module.exports = mongoose.model("RouteDelivery", userSchema);