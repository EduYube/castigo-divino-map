import fs from 'node:fs';

const path = 'supabase/migrations/20260901150000_add_public_player_note_authorship.sql';
let source = fs.readFileSync(path, 'utf8');
const before = "raise exception using errcode = '54000', message = 'public note rate limit exceeded';";
const after = "raise exception using errcode = 'PT429', message = 'public note rate limit exceeded';";
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`expected one rate-limit SQLSTATE, found ${count}`);
source = source.replace(before, after);
fs.writeFileSync(path, source);
