const API_BASE = "https://api.cloudflare.com/client/v4";

export interface CfZone {
  id: string;
  name: string;
}

export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

interface CfListResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T[];
  result_info: { page: number; per_page: number; total_pages: number };
}

async function cfGet<T>(path: string, token: string, accountId: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API_BASE}${path}${sep}page=${page}&per_page=50` + (path === "/zones" ? `&account.id=${accountId}` : "");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as CfListResponse<T>;

    if (!body.success) {
      throw new Error(`Cloudflare API error on ${path}: ${JSON.stringify(body.errors)}`);
    }

    results.push(...body.result);

    if (page >= body.result_info.total_pages) break;
    page++;
  }

  return results;
}

export async function listZones(token: string, accountId: string): Promise<CfZone[]> {
  return cfGet<CfZone>("/zones", token, accountId);
}

export async function listDnsRecords(token: string, accountId: string, zoneId: string): Promise<CfDnsRecord[]> {
  const records = await cfGet<CfDnsRecord>(`/zones/${zoneId}/dns_records`, token, accountId);
  return records.filter((r) => r.type === "A" || r.type === "AAAA" || r.type === "CNAME");
}
