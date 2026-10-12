# MAP-070 — Multicampaign admin UX hardening

## Administrative campaign source of truth

`AdminCampaignContext` remains the only source of truth for campaign-scoped administrative traffic. The fetch interceptor continues to append or validate `campaign_id` and blocks mutations while a campaign transition is in progress. MAP-070 does not introduce a second scope or couple the public selector to the administrative selector.

The admin shell now keeps a persistent, accessible context banner with the legible campaign name. It also reports the currently visible public campaign and explicitly states when public and administrative campaigns diverge.

## Campaign switching and dirty state

The existing campaign selector still owns the switch. Dirty forms across the admin shell participate in the guard, and moderation-note drafts now participate too even though they are not a form. Cancel keeps campaign, draft and selector focus. Accept begins one transition, discards local editors and drafts, synchronously purges campaign-scoped controller state, then commits only after the target roster has loaded.

Global geographic-name records remain global. Their linked `map_entities` references are invalidated at transition start and fetched again for the confirmed campaign, or for the original campaign if the target roster fails. Geographic editors are closed during switching; stale references cannot be used while loading.

If the destination roster request fails, the context never commits to the new campaign: a transition-cancelled event resets the visible banner and reloads the four purged administrative controllers against the original scope. An ordinary roster error leaves the original roster usable; authorization failures retain the blocked-session behavior. Unsent moderation notes are also purged on logout or revocation.

## Roster, dispositions and associations

The roster is labelled as the player-character/referent roster for the active administrative campaign. Entity dispositions explicitly describe themselves as roster-based and separate from generic entity relations. Player associations abort and remove their UI as soon as a campaign transition starts, then reload from the committed campaign. Organizations never mount player associations.

Production logic contains no Ura/Skade/Veyra conditions; those names remain fixture data only.

## Entity relations

Candidates continue to come from the scoped entity controller. MAP-070 purges that controller before the next campaign is committed, so stale records cannot remain available as relation targets while the target campaign loads. New archived targets remain unavailable, while an archived target already present in an existing relation is still represented by the existing editor behavior. Option labels continue to include entity type.

## Organizations

Organizations are explicitly labelled **No cartográfica** in the editor. Their discovery control is fixed to catalog/search, coordinates and geometry are absent, the map editor stays hidden, and player dispositions/associations are absent. Categories, tags, audience and generic same-campaign entity relations remain available. A physical headquarters continues to be a separate `location` linked with an entity relation.

## Master Mode and public URL state

Public campaign selection remains independent. Existing Master Mode campaign-transition generation/abort behavior and purge on revocation/sign-out are unchanged. Public `?campaign=`, entity resolution, history and degraded-mode behavior are unchanged; MAP-070 adds no cross-campaign fallback.

## Tests

MAP-070 adds unit coverage for campaign labels/public-admin divergence and for keeping geographic resources global. E2E coverage uses a realistic Castigo Divino roster (Ura/Skade) and Un aliento menos roster (Veyra), checks the persistent context, negative cross-campaign disposition/association controls, non-cartographic organization UX, accepted/cancelled dirty transitions and mobile overflow. Existing campaign/Master stale-response suites remain the regression guard for public and private catalog transitions.

No database migration is required. The public snapshot is not regenerated.
