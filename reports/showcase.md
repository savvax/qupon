# Qupon — the curated public showcase on Solana devnet (`make seed-showcase`)

Four demo series on the accelerated clock (1 civil day = 4 s), one per corporate-action scenario, issued from config/showcase.json — the single Go Showcase table (task 1535). Cluster devnet · run 2026-10-10T23:42:13.389Z.

**Result:** not called — `curl -fsS -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$QUPON_API_URL/admin/showcase/seed"`

_Featured mints: [Bs27mdahzGFEJru79jnXkG3UhFMV1aNHTsC7Z6RVkLpW](https://explorer.solana.com/address/Bs27mdahzGFEJru79jnXkG3UhFMV1aNHTsC7Z6RVkLpW?cluster=devnet) · [AavFshHYkfyCmRj5r1ciYAZs51G4hxFPHMmmT7tgHF4C](https://explorer.solana.com/address/AavFshHYkfyCmRj5r1ciYAZs51G4hxFPHMmmT7tgHF4C?cluster=devnet) · [HnZtxtegV8FLUsfjEYSCW9S7X9mmqAk8MP6wDb6U78Sc](https://explorer.solana.com/address/HnZtxtegV8FLUsfjEYSCW9S7X9mmqAk8MP6wDb6U78Sc?cluster=devnet) · [98vjgPFbKyRVP6wwkJuz9PkDFGS3xjCDAnD4DL9UPME2](https://explorer.solana.com/address/98vjgPFbKyRVP6wwkJuz9PkDFGS3xjCDAnD4DL9UPME2?cluster=devnet)_. KYC is SIMULATED (SAS attestations by the demo provider).

## Almaty Power (KZ2C0QPN0018) — coupon

| Step | Transaction | Status |
|---|---|---|
| series:create Almaty-Power — face 100000, 1000 bps ×2/yr, 2026-10-11 → 2027-10-11, DEMO clock 1 day = 4 s | — | ok |
| kyc:attest investor1 — SIMULATED KYC provider | — | ok |
| investor:register investor1 | [tx](https://explorer.solana.com/tx/3vaNhPMMLX4ZpFUoDxLWBV8UwbDiihkmq5u9nE6sQAKDPA5BGxBHSTfh9Weqxvoa7S4NRZMJphZWvWyHXNoFB6kg?cluster=devnet) | ok |
| kyc:attest investor2 — SIMULATED KYC provider | — | ok |
| investor:register investor2 | [tx](https://explorer.solana.com/tx/5cLrcqvMawpfVffu49HXqnsARpexABuANXZfypocnMhwU3GmmLYStsU2xwcXMxMFYik5ukLP93zJrPBuPcw6tRDZ?cluster=devnet) | ok |
| kyc:attest investor3 — SIMULATED KYC provider | — | ok |
| investor:register investor3 | [tx](https://explorer.solana.com/tx/3Ca7pHrVFZHDCgs41cPCJ5NZ1MAtpyMzKWkMF3KC9MBmSzhdUDzghipALbkdTxgtd3qgbpok1hyjr7m4RJeqp4q7?cluster=devnet) | ok |
| subscribe 10 bonds — investor1 | [tx](https://explorer.solana.com/tx/NmW8aBQhXZgv6hRGJPFmHUiFpcWdkPKyfMNHKuvtovbNJ6F8c4EbQAyX2FKPHjcHegofirojdCiwjiA1ZFexL44?cluster=devnet) | ok |
| subscribe 25 bonds — investor2 | [tx](https://explorer.solana.com/tx/3roHjvrmGMdpEbBWaRrSGnfzkJdDVJy2DoCLe1U3Y9QzLDVSDQncrtyYuKTCtFFLnnZC3bTNSZa1uMS3kwF5hXoZ?cluster=devnet) | ok |
| subscribe 65 bonds — investor3 | [tx](https://explorer.solana.com/tx/3TVY62hqcDsQYrbVwC4yz8bVDwZ3wq5mK81dJZSE2AxELHzogwfceQoM91iMNE2cvMABjPHvhp5omgc6QdkrPqQq?cluster=devnet) | ok |
| action:announce INTR SHOW1-INTR-0001 — the demo clock derives record/payment dates | [tx](https://explorer.solana.com/tx/54AeprkMnAVzhsPaUzeeuvqtVGR1pCj7CnePqx9BaeQMLWBSqnfbLiSEVtovewgYDGYyeBQp5TkPh6jwBf2FXf9w?cluster=devnet) | ok |
| wait for the record date (the transfer-hook gate arms itself — no strike) | — | ok |
| action:snapshot — outsider (permissionless crank) | [tx](https://explorer.solana.com/tx/FXcrtwntF9v5BA6Le1yk4oHSWFWPuT7rK7GMU6nEJrDP3pPzgUnkthZHs9rg3qX78LrBh7JWagwQsmjZVeNRqzr?cluster=devnet) | ok |
| action:finalize-snapshot — outsider | [tx](https://explorer.solana.com/tx/4W38iUJhmZV1YepdRwv57tGqurLjTCD8EmaasoCLXHcf8YmwF2fmBmJgMm31MYD1syiwRxkm25puFwbbebxc32zL?cluster=devnet) | ok |
| wait for the payment date | — | ok |
| action:fund — issuer pre-funds the escrow | [tx](https://explorer.solana.com/tx/3Pn7DkCGuWjDNEgAq9Yzxbu2urU7WWy3smVLDGD2wmCN5iFBNjKgbEEFgoEz64aBDUF3CvQZcoCzw2wwb94vkeJR?cluster=devnet) | ok |
| action:pay — holders paid from escrow | [tx](https://explorer.solana.com/tx/2kxyTZf41HCWqpY1AhhMLabHbmCvB9vhahkJEdrFXCSDDtSpfFkBQ6mBJPW3e3woB57DYUBzdwQPaYcpB74CskTq?cluster=devnet) | ok |
| action:complete — reconciled | [tx](https://explorer.solana.com/tx/3Q9nMvw7gVAZRd9PQYcrV1BwgLvbCAUQ1jCD4KNybAbnhMv49BAVHkFip5ghGuvS5N5tmt4aYe5uxWStf1w9oG3G?cluster=devnet) | ok |

## Astana Metro (KZ2C0QPN0026) — redemption

| Step | Transaction | Status |
|---|---|---|
| series:create Astana-Metro — face 100000, 1000 bps ×2/yr, 2026-10-11 → 2027-04-11, DEMO clock 1 day = 4 s | — | ok |
| kyc:attest investor1 — SIMULATED KYC provider | — | ok |
| investor:register investor1 | [tx](https://explorer.solana.com/tx/2KEz6Ss9nU9ZhYipe7C9ER7DbtceMa2zQ9PdSrgcyE5eH98YvWx5JecNgxgkUV9xptrA7o9kiGSKYDTiAiaazon5?cluster=devnet) | ok |
| kyc:attest investor2 — SIMULATED KYC provider | — | ok |
| investor:register investor2 | [tx](https://explorer.solana.com/tx/477xNbFX4SCm2i2W5yaRNgNJpSkke6bvQZkpHXgf7mCdM2JqXPjjghzuJDWtWAgcFaDaS4KzzuNxGKq8p3dFttxM?cluster=devnet) | ok |
| kyc:attest investor3 — SIMULATED KYC provider | — | ok |
| investor:register investor3 | [tx](https://explorer.solana.com/tx/3C4CxjtqAGZw7hVkzRrxKRWvsAjr4tu2rHAN7JifVVETs7XA2eWT73yjKwDMaF3N8Yy1wK4Pui7RRgWaq7fpw6Mh?cluster=devnet) | ok |
| subscribe 10 bonds — investor1 | [tx](https://explorer.solana.com/tx/3WUKhdqwqKvwRArNd8i2BgNPBLfgAMxMog9ACzMsm7FvHxDSk36M5kVxdq78aNGRNDcYjiweke8txQttjfRtdykW?cluster=devnet) | ok |
| subscribe 25 bonds — investor2 | [tx](https://explorer.solana.com/tx/9vrTmeyNn8E1wauGY17u2FtZvAYPp2mASEQB3GHiXvq7xdaMuD5rqC344zDEx7MzhEAf8GxWTihJwtYX7J4BmJZ?cluster=devnet) | ok |
| subscribe 65 bonds — investor3 | [tx](https://explorer.solana.com/tx/vFE3jPHSN9zch7AFigA2s7cs98RUa1tZKW1wkmJ5KbaiahHjNgoqGPEnV73h9oPfrqT3hfpPTnCfcudgRJXiesP?cluster=devnet) | ok |
| action:announce REDM SHOW2-REDM-0001 — principal + final coupon at maturity | [tx](https://explorer.solana.com/tx/5AGjqSMoxUkQLyiatX62YsCNCJXJZ6YtjHCZPphSBvbYzBzwbdQUM27ucY8nxH6wyJFa82zHhthCZwA9c3hsPmw8?cluster=devnet) | ok |
| wait for the record date (the transfer-hook gate arms itself — no strike) | — | ok |
| action:snapshot — outsider (permissionless crank) | [tx](https://explorer.solana.com/tx/5Xdqvvb2VtfjEYeEtfCR59C97ZLc9yzKakonBVyF285ixGXKmg5FynKb5wn7Ck6jz1FaFLq31KLNHtRGD5yPF9dt?cluster=devnet) | ok |
| action:finalize-snapshot — outsider | [tx](https://explorer.solana.com/tx/5dDvvfFJ3fQEmKLBKA9d3G1J8x6jwfJsfcryuDVEXMDA312Vg5BSZacN4T4dmo5yh4CX6LdG5XwXNxy7kRu7UV3J?cluster=devnet) | ok |
| wait for the payment date | — | ok |
| action:fund — issuer pre-funds the escrow | [tx](https://explorer.solana.com/tx/326q4GNb8cWDQf2tjXxnLbfkHCei4aeTzVujQXGH8qoCk2fhrCuqtZ28nScsAXnWLjCsP2k6VrvdV5uZZsFUMpwS?cluster=devnet) | ok |
| action:pay — pay and burn in one instruction | [tx](https://explorer.solana.com/tx/3Zz8UxzEgEAgFXMf2wYn6uHFDTRjqhKqCczCJj3Nz8rFbjDzeDbgqVerqscn9CjeNaXtKiXpS1HaqMwBSZJdG4XN?cluster=devnet) | ok |
| action:complete — reconciled | [tx](https://explorer.solana.com/tx/64qj5CaKSwJsvpg1CBpTyrDDWGc9PKzZqFsJm5kc2mZrQ1PQwLkLj9bqFLXmfRaY2nnWGq7ACexjH9oPbmT2qriA?cluster=devnet) | ok |
| action:retire — burn every remaining unit | — | ok |
| series:close — metadata REDEEMED, mint closed | [tx](https://explorer.solana.com/tx/5tEmgKXrDKNQvr6Mjx4KsBvDqZr4MKmbPg2Ft9ddMsMu4Ch71GL8dsN1MrQ5eWSCuU9iNUSvNz5nFZMTX7ne8dgU?cluster=devnet) | ok |

## Aktobe Mining (KZ2C0QPN0034) — meeting

| Step | Transaction | Status |
|---|---|---|
| series:create Aktobe-Mining — face 100000, 1000 bps ×2/yr, 2026-10-11 → 2027-07-11, DEMO clock 1 day = 4 s | — | ok |
| kyc:attest investor1 — SIMULATED KYC provider | — | ok |
| investor:register investor1 | [tx](https://explorer.solana.com/tx/4E9oZmk7B2irN8LVRN1B7j3uT7fJq9obToUSNfnwZQ7BKYmvi1m5tx1BANQsmXTikFzHYkyKbn4W9wFTAzjwNgJE?cluster=devnet) | ok |
| kyc:attest investor2 — SIMULATED KYC provider | — | ok |
| investor:register investor2 | [tx](https://explorer.solana.com/tx/u3KYw4dJeMF7CSwQ6hNndyjmr5QTB6jgfG5LJywt37ttSLyuQ1jYSppgbJKcFVTtQx7jixbhczSNDJzBTwGjwMb?cluster=devnet) | ok |
| kyc:attest investor3 — SIMULATED KYC provider | — | ok |
| investor:register investor3 | [tx](https://explorer.solana.com/tx/4CFeVn1oGYUiebrPc32YP9TFxx7y6oyF5PjJma2zNafkLbsdJJ4hrimpMGgJkUQKWFWifMino1dhfpL72RmgFifE?cluster=devnet) | ok |
| subscribe 10 bonds — investor1 | [tx](https://explorer.solana.com/tx/2BkGy5qiwmozNZbPpU77UqER7QuhF93HnAEVJBrQkXQWozEEU1yeUbFdmueT5H99xj43oYNGP76EV3Z39ZRBZdwN?cluster=devnet) | ok |
| subscribe 25 bonds — investor2 | [tx](https://explorer.solana.com/tx/5ukLc5Wd5YQq1vbe8Hiyi3GRqpi3PcDGG9j3vWy8t575UGPJ87jtrNpciZgFkfnhtWDddouGeXKFmizgNWCGZ26o?cluster=devnet) | ok |
| subscribe 65 bonds — investor3 | [tx](https://explorer.solana.com/tx/4AdxtZfR3HSknHDS6MwJcJucZkMHiLeShPCpCdmT7hjPHbJ771dxjKq3Z4C91Adjyzgg5wnJX848RXVLZRxPdCTy?cluster=devnet) | ok |
| meeting:announce SHOW3-BMET-0001 — issuer proposes 12% (voting stays open) | [tx](https://explorer.solana.com/tx/3pS4zFLVuXncc8GMTJay8Rf9wkJwF1bk9bQHH1foGpL8hRBpYaHB3wNJ1fZMY1hjC5ojSdPYYK1uuFQWxUEhGhF8?cluster=devnet) | ok |
| wait for the record date (the transfer-hook gate arms itself — no strike) | — | ok |
| action:snapshot — outsider (permissionless crank) | [tx](https://explorer.solana.com/tx/2MqtzzRCBB3Qt2ShffmiMnjjsCCBEGQX3zpry4a68sD6MdnxUQP9TwCAcECyAVr5faENhY7PA4KM24nhpsshJQnr?cluster=devnet) | ok |
| action:finalize-snapshot — outsider | [tx](https://explorer.solana.com/tx/28nbS4e7g1zbBzar9S1eNHBY3N2pFw2cjHsgVPyYSH8jEDpTbAQJ2e8tjLZVum2idtgpUbS1zbnvcvBi9qWuSoQN?cluster=devnet) | ok |
| vote For — investor3 (65 bonds) | [tx](https://explorer.solana.com/tx/ZPLYMbBD3KNiqfHULtXMyMR4hr8PdSppobB2hSGY2YRQ8SUVparvEfQWWJZH83v6EifAHXfFxGKaXEU2oV2G8rH?cluster=devnet) | ok |
| vote Against — investor2 (25 bonds) | [tx](https://explorer.solana.com/tx/3feTUFNArVDYfC26yD6ZzXjpdccGi1k3Yp8MeAiAAdiaM8LccQAe9eTVZzjArEpcxtqc9eFnNwuSPXFKSPySSmZc?cluster=devnet) | ok |

## Atyrau Oil (KZ2C0QPN0042) — early_call

| Step | Transaction | Status |
|---|---|---|
| series:create Atyrau-Oil — face 100000, 1000 bps ×2/yr, 2026-10-11 → 2027-06-11, DEMO clock 1 day = 4 s | — | ok |
| kyc:attest investor1 — SIMULATED KYC provider | — | ok |
| investor:register investor1 | [tx](https://explorer.solana.com/tx/2Zrk34kXoQ88tTjRgUB9ZUUcpbVjJdb5sqqEP4WtEfgEn9c2nGPfdMyumuEzunLUSwHRxPr47YFdqTBYTjuNrWgn?cluster=devnet) | ok |
| kyc:attest investor2 — SIMULATED KYC provider | — | ok |
| investor:register investor2 | [tx](https://explorer.solana.com/tx/2s9nfMafBrfFZadkDdqtPn9wtcZk8pKfjkKHuXU5Dw4FGb56QXReaeoiUogQWSfAFXMsb6AApo8EC3Lpx5Zjmbhu?cluster=devnet) | ok |
| kyc:attest investor3 — SIMULATED KYC provider | — | ok |
| investor:register investor3 | [tx](https://explorer.solana.com/tx/awGws5wN8GuysqQkKnNZDwdecQMRUUT3uP8UaQu3NRddj9mWJT62bZKjRnxw5H2fibY6mzK2sW3sQCfzn5YZ1ka?cluster=devnet) | ok |
| subscribe 10 bonds — investor1 | [tx](https://explorer.solana.com/tx/5qYSUqZ5oBhv4DNyoK6j3yLDCUZRGzGuMZfmJBuBcdqXgaSwUNWaJ5hyaidKfjDHLEPXhNFD36iFbSHnazr6uKCu?cluster=devnet) | ok |
| subscribe 25 bonds — investor2 | [tx](https://explorer.solana.com/tx/2H9BP1Cg7U7xRwmB3Whu6L9MucMcHfcdRTgMJaogzgDuRvMfa5wY5Xr2uyCqVKcNThwyJcLUo6vLy2Df5TQkyKAm?cluster=devnet) | ok |
| subscribe 65 bonds — investor3 | [tx](https://explorer.solana.com/tx/NjorqyWVxFWJ5ZXStXBUiduh5CRGe49hnYbSJquwFJrTdRWPEuG3vRDtX2rb1bodWG5HBHemBnZpuKGe4fVhKoE?cluster=devnet) | ok |
| action:announce MCAL SHOW4-MCAL-0001 — call on 2027-02-11 (before the first coupon) | [tx](https://explorer.solana.com/tx/cZkKogPNBhXaPgrYm8jpzNCMtyouHcdmekvwi9yKhUu4wBdaJ1ceiNYcgcu65SkXLBu6jBothzi4xAnXwFUEept?cluster=devnet) | ok |
