import type {
  BalanceSnapshot,
  BankConnection,
  ConnectionResult,
  FinancialDataConnector,
  RawTransaction,
} from "./models.js";

export class FinancialDataSession {
  activeConnection?: BankConnection;
  balances: BalanceSnapshot[] = [];
  rawTransactions: RawTransaction[] = [];

  async connect(
    connector: FinancialDataConnector,
    input: unknown,
  ): Promise<ConnectionResult> {
    const result = await connector.connect(input);
    if (!result.ok) return result;
    this.activeConnection = result.connection;
    this.balances = await connector.fetchBalances(result.connection.id);
    this.rawTransactions = await connector.fetchTransactions(
      result.connection.id,
    );
    return result;
  }

  async disconnect(connector?: FinancialDataConnector): Promise<void> {
    if (connector && this.activeConnection) {
      await connector.disconnect(this.activeConnection.id);
    }
    this.activeConnection = undefined;
    this.balances = [];
    this.rawTransactions = [];
  }

  deleteImportedData(): void {
    this.balances = [];
    this.rawTransactions = [];
  }
}
