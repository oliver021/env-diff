export interface VercelEnvVar {
  id?: string;
  key: string;
  value: string;
  type: 'plain' | 'encrypted' | 'sensitive';
  target: string[];
}

const API = 'https://api.vercel.com';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function listEnv(project: string, token: string): Promise<VercelEnvVar[]> {
  const res = await fetch(`${API}/v9/projects/${encodeURIComponent(project)}/env`, {
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error(`Vercel listEnv failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  return (data.envs || []).map((e: any) => ({
    id: e.id, key: e.key, value: e.value ?? '', type: e.type, target: e.target || []
  }));
}

export async function upsertEnv(
  project: string,
  token: string,
  vars: { key: string; value: string; target?: string[] }[]
): Promise<void> {
  const body = vars.map(v => ({
    key: v.key,
    value: v.value,
    type: 'encrypted',
    target: v.target || ['production', 'preview', 'development']
  }));
  const res = await fetch(`${API}/v10/projects/${encodeURIComponent(project)}/env?upsert=true`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Vercel upsertEnv failed: ${res.status} ${await res.text()}`);
}

export async function deleteEnv(project: string, token: string, id: string): Promise<void> {
  const res = await fetch(`${API}/v9/projects/${encodeURIComponent(project)}/env/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error(`Vercel deleteEnv failed: ${res.status} ${await res.text()}`);
}
