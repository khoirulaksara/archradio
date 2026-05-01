export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== Query params =====
    const q = url.searchParams.get("q")?.toLowerCase() || "";
    const city = url.searchParams.get("city")?.toLowerCase() || "";
    const codec = url.searchParams.get("codec")?.toLowerCase() || "";

    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "20"), 1),
      100
    );

    const sort = url.searchParams.get("sort") || "name";
    const group = url.searchParams.get("group");
    const random = url.searchParams.get("random");

    const latParam = url.searchParams.get("lat");
    const lngParam = url.searchParams.get("lng");
    const radiusKm = Math.max(parseFloat(url.searchParams.get("radius") || "50"), 1);

    // ===== Cache =====
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // ===== Load data =====
    const obj = await env.RADIO_BUCKET.get("indonesia.json");
    if (!obj) return json({ error: "Data not found" }, 404);

    const raw = await obj.json();
    let data = raw.data || [];
    
    // 1. Filter only live streams (Medium Priority Fix)
    data = data.map(s => ({
      ...s,
      streams: (s.streams || []).filter(x => x.status === 1)
    })).filter(s => s.streams.length > 0);

    const baseMeta = {
      ...raw.meta,
      updated_at: raw.meta?.updated_at || raw.updated_at || Date.now(),
      raw_total: raw.data?.length || 0,
      active_total: data.length
    };

    // ===== Search =====
    if (q) {
      data = data.filter(s =>
        (s.name + " " + s.city).toLowerCase().includes(q)
      );
    }

    // ===== Filter city =====
    if (city) {
      data = data.filter(s => s.city?.toLowerCase() === city);
    }

    // ===== Filter codec (fix) =====
    if (codec) {
      data = data.filter(s =>
        s.streams?.some(st => st.codec?.toLowerCase() === codec)
      );
    }

    // ===== Random =====
    if (random) {
      const item = data[Math.floor(Math.random() * data.length)];
      return json({
        meta: baseMeta,
        data: item
      });
    }

    // ===== Nearby =====
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);

      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180) || 1);

      let nearby = data.filter(s => {
        if (!s.lat || !s.lng) return false;
        return (
          s.lat >= lat - latDelta &&
          s.lat <= lat + latDelta &&
          s.lng >= lng - lngDelta &&
          s.lng <= lng + lngDelta
        );
      });

      nearby = nearby.map(s => ({
        ...s,
        distance: haversine(lat, lng, s.lat, s.lng)
      }));

      nearby = nearby.filter(s => s.distance <= radiusKm);
      nearby.sort((a, b) => a.distance - b.distance);

      const total = nearby.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;

      const res = json({
        meta: {
          ...baseMeta,
          type: "nearby",
          lat,
          lng,
          radiusKm,
          page,
          limit,
          total,
          totalPages
        },
        data: nearby.slice(start, start + limit)
      });

      res.headers.set("Cache-Control", "public, max-age=300");
      await cache.put(cacheKey, res.clone());
      return res;
    }

    // ===== Sorting (Prioritize high quality) =====
    if (sort === "bitrate" || sort === "quality") {
      data.sort((a, b) =>
        (b.streams?.[0]?.bitrate || 0) - (a.streams?.[0]?.bitrate || 0)
      );
    } else if (sort === "city") {
      data.sort((a, b) => (a.city || "").localeCompare(b.city || ""));
    } else if (sort === "name") {
      data.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: Higher bitrate stations first within name sorting
      data.sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp === 0) {
          return (b.streams?.[0]?.bitrate || 0) - (a.streams?.[0]?.bitrate || 0);
        }
        return nameCmp;
      });
    }

    // ===== Grouping =====
    if (group === "city") {
      const grouped = data.reduce((acc, s) => {
        const c = s.city || "Unknown";
        if (!acc[c]) acc[c] = [];
        acc[c].push(s);
        return acc;
      }, {});

      const res = json({
        meta: baseMeta,
        data: grouped
      });

      res.headers.set("Cache-Control", "public, max-age=300");
      await cache.put(cacheKey, res.clone());
      return res;
    }

    // ===== Pagination =====
    const total = data.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    const response = json({
      meta: {
        ...baseMeta,
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      data: data.slice(start, start + limit)
    });

    response.headers.set("Cache-Control", "public, max-age=300");
    await cache.put(cacheKey, response.clone());

    return response;
  }
};

// ===== Helper =====
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}