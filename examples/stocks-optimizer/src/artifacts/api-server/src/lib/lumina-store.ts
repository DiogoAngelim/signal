import crypto from "node:crypto";
import pg from "pg";
import { ApiProblem } from "../observability/signal-http.js";

const { Pool } = pg;
let pool: pg.Pool | null = null;

export function luminaDb(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new ApiProblem(503, "database_unconfigured", "Persistent data requires a configured database.");
  }
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 30000 });
  return pool;
}
export function luminaId() { return crypto.randomUUID(); }

export type LuminaGoal = {
  id: string; title: string; targetAmount: number | null;
  targetDate: string | null; description: string;
  createdAt: string; updatedAt: string;
};
// A goal deadline is a civil date, not an instant. Format it in PostgreSQL
// before node-postgres can reinterpret DATE as a local-midnight JavaScript Date.
const goalFields = "id,title,target_amount,to_char(target_date, 'YYYY-MM-DD') AS target_date,description,created_at,updated_at";
function goalFromRow(row: any): LuminaGoal {
  return {
    id: row.id, title: row.title,
    targetAmount: row.target_amount == null ? null : Number(row.target_amount),
    targetDate: row.target_date == null ? null : String(row.target_date),
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function listGoals(owner: string) {
  const { rows } = await luminaDb().query(
    "SELECT " + goalFields + " FROM lumina_goals WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100", [owner],
  );
  return rows.map(goalFromRow);
}
export async function addGoal(owner: string, data: {
  title: string; targetAmount?: number | null; targetDate?: string | null; description?: string;
}) {
  const { rows } = await luminaDb().query(
    "INSERT INTO lumina_goals(id,owner_id,title,target_amount,target_date,description)" +
    " VALUES($1,$2,$3,$4,$5,$6) RETURNING " + goalFields,
    [luminaId(), owner, data.title, data.targetAmount ?? null, data.targetDate ?? null, data.description ?? ""],
  );
  return goalFromRow(rows[0]);
}
export async function updateGoal(owner: string, id: string, data: {
  title: string; targetAmount?: number | null; targetDate?: string | null; description?: string;
}) {
  const { rows } = await luminaDb().query(
    "UPDATE lumina_goals SET title=$3,target_amount=$4,target_date=$5,description=$6,updated_at=now()" +
    " WHERE owner_id=$1 AND id=$2 RETURNING " + goalFields,
    [owner, id, data.title, data.targetAmount ?? null, data.targetDate ?? null, data.description ?? ""],
  );
  return rows[0] ? goalFromRow(rows[0]) : null;
}
export async function deleteGoal(owner: string, id: string) {
  const { rowCount } = await luminaDb().query(
    "DELETE FROM lumina_goals WHERE owner_id=$1 AND id=$2", [owner, id],
  );
  return Boolean(rowCount);
}

export type LuminaPractice = {
  id: string; at: string; amount: number; exposedPercent: number; accessiblePercent: number;
  goal: string; goalId: string | null; horizon: "soon" | "middle" | "later" | "unsure" | null;
  rationale: string; provenance: "illustrative"; executed: false;
};
function practiceFromRow(row: any): LuminaPractice {
  return {
    id: row.id, at: new Date(row.created_at).toISOString(),
    amount: Number(row.amount), exposedPercent: row.exposed_percent,
    accessiblePercent: 100 - row.exposed_percent,
    goal: row.goal_label, goalId: row.goal_id,
    horizon: row.horizon, rationale: row.rationale,
    provenance: "illustrative", executed: false,
  };
}
export async function listPractice(owner: string) {
  const { rows } = await luminaDb().query(
    "SELECT * FROM lumina_practice_choices WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100", [owner],
  );
  return rows.map(practiceFromRow);
}
export async function addPractice(owner: string, data: {
  amount: number; exposedPercent: number; goal: string;
  goalId?: string | null; horizon?: LuminaPractice["horizon"]; rationale?: string;
}) {
  if (data.goalId) {
    const check = await luminaDb().query(
      "SELECT id FROM lumina_goals WHERE id=$1 AND owner_id=$2", [data.goalId, owner],
    );
    if (!check.rowCount) throw new ApiProblem(404, "goal_not_found", "Goal was not found.");
  }
  const { rows } = await luminaDb().query(
    "INSERT INTO lumina_practice_choices(id,owner_id,goal_id,goal_label,amount,exposed_percent,horizon,rationale)" +
    " VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [luminaId(), owner, data.goalId ?? null, data.goal, data.amount,
      data.exposedPercent, data.horizon ?? null, data.rationale ?? ""],
  );
  return practiceFromRow(rows[0]);
}
export async function removePractice(owner: string, id: string) {
  const { rowCount } = await luminaDb().query(
    "DELETE FROM lumina_practice_choices WHERE owner_id=$1 AND id=$2", [owner, id],
  );
  return Boolean(rowCount);
}
export async function clearPractice(owner: string) {
  const { rowCount } = await luminaDb().query(
    "DELETE FROM lumina_practice_choices WHERE owner_id=$1", [owner],
  );
  return Number(rowCount ?? 0);
}

export type LuminaConversation = { id: string; title: string; createdAt: string; updatedAt: string };
function conversationFromRow(row: any): LuminaConversation {
  return { id: row.id, title: row.title,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
export async function listConversations(owner: string) {
  const { rows } = await luminaDb().query(
    "SELECT * FROM lumina_conversations WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100",
    [owner],
  );
  return rows.map(conversationFromRow);
}
export async function addConversation(owner: string, title: string) {
  const { rows } = await luminaDb().query(
    "INSERT INTO lumina_conversations(id,owner_id,title) VALUES($1,$2,$3) RETURNING *",
    [luminaId(), owner, title],
  );
  return conversationFromRow(rows[0]);
}
export async function removeConversation(owner: string, id: string) {
  const { rowCount } = await luminaDb().query(
    "DELETE FROM lumina_conversations WHERE owner_id=$1 AND id=$2", [owner, id],
  );
  return Boolean(rowCount);
}
export type LuminaMessage = {
  id: string; conversationId: string; role: "user" | "assistant"; content: string;
  provenance: "user-provided" | "illustrative" | "ai-generated"; createdAt: string;
};
function messageFromRow(row: any): LuminaMessage {
  return { id: row.id, conversationId: row.conversation_id, role: row.role,
    content: row.content, provenance: row.provenance,
    createdAt: new Date(row.created_at).toISOString() };
}
export async function listMessages(owner: string, conversationId: string) {
  const { rows } = await luminaDb().query(
    "SELECT m.* FROM lumina_messages m JOIN lumina_conversations c ON m.conversation_id=c.id" +
    " WHERE c.owner_id=$1 AND m.owner_id=$1 AND m.conversation_id=$2" +
    " ORDER BY m.created_at ASC,m.id ASC LIMIT 250", [owner, conversationId],
  );
  return rows.map(messageFromRow);
}
export async function appendMessages(owner: string, conversationId: string, entries: Array<{
  role: "user" | "assistant"; content: string; provenance: LuminaMessage["provenance"];
}>) {
  const client = await luminaDb().connect();
  try {
    await client.query("BEGIN");
    const check = await client.query(
      "SELECT id FROM lumina_conversations WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [conversationId, owner],
    );
    if (!check.rowCount) throw new ApiProblem(404, "conversation_not_found", "Conversation was not found.");
    const result: LuminaMessage[] = [];
    for (const entry of entries) {
      const { rows } = await client.query(
        "INSERT INTO lumina_messages(id,owner_id,conversation_id,role,content,provenance)" +
        " VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [luminaId(), owner, conversationId, entry.role, entry.content, entry.provenance],
      );
      result.push(messageFromRow(rows[0]));
    }
    await client.query(
      "UPDATE lumina_conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2",
      [conversationId, owner],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function eraseLuminaData(owner: string) {
  const client = await luminaDb().connect();
  try {
    await client.query("BEGIN");
    for (const table of [
      "lumina_messages", "lumina_conversations", "lumina_practice_choices",
      "lumina_goals", "lumina_inbox", "lumina_market_watches",
    ]) {
      await client.query("DELETE FROM " + table + " WHERE owner_id=$1", [owner]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}
