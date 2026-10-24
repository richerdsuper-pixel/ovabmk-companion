// Отключено: ежедневная сводка по беременным больше не используется (данные пациенток на сервере не хранятся).
// Функцию можно удалить в панели Supabase: Edge Functions → anc-digest → Delete.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
