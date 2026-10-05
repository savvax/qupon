# Qupon diagrams

Source `.mmd` files live next to this README; the same diagrams are embedded below as ```mermaid blocks so GitHub renders them natively.

## Architecture

```mermaid
flowchart TB
    subgraph clients["clients/ts — qupon CLI + @solana/kit 8 + Codama client"]
        cli["qupon CLI<br/>(series:init, action:*, vote, state:dump)"]
        scripts["scripts/<br/>create-tkzt, create-bond-mint, demo-full"]
    end

    subgraph program["programs/qupon_bonds — Anchor 1.2, devnet"]
        subgraph pdas["PDA accounts"]
            series["Series<br/>seeds [&quot;series&quot;, mint]"]
            investor["Investor<br/>seeds [&quot;investor&quot;, series, owner]"]
            action["CorporateAction<br/>seeds [&quot;action&quot;, series, index]"]
            entitlement["Entitlement<br/>seeds [&quot;entitlement&quot;, action, owner]"]
        end
        instrs["Instructions<br/>init_series · register_investor · subscribe ·<br/>announce_action · strike_record · snapshot_batch ·<br/>finalize_snapshot · fund_action · pay_batch ·<br/>complete_action · retire_batch · close_series ·<br/>cast_vote · finalize_meeting · apply_terms_change"]
        events["Anchor events<br/>ActionAnnounced, RecordStruck,<br/>SnapshotFinalized, ActionFunded, ..."]
    end

    subgraph tokens["SPL Token-2022"]
        bond["Bond mint<br/>MetadataPointer+TokenMetadata, DefaultAccountState=Frozen,<br/>PermanentDelegate, Pausable, decimals 0"]
        cash["Cash mint (tKZT / USDC)"]
        taxv["tax_vault ATA (series PDA)"]
        escrow["escrow ATA (action PDA)"]
    end

    subgraph registrar["services/registrar — Go 1.25"]
        scheduler["internal/scheduler<br/>(ticker, approval gate)"]
        executor["internal/executor<br/>(exec qupon CLI, timeout)"]
        chain["internal/chain<br/>(RPC + Borsh decoders)"]
        reconcile["internal/reconcile<br/>(snapshot hash check)"]
        iso["internal/iso20022<br/>(seev.031 / seev.036)"]
        api["internal/api<br/>(REST + activity)"]
    end

    web["apps/web — Next.js 15<br/>console + investor portal"]

    cli -->|"build + send tx"| instrs
    scripts --> cli
    scheduler --> executor --> cli
    api --> executor
    chain --> pdas
    reconcile --> chain
    iso --> reconcile
    web -->|"REST"| api
    instrs --> series
    instrs --> investor
    instrs --> action
    instrs --> entitlement
    instrs -->|"CPI pause/resume"| bond
    instrs -->|"mint/burn/transfers"| cash
    instrs --> escrow
    instrs --> taxv
    instrs --> events
```

## Corporate-action state machine

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Announced: announce_action<br/>(registrar/issuer)

    Announced --> Cancelled: cancel_action
    Cancelled --> [*]

    Announced --> RecordStruck: strike_record<br/>(CPI pause mint, ≥ record_at)
    RecordStruck --> RecordStruck: snapshot_batch*<br/>(≤8 holders/tx, idempotent)
    RecordStruck --> SnapshotComplete: finalize_snapshot<br/>(units == supply, rounding check)

    SnapshotComplete --> Funded: fund_action*<br/>(escrow ≥ total)
    Funded --> Settling: pay_batch*<br/>(≤10 holders/tx)
    Settling --> Completed: complete_action<br/>(CPI resume; INTR)

    Settling --> Retiring: complete_action<br/>(REDM / MCAL / PCAL)
    Retiring --> Retiring: retire_batch*<br/>(permanent-delegate burn)
    Retiring --> Completed: close_series<br/>(supply == 0, Series → Closed)

    SnapshotComplete --> VotingOpen: finalize_snapshot<br/>(BMET: CPI resume)
    VotingOpen --> VotingOpen: cast_vote*<br/>(weight = snapshot units)
    VotingOpen --> Finalized: finalize_meeting<br/>(quorum + approval)
    Finalized --> Completed: apply_terms_change<br/>(Approved only; CHAN)

    Completed --> [*]
    note right of Announced
        One open action per Series
        (open_action is None required)
    end note
```

## Record-date snapshot sequence

```mermaid
sequenceDiagram
    autonumber
    participant R as Registrar (Go scheduler / CLI)
    participant P as qupon_bonds program
    participant M as Bond mint (Token-2022 Pausable)
    participant E as Entitlement PDAs
    participant H as Holders

    Note over R: record_at reached<br/>(00:00 Asia/Almaty, start of last day)
    R->>P: strike_record
    P->>M: CPI pause (series PDA)
    P-->>R: event RecordStruck (snapshot_slot)

    loop snapshot_batch (batches of ≤ 8 holders, ascending owner pubkey)
        R->>P: snapshot_batch [Investor, bond ATA, Entitlement]…
        P->>E: create/fill Entitlement (units, gross, tax, net)
        P->>P: snapshot_hash = sha256(prev ‖ owner ‖ units LE)
        P-->>R: event SnapshotBatch
    end

    R->>P: finalize_snapshot
    P->>P: check units_snapshotted == mint.supply<br/>+ rounding drift check (half-up per holder)
    alt kind == BMET
        P->>M: CPI resume (voting uses snapshot weights)
        P-->>R: SnapshotFinalized → VotingOpen
    else cash action (INTR/REDM/MCAL/PCAL)
        P-->>R: SnapshotFinalized → SnapshotComplete
    end

    Note over R,H: mint stays paused: no transfers possible
    R->>P: fund_action (issuer → escrow ATA)
    loop pay_batch (batches of ≤ 10 holders)
        R->>P: pay_batch [Entitlement, Investor, cash ATA]…
        P->>H: transfer net + principal (escrow → holder)
        P->>P: transfer tax → tax_vault
        P-->>R: event PaymentMade (status Paid, idempotent)
    end
    R->>P: complete_action
    P->>M: CPI resume
    P-->>R: ActionCompleted (Series.period_start advanced / open_action cleared)
```
