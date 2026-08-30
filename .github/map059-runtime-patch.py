from pathlib import Path

path = Path('src/map/leaflet.ts')
source = path.read_text()

old = """  let renderMarkers: (\n    markers: readonly AtlasPinMarkerModel[],\n    eagerPortraitPinIds?: ReadonlySet<string>,\n  ) => void = () => undefined;\n\n  const activatePin = (pin: AtlasPinMarkerModel): void => {\n"""
new = """  let renderMarkers: (\n    markers: readonly AtlasPinMarkerModel[],\n    eagerPortraitPinIds?: ReadonlySet<string>,\n  ) => void = () => undefined;\n  let locatePin: (pinId: string, revealGrouped?: boolean) => void = () => undefined;\n\n  const activatePin = (pin: AtlasPinMarkerModel): void => {\n"""
assert old in source
source = source.replace(old, new)

old = """  const activatePin = (pin: AtlasPinMarkerModel): void => {\n    collapseSpiderfy(false);\n    map.closePopup();\n    options.onPinActivate?.(pin);\n\n    if (pin.legacyPlaceId === null) {\n      activeSupplementalPinId = pin.id;\n      activePlaceId = null;\n      elements.searchStatus.textContent = `${pin.name}, ${getPinTypeVisual(pin.entityType).label.toLocaleLowerCase('es')}, seleccionado en el mapa.`;\n      renderedGroups.forEach(({ marker, pins }) =>\n        updateGroupPresentation(marker, pins),\n      );\n      refreshPortraitMarkers();\n    }\n  };\n"""
new = """  const activatePin = (pin: AtlasPinMarkerModel): void => {\n    const originGroup = renderedGroupByPinId.get(pin.id);\n    collapseSpiderfy(false);\n    map.closePopup();\n    options.onPinActivate?.(pin);\n\n    if (pin.legacyPlaceId === null) {\n      activeSupplementalPinId = pin.id;\n      activePlaceId = null;\n      locatePin(pin.id, false);\n      if (originGroup && originGroup.pins.length > 1) {\n        const clusterElement = renderedGroupByPinId.get(pin.id)?.marker.getElement();\n        if (clusterElement) {\n          clusterElement.dataset.markerLat = String(pin.coordinate[0]);\n          clusterElement.dataset.markerLng = String(pin.coordinate[1]);\n        }\n      }\n      elements.searchStatus.textContent = `${pin.name}, ${getPinTypeVisual(pin.entityType).label.toLocaleLowerCase('es')}, seleccionado en el mapa.`;\n      renderedGroups.forEach(({ marker, pins }) =>\n        updateGroupPresentation(marker, pins),\n      );\n      refreshPortraitMarkers();\n    }\n  };\n"""
assert old in source
source = source.replace(old, new)

old = """  const locatePin = (pinId: string): void => {\n    const pin = renderedMarkers.find(({ id }) => id === pinId);\n    if (!pin) return;\n\n    collapseSpiderfy(false);\n    clearMapSearchFocus(map);\n    const targetZoom = Math.min(\n      FAERUN_MAP_CONFIG.maxZoom,\n      Math.max(map.getZoom(), map.getMinZoom() + 1),\n    );\n    map.setView(L.latLng(pin.coordinate[0], pin.coordinate[1]), targetZoom, {\n      animate: false,\n    });\n    map.panInsideBounds(bounds, { animate: false });\n    synchronizeViewDataset(map, elements.shell);\n    reclusterAtCurrentZoom();\n    revealPin(pinId, false);\n  };\n"""
new = """  locatePin = (pinId: string, revealGrouped = true): void => {\n    const pin = renderedMarkers.find(({ id }) => id === pinId);\n    if (!pin) return;\n\n    collapseSpiderfy(false);\n    clearMapSearchFocus(map);\n    const targetZoom = Math.min(\n      FAERUN_MAP_CONFIG.maxZoom,\n      Math.max(map.getZoom(), map.getMinZoom() + 1),\n    );\n    map.setView(L.latLng(pin.coordinate[0], pin.coordinate[1]), targetZoom, {\n      animate: false,\n    });\n    map.panInsideBounds(bounds, { animate: false });\n    synchronizeViewDataset(map, elements.shell);\n    reclusterAtCurrentZoom();\n    if (revealGrouped) revealPin(pinId, false);\n  };\n"""
assert old in source
source = source.replace(old, new)

old = """  const handleMapClick = (): void => collapseSpiderfy(false);\n\n  map.on('zoomstart', handleZoomStart);\n"""
new = """  const handleMapClick = (): void => collapseSpiderfy(false);\n  const interactionRoot = root instanceof HTMLElement ? root : null;\n  const handleRootPointerDown = (event: PointerEvent): void => {\n    if (!activeSpiderfy || !(event.target instanceof Element)) return;\n    if (event.target.closest('[data-spiderfied=\"true\"]')) return;\n    collapseSpiderfy(false);\n  };\n  interactionRoot?.addEventListener('pointerdown', handleRootPointerDown);\n\n  map.on('zoomstart', handleZoomStart);\n"""
assert old in source
source = source.replace(old, new)

old = """      elements.canvas.removeEventListener('keydown', handleMapKeyDown);\n      resizeObserver?.disconnect();\n"""
new = """      elements.canvas.removeEventListener('keydown', handleMapKeyDown);\n      interactionRoot?.removeEventListener('pointerdown', handleRootPointerDown);\n      resizeObserver?.disconnect();\n"""
assert old in source
source = source.replace(old, new)

path.write_text(source)
