// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Payment {
    struct PaymentRecord {
        string orderId;     
        uint256 amount;     
        string payer;       
        address sender;     
        uint256 timestamp;  
    }

    PaymentRecord[] public payments;

    event PaymentRegistered(
        string orderId,
        uint256 amount,
        string payer,
        address sender,
        uint256 timestamp
    );

    function registerPayment(string memory orderId, uint256 amount, string memory payer) public {
        payments.push(PaymentRecord(orderId, amount, payer, msg.sender, block.timestamp));
        emit PaymentRegistered(orderId, amount, payer, msg.sender, block.timestamp);
    }

    function getPaymentsCount() public view returns (uint256) {
        return payments.length;
    }

    function getPayment(uint256 index) public view returns (
        string memory,
        uint256,
        string memory,
        address,
        uint256
    ) {
        require(index < payments.length, "Registro no existe");
        PaymentRecord memory record = payments[index];
        return (
            record.orderId,
            record.amount,
            record.payer,
            record.sender,
            record.timestamp
        );
    }
}
