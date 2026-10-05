# Devnet smoke — meeting → terms change, early redemption → retire → close (task 018)

Series `QPNb1-tmevah` (created by `make demo-coupon`, INTR #1 already paid), driven only through the `qupon` CLI on 2026-10-05.
Votes: investor3 (65 bonds) For, investor2 (25) Against, investor1 (10) Abstain → Approved (65 ≥ ⅔ × 90; quorum 100%). The coupon rate became 12% (ARDFM registration SIMULATED by the registrar signature). MCAL then called the bonds on 2027-03-03 (60 accrued days at 12%), paid principal + accrued coupon, burned every unit and closed the mint.

| Command | Transaction(s) |
|---|---|
| `meeting:announce --record-at +60 --voting-ends-at +200 --new-rate-bps 1200 --corp-id Qevah-BMET-0002` | [tx](https://explorer.solana.com/tx/EC1MpZQtwgZC4DLuq95eAC5Eot7dagnsgUdptjNtbeQGhTTW2QN88SpswSw3zzvwRoo1ZrLRQttYzzoJKhLJpxc?cluster=devnet) |
| `action:strike` | [tx](https://explorer.solana.com/tx/4ztckmycWEme4qHUc83kZVTs9UFyiXQuibAEhD16kjFyfdc5HqdR9G6TbwN2aGK3erJ8GieywG28sarpo8kotPa4?cluster=devnet) |
| `action:snapshot` | [tx](https://explorer.solana.com/tx/3gaDJWj32ALYLv1WZCaVMZenRc5XGftdZKkFATbG36iy7ceBRE5wmvCcuT6P1VxQhChh7JcjA1XshtnjnRi1vuFg?cluster=devnet) |
| `action:finalize-snapshot` | [tx](https://explorer.solana.com/tx/54L9YFcC6r7xcV8V9VVSeZNwbCaXKXuAs6652pbUNcWiiCpWi4icjqZ3DK9QUV6Lq6KZMSffbUixLYM9ncnsN3E7?cluster=devnet) |
| `vote --choice for` | [tx](https://explorer.solana.com/tx/3JjPoNF5rJFkEhdXNSabF7SZTLwxfaNkC5hN8PFzYuP7969m35mzAm1uXRSffscdVMmnti3fnG5P8BC7G3HKQsUg?cluster=devnet) |
| `vote --choice against` | [tx](https://explorer.solana.com/tx/57mu3kL6JDSerGDNbyjwZtj1hD1VkNi1TT3YXHSkGQkwfcdRJKu87wK9WRRnE1b2tKbVyJLQYVXFiCDSbUPpCJ7V?cluster=devnet) |
| `vote --choice abstain` | [tx](https://explorer.solana.com/tx/5wMAHKv2z8RyzSZrbeQd6pHg8itHG3BUi38WFHxrizCJKb1qqPB4rt9YYsYyX2CCGDNAjMEfBNGKkBFtxPjV1HHk?cluster=devnet) |
| `meeting:finalize` | [tx](https://explorer.solana.com/tx/j1PbHP7j7Kgt7httkrWCTebMQoENyEvYCPjGcNfRsJmUEGTkpprpCcBUDTfEiir6zAmvvdgvqNnNTQhK8tyFfng?cluster=devnet) |
| `meeting:apply` | [tx](https://explorer.solana.com/tx/2vC1ACQFVMK2E2TYC8rVRdb4QkZrZqMkhU1X7TApDV4ngUVmAA4dxT7u6oBAscDsdrdLztz5R5PW19GguvYjKR7y?cluster=devnet) |
| `action:announce --kind MCAL --call-date 2027-03-03 --record-at +60 --payment-at +90 --corp-id Qevah-MCAL-0003` | [tx](https://explorer.solana.com/tx/4xDZ7pzt4nLAKgNm5tRG4SaNMMNMJk3zeUcC76Tgjo1EZfh67AqF6FwWN9Lhr8hcWYUQYzsp4Ps5m9G97PNrPUzs?cluster=devnet) |
| `action:strike` | [tx](https://explorer.solana.com/tx/3nsnBuDxkfBhphqeXTKBGKzWMDBbFR3SFP99etdUQvuTNgDQBuW8BkCvj93d2VWeSMvf68UYikoTAB1mQ993ResZ?cluster=devnet) |
| `action:snapshot` | [tx](https://explorer.solana.com/tx/5UNxq9PZ2WCyKRHVxAe7cfVDiR7r7guBF92DWND5sUnN8jfJVM4TFAVmWhZkmMhmPcvo8orEQJo6zjifk4VUFcR5?cluster=devnet) |
| `action:finalize-snapshot` | [tx](https://explorer.solana.com/tx/2LAu6KWg2z45N4fmpuRJeRAYFvMf3ro4eV4HG1xrUdQKXzdcuGLgWTkn4G9Q9JZJUtyp7uEv4xdmjdWNDUGHK5Vq?cluster=devnet) |
| `action:fund` | [tx](https://explorer.solana.com/tx/w8Evbwe7XQ73PW5ekndyWa8NKJL6jBehwnizJW1PkXK5A8Cx3xwoTMPwAAHaxPUt8J1Mns2tw3qCRNDV7wN8TfY?cluster=devnet) |
| `action:pay` | [tx](https://explorer.solana.com/tx/4kTt5cyLkeSRhtMowBSeuKm32DUKNzuTCQFkyKAFEsCgTJBBwzzGYj2MvoRP52Errq6cbgcd4FS9h36dMBSJ71JC?cluster=devnet) |
| `action:complete` | [tx](https://explorer.solana.com/tx/4Ezg9M44JjZe8kwwe4fxSo6GzBvXE55WsVp6U7VESNPAw4nvqbg2L9H8qjd19teKaPnZvHz5D4ewxs5DxCzu3JdJ?cluster=devnet) |
| `action:retire` | [tx](https://explorer.solana.com/tx/62nSA1QKaBDNph3Po1cMnftqCVY8C7XKiKSeTAe11NATJSuJ7bnfCkg91E79oYH8qAHs1yTcRwLbFjVhA4KfoRxd?cluster=devnet) |
| `series:close` | [tx](https://explorer.solana.com/tx/ssy1LwSHz27jrTZFrF2jeEvBxaeXEFkdmE7tjMULQVkUyipzSvAM7RAkRCAAQWrFi975SkKNK9P7GmkwHcHvMA5?cluster=devnet) |
