import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Manejo de CORS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const query = body.query;
    const provider = body.provider;

    if (!query || !provider) throw new Error("Se requiere query y provider");

    if (provider === 'opensanctions') {
        const res = await fetch(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) throw new Error("Error de red conectando con OpenSanctions");
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'reliefweb') {
        const res = await fetch(`https://api.reliefweb.int/v1/reports?appname=osint_search&query[value]=${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) throw new Error("Error de red conectando con ReliefWeb");
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'acled') {
        // Variables de entorno o fallback a credenciales provistas
        const username = Deno.env.get('ACLED_EMAIL') ?? 'despux@gmail.com';
        const password = Deno.env.get('ACLED_PASSWORD') ?? 's_jYNwE7G7kw%P_';
        
        // 1. & 2. & 3. Petición POST para solicitar token de acceso OAuth
        const authParams = new URLSearchParams();
        authParams.append('username', username);
        authParams.append('password', password);
        authParams.append('grant_type', 'password');
        authParams.append('client_id', 'acled');

        const authRes = await fetch('https://acleddata.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: authParams.toString()
        });

        if (!authRes.ok) {
            const err = await authRes.text();
            throw new Error(`Fallo en autenticación ACLED: HTTP ${authRes.status} - ${err}`);
        }

        // 4. Analizar respuesta JSON y extraer access_token
        const authData = await authRes.json();
        const accessToken = authData.access_token;
        if (!accessToken) throw new Error("ACLED no devolvió un access_token válido.");
        
        // 5. Consulta GET a la API con el token
        const dataUrl = `https://acleddata.com/api/acled/read?_format=json&limit=5&country=${encodeURIComponent(query)}`;
        const res = await fetch(dataUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Error HTTP ${res.status} al consultar datos en ACLED: ${err}`);
        }
        
        const data = await res.json();
        // Soportar array directo o envuelto en data.data
        const items = Array.isArray(data) ? data : (data.data || []);
        
        return new Response(JSON.stringify({ data: items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error("Proveedor no válido");

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
});
