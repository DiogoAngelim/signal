# Liquidity Manager

A Signal example app for answering one question: is this purchase justifiable given my real cashflow?

## Run

```sh
pnpm --filter @signal/liquidity-manager dev
```

## Test

```sh
pnpm --filter @signal/liquidity-manager typecheck
pnpm --filter @signal/liquidity-manager test
pnpm --filter @signal/liquidity-manager build
```

## MVP Scope

- Sample data works immediately and is the default path.
- Manual CSV upload supports `date`, `description`, and `amount`, plus optional `category`, `type`, and `balance`.
- The purchase decision engine consumes normalized cashflow data only.
- Nubank is isolated behind `FinancialDataConnector` as an experimental unofficial connector using `fmsouza/nubank-api`.
- Open Finance is a placeholder only.

## Security Notes

- Nubank passwords are never stored.
- First-time Nubank auth uses a locally generated QR id; repeat syncs can use `NUBANK_API_AUTH_STATE`.
- Certificate-backed account sync can read `NUBANK_API_CERT_BASE64` or `NUBANK_API_CERT_PATH` when available.
- CPF values are masked before persistence.
- Session data is encrypted before it is stored on the connection record.
- Set `LIQUIDITY_MANAGER_ENCRYPTION_SECRET` before using a real session adapter.
- The MVP does not initiate payments, Pix, transfers, loans, card actions, or investment advice.

## Known Limitations

- Nubank is unofficial and depends on QR authorization plus Nubank API availability; failed connection attempts still direct the user to manual upload.
- Open Finance is intentionally not implemented.
- Cashflow and purchase scoring are deterministic MVP rules, not financial advice.
