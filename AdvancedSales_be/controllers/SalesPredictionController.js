const Order = require("../models/Order");
const axios = require("axios");

const getProductMonthlyPrediction = async (req, res) => {
    try {
        const ventas = await Order.aggregate([
            { $unwind: "$products" },
            {
                $group: {
                    _id: {
                        productName: "$products.nombre",
                        year: { $year: "$creationDate" },
                        month: { $month: "$creationDate" }
                    },
                    totalVentas: {
                        $sum: {
                            $multiply: ["$products.cantidad", "$products.precio"]
                        }
                    }
                }
            },
            { $sort: { "_id.productName": 1, "_id.year": 1, "_id.month": 1 } }
        ]);

        const productos = {};
        ventas.forEach(v => {
            const nombre = v._id.productName;
            const mes = v._id.month.toString().padStart(2, '0');
            const fecha = `${v._id.year}-${mes}-01`;

            if (!productos[nombre]) productos[nombre] = [];
            productos[nombre].push({ ds: fecha, y: v.totalVentas });
        });

        const resultados = {};
        for (let producto in productos) {
            if (productos[producto].length < 3) {
                console.warn(`Producto ${producto} tiene menos de 3 registros. Omitiendo...`);
                continue;
            }

            try {
                const { data } = await axios.post("http://localhost:8000/predict", {
                    ventas: productos[producto]
                });
                resultados[producto] = data.predicciones;
            } catch (error) {
                console.error(`Error al predecir ${producto}:`, error.message);
                resultados[producto] = { error: "No se pudo predecir" };
            }
        }

        return res.status(200).json({
            success: true,
            message: "Predicciones por producto generadas",
            predicciones: resultados
        });
    } catch (error) {
        console.error("Error general:", error.message);
        return res.status(500).json({ success: false, message: "Error en la predicción" });
    }
};
module.exports = { getProductMonthlyPrediction };
