# Real on-chain account fixtures

Bytes actually written by the `qupon_bonds` program, used by the Go layout-parity
tests (`services/registrar/internal/chain/decode_real_test.go`). A mismatch there
means the Go decoder is wrong — never edit these files by hand.

Per account kind (`series`, `investor`, `action`, `entitlement`):

- `<kind>.b64` — base64 of the full account data, including the 8-byte Anchor discriminator.
- `<kind>.json` — `pubkey` + `expected` decode of every field (snake_case, like `state.rs`),
  produced by Anchor's own deserializer.

## Regenerate (off-line, LiteSVM)

Runs the brief's coupon cycle (10/25/65 units, 10% withholding on one holder),
pays it and leaves the action open (`open_action: Some`):

```sh
EXPORT_FIXTURES=1 cargo test -p qupon_bonds --test export_fixtures -- --nocapture
```

## Regenerate (devnet)

After a coupon run on the demo series, dump the same bytes with the CLI and take
the `dataB64` field of one account per kind:

```sh
qupon state:dump --series demo1 --raw
```
