export interface CatalogLocation {
  readonly screenId: string | undefined
  readonly flowId: string | undefined
  readonly variantId: string | undefined
}

export function readCatalogLocation(url: URL): CatalogLocation {
  return {
    screenId: url.searchParams.get("screen") ?? undefined,
    flowId: url.searchParams.get("flow") ?? undefined,
    variantId: url.searchParams.get("set") ?? undefined,
  }
}

export function catalogDeepLink(
  screenId: string,
  options: { readonly flowId?: string; readonly variantId?: string } = {},
) {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("screen", screenId)
  if (options.flowId) url.searchParams.set("flow", options.flowId)
  if (options.variantId) url.searchParams.set("set", options.variantId)
  return url.href
}

export function catalogRootUrl() {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  return url.href
}
