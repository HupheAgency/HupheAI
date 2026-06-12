export interface ClientLogo {
  id: string
  clientId: string
  label: string | null
  dataUrl: string
  isPrimary: boolean
  source: 'import' | 'upload'
  createdAt: string
}

function api() { return (window as any).api }

export async function fetchClientLogos(clientId: string): Promise<ClientLogo[]> {
  return (await api().getClientLogos(clientId)) ?? []
}

export async function saveClientLogo(
  clientId: string,
  dataUrl: string,
  opts: { label?: string; source?: 'import' | 'upload'; makePrimary?: boolean } = {}
): Promise<ClientLogo | null> {
  return api().saveClientLogo(clientId, dataUrl, opts) ?? null
}

export async function setPrimaryLogo(clientId: string, logoId: string): Promise<boolean> {
  const result = await api().setPrimaryClientLogo(clientId, logoId)
  return result?.ok ?? false
}

export async function deleteClientLogo(clientId: string, logoId: string): Promise<boolean> {
  const result = await api().deleteClientLogo(clientId, logoId)
  return result?.ok ?? false
}

export async function updateClientLogo(clientId: string, logoId: string, patch: { label?: string }): Promise<boolean> {
  const result = await api().updateClientLogo(clientId, logoId, patch)
  return result?.ok ?? false
}

export async function getActiveLogo(clientId: string): Promise<string | null> {
  const logos: ClientLogo[] = await fetchClientLogos(clientId)
  if (!logos.length) return null
  return (logos.find((l) => l.isPrimary) ?? logos[0]).dataUrl
}

/** Extraheer alle unieke logo dataUrls uit geïmporteerde templateData. */
export function extractLogosFromTemplateData(
  templateData: { layouts: Array<{ logoSlot?: { dataUrl?: string } }> }
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const layout of templateData.layouts ?? []) {
    const url = layout.logoSlot?.dataUrl
    if (url && !seen.has(url)) {
      seen.add(url)
      result.push(url)
    }
  }
  return result
}
