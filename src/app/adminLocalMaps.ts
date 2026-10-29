import type { AdminAuthController } from '../auth/adminAuthController';
import { adminCampaignContext } from '../application/adminCampaignContext';
import {
  type LocalMapContext,
  type LocalMapContextDraft,
  type LocalMapPlacement,
  type LocalMapBinding,
  type LocalMapEntity,
  validateLocalContext,
  validateLocalGeometry,
  localContextDescendants,
  isLocalCoordinateInBounds,
} from '../domain/adminLocalMaps';
import type { MapEntityGeometry } from '../domain/mapGeometry';
import { mapGeometryRepresentativePoint } from '../domain/mapGeometry';
import {
  AdminLocalMapError,
  SupabaseLocalMapRepository,
  type LocalMapRepository,
  type GlobalContextDependencies,
} from '../infrastructure/supabase/adminLocalMapRepository';
import { mountAdminLocalMapEditor, type LocalMapEditor } from '../map/adminLocalMapEditor';
import '../styles/admin-local-maps.css';

type Tab = 'contexts' | 'bindings' | 'placements';
type Editor = 'context' | 'placement' | null;
const blankContext = (): LocalMapContextDraft => ({
  id: 'map-',
  slug: '',
  name: '',
  parentId: null,
  width: 0,
  height: 0,
  publicationStatus: 'draft',
  imageUri: null,
  loadingStrategy: null,
  sourceUrl: null,
  rightsHolder: null,
  attribution: null,
  licenseNotes: null,
});
function createRepository(): LocalMapRepository {
  const testConfig = import.meta.env.DEV ? window.__MAP017_AUTH_TEST_CONFIG__ : undefined;
  return new SupabaseLocalMapRepository({
    projectUrl: testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey:
      testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    timeoutMs: testConfig?.timeoutMs,
    allowLocalProject: import.meta.env.DEV,
  });
}
function $(root: ParentNode, id: string): HTMLElement {
  const element = root.querySelector<HTMLElement>('#' + id);
  if (!element) throw new Error('Missing local map admin control: ' + id);
  return element;
}
function input(root: ParentNode, id: string): HTMLInputElement {
  return $(root, id) as HTMLInputElement;
}
function select(root: ParentNode, id: string): HTMLSelectElement {
  return $(root, id) as HTMLSelectElement;
}
function optional(value: string): string | null {
  return value.trim() || null;
}
function addOption(el: HTMLSelectElement, value: string, label: string): void {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  el.append(item);
}
function notice(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function mountAdminLocalMaps(
  root: ParentNode,
  auth: AdminAuthController,
): { destroy(): void } {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  if (!shell) throw new Error('Missing administrative shell for local maps.');
  const section = document.createElement('section');
  section.className = 'admin-local-maps';
  section.innerHTML = `
    <h3 id="admin-local-maps-heading">Mapas locales</h3>
    <p>Un <strong>contexto cartográfico</strong> es global e independiente de la campaña. Un <strong>binding</strong> enlaza campaña y geografía con ese contexto. Un <strong>placement</strong> sitúa una entidad de campaña dentro del contexto. La entidad no se convierte en el mapa.</p>
    <div class="admin-local-maps__tabs" role="group" aria-label="Administración de mapas locales">
      <button type="button" data-local-tab="contexts" aria-pressed="true">Contextos globales</button>
      <button type="button" data-local-tab="bindings" aria-pressed="false">Bindings de campaña</button>
      <button type="button" data-local-tab="placements" aria-pressed="false">Placements de campaña</button>
    </div>
    <p id="local-maps-status" role="status" aria-live="polite" aria-atomic="true"></p>
    <div id="local-maps-contexts">
      <h4>Contextos cartográficos · GLOBAL</h4>
      <p>Crear un contexto es opcional y explícito. No pertenece a ninguna campaña, aunque tenga bindings.</p>
      <button type="button" id="local-context-new">Crear contexto</button>
      <button type="button" id="local-context-reload">Recargar</button>
      <ul id="local-context-list" aria-label="Contextos cartográficos"></ul>
      <p id="local-context-empty" hidden>No hay contextos cartográficos disponibles.</p>
    </div>
    <div id="local-maps-bindings" hidden>
      <h4>Bindings · CAMPAIGN-SCOPED</h4>
      <button type="button" id="local-campaign-reload">Recargar datos de campaña</button>
      <p id="local-binding-campaign"></p>
      <p>Campaña administrativa activa + nombre geográfico existente → contexto global. No se crea una entidad ni se copian coordenadas.</p>
      <form id="local-binding-form">
        <label for="local-binding-geography">Geonombre</label>
        <select id="local-binding-geography" required></select>
        <label for="local-binding-context">Contexto global</label>
        <select id="local-binding-context" required></select>
        <button type="submit">Asociar geografía</button>
      </form>
      <ul id="local-binding-list" aria-label="Bindings de la campaña"></ul>
    </div>
    <div id="local-maps-placements" hidden>
      <h4>Placements · ENTIDAD DE CAMPAÑA</h4>
      <button type="button" id="local-placement-reload">Recargar datos de campaña</button>
      <p id="local-placement-campaign"></p>
      <p>Entidad de la campaña → geometría en un contexto global. La lectura pública multi-map/local-only se completará en MAP-079. Un placement guardado no garantiza todavía su visibilidad pública.</p>
      <button type="button" id="local-placement-new">Crear placement</button>
      <ul id="local-placement-list" aria-label="Placements de la campaña"></ul>
    </div>
    <section id="local-context-editor" class="admin-local-maps__editor" aria-labelledby="local-context-editor-title" hidden>
      <h4 id="local-context-editor-title">Editar contexto global</h4>
      <p id="local-context-error" class="admin-local-maps__error" role="alert" tabindex="-1"></p>
      <form id="local-context-form" novalidate>
        <div class="admin-local-maps__fields">
          <label for="local-context-id">Identificador cartográfico (inmutable)</label><input id="local-context-id" required autocomplete="off">
          <label for="local-context-slug">Ruta cartográfica (inmutable)</label><input id="local-context-slug" required autocomplete="off">
          <label for="local-context-name">Denominación del mapa</label><input id="local-context-name" required>
          <label for="local-context-parent">Mapa contenedor (opcional)</label><select id="local-context-parent"></select>
          <label for="local-context-width">Extensión horizontal (px)</label><input id="local-context-width" type="number" min="0.000001" step="any" required>
          <label for="local-context-height">Extensión vertical (px)</label><input id="local-context-height" type="number" min="0.000001" step="any" required>
          <label for="local-context-status">Publicación del contexto</label>
          <select id="local-context-status"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select>
          <label for="local-context-uri">Recurso gráfico (URI opcional)</label><input id="local-context-uri" type="text">
          <label for="local-context-strategy">Estrategia del recurso gráfico</label>
          <select id="local-context-strategy"><option value="">Sin imagen</option><option value="remote">remote · imagen alojada en origen</option><option value="bundled">bundled · asset incorporado previamente</option></select>
          <label for="local-context-source">Enlace de procedencia</label><input id="local-context-source" type="text">
          <label for="local-context-rights">Propietario legal del gráfico</label><input id="local-context-rights">
          <label for="local-context-attribution">Créditos cartográficos</label><textarea id="local-context-attribution" rows="2"></textarea>
          <label for="local-context-license">Condiciones de distribución y licencia</label><textarea id="local-context-license" rows="3"></textarea>
        </div>
        <p>El identificador (ID) y la ruta (slug) son estables e inmutables tras crear el contexto. Solo se permite cambiar el nombre editorial.</p>
        <p>Sin imagen: URI y estrategia vacías. Con imagen: estrategia remote/bundled, fuente, titular y licencia obligatorios según PostgreSQL. Guardar metadatos no concede permisos de distribución ni sube archivos.</p>
        <p id="local-context-provenance" role="status"></p>
        <div class="admin-local-maps__actions"><button type="submit">Guardar contexto</button><button type="button" id="local-context-cancel">Cancelar edición</button></div>
      </form>
    </section>
    <section id="local-placement-editor" class="admin-local-maps__editor" aria-labelledby="local-placement-editor-title" hidden>
      <h4 id="local-placement-editor-title">Editor de placement · CRS.Simple</h4>
      <p id="local-placement-error" class="admin-local-maps__error" role="alert" tabindex="-1"></p>
      <form id="local-placement-form" novalidate>
        <label for="local-placement-context">Superficie cartográfica elegida</label><select id="local-placement-context" required></select>
        <label for="local-placement-entity">Elemento narrativo para situar</label><select id="local-placement-entity" required></select>
        <label for="local-placement-kind">Forma geométrica local</label><select id="local-placement-kind"><option value="point">Punto</option><option value="polygon">Polígono (solo location)</option></select>
        <label for="local-placement-status">Publicación del placement</label>
        <select id="local-placement-status"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select>
        <p id="local-placement-help">Selecciona un contexto y una entidad. Haz clic para definir el punto, o añade vértices en modo polígono. Arrastra puntos o usa las flechas con teclado. Suprimir elimina un vértice.</p>
        <div class="admin-local-maps__coordinate-controls">
          <label for="local-placement-x">X</label><input id="local-placement-x" type="number" step="any" inputmode="decimal">
          <label for="local-placement-y">Y</label><input id="local-placement-y" type="number" step="any" inputmode="decimal">
          <button id="local-placement-add-coordinate" type="button">Situar punto o añadir vértice</button>
        </div>
        <div id="local-placement-map" role="region" aria-label="Editor del contexto local" aria-describedby="local-placement-help"></div>
        <p id="local-placement-coordinate" aria-live="polite"></p>
        <div class="admin-local-maps__actions"><button type="submit">Guardar placement</button><button type="button" id="local-placement-cancel">Cancelar edición</button></div>
      </form>
    </section>
  `;
  section.setAttribute('aria-labelledby', 'admin-local-maps-heading');
  shell.append(section);
  let repository: LocalMapRepository | null = null;
  try {
    repository = createRepository();
  } catch {
    /* read-only message until configured */
  }
  let editing: Editor = null;
  let authorized = false;
  let connected = false;
  let destroyed = false;
  let campaignId = adminCampaignContext.getCampaignId();
  let globalSequence = 0,
    campaignSequence = 0;
  let globalAbort: AbortController | null = null,
    campaignAbort: AbortController | null = null,
    mutationAbort: AbortController | null = null;
  let contexts: LocalMapContext[] = [];
  let globalDependencies: ReadonlyMap<string, GlobalContextDependencies> = new Map();
  let bindings: LocalMapBinding[] = [];
  let placements: LocalMapPlacement[] = [];
  let entities: LocalMapEntity[] = [];
  let geographies: { id: string; name: string }[] = [];
  let originalContext: LocalMapContext | null = null;
  let originalPlacement: LocalMapPlacement | null = null;
  let geometry: MapEntityGeometry | null = null;
  let selectedPlacementContextId = '';
  let mapEditor: LocalMapEditor | null = null;
  let dirty = false;
  let busy = false;
  let campaignReady = false;
  let globalReady = false;
  let restoreFocus: HTMLElement | null = null;
  const pane = (tab: Tab) => $(section, 'local-maps-' + tab);
  const status = $(section, 'local-maps-status');
  function announce(message: string, isError = false): void {
    status.textContent = message;
    status.setAttribute('role', isError ? 'alert' : 'status');
  }
  function allowed(): boolean {
    return (
      authorized &&
      connected &&
      repository !== null &&
      !adminCampaignContext.isTransitioning() &&
      !busy
    );
  }
  function enable(): void {
    for (const button of section.querySelectorAll<HTMLButtonElement>('button')) {
      if (button.hasAttribute('data-local-tab')) continue;
      const needsGlobal =
        button.id === 'local-context-new' ||
        Boolean(button.closest('#local-context-list')) ||
        button.id === 'local-placement-new' ||
        Boolean(button.closest('#local-binding-form')) ||
        Boolean(button.closest('#local-placement-form'));
      const needsCampaign =
        button.id === 'local-placement-new' ||
        Boolean(button.closest('#local-binding-list, #local-placement-list')) ||
        Boolean(button.closest('#local-binding-form')) ||
        Boolean(button.closest('#local-placement-form'));
      button.disabled =
        !allowed() || (needsGlobal && !globalReady) || (needsCampaign && !campaignReady);
    }
  }
  function clearEditor(): void {
    mapEditor?.destroy();
    mapEditor = null;
    $(section, 'local-context-editor').hidden = true;
    $(section, 'local-placement-editor').hidden = true;
    editing = null;
    originalContext = null;
    originalPlacement = null;
    geometry = null;
    selectedPlacementContextId = '';
    dirty = false;
    if (restoreFocus?.isConnected) restoreFocus.focus();
    restoreFocus = null;
  }
  function purgePrivateControls(): void {
    for (const control of section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    )) {
      control.value = '';
      control.readOnly = false;
      control.removeAttribute('aria-invalid');
    }
    for (const control of section.querySelectorAll<HTMLSelectElement>('select')) {
      if (
        [
          'local-context-parent',
          'local-binding-geography',
          'local-binding-context',
          'local-placement-context',
          'local-placement-entity',
        ].includes(control.id)
      ) {
        control.replaceChildren();
      } else control.selectedIndex = 0;
      control.disabled = false;
      control.removeAttribute('aria-invalid');
    }
    for (const id of [
      'local-context-error',
      'local-placement-error',
      'local-placement-coordinate',
      'local-context-provenance',
      'local-binding-campaign',
      'local-placement-campaign',
    ]) {
      $(section, id).textContent = '';
    }
    $(section, 'local-context-editor-title').textContent = 'Editar contexto global';
    $(section, 'local-placement-editor-title').textContent = 'Editor de placement · CRS.Simple';
    status.textContent = '';
    status.setAttribute('role', 'status');
  }
  function guardDiscard(): boolean {
    return !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
  }
  function showTab(tab: Tab): void {
    if (!guardDiscard()) return;
    clearEditor();
    for (const name of ['contexts', 'bindings', 'placements'] as const) {
      pane(name).hidden = name !== tab;
      const btn = section.querySelector<HTMLButtonElement>('[data-local-tab="' + name + '"]');
      btn?.setAttribute('aria-pressed', String(name === tab));
    }
  }
  function setList<T>(
    element: HTMLElement,
    items: readonly T[],
    render: (item: T, li: HTMLLIElement) => void,
  ): void {
    element.replaceChildren();
    for (const item of items) {
      const li = document.createElement('li');
      render(item, li);
      element.append(li);
    }
  }
  function renderGlobal(): void {
    const list = $(section, 'local-context-list');
    $(section, 'local-context-empty').hidden = contexts.length > 0;
    setList(list, contexts, (context, li) => {
      const title = document.createElement('strong');
      title.textContent = context.name;
      const meta = document.createElement('p');
      const parent = contexts.find((c) => c.id === context.parentId);
      meta.textContent = `${context.slug} · ${context.width} × ${context.height} · ${context.publicationStatus} · Padre: ${parent?.name ?? 'ninguno'} · ${context.imageUri ? context.loadingStrategy : 'sin imagen'} · ${context.sourceUrl && context.rightsHolder && context.licenseNotes ? 'procedencia registrada' : 'procedencia pendiente'}`;
      const editButton = createButton('Editar contexto', () => openContext(context, editButton));
      li.append(title, meta, editButton);
      if (context.publicationStatus !== 'archived') {
        li.append(createButton('Archivar contexto', () => void archiveContext(context)));
      }
      if (
        context.publicationStatus === 'draft' &&
        !contexts.some((c) => c.parentId === context.id) &&
        globalDependencies.get(context.id)?.placementCount === 0 &&
        globalDependencies.get(context.id)?.bindingCount === 0
      ) {
        li.append(createButton('Eliminar contexto', () => void deleteContext(context)));
      }
    });
    updateChoices();
  }
  function renderCampaign(): void {
    const label = authorized ? 'Campaña administrativa: ' + campaignId : '';
    $(section, 'local-binding-campaign').textContent = label;
    $(section, 'local-placement-campaign').textContent = label;
    setList($(section, 'local-binding-list'), bindings, (binding, li) => {
      const geo = geographies.find((g) => g.id === binding.geographicNameId);
      const context = contexts.find((c) => c.id === binding.mapContextId);
      const label = document.createElement('span');
      label.textContent = `${geo?.name ?? binding.geographicNameId} → ${context?.name ?? binding.mapContextId}`;
      li.append(
        label,
        createButton('Desasociar binding', () => void deleteBinding(binding)),
      );
    });
    setList($(section, 'local-placement-list'), placements, (placement, li) => {
      const entity = entities.find((e) => e.id === placement.entityId);
      const context = contexts.find((c) => c.id === placement.mapContextId);
      const label = document.createElement('span');
      label.textContent = `${entity?.name ?? placement.entityId} · ${context?.name ?? placement.mapContextId} · ${placement.geometry.kind} · ${placement.publicationStatus}`;
      const editButton = createButton('Editar placement', () =>
        openPlacement(placement, editButton),
      );
      li.append(label, editButton);
      li.append(createButton('Borrar placement', () => void deletePlacement(placement)));
    });
    updateChoices();
  }
  function updateChoices(): void {
    const bindingsContext = select(section, 'local-binding-context');
    const geo = select(section, 'local-binding-geography');
    const currentBindingContext = bindingsContext.value,
      currentGeo = geo.value;
    bindingsContext.replaceChildren();
    geo.replaceChildren();
    addOption(bindingsContext, '', 'Seleccionar contexto');
    addOption(geo, '', 'Seleccionar geonombre');
    for (const context of contexts)
      addOption(bindingsContext, context.id, context.name + ' · ' + context.publicationStatus);
    for (const name of geographies.filter(
      (g) => !bindings.some((b) => b.geographicNameId === g.id),
    ))
      addOption(geo, name.id, name.name);
    bindingsContext.value = currentBindingContext || '';
    geo.value = currentGeo || '';
    const placementContext = select(section, 'local-placement-context');
    const placementEntity = select(section, 'local-placement-entity');
    const oldContext = placementContext.value,
      oldEntity = placementEntity.value;
    placementContext.replaceChildren();
    placementEntity.replaceChildren();
    addOption(placementContext, '', 'Seleccionar contexto');
    addOption(placementEntity, '', 'Seleccionar entidad');
    for (const context of contexts)
      addOption(
        placementContext,
        context.id,
        context.name + ' · ' + context.width + ' × ' + context.height,
      );
    for (const entity of entities)
      addOption(placementEntity, entity.id, entity.name + ' (' + entity.entityType + ')');
    if (originalPlacement) {
      placementContext.value = originalPlacement.mapContextId;
      placementEntity.value = originalPlacement.entityId;
    } else {
      placementContext.value = oldContext;
      placementEntity.value = oldEntity;
    }
  }
  async function loadGlobal(): Promise<void> {
    if (!authorized || !repository) return;
    globalAbort?.abort();
    const controller = new AbortController();
    globalAbort = controller;
    const generation = ++globalSequence;
    globalReady = false;
    globalDependencies = new Map();
    enable();
    announce('Cargando contextos globales…');
    try {
      const [next, dependencies] = await Promise.all([
        repository.listContexts(controller.signal),
        repository.listGlobalContextDependencies(controller.signal),
      ]);
      if (generation !== globalSequence || !authorized || destroyed) return;
      if (next.some((context) => !dependencies.has(context.id))) {
        throw new Error('Falta la verificación de dependencias para un contexto global.');
      }
      contexts = next;
      globalDependencies = dependencies;
      globalReady = true;
      renderGlobal();
      enable();
      announce('Contextos globales cargados.');
    } catch (error) {
      if (generation === globalSequence && !controller.signal.aborted) announce(notice(error));
      handleAuthError(error);
    }
  }
  async function loadCampaign(): Promise<void> {
    if (!authorized || !repository) return;
    campaignAbort?.abort();
    const controller = new AbortController();
    campaignAbort = controller;
    const generation = ++campaignSequence;
    const requested = campaignId;
    campaignReady = false;
    enable();
    announce('Cargando bindings y placements de la campaña…');
    try {
      const [nextBindings, nextEntities, nextPlacements, nextGeo] = await Promise.all([
        repository.listBindings(requested, controller.signal),
        repository.listEntities(requested, controller.signal),
        repository.listPlacements(requested, controller.signal),
        repository.listGeography(controller.signal),
      ]);
      if (generation !== campaignSequence || campaignId !== requested || !authorized || destroyed)
        return;
      bindings = nextBindings;
      entities = nextEntities;
      placements = nextPlacements;
      geographies = nextGeo;
      campaignReady = true;
      renderCampaign();
      enable();
      announce('Datos de la campaña cargados.');
    } catch (error) {
      if (generation === campaignSequence && !controller.signal.aborted) announce(notice(error));
      handleAuthError(error);
    }
  }
  function handleAuthError(error: unknown): void {
    if (error instanceof AdminLocalMapError && (error.status === 401 || error.status === 403))
      auth.invalidateFromAdministrativeResponse(error.status);
  }
  function cancelPending(): void {
    globalAbort?.abort();
    campaignAbort?.abort();
    mutationAbort?.abort();
    globalSequence++;
    campaignSequence++;
  }
  function readContextForm(): LocalMapContextDraft {
    return {
      id: input(section, 'local-context-id').value.trim(),
      slug: input(section, 'local-context-slug').value.trim(),
      name: input(section, 'local-context-name').value.trim(),
      parentId: optional(select(section, 'local-context-parent').value),
      width: Number(input(section, 'local-context-width').value),
      height: Number(input(section, 'local-context-height').value),
      publicationStatus: select(section, 'local-context-status')
        .value as LocalMapContextDraft['publicationStatus'],
      imageUri: optional(input(section, 'local-context-uri').value),
      loadingStrategy: optional(
        select(section, 'local-context-strategy').value,
      ) as LocalMapContextDraft['loadingStrategy'],
      sourceUrl: optional(input(section, 'local-context-source').value),
      rightsHolder: optional(input(section, 'local-context-rights').value),
      attribution: optional(input(section, 'local-context-attribution').value),
      licenseNotes: optional(input(section, 'local-context-license').value),
    };
  }
  function openContext(context: LocalMapContext | null, trigger: HTMLElement): void {
    if (!allowed() || !guardDiscard()) return;
    clearEditor();
    showTab('contexts');
    originalContext = context;
    editing = 'context';
    restoreFocus = trigger;
    const draft = context ?? blankContext();
    const mapping: Record<string, string> = {
      'local-context-id': draft.id,
      'local-context-slug': draft.slug,
      'local-context-name': draft.name,
      'local-context-width': String(draft.width),
      'local-context-height': String(draft.height),
      'local-context-uri': draft.imageUri ?? '',
      'local-context-source': draft.sourceUrl ?? '',
      'local-context-rights': draft.rightsHolder ?? '',
      'local-context-attribution': draft.attribution ?? '',
      'local-context-license': draft.licenseNotes ?? '',
    };
    for (const [id, value] of Object.entries(mapping)) input(section, id).value = value;
    input(section, 'local-context-id').readOnly = Boolean(context);
    input(section, 'local-context-slug').readOnly = Boolean(context);
    const blockedResize = Boolean(
      context && globalDependencies.get(context.id)?.placementCount !== 0,
    );
    input(section, 'local-context-width').readOnly = blockedResize;
    input(section, 'local-context-height').readOnly = blockedResize;
    const parent = select(section, 'local-context-parent');
    parent.replaceChildren();
    addOption(parent, '', 'Sin padre');
    const descendants = context ? localContextDescendants(contexts, context.id) : new Set<string>();
    for (const item of contexts.filter((c) => c.id !== context?.id && !descendants.has(c.id)))
      addOption(parent, item.id, item.name);
    parent.value = draft.parentId ?? '';
    select(section, 'local-context-status').value = draft.publicationStatus;
    select(section, 'local-context-strategy').value = draft.loadingStrategy ?? '';
    $(section, 'local-context-editor-title').textContent = context
      ? 'Editar contexto ' + context.name
      : 'Crear contexto global';
    $(section, 'local-context-error').textContent = '';
    $(section, 'local-context-editor').hidden = false;
    input(section, 'local-context-name').focus();
    updateProvenance();
  }
  function updateProvenance(): void {
    const hasImage = Boolean(input(section, 'local-context-uri').value.trim());
    $(section, 'local-context-provenance').textContent = hasImage
      ? 'Imagen declarada: fuente, titular, licencia y estrategia obligatorios. Verifica derechos antes de publicar.'
      : 'Sin imagen: estado válido. Neverwinter conserva raster pendiente de derechos.';
  }
  async function mutate(
    action: (signal: AbortSignal) => Promise<void>,
    success: string,
  ): Promise<void> {
    if (!allowed()) return;
    busy = true;
    enable();
    mutationAbort?.abort();
    const controller = new AbortController();
    mutationAbort = controller;
    announce('Guardando…');
    try {
      await action(controller.signal);
      if (controller.signal.aborted || destroyed) return;
      clearEditor();
      announce(success);
      await Promise.all([loadGlobal(), loadCampaign()]);
    } catch (error) {
      if (!controller.signal.aborted) {
        const el = $(
          section,
          editing === 'placement' ? 'local-placement-error' : 'local-context-error',
        );
        el.textContent = notice(error);
        el.focus();
        announce(notice(error), true);
        handleAuthError(error);
      }
    } finally {
      busy = false;
      enable();
    }
  }
  async function saveContext(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!allowed()) return;
    const draft = readContextForm();
    const originalContextId = originalContext?.id;
    const errors = validateLocalContext(
      draft,
      originalContext,
      contexts,
      Boolean(originalContextId && globalDependencies.get(originalContextId)?.placementCount !== 0),
    );
    for (const el of section.querySelectorAll<HTMLElement>('[aria-invalid]'))
      el.removeAttribute('aria-invalid');
    const first = Object.entries(errors)[0];
    if (first) {
      const field =
        first[0] === 'parentId'
          ? 'parent'
          : first[0] === 'publicationStatus'
            ? 'status'
            : ((
                {
                  imageUri: 'uri',
                  loadingStrategy: 'strategy',
                  sourceUrl: 'source',
                  rightsHolder: 'rights',
                  licenseNotes: 'license',
                } as Record<string, string>
              )[first[0]] ?? first[0]);
      const el = $(section, 'local-context-' + field);
      el.setAttribute('aria-invalid', 'true');
      el.focus();
      $(section, 'local-context-error').textContent = first[1] ?? 'Corrige el formulario.';
      return;
    }
    const repo = repository;
    if (!repo) return;
    await mutate(async (signal) => {
      await repo.saveContext(draft, originalContext, signal);
    }, 'Contexto guardado.');
  }
  async function archiveContext(context: LocalMapContext): Promise<void> {
    if (!guardDiscard()) return;
    const errors = validateLocalContext(
      { ...context, publicationStatus: 'archived' },
      context,
      contexts,
      false,
    );
    if (Object.keys(errors).length > 0) {
      announce(Object.values(errors)[0] ?? 'No se puede archivar el contexto.', true);
      return;
    }
    if (
      !allowed() ||
      !window.confirm(
        '¿Archivar el contexto ' + context.name + '? Sus bindings y placements no se borrarán.',
      )
    )
      return;
    const repo = repository;
    if (!repo) return;
    await mutate(async (signal) => {
      await repo.saveContext({ ...context, publicationStatus: 'archived' }, context, signal);
    }, 'Contexto archivado.');
  }
  async function deleteContext(context: LocalMapContext): Promise<void> {
    if (
      !allowed() ||
      !window.confirm(
        '¿Eliminar físicamente el contexto borrador ' +
          context.name +
          '? Solo se permite sin dependencias.',
      )
    )
      return;
    const repo = repository;
    if (!repo) return;
    await mutate((signal) => repo.deleteContext(context, signal), 'Contexto eliminado.');
  }
  async function saveBinding(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!allowed()) return;
    const geo = select(section, 'local-binding-geography').value,
      context = select(section, 'local-binding-context').value;
    if (!geo || !context) {
      announce('Selecciona geonombre y contexto.', true);
      return;
    }
    if (bindings.some((b) => b.geographicNameId === geo)) {
      announce('La geografía ya tiene un binding en esta campaña.', true);
      return;
    }
    const geography = geographies.find((item) => item.id === geo);
    const globalContext = contexts.find((item) => item.id === context);
    if (!geography || !globalContext) {
      announce('Recarga geonombres y contextos antes de crear el binding.', true);
      return;
    }
    const requested = campaignId;
    const campaignName =
      rosterCampaign?.selectedOptions[0]?.textContent?.trim() || requested;
    if (
      !window.confirm(
        '¿Asociar "' +
          geography.name +
          '" al contexto global "' +
          globalContext.name +
          '" para la campaña "' +
          campaignName +
          '"? Si los recursos están publicados, esta operación puede habilitar una nueva entrada de navegación pública.',
      )
    )
      return;
    const repo = repository;
    if (!repo) return;
    await mutate(async (signal) => {
      if (requested !== adminCampaignContext.getCampaignId())
        throw new Error('La campaña cambió. Recarga.');
      await repo.saveBinding(
        { campaignId: requested, geographicNameId: geo, mapContextId: context },
        signal,
      );
    }, 'Binding creado.');
  }
  async function deleteBinding(binding: LocalMapBinding): Promise<void> {
    if (!allowed() || binding.campaignId !== campaignId) return;
    if (
      !window.confirm(
        '¿Desasociar el binding? La navegación pública puede dejar de mostrar la entrada. No se borrarán el contexto, el geonombre ni los placements.',
      )
    )
      return;
    const repo = repository;
    if (!repo) return;
    await mutate((signal) => repo.deleteBinding(binding, signal), 'Binding desasociado.');
  }
  function chosenContext(): LocalMapContext | null {
    return contexts.find((c) => c.id === select(section, 'local-placement-context').value) ?? null;
  }
  function chosenEntity(): LocalMapEntity | null {
    return entities.find((e) => e.id === select(section, 'local-placement-entity').value) ?? null;
  }
  function refreshKind(): void {
    const entity = chosenEntity(),
      kind = select(section, 'local-placement-kind');
    const polygon = kind.querySelector<HTMLOptionElement>('[value="polygon"]');
    if (polygon) polygon.disabled = entity?.entityType !== 'location';
    if (entity?.entityType !== 'location' && kind.value === 'polygon') {
      kind.value = 'point';
      geometry = null;
    }
  }
  function rebuildMap(): void {
    mapEditor?.destroy();
    mapEditor = null;
    const context = chosenContext();
    if (!context) {
      $(section, 'local-placement-coordinate').textContent =
        'Selecciona contexto para editar geometría.';
      return;
    }
    const canvas = $(section, 'local-placement-map');
    geometry =
      geometry && geometry.kind === select(section, 'local-placement-kind').value ? geometry : null;
    mapEditor = mountAdminLocalMapEditor(canvas, context, geometry, (next) => {
      geometry = next;
      dirty = true;
      describeGeometry();
    });
    if (select(section, 'local-placement-kind').value === 'polygon' && geometry?.kind !== 'polygon')
      mapEditor.setKind('polygon');
    describeGeometry();
  }
  function describeGeometry(): void {
    const output = $(section, 'local-placement-coordinate');
    if (!geometry) {
      output.textContent = 'Sin geometría; elige una posición.';
      return;
    }
    if (geometry.kind === 'polygon') {
      output.textContent =
        geometry.vertices.length + ' vértices. Mínimo 3, máximo 64. Sin rutas ni agujeros.';
      return;
    }
    const p = mapGeometryRepresentativePoint(geometry);
    output.textContent = 'Punto X ' + p.x.toFixed(2) + ' · Y ' + p.y.toFixed(2);
  }
  function addKeyboardCoordinate(): void {
    if (!allowed() || editing !== 'placement') return;
    const context = chosenContext();
    const xInput = input(section, 'local-placement-x');
    const yInput = input(section, 'local-placement-y');
    const x = xInput.value.trim() === '' ? Number.NaN : Number(xInput.value);
    const y = yInput.value.trim() === '' ? Number.NaN : Number(yInput.value);
    if (!context || !isLocalCoordinateInBounds(x, y, context)) {
      const error = $(section, 'local-placement-error');
      error.textContent = 'Introduce X e Y dentro de las dimensiones del contexto seleccionado.';
      error.focus();
      return;
    }
    const point = { x, y };
    if (select(section, 'local-placement-kind').value === 'polygon') {
      const old = geometry?.kind === 'polygon' ? geometry.vertices : [];
      if (old.length >= 64) {
        $(section, 'local-placement-error').textContent = 'Máximo 64 vértices.';
        return;
      }
      geometry = { kind: 'polygon', vertices: [...old, point] };
    } else {
      geometry = { kind: 'point', coordinates: point };
    }
    $(section, 'local-placement-error').textContent = '';
    dirty = true;
    mapEditor?.setGeometry(geometry);
    describeGeometry();
    xInput.focus();
  }
  function openPlacement(placement: LocalMapPlacement | null, trigger: HTMLElement): void {
    if (!allowed() || !guardDiscard()) return;
    clearEditor();
    showTab('placements');
    editing = 'placement';
    originalPlacement = placement;
    restoreFocus = trigger;
    geometry = placement?.geometry ?? null;
    updateChoices();
    select(section, 'local-placement-context').value =
      placement?.mapContextId ?? contexts[0]?.id ?? '';
    selectedPlacementContextId = select(section, 'local-placement-context').value;
    select(section, 'local-placement-entity').value = placement?.entityId ?? entities[0]?.id ?? '';
    select(section, 'local-placement-status').value = placement?.publicationStatus ?? 'draft';
    select(section, 'local-placement-context').disabled = Boolean(placement);
    select(section, 'local-placement-entity').disabled = Boolean(placement);
    select(section, 'local-placement-kind').value = placement?.geometry.kind ?? 'point';
    $(section, 'local-placement-editor-title').textContent = placement
      ? 'Editar placement'
      : 'Crear placement';
    $(section, 'local-placement-error').textContent = '';
    $(section, 'local-placement-editor').hidden = false;
    refreshKind();
    rebuildMap();
    select(section, 'local-placement-entity').focus();
  }
  async function savePlacement(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!allowed()) return;
    const context = chosenContext(),
      entity = chosenEntity();
    if (!context || !entity || !geometry) {
      $(section, 'local-placement-error').textContent = 'Selecciona contexto, entidad y geometría.';
      return;
    }
    if (
      originalPlacement?.publicationStatus === 'archived' &&
      select(section, 'local-placement-status').value === 'published'
    ) {
      const error = $(section, 'local-placement-error');
      error.textContent = 'Un placement archivado debe pasar por borrador antes de publicarse.';
      error.focus();
      select(section, 'local-placement-status').focus();
      return;
    }
    let valid: MapEntityGeometry;
    try {
      valid = validateLocalGeometry(geometry, entity.entityType, context);
    } catch (error) {
      $(section, 'local-placement-error').textContent = notice(error);
      $(section, 'local-placement-error').focus();
      return;
    }
    if (
      originalPlacement === null &&
      placements.some((p) => p.mapContextId === context.id && p.entityId === entity.id)
    ) {
      $(section, 'local-placement-error').textContent =
        'Ya existe un placement para esa entidad y contexto.';
      return;
    }
    const repo = repository;
    const requested = campaignId;
    if (!repo) return;
    const draft = {
      campaignId: requested,
      mapContextId: context.id,
      entityId: entity.id,
      geometry: valid,
      publicationStatus: select(section, 'local-placement-status').value as
        'draft' | 'published' | 'archived',
    };
    await mutate(async (signal) => {
      if (requested !== adminCampaignContext.getCampaignId())
        throw new Error('La campaña ha cambiado.');
      await repo.savePlacement(draft, originalPlacement, context, entity.entityType, signal);
    }, 'Placement guardado. La visibilidad pública local completa se habilitará en MAP-079.');
  }
  async function deletePlacement(placement: LocalMapPlacement): Promise<void> {
    if (!allowed() || placement.campaignId !== campaignId) return;
    if (!window.confirm('¿Eliminar este placement local? La entidad y el contexto se conservarán.'))
      return;
    const repo = repository;
    if (!repo) return;
    await mutate((signal) => repo.deletePlacement(placement, signal), 'Placement eliminado.');
  }
  const onStatus = (event: Event): void => {
    const detail = (event as CustomEvent<{ backendState?: string }>).detail;
    if (!detail) return;
    connected = detail.backendState === 'connected';
    enable();
  };
  const onTransition = (): void => {
    if (editing === 'placement') clearEditor();
    campaignAbort?.abort();
    mutationAbort?.abort();
    campaignSequence++;
    campaignReady = false;
    bindings = [];
    placements = [];
    entities = [];
    geographies = [];
    renderCampaign();
    enable();
  };
  const onCampaign = (next: string): void => {
    if (campaignId === next) return;
    campaignId = next;
    void loadCampaign();
  };
  const unsubscribeCampaign = adminCampaignContext.subscribe(onCampaign);
  const unsubscribeTransition = adminCampaignContext.subscribeTransition((transition) => {
    if (transition) {
      onTransition();
      return;
    }
    const confirmed = adminCampaignContext.getCampaignId();
    if (campaignId !== confirmed) campaignId = confirmed;
    if (authorized && !campaignReady) void loadCampaign();
    else enable();
  });
  const unsubscribeAuth = auth.subscribe((state) => {
    const next = state.phase === 'authorized';
    const changed = next !== authorized;
    authorized = next;
    if (changed && !next) {
      cancelPending();
      restoreFocus = null;
      clearEditor();
      campaignReady = false;
      globalReady = false;
      contexts = [];
      globalDependencies = new Map();
      bindings = [];
      placements = [];
      entities = [];
      geographies = [];
      purgePrivateControls();
      renderGlobal();
      renderCampaign();
      announce('Sesión administrativa cerrada.');
    }
    enable();
    if (changed && next) {
      void loadGlobal();
      void loadCampaign();
    }
  });
  const listeners: [HTMLElement, string, EventListener][] = [];
  function listen(el: HTMLElement, event: string, handler: EventListener): void {
    el.addEventListener(event, handler);
    listeners.push([el, event, handler]);
  }
  section.querySelectorAll<HTMLButtonElement>('[data-local-tab]').forEach((btn) => {
    listen(btn, 'click', () => showTab(btn.dataset.localTab as Tab));
  });
  listen($(section, 'local-context-new'), 'click', () =>
    openContext(null, $(section, 'local-context-new')),
  );
  listen($(section, 'local-context-reload'), 'click', () => {
    void loadGlobal();
  });
  for (const id of ['local-campaign-reload', 'local-placement-reload'])
    listen($(section, id), 'click', () => {
      void loadCampaign();
    });
  listen($(section, 'local-context-form'), 'submit', (e) => {
    void saveContext(e as SubmitEvent);
  });
  listen($(section, 'local-binding-form'), 'submit', (e) => {
    void saveBinding(e as SubmitEvent);
  });
  listen($(section, 'local-placement-form'), 'submit', (e) => {
    void savePlacement(e as SubmitEvent);
  });
  listen($(section, 'local-placement-add-coordinate'), 'click', addKeyboardCoordinate);
  listen($(section, 'local-placement-new'), 'click', () =>
    openPlacement(null, $(section, 'local-placement-new')),
  );
  listen($(section, 'local-context-cancel'), 'click', () => {
    if (guardDiscard()) clearEditor();
  });
  listen($(section, 'local-placement-cancel'), 'click', () => {
    if (guardDiscard()) clearEditor();
  });
  listen($(section, 'local-context-form'), 'input', () => {
    dirty = true;
    updateProvenance();
  });
  listen($(section, 'local-context-form'), 'change', () => {
    dirty = true;
    updateProvenance();
  });
  listen($(section, 'local-placement-status'), 'change', () => {
    dirty = true;
  });
  listen($(section, 'local-placement-kind'), 'change', () => {
    if (geometry && !guardDiscard()) {
      select(section, 'local-placement-kind').value = geometry?.kind ?? 'point';
      return;
    }
    dirty = true;
    geometry = null;
    refreshKind();
    rebuildMap();
  });
  listen($(section, 'local-placement-entity'), 'change', () => {
    dirty = true;
    refreshKind();
    geometry = null;
    rebuildMap();
  });
  listen($(section, 'local-placement-context'), 'change', () => {
    const contextControl = select(section, 'local-placement-context');
    if (dirty && !guardDiscard()) {
      contextControl.value = selectedPlacementContextId;
      return;
    }
    selectedPlacementContextId = contextControl.value;
    dirty = true;
    geometry = null;
    rebuildMap();
  });
  const rosterCampaign = root.querySelector<HTMLSelectElement>('.admin-campaign-roster__select');
  const onRosterChangeCapture = (event: Event): void => {
    if (editing !== 'placement' || !dirty || guardDiscard()) return;
    event.stopImmediatePropagation();
    if (rosterCampaign) rosterCampaign.value = campaignId;
  };
  rosterCampaign?.addEventListener('change', onRosterChangeCapture, true);
  window.addEventListener('atlas:public-data-status', onStatus);
  enable();
  return {
    destroy(): void {
      destroyed = true;
      cancelPending();
      clearEditor();
      unsubscribeAuth();
      unsubscribeCampaign();
      unsubscribeTransition();
      rosterCampaign?.removeEventListener('change', onRosterChangeCapture, true);
      window.removeEventListener('atlas:public-data-status', onStatus);
      for (const [el, event, handler] of listeners) el.removeEventListener(event, handler);
      section.remove();
    },
  };
}
