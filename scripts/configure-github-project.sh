#!/usr/bin/env bash
set -euo pipefail

OWNER="${PROJECT_OWNER:-EduYube}"
PROJECT_NUMBER="${PROJECT_NUMBER:-2}"
REPOSITORY="${REPOSITORY:-EduYube/castigo-divino-map}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: falta el comando '$1'." >&2
    exit 1
  fi
}

require_command gh
require_command awk

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: GitHub CLI no está autenticado. Ejecuta: gh auth login" >&2
  exit 1
fi

if ! PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id' 2>/dev/null)"; then
  cat >&2 <<'MESSAGE'
Error: no se puede acceder al GitHub Project.
Autoriza el scope necesario y vuelve a ejecutar:
  gh auth refresh -s project
MESSAGE
  exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: no se pudo obtener el ID interno del Project." >&2
  exit 1
fi

FIELDS_TSV="$(
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 100 --format json \
    --jq '.fields[] | [.name, .id] | @tsv'
)"

OPTIONS_TSV="$(
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 100 --format json \
    --jq '.fields[] | .name as $field | .options[]? | [$field, .name, .id] | @tsv'
)"

field_id() {
  local field_name="$1"
  awk -F '\t' -v field_name="$field_name" '$1 == field_name { print $2; exit }' <<<"$FIELDS_TSV"
}

option_id() {
  local field_name="$1"
  local option_name="$2"
  awk -F '\t' -v field_name="$field_name" -v option_name="$option_name" \
    '$1 == field_name && $2 == option_name { print $3; exit }' <<<"$OPTIONS_TSV"
}

assert_option_exists() {
  local field_name="$1"
  local option_name="$2"
  local selected_field_id
  local selected_option_id

  selected_field_id="$(field_id "$field_name")"
  selected_option_id="$(option_id "$field_name" "$option_name")"

  if [[ -z "$selected_field_id" ]]; then
    echo "Error: no existe el campo '$field_name' en el Project." >&2
    exit 1
  fi

  if [[ -z "$selected_option_id" ]]; then
    echo "Error: no existe la opción '$option_name' en el campo '$field_name'." >&2
    exit 1
  fi
}

set_single_select() {
  local item_id="$1"
  local field_name="$2"
  local option_name="$3"
  local selected_field_id
  local selected_option_id

  selected_field_id="$(field_id "$field_name")"
  selected_option_id="$(option_id "$field_name" "$option_name")"

  gh project item-edit \
    --id "$item_id" \
    --project-id "$PROJECT_ID" \
    --field-id "$selected_field_id" \
    --single-select-option-id "$selected_option_id" \
    >/dev/null
}

REQUIRED_OPTIONS=(
  "Status|Backlog" "Status|Ready" "Status|Done"
  "Priority|P0" "Priority|P1"
  "Type|Research" "Type|Feature" "Type|Chore" "Type|Documentation"
  "Area|Map" "Area|Data" "Area|Search" "Area|UI" "Area|Quality" "Area|Delivery" "Area|Governance"
  "Estimate|3" "Estimate|5" "Estimate|8"
  "Target|Foundation" "Target|Beta 0.1"
)

for entry in "${REQUIRED_OPTIONS[@]}"; do
  IFS='|' read -r field_name option_name <<<"$entry"
  assert_option_exists "$field_name" "$option_name"
done

ITEMS_TSV="$(
  gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 200 --format json \
    --jq '.items[] | [(.content.url // ""), ((.content.number // "") | tostring), .id] | @tsv'
)"

project_item_id() {
  local issue_number="$1"
  local issue_url="https://github.com/${REPOSITORY}/issues/${issue_number}"

  awk -F '\t' -v issue_url="$issue_url" -v issue_number="$issue_number" \
    '$1 == issue_url || $2 == issue_number { print $3; exit }' <<<"$ITEMS_TSV"
}

ensure_project_item() {
  local issue_number="$1"
  local issue_url="https://github.com/${REPOSITORY}/issues/${issue_number}"
  local item_id

  item_id="$(project_item_id "$issue_number")"
  if [[ -n "$item_id" ]]; then
    printf '%s' "$item_id"
    return
  fi

  item_id="$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$issue_url" --format json --jq '.id')"
  if [[ -z "$item_id" ]]; then
    echo "Error: no se pudo añadir la Issue #${issue_number} al Project." >&2
    exit 1
  fi

  ITEMS_TSV+=$'\n'"${issue_url}"$'\t'"${issue_number}"$'\t'"${item_id}"
  printf '%s' "$item_id"
}

# issue|status|priority|type|area|estimate|target
PROJECT_ITEMS=(
  "1|Done|P0|Documentation|Governance|3|Foundation"
  "2|Ready|P0|Research|Map|3|Beta 0.1"
  "3|Ready|P0|Chore|Quality|5|Beta 0.1"
  "4|Backlog|P0|Feature|Map|8|Beta 0.1"
  "5|Backlog|P0|Feature|Data|5|Beta 0.1"
  "6|Backlog|P0|Feature|UI|8|Beta 0.1"
  "7|Backlog|P1|Feature|Search|5|Beta 0.1"
  "8|Backlog|P0|Feature|Search|5|Beta 0.1"
  "9|Backlog|P1|Feature|UI|3|Beta 0.1"
  "10|Backlog|P1|Chore|Quality|5|Beta 0.1"
  "11|Backlog|P0|Chore|Delivery|5|Beta 0.1"
)

for entry in "${PROJECT_ITEMS[@]}"; do
  IFS='|' read -r issue_number status priority type area estimate target <<<"$entry"
  item_id="$(ensure_project_item "$issue_number")"

  set_single_select "$item_id" "Status" "$status"
  set_single_select "$item_id" "Priority" "$priority"
  set_single_select "$item_id" "Type" "$type"
  set_single_select "$item_id" "Area" "$area"
  set_single_select "$item_id" "Estimate" "$estimate"
  set_single_select "$item_id" "Target" "$target"

  echo "Configurada MAP-$(printf '%03d' "$issue_number") (#${issue_number})."
done

echo
echo "Project configurado correctamente: https://github.com/users/${OWNER}/projects/${PROJECT_NUMBER}"
