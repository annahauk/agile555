export type Query = Record<string, any>;

export async function insert<T>(document: T): Promise<T | null> {
  console.log('[db.insert]', document);
  return document;
}

export async function update<T>(query: Query, document: T): Promise<T | null> {
  console.log('[db.update]', { query, document });
  return document;
}

export async function find<T>(query: Query): Promise<T | null> {
  console.log('[db.find]', query);
  return null;
}
export async function del(query: Query): Promise<boolean> {
  console.log('[db.del]', query);
  return true;
}

export async function make_id(): Promise<string> {
  const id = crypto.randomUUID();
  console.log('[db.make_id]', id);
  return id;
}