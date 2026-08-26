"""
Payment Processor Module
Integrates checkout operations, receipt generation, and transaction rollback.
"""
from typing import Dict, Any, List

class PaymentProcessor:
    def __init__(self, currency: str = "USD", enable_test_mode: bool = True):
        self.currency = currency
        self.enable_test_mode = enable_test_mode
        self.ledger: List[Dict[str, Any]] = []

    def process_charge(self, customer_id: str, amount_cents: int) -> Dict[str, Any]:
        """Processes a single charge."""
        if amount_cents <= 0:
            raise ValueError("Charge amount must be positive")
            
        transaction_id = f"tx_{len(self.ledger) + 1001}"
        record = {
            "id": transaction_id,
            "customer": customer_id,
            "amount": amount_cents,
            "currency": self.currency,
            "status": "succeeded"
        }
        self.ledger.append(record)
        return record

    def refund(self, transaction_id: str) -> bool:
        """Refunds a prior transaction."""
        for tx in self.ledger:
            if tx["id"] == transaction_id and tx["status"] == "succeeded":
                tx["status"] = "refunded"
                return True
        return False
