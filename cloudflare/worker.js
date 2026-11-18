const ALLOWED_ORIGIN = "https://bercutgame-cell.github.io";
const VK_API = "https://api.vk.com/method/";
const VK_VERSION = "5.199";
const CITY_COUNTRY_ID = 1;
const TERMS = {
  beauty: ["парикмахерская", "салон красоты", "барбершоп", "парикмахер"],
  food: ["кафе", "ресторан", "пекарня", "кофейня"],
  auto: ["автосервис", "автомойка", "шиномонтаж"],
  health: ["стоматология", "медицинский центр", "клиника"],
  construction: ["ремонт", "строительство", "сантехник", "электрик"],
  fitness: ["фитнес", "спортивный клуб", "тренажерный зал"],
  education: ["учебный центр", "школа", "курсы"],
  lodging: ["гостиница", "отель", "гостевой дом"],
  professional: ["юридические услуги", "бухгалтер", "агентство недвижимости"],
  retail: ["магазин", "торговая точка"],
  all: ["организация", "компания", "магазин"]
};
const rateState = new Map();

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function rateLimited(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const entry = rateState.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60000) { entry.start = now; entry.count = 0; }
  entry.count += 1;
  rateState.set(ip, entry);
  return entry.count > 8;
}
async function vk(method, params, token) {
  const url = new URL(VK_API + method);
  for (const [key, value] of Object.entries({ ...params, access_token: token, v: VK_VERSION })) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("VK API HTTP " + response.status);
  const body = await response.json();
  if (body.error) {
    const error = new Error(body.error.error_msg || "Ошибка VK API");
    error.code = body.error.error_code;
    throw error;
  }
  return body.response;
}
function normalizeGroup(group, cityTitle, category) {
  const screen = group.screen_name || ("club" + group.id);
  const url = "https://vk.com/" + screen;
  const city = group.city && group.city.title ? group.city.title : cityTitle;
  const contact = Array.isArray(group.contacts) ? group.contacts.find(item => item && (item.phone || item.email)) : null;
  return {
    id: "vk-" + group.id,
    name: group.name || "Сообщество ВКонтакте",
    category: category + " · сообщество VK",
    address: city + " · точный адрес не подтверждён",
    website: group.site && /^https?:\/\//i.test(group.site) ? group.site : "",
    phone: contact && contact.phone ? String(contact.phone) : "",
    email: contact && contact.email ? String(contact.email) : "",
    social: { vk: url },
    lat: null,
    lon: null,
    osmUrl: url,
    source: "VK API · поиск сообществ",
    status: "Новый",
    note: String(group.description || group.activity || "").slice(0, 1200),
    addedAt: new Date().toISOString(),
    socialConfidence: "Нужно проверить адрес и принадлежность компании",
    membersCount: Number(group.members_count || 0)
  };
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "LeadScout VK Collector", version: "1.0" }, 200, origin);
    }
    if (url.pathname !== "/search" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, origin);
    }
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403, origin);
    if (rateLimited(request)) return json({ error: "Слишком много запросов. Подожди минуту." }, 429, origin);
    if (!env.VK_ACCESS_TOKEN) return json({ error: "На Worker не задан секрет VK_ACCESS_TOKEN." }, 503, origin);
    try {
      const input = await request.json();
      const city = String(input.city || "").trim().slice(0, 80);
      const category = String(input.category || "all").trim();
      if (city.length < 2) return json({ error: "Укажи город." }, 400, origin);
      const customTerm = String(input.subcategory || "").trim().slice(0, 80);
      const terms = customTerm ? [customTerm, ...(TERMS[category] || TERMS.all)] : (TERMS[category] || TERMS.all);
      const cityResponse = await vk("database.getCities", {
        q: city, country_id: CITY_COUNTRY_ID, count: 10
      }, env.VK_ACCESS_TOKEN);
      const cities = cityResponse.items || [];
      const normalizedCity = city.toLocaleLowerCase("ru");
      const match = cities.find(item => String(item.title || "").toLocaleLowerCase("ru") === normalizedCity)
        || cities.find(item => String(item.title || "").toLocaleLowerCase("ru").startsWith(normalizedCity));
      if (!match) return json({ city, results: [], message: "VK не нашёл город в своём справочнике. Проверь название." }, 200, origin);
      const found = new Map();
      const queries = terms.slice(0, 4);
      for (const term of queries) {
        const response = await vk("groups.search", {
          q: term, city_id: match.id, count: 40, sort: 0
        }, env.VK_ACCESS_TOKEN);
        for (const group of (response.items || [])) {
          if (!group || !group.id || !group.name) continue;
          if (!found.has(group.id)) found.set(group.id, group);
        }
      }
      let detailed = Array.from(found.values());
      if (detailed.length) {
        const detailsResponse = await vk("groups.getById", {
          group_ids: detailed.map(group => group.id).join(","),
          fields: "city,description,members_count,activity,verified,site,contacts"
        }, env.VK_ACCESS_TOKEN);
        if (Array.isArray(detailsResponse)) detailed = detailsResponse;
        else if (detailsResponse && Array.isArray(detailsResponse.groups)) detailed = detailsResponse.groups;
      }
      const results = detailed
        .filter(group => {
          const groupCity = group.city && group.city.title;
          return !groupCity || groupCity.toLocaleLowerCase("ru") === String(match.title).toLocaleLowerCase("ru");
        })
        .map(group => normalizeGroup(group, match.title, input.categoryLabel || category))
        .sort((a, b) => b.membersCount - a.membersCount)
        .slice(0, 120);
      return json({
        ok: true, city: match.title, cityId: match.id,
        count: results.length, results,
        note: "Сообщество найдено по городу VK. Физический адрес и статус действующей компании требуют проверки."
      }, 200, origin);
    } catch (error) {
      const status = error.code === 5 ? 401 : 502;
      return json({ error: error.message || "Не удалось выполнить поиск VK.", vkCode: error.code || null }, status, origin);
    }
  }
};
