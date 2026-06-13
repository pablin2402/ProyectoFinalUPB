const expres = require("express");
const router = expres.Router();
const productController = require("../controllers/ProductController");
const categoryController = require("../controllers/CategoryController");
const carrouselController = require("../controllers/CarrouselController");
const quotationController = require("../controllers/QuotationController");
const priceController = require("../controllers/PriceController");
const userController = require("../controllers/ClientController");
const authenticateToken = require("../middlewares/authentication.js");
const orderController = require("../controllers/OrderController");
const clientLocationController = require("../controllers/ClientLocationController");
const clientController = require("../controllers/ClientInfoController");
const SalesHistorialController = require("../controllers/SalesHistorialController");
const supplierController = require("../controllers/SupplierController");
const automatizationController = require("../controllers/AutomatizationController");
const orderTrackController = require("../controllers/OrderTrackController.js");
const salesObjectiveRegionController = require("../controllers/SalesObjectiveRegionController.js");
const administratorController = require("../controllers/AdministratorsController.js");
const currentLocationController = require("../controllers/CurrentLocationController.js");
const paymentController = require("../controllers/PaymentController.js");
const axios = require("axios")
router
.post("/login", userController.getUser)
.post("/administrator",authenticateToken,administratorController.postNewAccount)
.post("/administrator/list",administratorController.getClientsList)
.get("/check-payment/:orderId", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    
    if (order.txHash) {
      const receipt = await provider.getTransactionReceipt(order.txHash);
      if (receipt) {
        const currentBlock = await provider.getBlockNumber();
        const confirmations = currentBlock - receipt.blockNumber;
        
        if (confirmations >= 12) {
          return res.json({ status: 'confirmed', confirmations, txHash: order.txHash });
        } else if (confirmations > 0) {
          return res.json({ status: 'confirming', confirmations, txHash: order.txHash });
        } else {
          return res.json({ status: 'detected', txHash: order.txHash });
        }
      }
    }
    return res.json({ status: 'waiting' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
})
.post("/exchange-rate", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const axios = require("axios");

    const bybitFetch = async (side) => {
      const r = await axios.post("https://api2.bybit.com/fiat/otc/item/online", {
        tokenId: "USDT", currencyId: "BOB", payment: [], side: String(side), size: "10", page: "1"
      });
      return (r.data?.result?.items || []).slice(2).map(i => parseFloat(i.price)).filter(p => p > 0);
    };

    const binanceFetch = async (tradeType) => {
      const r = await axios.post("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
        fiat: "BOB", page: 1, rows: 10, tradeType, asset: "USDT", countries: [], payTypes: []
      });
      return (r.data?.data || []).slice(2).map(i => parseFloat(i.adv.price)).filter(p => p > 0);
    };

    const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;

    const getGasFees = async () => {
      const rpcs = {
        polygon: "https://polygon-bor-rpc.publicnode.com",
        ethereum: "https://ethereum-rpc.publicnode.com",
        bsc: "https://bsc-rpc.publicnode.com",
      };
      const gasUsed = 65000;

      const [polygonGas, ethGas, bscGas, prices] = await Promise.all([
        axios.post(rpcs.polygon, { jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }).catch(() => null),
        axios.post(rpcs.ethereum, { jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }).catch(() => null),
        axios.post(rpcs.bsc, { jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }).catch(() => null),
        axios.get("https://api.coingecko.com/api/v3/simple/price?ids=matic-network,ethereum,binancecoin&vs_currencies=usd").catch(() => null),
      ]);

      const toUSD = (gasHex, decimals, priceUSD) => {
        if (!gasHex || !priceUSD) return null;
        const gweiPrice = parseInt(gasHex, 16) / 1e9;
        const feeNative = (gweiPrice * gasUsed) / 1e9;
        return Math.round(feeNative * priceUSD * 10000) / 10000;
      };

      const p = prices?.data || {};
      return {
        polygon: toUSD(polygonGas?.data?.result, 18, p["matic-network"]?.usd),
        ethereum: toUSD(ethGas?.data?.result, 18, p["ethereum"]?.usd),
        bsc: toUSD(bscGas?.data?.result, 18, p["binancecoin"]?.usd),
      };
    };

    const [bybitBuy, bybitSell, binanceBuy, binanceSell, fees] = await Promise.all([
      bybitFetch("1").catch(() => []),
      bybitFetch("0").catch(() => []),
      binanceFetch("BUY").catch(() => []),
      binanceFetch("SELL").catch(() => []),
      getGasFees(),
    ]);

    res.json({
      bybit: { buy: avg(bybitBuy), sell: avg(bybitSell) },
      binance: { buy: avg(binanceBuy), sell: avg(binanceSell) },
      recommended: avg(bybitSell) || avg(binanceSell) || 9.5,
      fees,
    });
  } catch (e) {
    console.error("Error TC:", e.message);
    res.json({ bybit: null, binance: null, recommended: 9.5, fees: null });
  }
})
.post("/location/list",authenticateToken,currentLocationController.postCurrentLocation)
.post("/location/list/id",authenticateToken, currentLocationController.getLastLocation)
.post("/location/list/day/id",authenticateToken, currentLocationController.getLocationsByDayGrouped)

.post("/create",authenticateToken, paymentController.createOrder)
.post("/status",authenticateToken,  paymentController.orderStatus)

