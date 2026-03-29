import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const query = body.query;
    const provider = body.provider;

    if (!query || !provider) throw new Error("Se requiere query y provider");

    const commonHeaders = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
    };

    // 1. GDELT (Noticias Globales)
    if (provider === 'gdelt') {
        const targetUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=5&format=json`;
        const res = await fetch(targetUrl, { headers: commonHeaders });
        if (!res.ok) throw new Error(`GDELT devolvió HTTP ${res.status}`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.articles || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Wikidata Intelligence (Líderes y Perfiles Políticos) - 100% ABIERTO
    if (provider === 'wikidata_intel') {
        const sparql = `
        SELECT ?item ?itemLabel ?description WHERE {
          SERVICE wikibase:mwapi {
            bd:serviceParam wikibase:api "EntitySearch" .
            bd:serviceParam wikibase:endpoint "www.wikidata.org" .
            bd:serviceParam mwapi:search "${query}" .
            bd:serviceParam mwapi:language "es" .
            ?item wikibase:apiOutputItem mwapi:item .
          }
          ?item schema:description ?description .
          FILTER(LANG(?description) = "es")
          SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
        } LIMIT 5`;
        
        const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
        const res = await fetch(url, { headers: commonHeaders });
        if (!res.ok) throw new Error("Error consultando Wikidata Intelligence");
        const data = await res.json();
        const results = data.results.bindings.map((b: any) => ({
            label: b.itemLabel.value,
            description: b.description.value,
            url: b.item.value
        }));
        return new Response(JSON.stringify({ data: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Wikidata Sanctions Check (Personas Sancionadas en Wikidata) - 100% ABIERTO
    if (provider === 'wikidata_sanctions') {
        const sparql = `
        SELECT ?item ?itemLabel ?sanctionLabel ?description WHERE {
          SERVICE wikibase:mwapi {
            bd:serviceParam wikibase:api "EntitySearch" .
            bd:serviceParam wikibase:endpoint "www.wikidata.org" .
            bd:serviceParam mwapi:search "${query}" .
            bd:serviceParam mwapi:language "es" .
            ?item wikibase:apiOutputItem mwapi:item .
          }
          { ?item wdt:P10632 ?sanctionLabel . } UNION { ?item wdt:P106 wd:Q82955 . }
          ?item schema:description ?description .
          FILTER(LANG(?description) = "es")
          SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
        } LIMIT 5`;
        
        const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
        const res = await fetch(url, { headers: commonHeaders });
        if (!res.ok) throw new Error("Error consultando Wikidata Sanctions");
        const data = await res.json();
        const results = data.results.bindings.map((b: any) => ({
            label: b.itemLabel.value,
            description: b.description.value,
            isPotentialPEP: true
        }));
        return new Response(JSON.stringify({ data: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Global Hazards (NASA EONET) - 100% ABIERTO
    if (provider === 'hazards') {
        // Obtenemos eventos abiertos (incendios, tormentas, volcanes) filtrados por coincidencia de nombre
        const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100`;
        const res = await fetch(url, { headers: commonHeaders });
        if (!res.ok) throw new Error("Error consultando NASA EONET Hazards");
        const data = await res.json();
        
        // Filtramos por la palabra clave del usuario en el nombre del evento (ej: "Venezuela" o "Amazon")
        const filtered = (data.events || []).filter((e: any) => 
            e.title.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);

        return new Response(JSON.stringify({ data: filtered }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error("Proveedor no válido");

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
});
