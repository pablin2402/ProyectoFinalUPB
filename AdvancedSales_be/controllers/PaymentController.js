const Payment = require("../models/Payments");

const { getAddress } = require("../utils/wallet.js");
let currentIndex = 0;
const axios = require("axios");
const { ethers } = require("ethers");

  const createOrder = async (req, res) => {
    try {
      const { amount } = req.body;
  
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      const address = getAddress(currentIndex);
      const payment = await Payment.create({
        address,
        index: currentIndex,
        amount: Number(amount),
        status: "PENDING",
      });
  
      currentIndex++;
  
      return res.json({
        orderId: payment._id,
        address: payment.address,
        amount: payment.amount,
        status: payment.status,
      });
    } catch (err) {
      console.error("createOrder error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
    };
    const orderStatus = async (req, res) => {
      try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: "orderId required" });
    
        const payment = await Payment.findById(orderId);
        if (!payment) return res.status(404).json({ error: "Payment not found" });
    
        if (payment.status === "PAID") return res.json(payment);
    
        if (!process.env.ETHERSCAN_KEY) {
          return res.status(500).json({ error: "Missing ETHERSCAN_KEY" });
        }
    
        
        const createdAtSec = payment.createdAt
          ? Math.floor(new Date(payment.createdAt).getTime() / 1000)
          : 0;
    
        const { data } = await axios.get("https://api.etherscan.io/v2/api", {
          params: {
            chainid: 1,
            module: "account",
            action: "txlist",
            address: payment.address,
            sort: "desc",
            apikey: process.env.ETHERSCAN_KEY,
          },
          timeout: 15000,
        });
        if (!data || !Array.isArray(data.result) || data.result.length === 0) {
          return res.json(payment);
        }
    
        const requiredWei = ethers.parseEther(String(payment.amount));
    
        const tx = data.result.find((t) => {
          if (!t.to) return false;
    
          if (t.to.toLowerCase() !== payment.address.toLowerCase()) return false;
    
          const ts = Number(t.timeStamp || "0");
          if (createdAtSec && ts < createdAtSec) return false;
    
          const valueWei = BigInt(t.value || "0");
          if (valueWei < requiredWei) return false;
    
          const conf = Number(t.confirmations || "0");
          if (conf < REQUIRED_CONFIRMATIONS) return false;
    
          if (t.isError === "1") return false;
    
          return true;
        });
        console
        if (!tx) return res.json(payment);
    
        await Payment.updateOne(
          { _id: payment._id },
          {
            $set: {
              status: "PAID",
              txHash: tx.hash,
              paidAt: new Date(),
            },
          }
        );
    
        const updated = await Payment.findById(payment._id);
        return res.json(updated);
      } catch (err) {
        console.error("orderStatus error:", err);
        return res.status(500).json({ error: "Internal error" });
      }
    };
      
      
      
module.exports = {
    createOrder,
    orderStatus
};