.post("/order/objective",authenticateToken, orderController.getSalesSummary)
.post("/order/objective/region",authenticateToken, orderController.getCategorySummary)
.post("/order/objective/region/id",authenticateToken, salesObjectiveRegionController.getObjectiveWithSalesData)
.post("/order/objective/region/product",authenticateToken, salesObjectiveRegionController.getObjectiveWithSalesDataProducts)
.put("/order/objective/region/product",authenticateToken, salesObjectiveRegionController.updateSalesObjectiveRegion)
.delete("/order/objective/region/product",authenticateToken, salesObjectiveRegionController.deleteSalesObjectiveRegion)

.put("/order/objective/product",authenticateToken, salesObjectiveRegionController.updateSalesObjective)
.delete("/order/objective/product",authenticateToken, salesObjectiveRegionController.deleteSalesObjective)


.put("/order/status/id",authenticateToken, orderController.updateOrderTracking)

.post("/sales/objective/regional/id",authenticateToken, salesObjectiveRegionController.getSalesObjectiveRegionByIdAndOwner)
.post("/sales/objective/regional",authenticateToken, salesObjectiveRegionController.postSalesObjectiveRegion)
.post("/sales/objective/general",authenticateToken, salesObjectiveRegionController.getSalesObjectiveGeneralByIdAndOwner)
.post("/sales/objective/id",authenticateToken, salesObjectiveRegionController.postSalesObjective)
.post("/sales/objective/region/order",authenticateToken, salesObjectiveRegionController.getOrdersWithSalesObjective)
.post("/sales/objective/national",authenticateToken, salesObjectiveRegionController.getSalesDataByLyne)
.post("/sales/objective/sales",authenticateToken, salesObjectiveRegionController.postSalesObjectiveSalesMan)
.post("/sales/objective/list",authenticateToken, salesObjectiveRegionController.getSalesObjectiveSalesManByIdAndOwner)

.post("/order/track",authenticateToken, orderTrackController.createOrderEvent)
.post("/order/track/list",authenticateToken, orderTrackController.getOrderEventsByOrderId)

.post("/automatization",authenticateToken, automatizationController.getAutomatization)
.post("/automatization/new",authenticateToken, automatizationController.postAutomatization)
.post("/automatization/list",authenticateToken, automatizationController.postAutomatizationList)
.put("/automatization/list/id", authenticateToken,automatizationController.uploadAutomatizationStatus)


.post("/product/id",authenticateToken,productController.getProductsById)
.post("/product", authenticateToken,productController.postProduct)
.post("/product/import",authenticateToken, productController.postProductsMany)
.put("/product/id",authenticateToken, productController.uploadProductStatus)
.delete("/product/id",authenticateToken, productController.deleteProduct)
.put("/product/price/id",authenticateToken, productController.updateProductAndPrice)


.post("/category/id",authenticateToken, categoryController.getCategory)
.post("/category",authenticateToken, categoryController.postCategory)
.post("/category/import",authenticateToken,  categoryController.postCategoryMany)
.get("/carrousel",authenticateToken, carrouselController.getCarrousel)
.get("/quotation",authenticateToken, quotationController.getQuotation)
.post("/quotation",authenticateToken, quotationController.postQuotation)

.post("/price/product",authenticateToken, priceController.getPriceByProductId)
.post("/price",authenticateToken, priceController.postPrice)
.put("/price",authenticateToken, priceController.uploadPriceProduct)

.post("/user",authenticateToken,  userController.postNewAccountUser)
.put("/password",authenticateToken,  userController.resetPassword)
.put("/user/id",authenticateToken, userController.updateUserFile)
.delete("/user/id",authenticateToken, userController.deleteClient)

.post("/order", authenticateToken,orderController.postOrder)
.post("/order/products/stadistics",authenticateToken, orderController.getMostSoldProducts)
.post("/order/products/analysis",authenticateToken, orderController.predictSalesForTopProducts)
.post("/order/id", authenticateToken,orderController.getOrderById)
.post("/order/deliver/id",authenticateToken, orderController.getOrderByIdAndDelivery)
.post("/order/filter/id", authenticateToken,orderController.getOrderStatusCounts)
.post("/order/sales/id",authenticateToken, orderController.getOrderSalesAppById)
.post("/order/id/user", authenticateToken, orderController.getOrderByIdAndClient)
.post("/order/id/sales", authenticateToken, orderController.getOrderByIdAndSales)
.post("/order/id/statistics",authenticateToken, orderController.getOrderSalesById)
.post("/order/id/year",authenticateToken, orderController.getOrdersByYear)
.delete("/order/id", authenticateToken,orderController.deleteOrderById)
.post("/order/status",authenticateToken, orderController.getOrderByDeliverStatusAnd)
.post("/order/status/id", authenticateToken, orderController.getOrderByIdAndOrderStatus)
.post("/order/status/count", authenticateToken, orderController.getApprovedOrdersCount)
.put("/order/status/confirm/id", authenticateToken,orderController.uploadOrderStatus)

.post("/maps/list/id",authenticateToken, clientLocationController.getClientLocationById)
.post("/maps/id",authenticateToken,clientLocationController.postClientLocation)
.post("/client/info/id",authenticateToken,clientLocationController.getClientInfoById)
.post("/maps/list/sales/id",authenticateToken,clientLocationController.getClientLocationByIdAndSales)

.post("/sales/inform",authenticateToken,SalesHistorialController.getSalesHistorial)
.post("/sales/inform/client",authenticateToken,SalesHistorialController.getSalesHistorialPerClient)
.post("/sales",authenticateToken,SalesHistorialController.postSalesHistorial)

.post("/client/info",authenticateToken, clientController.postClientInfo)
.post("/supplier/info",authenticateToken, supplierController.postSupplier)
.post("/supplier",authenticateToken, supplierController.getSupplier);

module.exports = router;