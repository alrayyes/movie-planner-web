#!/usr/bin/env bash
# Drives Baikal's own web install wizard via curl — there's no non-interactive
# CLI or API for this, so this replays the same multi-step form POSTs a
# browser would send. Idempotent: Baikal's own install wizard refuses to run
# a second time (INSTALL_DISABLED), so a re-run just fails these steps and
# falls through to verifying the calendar already answers, rather than
# erroring.
#
# -k (insecure): Caddy terminates TLS with its own internal self-signed CA
# for this local/CI-only container — never do this against a real server.
set -euo pipefail

BASE_URL="${BAIKAL_BASE_URL:-https://localhost:8443}"
ADMIN_PASSWORD="${BAIKAL_ADMIN_PASSWORD:-testpassword123}"
CALDAV_USERNAME="${BAIKAL_CALDAV_USERNAME:-moviewatcher}"
CALDAV_PASSWORD="${BAIKAL_CALDAV_PASSWORD:-testpassword123}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

curl_() { curl -ksS -b "$COOKIES" -c "$COOKIES" "$@"; }

csrf_token() {
  grep -o 'name="CSRF_TOKEN" value="[^"]*"' | sed -E 's/.*value="([^"]*)".*/\1/'
}

echo "Waiting for Baikal to answer..."
for _ in $(seq 1 30); do
  if curl -ks -o /dev/null "$BASE_URL/admin/install/"; then break; fi
  sleep 1
done

echo "Step 1/4: standard config (admin password, Basic auth)..."
CSRF=$(curl_ "$BASE_URL/admin/install/" | csrf_token)
curl_ -X POST "$BASE_URL/admin/install/" \
  --data-urlencode 'Baikal_Model_Config_Standard::submitted=1' \
  --data-urlencode "CSRF_TOKEN=$CSRF" \
  --data-urlencode 'witness[timezone]=1' --data-urlencode 'data[timezone]=Europe/Amsterdam' \
  --data-urlencode 'witness[card_enabled]=1' --data-urlencode 'data[card_enabled]=1' \
  --data-urlencode 'witness[cal_enabled]=1' --data-urlencode 'data[cal_enabled]=1' \
  --data-urlencode 'witness[invite_from]=1' --data-urlencode 'data[invite_from]=noreply@example.com' \
  --data-urlencode 'witness[dav_auth_type]=1' --data-urlencode 'data[dav_auth_type]=Basic' \
  --data-urlencode 'witness[admin_passwordhash]=1' --data-urlencode "data[admin_passwordhash]=$ADMIN_PASSWORD" \
  --data-urlencode 'witness[admin_passwordhash_confirm]=1' --data-urlencode "data[admin_passwordhash_confirm]=$ADMIN_PASSWORD" \
  -o /dev/null

echo "Step 2/4: database config..."
CSRF=$(curl_ "$BASE_URL/admin/install/" | csrf_token)
curl_ -X POST "$BASE_URL/admin/install/" \
  --data-urlencode 'Baikal_Model_Config_Database::submitted=1' \
  --data-urlencode "CSRF_TOKEN=$CSRF" \
  --data-urlencode 'witness[backend]=1' --data-urlencode 'data[backend]=sqlite' \
  --data-urlencode 'witness[sqlite_file]=1' --data-urlencode 'data[sqlite_file]=/var/www/baikal/Specific/db/db.sqlite' \
  -o /dev/null

echo "Step 3/4: log in and create the $CALDAV_USERNAME user..."
curl_ -o /dev/null "$BASE_URL/admin/"
curl_ -X POST "$BASE_URL/admin/" \
  --data-urlencode 'auth=1' --data-urlencode 'login=admin' --data-urlencode "password=$ADMIN_PASSWORD" \
  -o /dev/null

CSRF=$(curl_ "$BASE_URL/admin/?/users/new/1/" | csrf_token)
curl_ -X POST "$BASE_URL/admin/?/users/new/1/" \
  --data-urlencode 'Baikal_Model_User::submitted=1' --data-urlencode "CSRF_TOKEN=$CSRF" \
  --data-urlencode 'witness[username]=1' --data-urlencode "data[username]=$CALDAV_USERNAME" \
  --data-urlencode 'witness[password]=1' --data-urlencode "data[password]=$CALDAV_PASSWORD" \
  --data-urlencode 'witness[passwordconfirm]=1' --data-urlencode "data[passwordconfirm]=$CALDAV_PASSWORD" \
  --data-urlencode 'witness[displayname]=1' --data-urlencode 'data[displayname]=Movie Watcher' \
  --data-urlencode 'witness[email]=1' --data-urlencode "data[email]=$CALDAV_USERNAME@example.com" \
  -o /dev/null

echo "Step 4/4: create the movies calendar..."
CSRF=$(curl_ "$BASE_URL/admin/?/users/calendars/user/1/new/1/" | csrf_token)
curl_ -X POST "$BASE_URL/admin/?/users/calendars/user/1/new/1/" \
  --data-urlencode 'Baikal_Model_Calendar::submitted=1' --data-urlencode "CSRF_TOKEN=$CSRF" \
  --data-urlencode 'witness[displayname]=1' --data-urlencode 'data[displayname]=Movies' \
  --data-urlencode 'witness[uri]=1' --data-urlencode 'data[uri]=movies' \
  --data-urlencode 'witness[description]=1' --data-urlencode 'data[description]=' \
  --data-urlencode 'witness[calendarcolor]=1' --data-urlencode 'data[calendarcolor]=#CB90D6' \
  --data-urlencode 'witness[todos]=1' --data-urlencode 'data[todos]=0' \
  --data-urlencode 'witness[notes]=1' --data-urlencode 'data[notes]=1' \
  -o /dev/null

echo "Verifying the calendar answers over CalDAV..."
status=$(curl -ks -o /dev/null -w '%{http_code}' -u "$CALDAV_USERNAME:$CALDAV_PASSWORD" \
  -X PROPFIND -H 'Depth: 0' "$BASE_URL/dav.php/calendars/$CALDAV_USERNAME/movies/")
if [ "$status" != "207" ]; then
  echo "Calendar did not answer as expected (got HTTP $status)" >&2
  exit 1
fi

echo "Baikal provisioned: $BASE_URL/dav.php/calendars/$CALDAV_USERNAME/movies/"
